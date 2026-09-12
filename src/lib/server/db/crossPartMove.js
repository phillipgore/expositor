/**
 * # Move Text Up / Down across a passage boundary (SERIES_PLAN §8, commands 4 and 5)
 *
 * The last two of §8's five commands. §8 says they are **"rewritten, not extended"**, and warns that
 * their apparent cheapness misleads: `moveSegmentTextUp` rewrites one `startingWordId`, but
 * `moveSegmentTextDown` already walks the whole passage tree to find its next segment — and it is that
 * walk which must span two passages.
 *
 * ## Why these could not be routed like the Joins
 *
 * The three Joins were generalised by *routing around* `passageJoin.js`: a cross-part join is a
 * different operation (it re-parents rows and deletes a container), so a separate implementation is
 * honest. A cross-part text move is the **same** operation over a wider scope — one `startingWordId`
 * still moves — so routing would duplicate the tree walk rather than widen it. Hence a scope-aware
 * implementation here, with the passage-local case still served by the original functions.
 *
 * ## ⚠️ The mid-verse caret, and why it is refused
 *
 * A segment may legitimately begin mid-verse: `startingWordId` is word-granular, and Move Text exists
 * precisely to place a segment boundary at an arbitrary word. Passage ranges, however, are
 * **verse**-granular (`fromVerse` / `toVerse`).
 *
 * Within one passage that mismatch is harmless — both segments render from the same passage's text. At
 * a part boundary it is not. If the caret sits at word 5 of Romans 3:1 and the boundary is derived from
 * it, the range arithmetic assigns the whole of 3:1 to one part while the other part's last segment
 * still claims words 1–4 of it. One part would render text it does not own, or the words would vanish
 * from both. Verified against the real arithmetic before writing this: a caret at `RO-003-001-005`
 * yields a boundary of exactly 3:1, silently dropping the word offset.
 *
 * So a cross-part move requires the caret to be at the **start of a verse**. That is a real
 * restriction and is surfaced as a reason, not as a silent no-op: the user is told to move the text in
 * two steps (to the verse boundary within the part, then across), which is achievable with the
 * commands that already exist. Recorded rather than worked around, because the alternative — making
 * passage ranges word-granular — is a schema change well outside §8's scope.
 *
 * @module crossPartMove
 */

import { passage, passageSegment, study } from './schema.js';
import { eq } from 'drizzle-orm';
import { resolveScope } from '$lib/utils/sequenceScope.js';
import { planBoundaryShift } from '$lib/utils/boundaryMove.js';
import { loadPassageSequence } from './passageSequence.js';
import { reanchorPassages } from './reanchor.js';
import { validateStudyDisplayLimits, getDisplayLimits } from '$lib/utils/translationLimits.js';

/** Is this word id the first word of its verse? */
function isVerseStart(wordId) {
	const parts = String(wordId ?? '').split('-');
	return parts.length === 4 && parseInt(parts[3], 10) === 1;
}

/**
 * Display-limit warnings for both affected studies after the proposed shift (§10.1).
 *
 * ## ⚠️ Why a MOVE needs this as much as a join does
 *
 * `crossPartJoin.js` has carried this since the Joins landed; Move Text shipped without it. That was a
 * gap, not a decision: §10.1 and the §13 table both say re-validation is **"Required, on both parts"**
 * for any boundary move, and the plan's own worked example is a Move Text — "a part at Rom 1:1–8:25
 * (211 verses) tipped past 216 by a few Move Text Up gestures". A join moves a whole item once; a move
 * is repeatable a verse at a time, which makes it the *likelier* way to drift over the cap, not the
 * safer one.
 *
 * ⚠️ Checked per STUDY, not per passage — the display cap is per page, so a study's other passages
 * count towards it. Validating only the two changed ranges would under-report on a multi-passage part.
 *
 * ## Which side is the "receiver" depends on the DIRECTION
 *
 * §8: `direction` names where the CONTENT moved, and the receiver is the part that GREW. Move Text Up
 * folds words backwards, so the EARLIER part receives; Move Text Down pushes them forwards, so the
 * LATER part does. Getting this backwards re-checks the part that shrank — which can only ever pass —
 * and lets the growing one breach silently.
 *
 * @param {'up'|'down'} direction
 */
async function displayWarnings(dbx, earlierEntry, laterEntry, shift, translationId, direction) {
	const forStudy = async (studyId, replacement) => {
		const rows = await dbx.select().from(passage).where(eq(passage.studyId, studyId));
		const substituted = rows.map((r) => (r.id === replacement.id ? replacement : r));
		return validateStudyDisplayLimits(substituted, translationId).warnings;
	};

	const earlier = await forStudy(earlierEntry.studyId, shift.before);
	const later = await forStudy(laterEntry.studyId, shift.after);

	// Up ⇒ the earlier part grew; Down ⇒ the later part grew.
	const receiver = direction === 'up' ? earlier : later;
	const donor = direction === 'up' ? later : earlier;

	// ── Q41: refuse BEFORE writing, never mid-gesture ────────────────────
	//
	// Same rule as `crossPartJoin.js`, deliberately kept in step: a block requires BOTH that the
	// translation enforces blocking AND that this particular move actually warns. Blocking on
	// enforcement alone would refuse every cross-part move under a 'block' translation, including
	// compliant ones. Every translation ships 'warn' today, so this is latent — which is exactly why
	// it is written now rather than left to whoever flips the flag.
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
 * Analyse a cross-boundary Move Text without writing.
 *
 * `crossesBoundary: false` means the move is passage-local and the caller should use the original
 * `moveSegmentTextUp` / `moveSegmentTextDown`. Returned as a fact rather than an error, because it is
 * the common case.
 *
 * @param {Object} dbx
 * @param {string} userId
 * @param {string} passageId
 * @param {string} segmentId
 * @param {string} insertionWordId
 * @param {'up'|'down'} direction
 * @returns {Promise<Object>}
 */
export async function analyzeCrossPartMove(
	dbx,
	userId,
	passageId,
	segmentId,
	insertionWordId,
	direction
) {
	const loaded = await loadPassageSequence(dbx, userId, passageId);
	if (!loaded) return { ok: false, reason: 'Passage not found.' };

	// Move Text Up folds the caret's leading words BACKWARDS into the previous segment; Move Text Down
	// pushes the trailing words FORWARDS into the next. So the neighbour each needs is on the
	// corresponding side, which is exactly what `direction` means to resolveScope.
	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity: 'segment',
		itemId: segmentId,
		direction: direction === 'up' ? 'previous' : 'next'
	});

	if (!scope.ok) return { ok: false, reason: scope.reason, seamKind: scope.seamKind ?? null };
	if (!scope.crossesBoundary) return { ok: true, crossesBoundary: false, reason: null };

	if (!isVerseStart(insertionWordId)) {
		return {
			ok: false,
			crossesBoundary: true,
			reason:
				'Text can only be moved to another part at the start of a verse. Move it to a verse boundary within this part first, then across.'
		};
	}

	const activeEntry = loaded.sequence[scope.active.passageIndex];
	const targetEntry = loaded.sequence[scope.target.passageIndex];

	// The seam is always classified earlier-passage-first, whichever way the gesture travels.
	const earlier = direction === 'up' ? targetEntry : activeEntry;
	const later = direction === 'up' ? activeEntry : targetEntry;

	const shift = planBoundaryShift({
		before: earlier.passage,
		after: later.passage,
		newBoundaryWordId: insertionWordId
	});
	if (!shift.ok) return { ok: false, crossesBoundary: true, reason: shift.error };

	// The receiving study's translation governs the display check: the limit belongs to the licence of
	// the text being rendered, and both parts of a series carry the same translation by construction.
	const receivingStudyId = direction === 'up' ? earlier.studyId : later.studyId;
	const [receivingStudy] = await dbx
		.select({ translation: study.translation })
		.from(study)
		.where(eq(study.id, receivingStudyId))
		.limit(1);

	const translationId = receivingStudy?.translation ?? 'esv';

	return {
		ok: true,
		crossesBoundary: true,
		reason: null,
		direction,
		versesMoved: shift.versesMoved,
		display: await displayWarnings(dbx, earlier, later, shift, translationId, direction),
		earlierPassageId: earlier.passageId,
		laterPassageId: later.passageId,
		earlierStudyId: earlier.studyId,
		laterStudyId: later.studyId,
		activeSegmentId: scope.active.id,
		targetSegmentId: scope.target.id,
		newEarlierRange: shift.before,
		newLaterRange: shift.after
	};
}

/**
 * Perform a cross-boundary Move Text.
 *
 * ## Which anchor moves, and why it differs by direction
 *
 * Structure has implicit extent: a segment runs from its anchor until the next segment begins. So
 * moving text is always a single anchor rewrite, and *which* anchor depends on the direction — the same
 * asymmetry the passage-local functions have:
 *
 * - **Up**: the ACTIVE segment's anchor advances to the caret. Its leading words fall to whatever
 *   precedes it, which across a boundary is the previous part's last segment.
 * - **Down**: the TARGET segment's anchor retreats to the caret, absorbing the active segment's
 *   trailing words. Across a boundary the target lives in the next part.
 *
 * ⚠️ **No structure changes parent, and that is a conclusion rather than an omission.** My first draft
 * of this comment claimed the active segment must be re-parented into the other part; I traced the
 * arithmetic before writing the code and it is not so. Because the boundary is derived from the caret
 * itself, the moved verses always land inside the range of the part whose segment already covers them:
 *
 *   Move Up, part B's first segment anchored 3:1, caret at 3:5 → boundary 3:5, so part A now ends at
 *   3:4 and part B begins at 3:5. The active segment's new anchor (3:5) is still inside part B. The
 *   verses that left (3:1–3:4) are covered by part A's LAST segment, which — by implicit extent — runs
 *   to the end of part A's range wherever that now falls.
 *
 * So both directions are exactly one anchor rewrite plus the two range updates. Verified against the
 * real `planBoundaryShift` output, not assumed, because "the cheap-looking one is cheap" is the
 * specific error §8 warns about here.
 *
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} passageId
 * @param {string} segmentId
 * @param {string} insertionWordId
 * @param {'up'|'down'} direction
 * @returns {Promise<Object>}
 */
export async function moveTextAcrossBoundary(
	dbInstance,
	userId,
	passageId,
	segmentId,
	insertionWordId,
	direction
) {
	// Re-analysed here rather than trusting a client-supplied plan: a dry run may be seconds old, and a
	// concurrent edit must not be overwritten on the strength of a stale preview.
	const plan = await analyzeCrossPartMove(
		dbInstance,
		userId,
		passageId,
		segmentId,
		insertionWordId,
		direction
	);
	if (!plan.ok) throw new Error(plan.reason ?? 'This move is not available.');
	if (!plan.crossesBoundary) {
		throw new Error('This move does not cross a boundary; use the standard move.');
	}

	// ── Q41: refuse BEFORE writing, never mid-gesture ────────────────────
	//
	// `blocked` comes from the same analysis the dry run showed the user, so a move the dialog presented
	// as permissible cannot be refused here, and one it presented as blocked offers no confirm button to
	// reach this line. Today every `enforcement` is 'warn', so this never fires — it exists so that
	// flipping the flag produces a clean, explained refusal rather than a half-applied move.
	//
	// Thrown with a `blocked` flag attached so the endpoint can answer 409 (well-formed request, the
	// state is the obstacle) rather than the generic 400 the other reasons take.
	if (plan.display?.blocked) {
		const error = new Error(
			'Moving this boundary would show more of the book than the licence allows in one part.'
		);
		error.blocked = true;
		error.display = plan.display;
		throw error;
	}

	const loaded = await loadPassageSequence(dbInstance, userId, passageId);
	if (!loaded) throw new Error('Passage not found.');

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity: 'segment',
		itemId: segmentId,
		direction: direction === 'up' ? 'previous' : 'next'
	});
	if (!scope.ok || !scope.crossesBoundary) {
		throw new Error(scope.reason ?? 'This move is not available.');
	}

	await dbInstance.transaction(async (tx) => {
		const now = new Date();

		if (direction === 'up') {
			// The active segment's words before the caret join the previous part. Everything from the
			// caret onwards stays with the active segment — which now begins at a verse the LATER part
			// still owns, so the segment itself does not change passage.
			//
			// The boundary moves earlier: the later part starts at the caret's verse, the earlier part
			// ends just before it. So the words that left are covered by the earlier part's range, and are
			// rendered by whatever segment ends that part — no re-parenting needed.
			await tx
				.update(passageSegment)
				.set({ startingWordId: insertionWordId, updatedAt: now })
				.where(eq(passageSegment.id, segmentId));
		} else {
			// Down: the NEXT part's first segment retreats to the caret, absorbing the active segment's
			// trailing words. The boundary moves earlier too — the later part grows — so again the moved
			// words fall inside the range of the part whose segment now covers them.
			await tx
				.update(passageSegment)
				.set({ startingWordId: insertionWordId, updatedAt: now })
				.where(eq(passageSegment.id, scope.target.id));
		}

		// Both ranges move together, derived from ONE boundary so they cannot gap or overlap.
		await tx
			.update(passage)
			.set({
				toChapter: plan.newEarlierRange.toChapter,
				toVerse: plan.newEarlierRange.toVerse,
				// Keyed by verse range: a passage holding text for a range it no longer covers would render
				// verses belonging to the other part.
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.earlierPassageId));

		await tx
			.update(passage)
			.set({
				fromChapter: plan.newLaterRange.fromChapter,
				fromVerse: plan.newLaterRange.fromVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, plan.laterPassageId));

		// ⚠️ Both sides, and NOT optional.
		//
		// The anchor rewrite above moves a segment; the column and section holding it are untouched, so
		// one of them is now anchored at a word its first segment no longer starts at. Nothing renders
		// wrongly — extent is implicit — but the next `insertSegment()` compares the section's anchor
		// against the caret and refuses with "Cannot insert segment at the beginning of a section",
		// on text the user has just moved. See `reanchor.js` for the full account.
		//
		// Inside the transaction, so a failure here cannot leave the ranges moved and the anchors stale.
		await reanchorPassages(tx, [plan.earlierPassageId, plan.laterPassageId]);
	});

	return {
		crossedBoundary: true,
		direction,
		versesMoved: plan.versesMoved,
		// Travels back so the client can surface a §10.1 warning the move has just CREATED or CLEARED —
		// a stale on-screen warning is its own bug.
		display: plan.display,
		earlierPassageId: plan.earlierPassageId,
		laterPassageId: plan.laterPassageId
	};
}
