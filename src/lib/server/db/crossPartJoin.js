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
import { eq, inArray } from 'drizzle-orm';
import { resolveScope } from '$lib/utils/sequenceScope.js';
import { planBoundaryShift } from '$lib/utils/boundaryMove.js';
import { compareWordIds } from '$lib/utils/wordIds.js';
import { loadPassageSequence } from './passageSequence.js';
import { reanchorPassages } from './reanchor.js';
import { foldSegmentContent, reanchorConnectionsOnto } from './passageFold.js';
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
 * Where the boundary must land for a join that pushes an item FORWARDS (Join Down across a seam).
 *
 * The mirror of `planBoundaryShiftForJoin`, and deliberately a separate function rather than a flag on
 * it: the two ask different questions of different passages, and folding them together behind a
 * boolean is how the backwards rule ends up silently applied to a forward gesture — which is the exact
 * defect this path exists to fix.
 *
 * Here the SELECTED item leaves the earlier part and lands in the later one, so the later part must
 * now begin where that item begins. The new boundary is therefore the anchor of the **first moving**
 * segment — not the first that stays, which is the backwards rule.
 *
 * If nothing stays behind, every verse would leave the earlier part: that is Join Parts, refused here
 * for the same reason the backwards path refuses its own version of it.
 */
function planForwardBoundaryShiftForJoin(sequence, scope, granularity) {
	const activeEntry = sequence[scope.active.passageIndex];
	const targetEntry = sequence[scope.target.passageIndex];

	const moving = movingSegmentsFor(activeEntry, granularity, scope.active.id);
	if (moving.length === 0) {
		return {
			ok: false,
			error: 'That item holds no text, so there is nothing to move into the next part.',
			before: /** @type {Object|null} */ (null),
			after: /** @type {Object|null} */ (null),
			versesMoved: 0,
			direction: /** @type {'backward'|'forward'|'none'} */ ('none')
		};
	}

	const movingIds = new Set(moving.map((s) => s.id));
	const staying = segmentsOf(activeEntry).filter((s) => !movingIds.has(s.id));

	if (staying.length === 0) {
		return {
			ok: false,
			error: `Joining this ${granularity} would move every verse out of its part. Use Join Parts to merge them instead.`,
			before: /** @type {Object|null} */ (null),
			after: /** @type {Object|null} */ (null),
			versesMoved: 0,
			direction: /** @type {'backward'|'forward'|'none'} */ ('none')
		};
	}

	// `before`/`after` are the EARLIER and LATER passages respectively, which for a forward join are the
	// active and target passages — the opposite assignment to the backwards path.
	return planBoundaryShift({
		before: activeEntry.passage,
		after: targetEntry.passage,
		newBoundaryWordId: moving[0].startingWordId
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
 * Analyse a cross-boundary Join DOWN without writing (drives the confirm modal).
 *
 * ## ⚠️ Why Join Down needs its own path at a seam
 *
 * `joinRouting.js` rewrites every Join Down into "the equivalent Join Up on the successor", and within
 * one passage that identity is exact: a join removes one anchor, the earlier item of the pair
 * survives, and direction only names which pair is meant.
 *
 * **At a part boundary the identity breaks**, because which PART the result lives in is the whole
 * point of the gesture. Rewriting a Join Down on part A's last item into a Join Up on part B's first
 * item grows part A — the opposite of what the user asked for, moving verses across the seam the wrong
 * way. That shipped, and this function is the fix.
 *
 * ## What survives, and why it is the selected item
 *
 * The selected item keeps its row and moves into the later part; the target folds INTO it. Three rules
 * agree on that, which is what makes it right rather than merely chosen:
 *
 *   - the user's stated expectation — "Join Selected Down: the selected item is now in Part B";
 *   - Join Down's existing within-passage behaviour (manual test STR-014: "the activated segment
 *     SURVIVES and stays selected"), so the cross-part case is not a special case;
 *   - the anchor rule itself — the selected item's anchor is EARLIER than the target's, and the
 *     earlier anchor is always the one left standing.
 *
 * So the consumed item here is the TARGET, which is why `summary` describes the target rather than the
 * active item: the confirm dialog must name what is about to be destroyed.
 *
 * @returns {Promise<Object>}
 */
export async function analyzeCrossPartJoinDown(
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
		direction: 'next'
	});

	if (!scope.ok) {
		return { ok: false, reason: scope.reason, seamKind: scope.seamKind ?? null };
	}

	if (!scope.crossesBoundary) {
		return { ok: true, crossesBoundary: false, reason: null };
	}

	const activeEntry = loaded.sequence[scope.active.passageIndex];
	const targetEntry = loaded.sequence[scope.target.passageIndex];

	const shift = planForwardBoundaryShiftForJoin(loaded.sequence, scope, granularity);
	if (!shift.ok) return { ok: false, reason: shift.error };

	// The receiving study is the LATER part here — the selected item is moving into it.
	const [receivingStudy] = await dbx
		.select({ translation: study.translation })
		.from(study)
		.where(eq(study.id, targetEntry.studyId))
		.limit(1);

	const translationId = receivingStudy?.translation ?? 'esv';

	return {
		ok: true,
		crossesBoundary: true,
		direction: /** @type {'down'} */ ('down'),
		reason: null,
		// The item MOVES from the active passage into the target's, so `from`/`to` name the same
		// journey they do for a Join Up — but the surviving row is the active one, not the target.
		fromPassageId: activeEntry.passageId,
		toPassageId: targetEntry.passageId,
		fromStudyId: activeEntry.studyId,
		toStudyId: targetEntry.studyId,
		granularity,
		targetItemId: scope.target.id,
		versesMoved: shift.versesMoved,
		// ⚠️ The receiver is the LATER part, so the argument order is flipped relative to the backwards
		// path: `displayWarnings(dbx, receiverEntry, donorEntry, …)` with the shift's own before/after.
		display: await displayWarnings(dbx, activeEntry, targetEntry, shift, translationId),
		// The TARGET is what gets consumed, so it is what the confirm dialog must describe.
		summary: summarize(scope.target.item, granularity)
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

		// ⚠️ BOTH passages, not just the donor.
		//
		// This read `reanchorFirstOf(tx, plan.fromPassageId, shift.after)` — the source only. The
		// RECEIVER is the passage that grew, and it has just been handed segments whose column and
		// section anchors were never reconciled with it, so it is the likelier of the two to refuse the
		// user's next `insertSegment()` with "Cannot insert segment at the beginning of a section".
		// Fixing only the side whose range moved backwards fixed the less likely half of the bug.
		await reanchorPassages(tx, [plan.fromPassageId, plan.toPassageId]);
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
 * Perform a cross-boundary Join DOWN: move the selected item into the NEXT part.
 *
 * The mirror of `joinAcrossBoundary`, and the reason `analyzeCrossPartJoinDown` exists — see its
 * header for why a seam-crossing Join Down cannot be rewritten into a Join Up.
 *
 * ## What moves, and what is destroyed
 *
 * The **selected item keeps its row** and changes parent into the target's container; the **target is
 * consumed**, its content folded onto the selected item first. That is the opposite assignment to the
 * backwards path, and it is what makes "Join Selected Down leaves the result in Part B" true.
 *
 * ⚠️ The delete-before-re-parent trap applies here exactly as it does backwards, but to the OTHER row:
 * the target's children must be re-parented onto the surviving (selected) container before the target
 * is deleted, or `ON DELETE CASCADE` takes them and the join reports success having destroyed the next
 * part's leading content.
 *
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} passageId
 * @param {string} itemId - The SELECTED item, which survives and moves forward
 * @param {'merge'|'delete'} decision
 * @param {'segment'|'section'|'column'} granularity
 * @returns {Promise<Object>}
 */
export async function joinDownAcrossBoundary(
	dbInstance,
	userId,
	passageId,
	itemId,
	decision = 'merge',
	granularity = 'segment'
) {
	const plan = await analyzeCrossPartJoinDown(dbInstance, userId, passageId, itemId, granularity);
	if (!plan.ok) throw new Error(plan.reason ?? 'This join is not available.');
	if (!plan.crossesBoundary) {
		throw new Error('This join does not cross a boundary; use the standard join.');
	}

	const loaded = await loadPassageSequence(dbInstance, userId, passageId);
	if (!loaded) throw new Error('Passage not found.');

	const scope = resolveScope({ sequence: loaded.sequence, granularity, itemId, direction: 'next' });
	if (!scope.ok || !scope.crossesBoundary) {
		throw new Error(scope.reason ?? 'This join is not available.');
	}

	const shift = planForwardBoundaryShiftForJoin(loaded.sequence, scope, granularity);
	if (!shift.ok) throw new Error(shift.error);

	const activeEntry = loaded.sequence[scope.active.passageIndex];
	const targetEntry = loaded.sequence[scope.target.passageIndex];
	const targetItemId = scope.target.id;

	// The SURVIVOR is the selected item — connections on the consumed target remap onto it.
	const survivor = {
		segment:
			granularity === 'segment'
				? scope.active.item
				: firstSegmentOfTarget(scope.active, granularity),
		section: granularity === 'section' ? scope.active.item : (scope.active.section ?? null),
		column: granularity === 'column' ? scope.active.item : (scope.active.column ?? null)
	};

	const movingSegments = movingSegmentsFor(activeEntry, granularity, itemId).map((s) => s.id);
	const targetSegments = movingSegmentsFor(targetEntry, granularity, targetItemId).map((s) => s.id);

	await dbInstance.transaction(async (tx) => {
		const now = new Date();

		// 1. Fold the TARGET's content onto the surviving selected item.
		if (decision === 'merge' && granularity === 'segment' && survivor.segment) {
			await foldSegmentContent(tx, scope.target.item, survivor.segment);
		}

		// 2. Ownership moves to the LATER study, because that is where the selected item now lives.
		const reown = { studyId: plan.toStudyId, seriesId: loaded.seriesId, updatedAt: now };
		const allAffected = [...movingSegments, ...targetSegments];
		if (allAffected.length > 0) {
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.fromSegmentId, allAffected));
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.toSegmentId, allAffected));
		}
		if (granularity !== 'segment') {
			const fromColumn =
				granularity === 'column' ? segmentConnection.fromColumnId : segmentConnection.fromSectionId;
			const toColumn =
				granularity === 'column' ? segmentConnection.toColumnId : segmentConnection.toSectionId;
			for (const affectedId of [itemId, targetItemId]) {
				await tx.update(segmentConnection).set(reown).where(eq(fromColumn, affectedId));
				await tx.update(segmentConnection).set(reown).where(eq(toColumn, affectedId));
			}
		}

		// Connections anchored to the CONSUMED target remap onto the survivor.
		await reanchorConnectionsOnto(
			tx,
			plan.toStudyId,
			granularity === 'segment' ? [targetItemId] : [],
			granularity === 'section' ? [targetItemId] : [],
			granularity === 'column' ? [targetItemId] : [],
			survivor,
			decision === 'delete' ? 'delete' : 'reanchor'
		);

		await moveSelectedForward(tx, {
			granularity,
			itemId,
			targetItemId,
			scope,
			targetEntry,
			targetSegments,
			now
		});

		// 4. The verses follow the structure. The EARLIER part shrinks and the LATER part grows — the
		//    opposite of the backwards path, which is the entire point of this function.
		await tx
			.update(passage)
			.set({
				toChapter: shift.before.toChapter,
				toVerse: shift.before.toVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.fromPassageId));

		await tx
			.update(passage)
			.set({
				fromChapter: shift.after.fromChapter,
				fromVerse: shift.after.fromVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.toPassageId));

		await reanchorPassages(tx, [plan.fromPassageId, plan.toPassageId]);
	});

	return {
		crossedBoundary: true,
		direction: 'down',
		granularity,
		versesMoved: shift.versesMoved,
		movedSegments: movingSegments.length,
		fromPassageId: plan.fromPassageId,
		toPassageId: plan.toPassageId,
		display: plan.display
	};
}

/**
 * Re-parent the selected item into the later part, then consume the target.
 *
 * Split out of `joinDownAcrossBoundary` because the three granularities differ only here, and inlining
 * three branches inside an already long transaction is how the cascade ordering gets edited wrongly.
 *
 * ⚠️ **Re-parent before delete, every branch.** `passage_section.passage_column_id` and
 * `passage_segment.passage_section_id` are `ON DELETE CASCADE`, so deleting the target first would take
 * the rows being moved onto it — the next part's leading content — while the join reported success.
 */
async function moveSelectedForward(
	tx,
	{ granularity, itemId, targetItemId, scope, targetEntry, targetSegments, now }
) {
	if (granularity === 'segment') {
		// The selected segment adopts the target's section, which already lives in the later passage.
		if (scope.target.section) {
			await tx
				.update(passageSegment)
				.set({ passageSectionId: scope.target.section.id, updatedAt: now })
				.where(eq(passageSegment.id, itemId));
		}
		await tx.delete(passageSegment).where(eq(passageSegment.id, targetItemId));
		return;
	}

	if (granularity === 'section') {
		// The selected section adopts the target's column; the target's segments move onto the selected
		// section, which is the survivor.
		if (scope.target.column) {
			await tx
				.update(passageSection)
				.set({ passageColumnId: scope.target.column.id, updatedAt: now })
				.where(eq(passageSection.id, itemId));
		}
		if (targetSegments.length > 0) {
			await tx
				.update(passageSegment)
				.set({ passageSectionId: itemId, updatedAt: now })
				.where(inArray(passageSegment.id, targetSegments));
		}
		await tx.delete(passageSection).where(eq(passageSection.id, targetItemId));
		return;
	}

	// Column: the selected column changes PASSAGE, and the target column's sections move onto it.
	await tx
		.update(passageColumn)
		.set({ passageId: targetEntry.passageId, updatedAt: now })
		.where(eq(passageColumn.id, itemId));

	const targetColumn = (targetEntry.tree ?? []).find((c) => c.id === targetItemId);
	const sectionIds = (targetColumn?.sections ?? []).map((s) => s.id);
	if (sectionIds.length > 0) {
		await tx
			.update(passageSection)
			.set({ passageColumnId: itemId, updatedAt: now })
			.where(inArray(passageSection.id, sectionIds));
	}
	await tx.delete(passageColumn).where(eq(passageColumn.id, targetItemId));
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
