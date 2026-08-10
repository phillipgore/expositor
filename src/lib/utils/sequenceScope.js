/**
 * # Sequence scope: resolving "the previous item" across a passage boundary (SERIES_PLAN §8)
 *
 * The five structural commands — Join Column, Join Section, Join Segment, Move Text Up, Move Text
 * Down — are scoped to **one passage** today. §8's table lists seven separate sites that assume it,
 * down to guard strings reading literally "Cannot join the first segment in a passage". This module
 * is the scope resolution §8 asks for: it is given an **ordered sequence of passages** and answers
 * "what precedes this item, and may we reach it?" without caring whether the neighbour lives in the
 * same passage, a later passage of the same study, or a different part of a series.
 *
 * ## Why a sequence rather than a part pair
 *
 * §8 is explicit: "Prefer a scope-resolution helper that is given an ordered sequence of passages —
 * whether those passages belong to one study or to adjacent parts — so both cases fall out of one
 * implementation." That is not generality for its own sake. A study holding Romans 1–8 and Romans
 * 9–16 as two passages **cannot Join Segment across that boundary today**, so cross-part work is a
 * generalisation of a defect that already exists one level down. Taking a sequence fixes both;
 * taking a part pair would fix only the newer half.
 *
 * ## What this module does NOT do
 *
 * It performs no writes, loads nothing, and folds no content. It decides *scope* — which item is the
 * neighbour, and whether the seam between them is eligible — and hands that to the callers that
 * already know how to fold (`passageJoin.js`) and re-anchor (`passageFold.js`). Staying pure is also
 * what makes it verifiable under plain Node, the constraint that shaped `seriesStructurePlan.js`.
 *
 * ⚠️ **Eligibility is borrowed, never re-implemented.** `isBoundaryContiguous()` already governs run
 * membership, the part-delete warning, drag legality and Join Parts. §4 calls it "one concept, two
 * uses"; this is the fifth. A second adjacency rule here would be a fifth place for them to disagree.
 *
 * @module sequenceScope
 */

import { compareWordIds } from './wordIds.js';
import { isBoundaryContiguous, classifyBoundary } from './seriesRuns.js';

/**
 * Wrap one passage row as the shape `classifyBoundary()` reads.
 *
 * That function takes *parts* (objects with a `passages` array) because §4 asks its adjacency
 * question about parts. The same question at passage granularity is the same arithmetic on the same
 * fields, so the row is wrapped rather than the predicate duplicated.
 */
function asBoundaryOperand(passageRow) {
	return { passages: [passageRow] };
}

/**
 * Is the seam between two consecutive passages eligible for a cross-boundary move?
 *
 * @param {Object} before - The earlier passage row
 * @param {Object} after - The later passage row
 * @returns {boolean}
 */
export function isPassageSeamEligible(before, after) {
	if (!before || !after) return false;
	return isBoundaryContiguous(asBoundaryOperand(before), asBoundaryOperand(after));
}

/**
 * Why a seam is not eligible, as a `BoundaryKind`, for callers that must explain a dead command.
 *
 * §11 requires a disabled command to distinguish "not available across parts yet" from "these parts
 * aren't adjacent in Scripture" — one message for both would promise a Prison Epistles user a fix
 * that is never coming. Returning the kind rather than a sentence keeps the copy next to the UI that
 * shows it, while the classification stays here.
 *
 * @returns {'contiguous'|'gap'|'different-books'|'overlap'}
 */
export function classifyPassageSeam(before, after) {
	if (!before || !after) return 'gap';
	return classifyBoundary(asBoundaryOperand(before), asBoundaryOperand(after));
}

/**
 * Flatten an ordered sequence of per-passage trees into one item list.
 *
 * Each entry keeps its owning `passageId` and that passage's index in the sequence, because the whole
 * point of this module is letting a caller know **when it has crossed a boundary**: an operation
 * staying inside one passage needs no eligibility check and no range adjustment, and one that crosses
 * needs both.
 *
 * ⚠️ Items are NOT re-sorted across the whole sequence — order follows the sequence given, and word
 * order only *within* each passage. Sorting globally by `startingWordId` would be wrong twice over:
 * `compareWordIds` ignores the book segment entirely (see `wordIds.js`), so items from different
 * books would interleave nonsensically; and §4 forbids re-deriving a user's sequence from canonical
 * order, so a series deliberately teaching Romans 8 first must keep that arrangement.
 *
 * @param {Array<{ passageId: string, tree: Array }>} sequence - Passages in sequence order
 * @param {'segment'|'section'|'column'} granularity
 * @returns {Array<Object>}
 */
export function flattenSequence(sequence, granularity) {
	const out = [];

	(sequence ?? []).forEach((entry, passageIndex) => {
		const { passageId, tree } = entry ?? {};
		const local = [];

		for (const column of tree ?? []) {
			if (granularity === 'column') {
				local.push({
					id: column.id,
					passageId,
					passageIndex,
					startingWordId: column.startingWordId,
					item: column
				});
				continue;
			}

			for (const section of column.sections ?? []) {
				if (granularity === 'section') {
					local.push({
						id: section.id,
						passageId,
						passageIndex,
						startingWordId: section.startingWordId,
						item: section,
						column
					});
					continue;
				}

				for (const segment of section.segments ?? []) {
					local.push({
						id: segment.id,
						passageId,
						passageIndex,
						startingWordId: segment.startingWordId,
						item: segment,
						section,
						column
					});
				}
			}
		}

		// Word order within this passage only — see the warning above.
		local.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
		out.push(...local);
	});

	return out;
}

/**
 * Resolve what a structural command should act on, given the whole sequence.
 *
 * This is what the five commands consult instead of asking "am I the first item in my passage?". It
 * answers the three things they each get wrong at a boundary:
 *
 * - **`target`** — the neighbour to fold into (`direction: 'previous'`) or out to (`'next'`), which
 *   may live in a different passage entirely.
 * - **`crossesBoundary`** — whether this is a cross-passage operation, so the caller knows it must
 *   adjust two passage ranges rather than none.
 * - **`reason`** — why the command is unavailable, when it is.
 *
 * ⚠️ Returns `ok: false` with a reason instead of throwing, and that is a correctness decision rather
 * than a stylistic one. The existing commands throw `'Cannot join the first segment in a passage'` —
 * a sentence that becomes **false** as soon as a previous passage exists and abuts. §11 requires the
 * UI to distinguish "nothing precedes this anywhere" (permanent) from "the neighbour is across an
 * ineligible seam" (a different, also permanent, cause) — and an exception message cannot carry that
 * distinction without being string-parsed.
 *
 * @param {Object} params
 * @param {Array<{ passageId: string, passage: Object, tree: Array }>} params.sequence
 * @param {'segment'|'section'|'column'} params.granularity
 * @param {string} params.itemId
 * @param {'previous'|'next'} [params.direction='previous']
 * @returns {{ ok: boolean, reason: string|null, seamKind: string|null, crossesBoundary: boolean, active: Object|null, target: Object|null }}
 */
export function resolveScope({ sequence, granularity, itemId, direction = 'previous' }) {
	const flat = flattenSequence(sequence, granularity);
	const index = flat.findIndex((entry) => entry.id === itemId);

	const fail = (reason, seamKind = null) => ({
		ok: false,
		reason,
		seamKind,
		crossesBoundary: false,
		active: index >= 0 ? flat[index] : null,
		target: null
	});

	if (index === -1) return fail('That item is not in this passage sequence.');

	const targetIndex = direction === 'previous' ? index - 1 : index + 1;

	// Nothing before the first item, or after the last, anywhere in the sequence. This is the only
	// genuinely permanent refusal of the three, and it must never be phrased as "yet".
	if (targetIndex < 0 || targetIndex >= flat.length) {
		return fail(
			direction === 'previous'
				? 'Nothing precedes this, so there is nothing to join it into.'
				: 'Nothing follows this, so there is nowhere to move it.'
		);
	}

	const active = flat[index];
	const target = flat[targetIndex];
	const crossesBoundary = active.passageIndex !== target.passageIndex;

	if (!crossesBoundary) {
		// Wholly inside one passage: the operation the five commands already perform correctly.
		return { ok: true, reason: null, seamKind: null, crossesBoundary: false, active, target };
	}

	// Crossing. The seam is always classified in SEQUENCE order — earlier passage first — regardless
	// of which way the gesture travels, because contiguity is a property of the seam and not of the
	// direction it is approached from. Getting this backwards would make Move Text Down legal exactly
	// where Move Text Up is illegal, at the same seam.
	const earlier = direction === 'previous' ? target : active;
	const later = direction === 'previous' ? active : target;
	const earlierPassage = sequence[earlier.passageIndex]?.passage;
	const laterPassage = sequence[later.passageIndex]?.passage;

	const seamKind = classifyPassageSeam(earlierPassage, laterPassage);

	if (seamKind !== 'contiguous') {
		return fail(reasonForSeam(seamKind, earlierPassage, laterPassage), seamKind);
	}

	return { ok: true, reason: null, seamKind, crossesBoundary: true, active, target };
}

/**
 * Why an ineligible seam is ineligible, in the user's terms.
 *
 * §11's rule restated: a permanently dead seam must never be described as "not yet". Every branch
 * below is permanent — none waits on a later phase — so none of them says "yet".
 */
function reasonForSeam(seamKind, earlierPassage, laterPassage) {
	if (seamKind === 'different-books') {
		const from = earlierPassage?.bookName ?? earlierPassage?.bookId ?? 'this passage';
		const to = laterPassage?.bookName ?? laterPassage?.bookId ?? 'the next';
		return `${from} and ${to} aren’t adjacent in Scripture, so structure can’t move across this boundary.`;
	}
	if (seamKind === 'overlap') {
		// Q40, ratified: overlap is ineligible and says so in its own words. Moving structure across
		// an overlapping seam has no single meaning — the preceding item in canonical order may sit in
		// either passage — so it would silently duplicate or orphan what it moved.
		return 'These passages overlap, so moving structure across this boundary would repeat verses.';
	}
	return 'There’s a gap in Scripture at this boundary, so structure can’t move across it.';
}
