import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { classifyExtent, projectExtent } from '$lib/utils/seriesExtent.js';
import { fingerprintParts, recomposePassages, diffSeams } from '$lib/utils/seriesSeams.js';
import { applyPassageRangeChange, rangeFirstWordId } from '$lib/server/db/passageReconcile.js';
import {
	renumberForRemoval,
	renumberForInsert,
	planPartSplit,
	planPartJoin
} from '$lib/utils/seriesRestructure.js';
import { planSeriesParts } from '$lib/utils/seriesPlanning.js';
import {
	splitPassageStructure,
	joinPassageStructure,
	preserveCrossPartConnections
} from '$lib/server/db/seriesStructure.js';

/**
 * Apply an edit to a serialized study AS A WHOLE (SERIES_PLAN §5, §8).
 *
 * ## Order of operations, and why it is this order
 *
 *   1. **Narrow** the parts that shrink, applying the user's Merge/Delete decisions through
 *      `applyPassageRangeChange()` — the same non-destructive reconciler a single-study edit uses.
 *      Done FIRST because it is the only step that can preserve authored work, and a later step
 *      must never be able to destroy something this step was about to save.
 *   2. **Delete** the parts that leave the study entirely.
 *   3. **Renumber** `seriesOrder` to close the gaps, and dissolve the series if one part remains.
 *
 * ⚠️ Splitting and joining — changing the DIVISION — is deliberately not performed in the same call
 * as an extent change. `diffSeams()` refuses that combination outright, because a seam diff computed
 * across a changed extent produced silently wrong answers (a "join" that kept verses the user had
 * removed). The two are separate operations on purpose.
 *
 * ## What protects the user's work
 *
 * Passage rows are UPDATED, never deleted and recreated: `passage_column.passage_id` is
 * ON DELETE CASCADE, so re-creating a row to change its range would destroy every column, section,
 * segment, heading, note and commentary hanging off it — silently, while reporting success. The
 * same trap `api/series/[id]/split/+server.js` documents.
 *
 * A part that is deleted loses all of that by design, which is why it cannot happen without the
 * caller having seen `analyze-edit`'s count of exactly what each doomed part contains, and having
 * sent `confirmPartDeletion`. Q35 leaves no undo; that acknowledgement is the whole mitigation.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const seriesId = params.id;
		const body = (await request.json()) ?? {};
		const {
			passages: desiredPassages,
			title,
			subtitle,
			decisions = {},
			partsFingerprint = null,
			confirmPartDeletion = false,
			// The requested DIVISION. Absent means "leave the seams alone" — an edit that only
			// changes passages must not re-divide the series as a side effect.
			chaptersPerPart = null,
			chaptersPerPassage = null
		} = body;

		if (!Array.isArray(desiredPassages)) {
			return json({ error: 'Invalid passages' }, { status: 400 });
		}

		const [series] = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);

		if (!series) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		const parts = await loadPartsWithPassages(db, seriesId, session.user.id);
		if (parts.length === 0) {
			return json({ error: 'This series has no parts' }, { status: 404 });
		}

		// ── Staleness ────────────────────────────────────────────────────────
		//
		// There is no optimistic concurrency anywhere in the series endpoints, so a user who opened
		// the editor, split a part in another tab, and then saved would commit decisions computed
		// against parts that no longer exist. Recomputed from live rows at both ends, so it stores
		// nothing and cannot itself go stale.
		if (partsFingerprint && partsFingerprint !== fingerprintParts(parts)) {
			return json(
				{
					error:
						'This series changed since you reviewed it. Reopen the editor to see its current parts.',
					stale: true
				},
				{ status: 409 }
			);
		}

		const extent = classifyExtent({ parts, desiredPassages });

		// ── The destructive gate ─────────────────────────────────────────────
		//
		// Refused rather than warned: deleting a part destroys its structure, notes and commentary,
		// and the caller must have been shown what that is. `analyze-edit` supplies the counts.
		if (extent.deletedParts.length > 0 && !confirmPartDeletion) {
			return json(
				{
					error: 'This edit removes whole parts. Confirm the deletion to continue.',
					requiresPartDeletionConfirmation: true,
					deletedPartIds: extent.deletedParts.map((d) => d.part.id)
				},
				{ status: 409 }
			);
		}

		// A study with no passages is not a study. Refused before the transaction so nothing is
		// half-applied — the same refusal the single-study edit action makes.
		if (extent.keptParts.length + extent.narrowedParts.length === 0) {
			return json({ error: 'That edit would leave the study with no passages.' }, { status: 400 });
		}

		const result = await commit({
			seriesId,
			parts,
			extent,
			decisions,
			title,
			subtitle,
			translation: series.translation || 'esv',
			userId: session.user.id,
			chaptersPerPart,
			chaptersPerPassage
		});

		return json({ success: true, ...result }, { status: 200 });
	} catch (error) {
		console.error('Series reserialize error:', error);
		return json({ error: 'Failed to save changes' }, { status: 500 });
	}
};

/**
 * Apply the edit in ONE transaction.
 *
 * A partial failure would leave the study in a state no screen describes — some parts narrowed,
 * others deleted, `seriesOrder` half-renumbered. Everything below either happens or none of it does.
 */
async function commit({
	seriesId,
	parts,
	extent,
	decisions,
	title,
	subtitle,
	translation,
	userId,
	chaptersPerPart,
	chaptersPerPassage
}) {
	const now = new Date();

	return db.transaction(async (tx) => {
		const narrowedCount = await narrowParts(tx, extent, decisions);

		// ── Delete the parts that leave the study ────────────────────────────
		const deletedIds = extent.deletedParts.map((d) => d.part.id);
		if (deletedIds.length > 0) {
			await tx.delete(study).where(inArray(study.id, deletedIds));
		}

		// ── Close the gaps in seriesOrder ────────────────────────────────────
		//
		// Renumbered by REMOVAL, one deletion at a time, rather than re-derived from canonical
		// order — §4 forbids the latter, because it would silently undo a deliberate arrangement.
		let remaining = parts.filter((p) => !deletedIds.includes(p.id));
		for (const deleted of extent.deletedParts) {
			for (const update of renumberForRemoval(remaining, deleted.part.seriesOrder ?? 0)) {
				const target = remaining.find((p) => p.id === update.id);
				if (target) target.seriesOrder = update.seriesOrder;
			}
		}
		for (const part of remaining) {
			const original = parts.find((p) => p.id === part.id);
			if (original && original.seriesOrder !== part.seriesOrder) {
				await tx
					.update(study)
					.set({ seriesOrder: part.seriesOrder, updatedAt: now })
					.where(eq(study.id, part.id));
			}
		}

		// ── Division, planned against the PROJECTED parts ────────────────────
		//
		// Phase two of the same save. `diffSeams()` refuses to answer a division question across a
		// changed extent — and must, since asked that it once produced a "join" that silently kept
		// verses the user had removed. `projectExtent()` supplies the parts as they now ARE, after
		// phase one, so the guard is SATISFIED rather than bypassed.
		//
		// Runs after narrowing and deletion because it operates on what survives; running it first
		// would plan seams for parts that are about to disappear.
		const division = await applyDivision(tx, {
			seriesId,
			parts,
			extent,
			remaining,
			translation,
			userId,
			chaptersPerPart,
			chaptersPerPassage,
			now
		});

		// A split adds parts; the dissolve test below must see the post-division count or a series
		// that split back up to two parts would be wrongly dissolved.
		remaining = division.parts;

		const seriesUpdates = { updatedAt: now };
		if (typeof title === 'string' && title.trim() !== '') seriesUpdates.name = title.trim();
		if (typeof subtitle === 'string') {
			seriesUpdates.subtitle = subtitle.trim() === '' ? null : subtitle.trim();
		}

		// ── Dissolve, if only one part is left ───────────────────────────────
		//
		// §4: "a one-part series is a study wearing a costume." ORDER MATTERS — `study.series_id` is
		// ON DELETE CASCADE, so the back-reference must be cleared BEFORE the series row is removed,
		// or the surviving part would be destroyed with it. Same ordering the part-delete endpoint
		// documents, and for the same reason.
		let dissolved = false;
		if (remaining.length === 1) {
			await tx
				.update(study)
				.set({
					seriesId: null,
					seriesOrder: null,
					// The survivor becomes a standalone study and takes the series' title —
					// otherwise the user's study would silently be left named "Matthew 3".
					...(seriesUpdates.name ? { title: seriesUpdates.name } : {}),
					updatedAt: now
				})
				.where(eq(study.id, remaining[0].id));
			await tx.delete(studySeries).where(eq(studySeries.id, seriesId));
			dissolved = true;
		} else {
			await tx.update(studySeries).set(seriesUpdates).where(eq(studySeries.id, seriesId));
			// `lastPartId` is ON DELETE SET NULL, so a deleted remembered part leaves a null rather
			// than a dangling reference — nothing to repair here.
		}

		return {
			narrowedPassages: narrowedCount,
			deletedParts: deletedIds.length,
			splitParts: division.splits,
			joinedParts: division.joins,
			remainingParts: remaining.length,
			dissolved,
			dissolvedIntoStudyId: dissolved ? remaining[0].id : null
		};
	});
}

/**
 * Re-divide the surviving parts — phase two of the same save.
 *
 * ## The seams are diffed against the PROJECTED parts
 *
 * By the time this runs, phase one has already narrowed and deleted rows, so the database holds the
 * new extent. `projectExtent()` reproduces that same shape in memory, which is what the seam diff
 * reasons about — so `diffSeams()`'s precondition (both sides cover the same verses) holds by
 * construction rather than by being waived.
 *
 * ## Joins before splits
 *
 * A join removes a part and a split adds one, and both shift `seriesOrder`. Doing joins first means
 * every split is planned against a sequence that has already contracted, so the inserted order is
 * correct without a second renumbering pass. Reversing them would leave a split's new part sitting
 * at an order a subsequent join then closes over.
 *
 * ⚠️ Reuses `planPartSplit`/`planPartJoin` and the structure helpers rather than reimplementing
 * them. The split and join ENDPOINTS each open their own transaction, so their bodies cannot be
 * called from inside this one; the shared planners and `seriesStructure.js` executors can be, and
 * they are the parts that carry the safety argument.
 *
 * @returns {Promise<{parts: Array<Object>, splits: number, joins: number}>}
 */
async function applyDivision(
	tx,
	{
		seriesId,
		parts,
		extent,
		remaining,
		translation,
		userId,
		chaptersPerPart,
		chaptersPerPassage,
		now
	}
) {
	// No division requested: leave the seams exactly as they are. An edit that only changed passages
	// must not re-divide the series as a side effect.
	const wantsDivision = Number.isFinite(Number(chaptersPerPart)) && Number(chaptersPerPart) >= 1;
	if (!wantsDivision || remaining.length === 0) {
		return { parts: remaining, splits: 0, joins: 0 };
	}

	// The parts as they now are, in memory. Built from the ORIGINAL rows plus the extent
	// classification, which is exactly what phase one wrote.
	const projected = projectExtent(parts, extent).filter((p) =>
		remaining.some((r) => r.id === p.id)
	);
	if (projected.length === 0) return { parts: remaining, splits: 0, joins: 0 };

	const plan = planSeriesParts({
		passages: recomposePassages(projected),
		chaptersPerPart: Number(chaptersPerPart),
		chaptersPerPassage: Array.isArray(chaptersPerPassage) ? chaptersPerPassage : [],
		translationId: translation,
		baseTitle: ''
	});

	const diff = diffSeams({ parts: projected, plannedParts: plan.parts });

	// A refusal here is a fault in the projection, not a user error — phase one has already run, so
	// the extents cannot legitimately differ. Surfaced loudly rather than silently skipped: a
	// division that quietly does nothing is the failure this whole feature was built to remove.
	if (diff.refusals.length > 0) {
		throw new Error(`Division could not be planned: ${diff.refusals[0]}`);
	}

	let live = projected;
	let joinCount = 0;
	let splitCount = 0;

	// ── Joins ────────────────────────────────────────────────────────────────
	for (const join of diff.joins) {
		for (const absorbId of join.absorbIds) {
			const result = await joinOnce(tx, {
				seriesId,
				parts: live,
				keepId: join.keepId,
				absorbId,
				translation,
				now
			});
			live = result.parts;
			joinCount += 1;
		}
	}

	// ── Splits ───────────────────────────────────────────────────────────────
	for (const split of diff.splits) {
		// Each division follows the part most recently created: `planPartSplit()` leaves the first
		// half on the original id and puts the second half on a new one, so the remaining chapters
		// of a multi-way split live in the newest part.
		let targetId = split.partId;
		for (const afterChapter of split.afterChapters) {
			const result = await splitOnce(tx, {
				seriesId,
				parts: live,
				partId: targetId,
				afterChapter,
				translation,
				userId,
				now
			});
			if (!result) break;
			live = result.parts;
			targetId = result.newPartId;
			splitCount += 1;
		}
	}

	return { parts: live, splits: splitCount, joins: joinCount };
}

/**
 * Merge one part into its neighbour, inside the caller's transaction.
 *
 * The same sequence `api/series/[id]/join` performs, and for the same reasons — structure is
 * re-parented BEFORE the absorbed passage row can be deleted, because
 * `passage_column.passage_id` is ON DELETE CASCADE and the reverse order would destroy the user's
 * columns, notes and commentary while reporting success.
 */
async function joinOnce(tx, { seriesId, parts, keepId, absorbId, translation, now }) {
	const plan = planPartJoin({
		parts,
		partId: keepId,
		direction: 'next',
		translationId: translation
	});
	// The planner refuses non-adjacent joins. `diffSeams()` only ever proposes seams inside a run,
	// so a refusal here means the two disagree — worth failing loudly rather than skipping.
	if (!plan.ok || plan.absorb?.id !== absorbId) {
		throw new Error(plan.error ?? 'That join is no longer valid.');
	}

	const keepRows = await rowsOf(tx, keepId);
	const absorbRows = await rowsOf(tx, absorbId);
	const coalesces = plan.passages.length < keepRows.length + absorbRows.length;

	// 1. Structure first, while both passage rows still exist.
	const moved = await joinPassageStructure(tx, {
		fromPassageId: absorbRows[0]?.id,
		toPassageId: keepRows[0]?.id,
		targetStudyId: keepId,
		seriesId,
		deleteEmptied: coalesces
	});
	await preserveCrossPartConnections(tx, moved.straddlingConnections, seriesId);

	// 2. The surviving part takes the merged range. Rows are UPDATED, never recreated.
	const rows = [...keepRows, ...absorbRows];
	for (let i = 0; i < plan.passages.length; i += 1) {
		const range = plan.passages[i];
		const row = rows[i];
		if (!row) continue;
		const bookId = range.bookId ?? range.book;
		await tx
			.update(passage)
			.set({
				studyId: keepId,
				testament: range.testament,
				bookId,
				bookName: range.bookName ?? bookId,
				fromChapter: range.fromChapter,
				toChapter: range.toChapter,
				fromVerse: range.fromVerse,
				toVerse: range.toVerse,
				displayOrder: i,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, row.id));
	}

	// 3. The absorbed study row goes; its passages are already re-parented or removed.
	await tx.delete(study).where(eq(study.id, absorbId));

	// 4. Close the gap in seriesOrder locally — never re-derived from canonical order (§4).
	const absorbedOrder = plan.absorb.seriesOrder ?? 0;
	for (const update of renumberForRemoval(parts, absorbedOrder)) {
		await tx
			.update(study)
			.set({ seriesOrder: update.seriesOrder, updatedAt: now })
			.where(eq(study.id, update.id));
	}

	const next = parts
		.filter((p) => p.id !== absorbId)
		.map((p) =>
			p.id === keepId
				? { ...p, passages: plan.passages }
				: (p.seriesOrder ?? 0) > absorbedOrder
					? { ...p, seriesOrder: (p.seriesOrder ?? 0) - 1 }
					: p
		);

	return { parts: next };
}

/**
 * Divide one part at a chapter line, inside the caller's transaction.
 *
 * Mirrors `api/series/[id]/split`. The original row is NARROWED to the first half — updated, never
 * deleted and recreated — and a new row receives the second half; structure moves across before
 * anything is removed.
 */
async function splitOnce(tx, { seriesId, parts, partId, afterChapter, translation, userId, now }) {
	const target = parts.find((p) => p.id === partId);
	if (!target) return null;

	const plan = planPartSplit({ part: target, afterChapter, translationId: translation });
	if (!plan.ok) throw new Error(plan.error ?? 'That split is no longer valid.');

	const rows = await rowsOf(tx, partId);
	if (rows.length === 0) return null;

	const boundaryWordId = rangeFirstWordId({
		testament: plan.second[0].testament,
		bookId: plan.second[0].bookId ?? plan.second[0].book,
		fromChapter: plan.second[0].fromChapter,
		fromVerse: plan.second[0].fromVerse
	});
	if (!boundaryWordId) throw new Error('The split point could not be resolved.');

	// 1. seriesOrder is SHIFTED, never re-derived (§4).
	const { inserted, updates } = renumberForInsert(parts, target.seriesOrder ?? 0);
	for (const update of updates) {
		await tx
			.update(study)
			.set({ seriesOrder: update.seriesOrder, updatedAt: now })
			.where(eq(study.id, update.id));
	}

	const newPartId = uuidv4();
	const second = plan.second[0];
	const secondBook = second.bookId ?? second.book;
	await tx.insert(study).values({
		id: newPartId,
		// Named for what it CONTAINS: a number in the title is maintained by nothing, while
		// `seriesOrder` is, and two parts claiming "Part 3" would be worse than a plain reference.
		title: `${second.bookName ?? secondBook} ${second.fromChapter}–${second.toChapter}`,
		subtitle: null,
		// NOT NULL with no default (trap 16): omitting it fails at runtime, not at build time.
		translation,
		userId,
		// A part's home is its series, never a group directly.
		groupId: null,
		seriesId,
		seriesOrder: inserted,
		createdAt: now,
		updatedAt: now
	});

	// 2. Narrow the original row and create the second half's row.
	const first = plan.first[0];
	await tx
		.update(passage)
		.set({
			fromChapter: first.fromChapter,
			fromVerse: first.fromVerse,
			toChapter: first.toChapter,
			toVerse: first.toVerse,
			cachedText: null,
			textCachedAt: null
		})
		.where(eq(passage.id, rows[0].id));

	const newPassageId = uuidv4();
	await tx.insert(passage).values({
		id: newPassageId,
		studyId: newPartId,
		testament: second.testament,
		bookId: secondBook,
		bookName: second.bookName ?? secondBook,
		fromChapter: second.fromChapter,
		toChapter: second.toChapter,
		fromVerse: second.fromVerse,
		toVerse: second.toVerse,
		displayOrder: 0,
		createdAt: now
	});

	// 3. Structure moves BEFORE anything is deleted — the whole safety argument.
	const moved = await splitPassageStructure(tx, {
		passageId: rows[0].id,
		newPassageId,
		boundaryWordId,
		newStudyId: newPartId,
		seriesId
	});
	// Preserved as cross-part rows rather than destroyed (§8 strategy (c)).
	await preserveCrossPartConnections(tx, moved.straddlingConnections, seriesId);

	const next = parts.map((p) =>
		p.id === partId
			? { ...p, passages: plan.first }
			: (p.seriesOrder ?? 0) > (target.seriesOrder ?? 0)
				? { ...p, seriesOrder: (p.seriesOrder ?? 0) + 1 }
				: p
	);
	next.push({
		id: newPartId,
		title: `${second.bookName ?? secondBook} ${second.fromChapter}–${second.toChapter}`,
		seriesOrder: inserted,
		passages: plan.second
	});

	return { parts: next, newPartId };
}

/** A part's passage rows, in display order. */
async function rowsOf(tx, studyId) {
	return tx
		.select()
		.from(passage)
		.where(eq(passage.studyId, studyId))
		.orderBy(asc(passage.displayOrder));
}

/**
 * Narrow every part that shrinks, applying the user's Merge/Delete decisions.
 *
 * Runs FIRST in the transaction, because it is the only step that can PRESERVE authored work: a
 * delete performed earlier could destroy structure this step was about to merge into a survivor.
 *
 * @returns {Promise<number>} How many passage rows were narrowed
 */
async function narrowParts(tx, extent, decisions) {
	let narrowed = 0;

	for (const entry of extent.narrowedParts) {
		const rows = entry.part.passages;

		for (const change of entry.changes) {
			const row = matchRow(rows, change.old);
			if (!row) continue;

			const next = {
				id: row.id,
				testament: change.next.testament,
				book: change.next.book,
				fromChapter: change.next.fromChapter,
				fromVerse: change.next.fromVerse,
				toChapter: change.next.toChapter,
				toVerse: change.next.toVerse
			};

			// ⚠️ UPDATE, never delete-and-reinsert. `passage_column.passage_id` is ON DELETE
			// CASCADE, so recreating this row would take every column, section, segment, heading,
			// note and commentary with it — silently, while the save reported success. The trap
			// `api/series/[id]/split/+server.js` documents at length.
			//
			// `cachedText` is keyed by the verse range, so a narrowed passage holding its old text
			// would render verses the study no longer covers.
			await tx
				.update(passage)
				.set({
					fromChapter: next.fromChapter,
					fromVerse: next.fromVerse,
					toChapter: next.toChapter,
					toVerse: next.toVerse,
					cachedText: null,
					textCachedAt: null
				})
				.where(eq(passage.id, row.id));

			// Structure that would be orphaned is merged or deleted per the user's choice, through
			// the SAME reconciler a single-study edit uses. Decisions are keyed by passage id,
			// which is what `PassageReview` keys them by — so the choice shown is the choice applied.
			await applyPassageRangeChange(tx, entry.part.id, row, next, decisions[row.id] || {});
			narrowed += 1;
		}

		// Ranges of a MULTI-range part that left entirely while the part survives through another
		// range. The row goes, and its structure with it by cascade — which is exactly what the
		// review reported for these verses.
		for (const removed of entry.removedRanges) {
			const row = matchRow(rows, removed);
			if (row) await tx.delete(passage).where(eq(passage.id, row.id));
		}
	}

	return narrowed;
}

/**
 * The existing passage row matching a range's ORIGINAL bounds.
 *
 * Matched on the bounds `classifyExtent()` carried through, never by position: silently falling
 * back to "the first row" would apply the user's decision to a passage other than the one they
 * were shown.
 */
function matchRow(rows, original) {
	return (
		rows.find(
			(row) =>
				(row.bookId ?? row.book) === original.book &&
				row.testament === original.testament &&
				row.fromChapter === original.fromChapter &&
				row.fromVerse === original.fromVerse &&
				row.toChapter === original.toChapter &&
				row.toVerse === original.toVerse
		) ?? null
	);
}

/**
 * Load every part of a series with its passages attached.
 *
 * ⚠️ `inArray` over EVERY part id — the under-count trap recorded in the join endpoint, where a
 * per-part omission made every seam look like a gap.
 */
async function loadPartsWithPassages(dbx, seriesId, userId) {
	const parts = await dbx
		.select()
		.from(study)
		.where(and(eq(study.seriesId, seriesId), eq(study.userId, userId)))
		.orderBy(asc(study.seriesOrder));

	if (parts.length === 0) return [];

	const rows = await dbx
		.select()
		.from(passage)
		.where(
			inArray(
				passage.studyId,
				parts.map((p) => p.id)
			)
		)
		.orderBy(asc(passage.displayOrder));

	const byStudy = new Map(parts.map((p) => [p.id, []]));
	for (const row of rows) {
		byStudy.get(row.studyId)?.push(row);
	}

	return parts.map((part) => ({ ...part, passages: byStudy.get(part.id) ?? [] }));
}
