import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { planPartJoin, renumberForRemoval } from '$lib/utils/seriesRestructure.js';
import {
	joinPassageStructure,
	inspectPassageJoin,
	preserveCrossPartConnections
} from '$lib/server/db/seriesStructure.js';
import { validateStudyDisplayLimits } from '$lib/utils/translationLimits.js';
import { formatPassageReference } from '$lib/utils/passageFormatting.js';

/** A human reference spanning a set of ranges. */
function referenceFor(ranges) {
	const first = ranges?.[0];
	if (!first) return null;
	const last = ranges[ranges.length - 1];
	return formatPassageReference({
		bookName: first.bookName ?? first.bookId ?? first.book,
		fromChapter: first.fromChapter,
		fromVerse: first.fromVerse,
		toChapter: last.toChapter,
		toVerse: last.toVerse
	});
}

/**
 * What a dissolving series hands to the study it leaves behind.
 *
 * Only `name` → `title` and `subtitle`. Deliberately NOT `groupId`: a series may live in a group
 * while its parts carry `groupId: null` (see `api/series/+server.js`, which nulls them so a part is
 * not rendered both inside the series and beside it), so copying placement here would be the right
 * idea applied to the wrong column — and on dissolve the survivor is already wherever the series
 * put it. Nor `description`: `study` has no such column.
 *
 * A guard on the name rather than an unconditional copy. `study.title` is `.notNull()`, and while
 * `study_series.name` is too, a blank-but-present name would otherwise replace a real part title
 * with an empty string — a worse outcome than the stale title this whole helper exists to avoid.
 *
 * @param {{ name?: string|null, subtitle?: string|null }|null|undefined} series
 * @returns {{ title?: string, subtitle?: string|null }}
 */
function dissolvedIdentity(series) {
	/** @type {{ title?: string, subtitle?: string|null }} */
	const fields = {};
	const name = series?.name?.trim();
	if (name) fields.title = name;
	// Copied even when null: the series' subtitle is the one that matched the inherited title, so
	// keeping the part's own would caption the study with a line written for something else.
	if (series && 'subtitle' in series) {
		const subtitle = series.subtitle?.trim();
		fields.subtitle = subtitle ? subtitle : null;
	}
	return fields;
}

/**
 * Load every part of a series with its passages attached.
 *
 * `planPartJoin()` reads `part.passages` to classify the boundary via `isBoundaryContiguous()`, so
 * the ranges must travel with the parts. One indexed query for the passages, grouped in memory,
 * rather than a query per part.
 */
async function loadPartsWithPassages(dbx, seriesId, userId) {
	const parts = await dbx
		.select()
		.from(study)
		.where(and(eq(study.seriesId, seriesId), eq(study.userId, userId)))
		.orderBy(asc(study.seriesOrder));

	if (parts.length === 0) return [];

	// ⚠️ `inArray` over EVERY part id, not `eq` on the first one. Written the wrong way first, and
	// the failure would have been silent in the worst way: every part but one would have arrived
	// with an empty `passages` array, so `classifyBoundary()` — which returns 'gap' when a range is
	// missing — would have called every seam a gap. Join Parts would then refuse every legal join
	// with "these parts aren't adjacent in Scripture", a confident false statement about the user's
	// data rather than a visible fault. The same class as the `studyId` under-count §8 records.
	const rows = await dbx
		.select()
		.from(passage)
		.where(
			inArray(
				passage.studyId,
				parts.map((p) => p.id)
			)
		);

	const byStudy = new Map();
	for (const part of parts) {
		byStudy.set(part.id, []);
	}
	for (const row of rows) {
		const list = byStudy.get(row.studyId);
		if (list) list.push(row);
	}

	return parts.map((part) => ({
		...part,
		passages: (byStudy.get(part.id) ?? []).sort(
			(a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
		)
	}));
}

/**
 * Merge a part with its previous or next neighbour (SERIES_PLAN §8, "Join Parts").
 *
 * Q27: next and previous only, never arbitrary — joining non-neighbours would have to invent an
 * order for the result. Q28: the earlier part in sequence keeps its title, and the discarded one is
 * named in the confirmation before it goes.
 *
 * ## This is the destructive one
 *
 * `planPartJoin()` coalesces two abutting ranges into ONE, which means the absorbed part's passage
 * row disappears. `joinPassageStructure()` re-parents its structure first and refuses to delete a
 * passage row that still owns columns, because `ON DELETE CASCADE` would otherwise take the user's
 * columns, sections, segments, headings, notes and commentary while the join reported success.
 *
 * `dryRun` reports the outcome — which title is discarded, how many connections cannot survive,
 * whether the series dissolves — from the same functions the commit runs.
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
			partId,
			direction,
			dryRun = false,
			confirmConnectionLoss = false,
			// Opt-in, and only ever sent after the user has SEEN the planner refuse the ordinary
			// join and chosen the alternative. Absent, this endpoint behaves exactly as before.
			allowNonContiguous = false
		} = body;

		if (!partId || typeof partId !== 'string') {
			return json({ error: 'partId is required' }, { status: 400 });
		}
		if (direction !== 'previous' && direction !== 'next') {
			return json({ error: "direction must be 'previous' or 'next'" }, { status: 400 });
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
		if (!parts.some((p) => p.id === partId)) {
			return json({ error: 'That part is not in this series' }, { status: 404 });
		}

		// A two-part series joined back into one is no longer a series: §4 says "a one-part series
		// is a study wearing a costume", and part delete already dissolves at that threshold.
		// Reported so the confirmation can say so, rather than surprising the user afterwards.
		const willDissolve = parts.length === 2;
		const translationId = parts.find((p) => p.id === partId)?.translation || 'esv';

		const plan = planPartJoin({ parts, partId, direction, translationId, allowNonContiguous });
		if (!plan.ok) {
			// The planner distinguishes different-books from gap from overlap, each with its own
			// sentence. Passed through unchanged: §11 requires a dead command to say WHY, and never
			// to promise a fix that is not coming.
			//
			// With `allowNonContiguous` sent by the dialog, the only refusals that reach a user
			// here are the genuinely impossible ones — overlap, or a part with no neighbour in the
			// chosen direction. A gap no longer lands in this branch at all; it is a warning on a
			// successful plan.
			return json({ error: plan.error }, { status: 400 });
		}

		// §10.1: the joined part grows and the display cap is per page, so this must be re-checked.
		// Export limits are deliberately not re-run — a join is verse-conservative.
		const display = validateStudyDisplayLimits(plan.passages, translationId);

		const keepPassages = plan.keep.passages ?? [];
		const absorbPassages = plan.absorb.passages ?? [];

		// Do the two ranges coalesce into one row, or do both survive? `planPartJoin()` coalesces
		// only across a CONTIGUOUS seam. This decides whether a passage row is deleted at all,
		// which is exactly the case `deleteEmptied` guards.
		//
		// ⚠️ Counted from the rows rather than read from `plan.coalesced`, and the two must agree.
		// Only this function knows how many passage rows the two parts actually hold, and it is the
		// row count that determines whether one is left over to delete. Until non-contiguous joins
		// existed this was always `true` for a same-book seam; it is now genuinely both, so the
		// `deleteEmptied: false` path below runs for the first time.
		const coalesces = plan.passages.length < keepPassages.length + absorbPassages.length;

		// ⚠️ The connection count belongs in the DRY RUN, not only in the 409.
		//
		// Written without this first, and the consequence was a dead end: the modal shows an
		// acknowledgement checkbox only when it knows connections will break, so with the count
		// absent from the preview the checkbox never rendered — and the commit then answered 409
		// "confirm to continue" with no way to confirm. Q23's warn-then-delete requires the warning
		// to be visible BEFORE the user commits, which means it has to be part of the preview.
		const probe = await joinPassageStructureProbe(absorbPassages);

		const report = {
			ok: true,
			connections: { crossPart: probe.straddling, broken: 0 },
			keepId: plan.keep.id,
			keepTitle: plan.keep.title,
			absorbId: plan.absorb.id,
			absorbTitle: plan.absorb.title,
			passages: plan.passages,
			reference: referenceFor(plan.passages),
			warnings: plan.warnings,
			display: display.warnings,
			// Q28: what has nowhere to go. Deliberately short, not padded to look thorough —
			// structure, notes and commentary are all re-parented intact.
			discards: plan.discards,
			// So the dialog can say which of the two outcomes it is about to produce: one merged
			// range, or one part carrying both ranges as separate passages.
			coalesced: plan.coalesced,
			seamKind: plan.seamKind,
			willDissolve
		};

		if (dryRun) {
			return json({ ...report, dryRun: true });
		}

		// A join is the one structural operation that can CREATE a display breach out of two
		// compliant parts: the joined part holds both ranges, and the page cap applies to the sum.
		// Refused only under a 'block' posture — `display.blocked` is already
		// `!compliant && enforcement === 'block'`, so a warn-posture translation still joins and
		// still reports the warning in `report`.
		//
		// ⚠️ AFTER the dry-run return, deliberately. The preview must still describe the join and
		// carry the warning so `JoinPartsModal` can show it; it is the COMMIT that is refused. A
		// preview that 400s would leave the modal with nothing to render and no way to explain why.
		if (display.blocked) {
			return json(
				{
					error: `The joined part cannot be displayed: ${display.warnings[0]} Leave these parts separate, or shorten the study.`
				},
				{ status: 400 }
			);
		}

		return await commitJoin({
			plan,
			parts,
			report,
			seriesId,
			series,
			keepPassages,
			absorbPassages,
			coalesces,
			willDissolve,
			confirmConnectionLoss,
			probe
		});
	} catch (error) {
		console.error('Error joining parts:', error);
		return json({ error: 'Failed to join the parts' }, { status: 500 });
	}
};

/**
 * Perform the join in one transaction.
 *
 * Split out because the connection check can only be answered after inspecting structure, which
 * means it happens *inside* the transaction — and refusing at that point must roll back everything
 * already written. Doing that with a thrown sentinel inside a 200-line handler hid the control
 * flow; here the two outcomes are visible side by side.
 */
async function commitJoin({
	plan,
	parts,
	report,
	seriesId,
	series,
	keepPassages,
	absorbPassages,
	coalesces,
	willDissolve,
	confirmConnectionLoss,
	probe
}) {
	// ⚠️ No confirmation gate: phase 3 preserves cross-part connections rather than deleting them
	// (§8 strategy (c)), so there is no loss to acknowledge. See the split endpoint for the full note.
	// `confirmConnectionLoss` is still accepted and ignored, so an un-redeployed client keeps working.

	const result = await db.transaction(async (tx) => {
		const now = new Date();

		// 1. Re-parent the absorbed part's structure BEFORE anything is deleted. When the ranges
		//    coalesce the absorbed passage row goes away; when they do not, both rows survive and
		//    only their owner changes — which is what `deleteEmptied` distinguishes.
		const moved = await joinPassageStructure(tx, {
			fromPassageId: absorbPassages[0]?.id,
			toPassageId: keepPassages[0]?.id,
			targetStudyId: plan.keep.id,
			seriesId,
			deleteEmptied: coalesces
		});

		// The caller has already acknowledged this count (or there is nothing to acknowledge).
		// Preserved as cross-part rows rather than deleted (§8 (c)). A Join Parts that absorbs one part
		// into another can still leave a connection reaching outside the merged part — to a THIRD part —
		// and that link survives now instead of being destroyed.
		await preserveCrossPartConnections(tx, moved.straddlingConnections, seriesId);

		// 2. The surviving part takes the merged range, and keeps its own title (Q28).
		const rows = [...keepPassages, ...absorbPassages];
		for (let i = 0; i < plan.passages.length; i += 1) {
			const range = plan.passages[i];
			const row = rows[i];
			if (!row) continue;
			const bookId = range.bookId ?? range.book;
			await tx
				.update(passage)
				.set({
					studyId: plan.keep.id,
					testament: range.testament,
					bookId,
					bookName: range.bookName ?? bookId,
					fromChapter: range.fromChapter,
					toChapter: range.toChapter,
					fromVerse: range.fromVerse,
					toVerse: range.toVerse,
					displayOrder: i,
					// Keyed by the verse range, so a widened passage must refetch its text.
					cachedText: null,
					textCachedAt: null
				})
				.where(eq(passage.id, row.id));
		}

		// 3. The absorbed study row goes. Its passages have already been re-parented or deleted, so
		//    this cannot cascade into anything the user authored.
		await tx.delete(study).where(eq(study.id, plan.absorb.id));

		// 4. Close the gap in seriesOrder locally — never re-derive it (§4).
		for (const update of renumberForRemoval(parts, plan.absorb.seriesOrder ?? 0)) {
			await tx
				.update(study)
				.set({ seriesOrder: update.seriesOrder, updatedAt: now })
				.where(eq(study.id, update.id));
		}

		// 5. Down to one part: dissolve, exactly as part delete does. ORDER MATTERS —
		//    `study.series_id` is ON DELETE CASCADE, so the back-reference must be cleared BEFORE
		//    the series row is removed or the survivor would be destroyed with it.
		//
		// ⚠️ The survivor also inherits the SERIES' identity, not just its verses. Q28 says the
		// earlier part keeps its title, and that is right while a series still exists — but when
		// the series dissolves there is no longer anything called by the series' name, and the
		// study the user is left holding would be named "Part 1" (or "Ecclesiastes 1:9-11") while
		// the name they actually chose is deleted with the series row. The series name is the more
		// specific of the two: a part title is auto-generated at creation, a series name was typed.
		// `reserialize` already does this at its own dissolve for the same reason; the two must not
		// disagree about what a dissolved series leaves behind.
		let dissolved = false;
		if (willDissolve) {
			await tx
				.update(study)
				.set({
					seriesId: null,
					seriesOrder: null,
					...dissolvedIdentity(series),
					updatedAt: now
				})
				.where(eq(study.id, plan.keep.id));
			await tx.delete(studySeries).where(eq(studySeries.id, seriesId));
			dissolved = true;
		} else {
			await tx
				.update(studySeries)
				.set({ lastPartId: plan.keep.id, updatedAt: now })
				.where(eq(studySeries.id, seriesId));
		}

		await tx.update(study).set({ updatedAt: now }).where(eq(study.id, plan.keep.id));

		return { moved, dissolved };
	});

	return json({
		...report,
		dissolved: result.dissolved,
		// The name the user is left holding. Reported because the dissolve renames the survivor,
		// and a client that refetches the tree should not be the only way to discover that.
		dissolvedIntoStudyId: result.dissolved ? plan.keep.id : null,
		dissolvedTitle: result.dissolved ? (dissolvedIdentity(series).title ?? plan.keep.title) : null,
		movedSegments: result.moved.movedSegments,
		crossPartConnections: result.moved.straddlingConnections.length,
		brokenConnections: 0
	});
}

/**
 * How many connections a join would break, without writing.
 *
 * A join re-parents whole columns, so a connection is broken only when exactly one of its endpoints
 * is inside the absorbed passage. Answered by the same classifier the commit uses.
 */
async function joinPassageStructureProbe(absorbPassages) {
	const fromPassageId = absorbPassages[0]?.id;
	if (!fromPassageId) return { needsConfirmation: false, straddling: 0 };

	// Only the SOURCE passage matters: a join re-parents whole columns, so whether a connection
	// breaks depends solely on whether one of its endpoints is inside the passage being absorbed.
	// Passing the destination too would imply it affects the answer, and the type-checker caught
	// that it does not.
	const inspection = await inspectPassageJoin(db, { fromPassageId });

	return {
		needsConfirmation: inspection.straddlingConnections.length > 0,
		straddling: inspection.straddlingConnections.length
	};
}
