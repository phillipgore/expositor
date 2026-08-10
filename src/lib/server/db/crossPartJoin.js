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
import { eq, asc } from 'drizzle-orm';
import { resolveScope } from '$lib/utils/sequenceScope.js';
import { planBoundaryShift } from '$lib/utils/boundaryMove.js';
import { compareWordIds } from '$lib/utils/wordIds.js';
import { loadPassageSequence } from './passageSequence.js';
import { foldSegmentContent, reanchorConnectionsOnto } from './passageFold.js';
import { getBookMeta } from './passageReconcile.js';
import { validateStudyDisplayLimits } from '$lib/utils/translationLimits.js';

/**
 * Where the boundary must land for a join that pulls one segment backwards.
 *
 * Structure has **implicit extent**: a segment runs from its own anchor until the next segment begins
 * (`passageReconcile.js` states this). So after the join the earlier passage must extend to cover
 * exactly the joined segment's span, which means the new boundary is the anchor of the segment that
 * FOLLOWS it inside its own passage.
 *
 * If nothing follows it, the join would move every verse out of the passage — which is a Join Parts,
 * a different command with its own confirmation and its own deletion. Refused here rather than
 * silently promoted, the same rule `planBoundaryShift` enforces.
 */
function planBoundaryShiftForJoin(sequence, scope) {
	const activeEntry = sequence[scope.active.passageIndex];
	const targetEntry = sequence[scope.target.passageIndex];

	const own = [];
	for (const column of activeEntry.tree) {
		for (const section of column.sections ?? []) {
			for (const segment of section.segments ?? []) own.push(segment);
		}
	}
	own.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));

	const position = own.findIndex((s) => s.id === scope.active.id);
	const next = position >= 0 ? own[position + 1] : null;

	if (!next) {
		// Returns the SAME shape as planBoundaryShift's own failure, including `before`/`after`. The
		// first version omitted them, and svelte-check rejected every later `shift.before` read against
		// the resulting union — a genuine inconsistency, not a typing nuisance: two failure shapes from
		// one function is how a caller ends up reading a field that is sometimes absent.
		return {
			ok: false,
			error:
				'This is the only segment in its part, so joining it would empty the part. Use Join Parts to merge them instead.',
			before: /** @type {Object|null} */ (null),
			after: /** @type {Object|null} */ (null),
			versesMoved: 0,
			direction: /** @type {'backward'|'forward'|'none'} */ ('none')
		};
	}

	return planBoundaryShift({
		before: targetEntry.passage,
		after: activeEntry.passage,
		newBoundaryWordId: next.startingWordId
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

	return {
		// §10.1: the receiver may breach; the donor's existing warning may now CLEAR, and a stale
		// warning left on screen is its own bug.
		receiver: await forStudy(targetEntry.studyId, shift.before),
		donor: await forStudy(activeEntry.studyId, shift.after)
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
export async function analyzeCrossPartJoin(dbx, userId, passageId, segmentId) {
	const loaded = await loadPassageSequence(dbx, userId, passageId);
	if (!loaded) return { ok: false, reason: 'Passage not found.' };

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity: 'segment',
		itemId: segmentId,
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

	const shift = planBoundaryShiftForJoin(loaded.sequence, scope);
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
		targetSegmentId: scope.target.id,
		versesMoved: shift.versesMoved,
		display: await displayWarnings(dbx, targetEntry, activeEntry, shift, translationId),
		summary: summarize(scope.active.item)
	};
}

/**
 * Perform a cross-boundary Join Segment.
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
 * @param {string} segmentId
 * @param {'merge'|'delete'} decision
 * @returns {Promise<Object>} What was done, for the response
 */
export async function joinSegmentAcrossBoundary(
	dbInstance,
	userId,
	passageId,
	segmentId,
	decision = 'merge'
) {
	// Re-analysed inside the call rather than trusting a client-supplied plan: the dry run may be
	// seconds old, and a concurrent edit must not be overwritten on the strength of a stale preview.
	const plan = await analyzeCrossPartJoin(dbInstance, userId, passageId, segmentId);
	if (!plan.ok) throw new Error(plan.reason ?? 'This join is not available.');
	if (!plan.crossesBoundary) {
		throw new Error('This join does not cross a boundary; use the standard join.');
	}

	const loaded = await loadPassageSequence(dbInstance, userId, passageId);
	if (!loaded) throw new Error('Passage not found.');

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity: 'segment',
		itemId: segmentId,
		direction: 'previous'
	});
	if (!scope.ok || !scope.crossesBoundary) {
		throw new Error(scope.reason ?? 'This join is not available.');
	}

	const shift = planBoundaryShiftForJoin(loaded.sequence, scope);
	if (!shift.ok) throw new Error(shift.error);

	const target = {
		segment: scope.target.item,
		section: scope.target.section,
		column: scope.target.column
	};

	await dbInstance.transaction(async (tx) => {
		const now = new Date();

		// 1. Fold authored content onto the target (merge only), using the SHARED helper so a
		//    cross-part join and a within-passage join treat content identically.
		if (decision === 'merge') {
			await foldSegmentContent(tx, scope.active.item, target.segment);
		}

		// 2. Hand the connections to the receiving study BEFORE re-anchoring them — see the warning
		//    above. Without this the re-anchor queries the wrong study and silently finds nothing.
		await tx
			.update(segmentConnection)
			.set({ studyId: plan.toStudyId, seriesId: loaded.seriesId, updatedAt: now })
			.where(eq(segmentConnection.fromSegmentId, segmentId));
		await tx
			.update(segmentConnection)
			.set({ studyId: plan.toStudyId, seriesId: loaded.seriesId, updatedAt: now })
			.where(eq(segmentConnection.toSegmentId, segmentId));

		await reanchorConnectionsOnto(
			tx,
			plan.toStudyId,
			[segmentId],
			[],
			[],
			target,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		// 3. Delete the joined segment. Its parents in the source passage may now be empty; they are
		//    pruned below, after the ranges move.
		await tx.delete(passageSegment).where(eq(passageSegment.id, segmentId));

		// 4. The verses follow the structure. Without this the segment would render in the earlier part
		//    while its words still belonged to the later one.
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
		versesMoved: shift.versesMoved,
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

/** Short description of what the joined segment carries, for the confirm copy. */
function summarize(segment) {
	const parts = [];
	if (segment?.note) parts.push('note');
	if (segment?.commentary) parts.push('commentary');
	return parts.join(', ');
}
