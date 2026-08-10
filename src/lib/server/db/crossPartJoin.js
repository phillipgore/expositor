/**
 * # Join Segment across a passage boundary (SERIES_PLAN §8)
 *
 * The first of §8's five commands generalised from passage scope to sequence scope. It handles only
 * the case the existing `joinSegment()` refuses: the active segment is the **first in its passage**, so
 * its predecessor lives in the previous passage — which may be an earlier passage of the same study, or
 * the last passage of the previous part of a series.
 *
 * ## Why a separate function rather than a rewrite of `joinSegment()`
 *
 * The within-passage path already works, is exercised daily, and folds content correctly. §8 warns
 * that generalising has "two call graphs to generalise, not one", and de-duplicating
 * `passageJoin`/`passageReconcile` is a recorded **non-goal** for now. Rewriting `joinSegment()` in
 * place would put the risky new path and the working old one inside the same function, on a command
 * that destroys content. So the endpoint routes: same passage → existing code, untouched; across a
 * boundary → here. The shared fold helpers (`foldSegmentContent`, `reanchorConnectionsOnto`) are
 * reused rather than copied, so content semantics cannot drift between the two paths.
 *
 * ## What crossing adds beyond the within-passage join
 *
 * A within-passage join deletes a segment and re-anchors its parents. Crossing must additionally:
 *
 * 1. verify the seam is eligible (`resolveScope`, borrowing the contiguity predicate);
 * 2. **move the passage boundary** (`planBoundaryShift`) — the verses the joined segment covered now
 *    belong to the earlier passage, or the structure ends up in one part and the words in another;
 * 3. invalidate `cachedText` on both passages, since it is keyed by verse range;
 * 4. re-validate display compliance on both (§10.1) — and NOT export compliance, which §10.1 proves
 *    cannot change, because a boundary move is verse-conservative.
 *
 * @module crossPartJoin
 */

import {
	passage,
	study,
	passageColumn,
	passageSection,
	passageSegment,
	segmentConnection
} from './schema.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { resolveScope } from '$lib/utils/sequenceScope.js';
import { planBoundaryShift } from '$lib/utils/boundaryMove.js';
import { compareWordIds } from '$lib/utils/wordIds.js';
import { loadPassageSequence } from './passageSequence.js';
import { foldSegmentContent, reanchorConnectionsOnto } from './passageFold.js';
import { getBookMeta } from './passageReconcile.js';
import { validateStudyDisplayLimits, getDisplayLimits } from '$lib/utils/translationLimits.js';

/** Every segment of one passage's tree, in word order. */
function segmentsOf(entry) {
	const out = [];
	for (const column of entry?.tree ?? []) {
		for (const section of column.sections ?? []) {
			for (const segment of section.segments ?? []) out.push(segment);
		}
	}
	out.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
	return out;
}

/**
 * The segments that move when `itemId` (of `granularity`) is joined backwards.
 *
 * A segment moves alone. A section takes its segments; a column takes every segment of every section
 * it holds. This is what makes the three granularities one operation rather than three: the boundary
 * question is always "which segments leave this passage?", and the answer differs only in how many.
 */
function movingSegmentsFor(entry, granularity, itemId) {
	if (granularity === 'segment') {
		return segmentsOf(entry).filter((s) => s.id === itemId);
	}

	const out = [];
	for (const column of entry?.tree ?? []) {
		if (granularity === 'column' && column.id !== itemId) continue;
		for (const section of column.sections ?? []) {
			if (granularity === 'section' && section.id !== itemId) continue;
			for (const segment of section.segments ?? []) out.push(segment);
		}
	}
	out.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
	return out;
}

/**
 * A segment belonging to the join target, for `reanchorConnectionsOnto`'s segment map.
 *
 * When a section or column is joined, a connection anchored to one of ITS segments still needs a
 * surviving segment to remap onto. The target's first segment in word order is that survivor. Returns
 * null when the target holds none, in which case `reanchorConnectionsOnto` falls back to deleting the
 * affected connections rather than remapping onto nothing — its documented behaviour for a missing
 * target.
 */
function firstSegmentOfTarget(targetEntry, granularity) {
	if (granularity === 'section') {
		const segments = (targetEntry?.item?.segments ?? []).slice();
		segments.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
		return segments[0] ?? null;
	}
	// A column: its first section's first segment.
	const sections = (targetEntry?.item?.sections ?? []).slice();
	sections.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
	for (const section of sections) {
		const segments = (section.segments ?? []).slice();
		segments.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
		if (segments[0]) return segments[0];
	}
	return null;
}

/**
 * Where the boundary must land for a join that pulls an item backwards.
 *
 * Structure has **implicit extent**: an item runs from its own anchor until the next item of its kind
 * begins (`passageReconcile.js` states this). So after the join the earlier passage must extend to
 * cover exactly the span that left, which means the new boundary is the anchor of the first segment
 * that **stays** — not simply the next segment after the active one.
 *
 * ⚠️ That distinction is why this is computed from the *set* of moving segments rather than from the
 * active item's own successor. For Join Segment the two coincide, which is what the first version
 * relied on; for Join Section and Join Column they do not, because several segments leave at once and
 * the next segment after the *first* of them is still moving. Using the active item's successor there
 * would leave the boundary inside the moved block, so the earlier part would claim verses whose
 * structure had also moved and the later part would render text it no longer owned.
 *
 * If nothing stays, the join would move every verse out of the passage — that is Join Parts, a
 * different command with its own confirmation and its own deletion. Refused rather than silently
 * promoted, the same rule `planBoundaryShift` enforces.
 */
function planBoundaryShiftForJoin(sequence, scope, granularity) {
	const activeEntry = sequence[scope.active.passageIndex];
	const targetEntry = sequence[scope.target.passageIndex];

	const moving = new Set(
		movingSegmentsFor(activeEntry, granularity, scope.active.id).map((s) => s.id)
	);
	const staying = segmentsOf(activeEntry).filter((s) => !moving.has(s.id));

	if (staying.length === 0) {
		// Returns the SAME shape as planBoundaryShift's own failure, including `before`/`after`. The
		// first version omitted them, and svelte-check rejected every later `shift.before` read against
		// the resulting union — a genuine inconsistency, not a typing nuisance: two failure shapes from
		// one function is how a caller ends up reading a field that is sometimes absent.
		return {
			ok: false,
			error: `Joining this ${granularity} would move every verse out of its part. Use Join Parts to merge them instead.`,
			before: /** @type {Object|null} */ (null),
			after: /** @type {Object|null} */ (null),
			versesMoved: 0,
			direction: /** @type {'backward'|'forward'|'none'} */ ('none')
		};
	}

	// The first segment that stays sets the new boundary. `staying` is already in word order.
	return planBoundaryShift({
		before: targetEntry.passage,
		after: activeEntry.passage,
		newBoundaryWordId: staying[0].startingWordId
	});
}

/**
 * Display-limit warnings for both affected studies after the proposed shift (§10.1).
 *
 * ⚠️ Checked per STUDY, not per passage. The display cap is per page, so a study's other passages count
 * towards it — validating only the two changed ranges would under-report on a multi-passage part. The
 * changed range is substituted into its study's full passage list, which is what the page will render.
 */
async function displayWarnings(dbx, targetEntry, activeEntry, shift, translationId) {
	const forStudy = async (studyId, replacement) => {
		const rows = await dbx.select().from(passage).where(eq(passage.studyId, studyId));
		const substituted = rows.map((r) => (r.id === replacement.id ? replacement : r));
		return validateStudyDisplayLimits(substituted, translationId).warnings;
	};

	const receiver = await forStudy(targetEntry.studyId, shift.before);
	const donor = await forStudy(activeEntry.studyId, shift.after);

	// ── Q41: what a boundary move does once `enforcement` flips to 'block' ────
	//
	// SETTLED as the plan's own recommendation: **a pre-move confirmation that can be declined, never a
	// mid-gesture failure.** Today every `enforcement` is 'warn', so `blocked` is always false and this
	// is latent — but the decision is made here rather than left for whoever flips the flag, because
	// the wrong answer is the one that arrives by default.
	//
	// The wrong answer is throwing. COMPLIANCE.md §1.6 chose warn-over-block partly to avoid "stranding
	// work already done at the worst possible moment", and a boundary move is exactly that case: the
	// user is manipulating the page directly, not filling in a form they can abandon. A refusal
	// discovered mid-gesture destroys the gesture and explains nothing.
	//
	// So a block is reported as a fact BEFORE anything is written, on the same object as the warnings,
	// and the endpoint declines the request cleanly with the reason attached. The user is told what
	// would happen and why, in advance, and nothing is half-done. Because `analyze*` runs the same code
	// as the commit, the dialog cannot promise an outcome the commit would refuse.
	const enforcement = getDisplayLimits(translationId).enforcement;
	const blocked = enforcement === 'block' && (receiver.length > 0 || donor.length > 0);

	return {
		// §10.1: the receiver may breach; the donor's existing warning may now CLEAR, and a stale
		// warning left on screen is its own bug.
		receiver,
		donor,
		enforcement,
		blocked
	};
}

/**
 * Analyse a cross-boundary Join Segment without writing (drives the confirm modal).
 *
 * Reports what the commit will do, from the functions the commit uses — the property every confirm
 * dialog in this feature depends on, so the dialog cannot promise an outcome the commit will not
 * produce.
 *
 * `crossesBoundary: false` means this is not our case and the caller should use the existing
 * within-passage join. Returned as a fact rather than an error, because it is the common case.
 *
 * @returns {Promise<Object>}
 */
export async function analyzeCrossPartJoin(
	dbx,
	userId,
	passageId,
	itemId,
	/** @type {'segment'|'section'|'column'} */ granularity = 'segment'
) {
	const loaded = await loadPassageSequence(dbx, userId, passageId);
	if (!loaded) return { ok: false, reason: 'Passage not found.' };

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity,
		itemId,
		direction: 'previous'
	});

	if (!scope.ok) {
		return { ok: false, reason: scope.reason, seamKind: scope.seamKind ?? null };
	}

	if (!scope.crossesBoundary) {
		return { ok: true, crossesBoundary: false, reason: null };
	}

	const activeEntry = loaded.sequence[scope.active.passageIndex];
	const targetEntry = loaded.sequence[scope.target.passageIndex];

	const shift = planBoundaryShiftForJoin(loaded.sequence, scope, granularity);
	if (!shift.ok) return { ok: false, reason: shift.error };

	// The receiving study's translation governs the display check: the limit belongs to the licence of
	// the text being rendered, and both parts of a series carry the same translation by construction.
	const [receivingStudy] = await dbx
		.select({ translation: study.translation })
		.from(study)
		.where(eq(study.id, targetEntry.studyId))
		.limit(1);

	const translationId = receivingStudy?.translation ?? 'esv';

	return {
		ok: true,
		crossesBoundary: true,
		reason: null,
		fromPassageId: activeEntry.passageId,
		toPassageId: targetEntry.passageId,
		fromStudyId: activeEntry.studyId,
		toStudyId: targetEntry.studyId,
		granularity,
		targetItemId: scope.target.id,
		versesMoved: shift.versesMoved,
		display: await displayWarnings(dbx, targetEntry, activeEntry, shift, translationId),
		summary: summarize(scope.active.item, granularity)
	};
}

/**
 * Perform a cross-boundary Join Segment / Section / Column.
 *
 * The three granularities differ in exactly one respect — which rows change parent — and are handled
 * together for the reason `passageJoin.js` handles them separately: there, each has its own tree walk
 * and its own guard string; here, the boundary arithmetic, the connection ownership fix, the range
 * move and the cache invalidation are identical, and only the re-parent step branches. Splitting them
 * would triple the code that has to stay in step across a destructive operation.
 *
 * ## Order of operations, and why it is this order
 *
 * 1. **Fold content** onto the target segment (merge only), while the source row still exists.
 * 2. **Re-anchor connections** — before the delete, so `ON DELETE CASCADE` on the six endpoint FKs
 *    cannot take a connection we intend to re-home. `passageJoin.js` observes the same ordering.
 * 3. **Delete the joined segment.**
 * 4. **Move the passage boundary**, so the verses follow the structure.
 * 5. **Invalidate `cachedText`** on both passages: it is keyed by verse range, and a passage holding
 *    text for a range it no longer covers renders verses that belong to the other part.
 *
 * ⚠️ Step 2 passes the **receiving** study's id, not the source's. `reanchorConnectionsOnto` selects
 * `where(eq(segmentConnection.studyId, studyId))`, and §8 records that this query "silently returns
 * fewer rows than it should" once structure spans parts. A cross-part join is precisely that case: the
 * connection being re-anchored belongs to the source study, while the target belongs to another. So
 * ownership is rewritten to the receiving study FIRST, and the re-anchor is then run against that id —
 * otherwise the re-anchor would find nothing, report success, and leave a connection pointing at a
 * segment that no longer exists.
 *
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} passageId
 * @param {string} itemId
 * @param {'merge'|'delete'} decision
 * @param {'segment'|'section'|'column'} granularity
 * @returns {Promise<Object>} What was done, for the response
 */
export async function joinAcrossBoundary(
	dbInstance,
	userId,
	passageId,
	itemId,
	decision = 'merge',
	granularity = 'segment'
) {
	// Re-analysed inside the call rather than trusting a client-supplied plan: the dry run may be
	// seconds old, and a concurrent edit must not be overwritten on the strength of a stale preview.
	const plan = await analyzeCrossPartJoin(dbInstance, userId, passageId, itemId, granularity);
	if (!plan.ok) throw new Error(plan.reason ?? 'This join is not available.');
	if (!plan.crossesBoundary) {
		throw new Error('This join does not cross a boundary; use the standard join.');
	}

	const loaded = await loadPassageSequence(dbInstance, userId, passageId);
	if (!loaded) throw new Error('Passage not found.');

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity,
		itemId,
		direction: 'previous'
	});
	if (!scope.ok || !scope.crossesBoundary) {
		throw new Error(scope.reason ?? 'This join is not available.');
	}

	const shift = planBoundaryShiftForJoin(loaded.sequence, scope, granularity);
	if (!shift.ok) throw new Error(shift.error);

	// `resolveScope` returns the target's parents only for the granularities that have them, so the
	// three fields are filled from whichever it did supply. `reanchorConnectionsOnto` needs all three
	// to remap an endpoint of any type onto a survivor of the same type.
	const target = {
		segment:
			granularity === 'segment'
				? scope.target.item
				: firstSegmentOfTarget(scope.target, granularity),
		section: granularity === 'section' ? scope.target.item : (scope.target.section ?? null),
		column: granularity === 'column' ? scope.target.item : (scope.target.column ?? null)
	};

	// Every segment that changes parent, and the container ids being removed. Connections may be
	// anchored to any of the three types (§8's Q42 note), so all three lists travel.
	const movingSegments = movingSegmentsFor(
		loaded.sequence[scope.active.passageIndex],
		granularity,
		itemId
	).map((s) => s.id);

	await dbInstance.transaction(async (tx) => {
		const now = new Date();

		// 1. Fold authored content onto the target (merge only), using the SHARED helper so a
		//    cross-part join and a within-passage join treat content identically.
		//
		//    Only segments have foldable content — `passageJoin.js` records that sections and columns
		//    "no longer carry their own commentary" — so for those this step is correctly a no-op rather
		//    than a missing feature.
		if (decision === 'merge' && granularity === 'segment' && target.segment) {
			await foldSegmentContent(tx, scope.active.item, target.segment);
		}

		// 2. Hand the connections to the receiving study BEFORE re-anchoring them — see the warning
		//    above. Without this the re-anchor queries the wrong study and silently finds nothing.
		//
		//    Every endpoint kind is re-owned, not only the joined item's own: a section's segments carry
		//    their own connections, and those segments are changing study too. Missing them would leave
		//    a connection owned by a study that no longer contains either endpoint.
		const reown = { studyId: plan.toStudyId, seriesId: loaded.seriesId, updatedAt: now };
		if (movingSegments.length > 0) {
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.fromSegmentId, movingSegments));
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.toSegmentId, movingSegments));
		}
		if (granularity !== 'segment') {
			// The joined container's own connections, on whichever pair of endpoint columns matches its
			// type. Named for what they are rather than reusing `column` for a section id, which is how
			// the wrong pair gets consulted.
			const fromColumn =
				granularity === 'column' ? segmentConnection.fromColumnId : segmentConnection.fromSectionId;
			const toColumn =
				granularity === 'column' ? segmentConnection.toColumnId : segmentConnection.toSectionId;
			await tx.update(segmentConnection).set(reown).where(eq(fromColumn, itemId));
			await tx.update(segmentConnection).set(reown).where(eq(toColumn, itemId));
		}

		await reanchorConnectionsOnto(
			tx,
			plan.toStudyId,
			granularity === 'segment' ? [itemId] : [],
			granularity === 'section' ? [itemId] : [],
			granularity === 'column' ? [itemId] : [],
			target,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		// 3. Move the structure across, then remove the emptied container.
		//
		//    ⚠️ Children are re-parented BEFORE the container is deleted. `passage_section.column_id` and
		//    `passage_segment.section_id` are both ON DELETE CASCADE, so deleting the joined section or
		//    column first would take its segments — and all their notes, commentary and headings — with
		//    it, while the join reported success. The same ordering trap as Join Parts.
		if (granularity === 'segment') {
			await tx.delete(passageSegment).where(eq(passageSegment.id, itemId));
		} else if (granularity === 'section') {
			if (movingSegments.length > 0 && target.section) {
				await tx
					.update(passageSegment)
					.set({ passageSectionId: target.section.id, updatedAt: now })
					.where(inArray(passageSegment.id, movingSegments));
			}
			await tx.delete(passageSection).where(eq(passageSection.id, itemId));
		} else {
			const activeEntry = loaded.sequence[scope.active.passageIndex];
			const joinedColumn = (activeEntry.tree ?? []).find((c) => c.id === itemId);
			const sectionIds = (joinedColumn?.sections ?? []).map((s) => s.id);
			if (sectionIds.length > 0 && target.column) {
				await tx
					.update(passageSection)
					.set({ passageColumnId: target.column.id, updatedAt: now })
					.where(inArray(passageSection.id, sectionIds));
			}
			await tx.delete(passageColumn).where(eq(passageColumn.id, itemId));
		}

		// 4. The verses follow the structure. Without this the moved rows would render in the earlier
		//    part while their words still belonged to the later one.
		await tx
			.update(passage)
			.set({
				toChapter: shift.before.toChapter,
				toVerse: shift.before.toVerse,
				// 5. cachedText is keyed by the verse range, so both sides must refetch.
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.toPassageId));

		await tx
			.update(passage)
			.set({
				fromChapter: shift.after.fromChapter,
				fromVerse: shift.after.fromVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.fromPassageId));

		// The source passage's first column/section may now start after the passage does; re-anchor them
		// so the invariant "the first item begins where the passage begins" survives.
		await reanchorFirstOf(tx, plan.fromPassageId, shift.after);
	});

	return {
		crossedBoundary: true,
		granularity,
		versesMoved: shift.versesMoved,
		movedSegments: movingSegments.length,
		fromPassageId: plan.fromPassageId,
		toPassageId: plan.toPassageId,
		display: plan.display
	};
}

/**
 * Re-anchor a passage's first column and section to its (new) first verse.
 *
 * After the boundary moves, the source passage begins later than it did, so its leading column and
 * section may still be anchored at a word that now belongs to the other part. `passageJoin.js` keeps
 * the same invariant via `reanchorAndPrune`; this is the narrow version for the one passage whose
 * start changed.
 */
async function reanchorFirstOf(tx, passageId, newRange) {
	const firstWordId = firstWordIdOfRange(newRange);
	if (!firstWordId) return;

	const columns = await tx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));

	if (columns.length === 0) return;

	// The leading column, by word order.
	const first = columns.reduce((lowest, candidate) =>
		compareWordIds(candidate.startingWordId, lowest.startingWordId) < 0 ? candidate : lowest
	);

	const now = new Date();

	// Only move an anchor that now precedes the passage. An anchor already inside the new range is the
	// user's own structure and must not be dragged to the top.
	if (compareWordIds(first.startingWordId, firstWordId) < 0) {
		await tx
			.update(passageColumn)
			.set({ startingWordId: firstWordId, updatedAt: now })
			.where(eq(passageColumn.id, first.id));
	}

	const sections = await tx
		.select()
		.from(passageSection)
		.where(eq(passageSection.passageColumnId, first.id))
		.orderBy(asc(passageSection.startingWordId));

	if (sections.length === 0) return;

	const firstSection = sections.reduce((lowest, candidate) =>
		compareWordIds(candidate.startingWordId, lowest.startingWordId) < 0 ? candidate : lowest
	);

	if (compareWordIds(firstSection.startingWordId, firstWordId) < 0) {
		await tx
			.update(passageSection)
			.set({ startingWordId: firstWordId, updatedAt: now })
			.where(eq(passageSection.id, firstSection.id));
	}

	// The leading SEGMENT is deliberately left alone. After a cross-part join the segment that used to
	// lead this passage has been removed, so whatever now leads it already begins at or after the new
	// first verse — moving it earlier would silently extend it over verses the other part now owns.
	// Its containers are re-anchored above only because a container's anchor is bookkeeping, not content.
}

/**
 * First word id of a passage range, from either book-field spelling.
 *
 * A local builder rather than `rangeFirstWordId` from `passageReconcile.js`: that module opens the
 * reconciliation engine's whole import graph, and this needs four fields and a book abbreviation.
 */
function firstWordIdOfRange(range) {
	const bookId = range?.bookId ?? range?.book;
	if (!bookId || !range?.testament) return null;
	const meta = getBookMeta(range.testament, bookId);
	const abbr = (meta?.abbr ?? bookId).toUpperCase();
	const pad = (n) => String(n).padStart(3, '0');
	return `${abbr}-${pad(range.fromChapter)}-${pad(range.fromVerse)}-001`;
}

/**
 * Short description of what the joined item carries, for the confirm copy.
 *
 * Only segments carry authored content: `passageJoin.js` records that sections and columns "no longer
 * carry their own commentary", so for those the merge-vs-delete choice affects connections only. This
 * says nothing rather than inventing content that does not exist.
 */
function summarize(item, granularity) {
	if (granularity !== 'segment') return '';
	const parts = [];
	if (item?.note) parts.push('note');
	if (item?.commentary) parts.push('commentary');
	return parts.join(', ');
}
