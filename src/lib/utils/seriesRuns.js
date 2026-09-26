/**
 * # Series runs and boundary adjacency
 *
 * A series decomposes into maximal **runs** of canonically contiguous parts (SERIES_PLAN §4).
 * Romans 1–16 in sixteen parts is one run; Prison Epistles is four runs of one part each.
 *
 * ## Runs are derived, never stored
 *
 * §4 is explicit, and §12 trap 12 repeats it: a part delete creates a run boundary, Split Part
 * creates one, Join Parts merges two, and a boundary move shifts where one ends — four chances
 * for a stored `runId` to go stale. So this folds the adjacency predicate over parts in canonical
 * order, on demand. If you find yourself adding a `run` table, re-read §4.
 *
 * ## One predicate, three callers
 *
 * §4: "the function that decides whether Join Column works at a seam also decides whether a drag
 * is legal. One concept, two uses." Plus the part-delete warning, which is three. They must agree,
 * so `classifyBoundary()` is the single source and everything else is built from it.
 *
 * ## Why the predicate returns four states, not a boolean
 *
 * §8's table has four rows, and the fourth is overlap (Q40, settled: ineligible). A boolean would
 * have to fold overlap into either "contiguous" or "gap", and both are wrong — overlap is neither.
 * Worse, §8/§11 need to tell an ELIGIBLE boundary apart from the several ways one can be dead, and
 * to say which, since "these parts aren't adjacent in Scripture" and "these parts overlap" are
 * different facts a user can act on differently. The reason strings need to know *why* a boundary is
 * dead, which a boolean cannot say.
 *
 * ⚠️ **This used to describe a "not implemented yet" state as one of the two reasons.** A contiguous
 * seam was the phase-1 case that carried it; the five cross-part commands are now implemented, so
 * that seam is simply eligible and `getBoundaryDisabledReason()` returns `null` for it. The four
 * classification states are unchanged — only the copy attached to one of them.
 *
 * @module seriesRuns
 */

import { getVerseCount } from './bibleData.js';

/**
 * @typedef {'contiguous'|'gap'|'different-books'|'overlap'} BoundaryKind
 */

/**
 * Classify the seam between two parts in sequence order.
 *
 * The predicate §8 specifies is NOT "is this part n−1" but "does part n−1 end at the word
 * immediately preceding part n's first word". Two ways for that to hold: the next verse is in the
 * same chapter, or the earlier part ends on a chapter's final verse and the later one starts at
 * verse 1 of the next chapter. The second case needs real verse counts, which is why this reaches
 * for `getVerseCount` rather than assuming chapters are equal length.
 *
 * @param {Object} before - The earlier part (needs `passages`)
 * @param {Object} after - The later part
 * @returns {BoundaryKind}
 */
export function classifyBoundary(before, after) {
	const end = lastRangeOf(before);
	const start = firstRangeOf(after);

	if (!end || !start) return 'gap';

	// Different book (or testament) is never joinable — Eph 6:24 → Phil 1:1 is a seam, not a
	// continuation (§8). Checked first because verse arithmetic across books is meaningless.
	if (end.testament !== start.testament || end.book !== start.book) {
		return 'different-books';
	}

	const endsBefore =
		start.fromChapter < end.toChapter ||
		(start.fromChapter === end.toChapter && start.fromVerse <= end.toVerse);

	// The later part begins at or before the earlier one ends: Rom 1–3 then Rom 3–5. Q40 has not
	// decided what this means for runs, so it is reported as its own state rather than guessed at.
	if (endsBefore) return 'overlap';

	// Immediately next verse, same chapter.
	if (start.fromChapter === end.toChapter && start.fromVerse === end.toVerse + 1) {
		return 'contiguous';
	}

	// First verse of the next chapter, where the earlier part ran to the end of its chapter.
	if (start.fromChapter === end.toChapter + 1 && start.fromVerse === 1) {
		const chapterLength = getVerseCount(end.testament, end.book, end.toChapter);
		// A missing chapter length would make this silently "contiguous"; treat unknown as a gap
		// rather than inventing adjacency.
		if (chapterLength && end.toVerse >= chapterLength) return 'contiguous';
	}

	return 'gap';
}

/**
 * True only for a seam where cross-part structural operations are permitted (§8).
 * Overlap is deliberately excluded: Q40 is undecided, and treating an undecided case as eligible
 * would let phase 2 operate on a boundary nobody has defined semantics for.
 *
 * @param {Object} before
 * @param {Object} after
 * @returns {boolean}
 */
export function isBoundaryContiguous(before, after) {
	return classifyBoundary(before, after) === 'contiguous';
}

/**
 * Fold the adjacency predicate over parts in sequence order to produce maximal runs.
 *
 * @param {Array<Object>} parts - Parts with `passages`; ordered by `seriesOrder` if present
 * @returns {Array<Array<Object>>} Runs, each a non-empty array of parts in order
 */
export function computeRuns(parts) {
	const ordered = sortParts(parts);
	if (ordered.length === 0) return [];

	const runs = [[ordered[0]]];

	for (let i = 1; i < ordered.length; i += 1) {
		const previous = ordered[i - 1];
		const current = ordered[i];

		if (isBoundaryContiguous(previous, current)) {
			runs[runs.length - 1].push(current);
		} else {
			runs.push([current]);
		}
	}

	return runs;
}

/**
 * Describe every seam in a series, for UI that must explain why a boundary is dead.
 *
 * @param {Array<Object>} parts
 * @returns {Array<{ beforeId: string, afterId: string, kind: BoundaryKind }>}
 */
export function describeBoundaries(parts) {
	const ordered = sortParts(parts);
	const boundaries = [];

	for (let i = 1; i < ordered.length; i += 1) {
		boundaries.push({
			beforeId: ordered[i - 1].id,
			afterId: ordered[i].id,
			kind: classifyBoundary(ordered[i - 1], ordered[i])
		});
	}

	return boundaries;
}

/**
 * Whether a series can be reordered at all.
 *
 * §11 asks for this explicitly: "a contiguous Romans series has exactly one run and nothing to
 * reorder, so the UI must not offer it." Fewer than two runs means the gesture is meaningless.
 *
 * @param {Array<Object>} parts
 * @returns {boolean}
 */
export function isReorderable(parts) {
	return computeRuns(parts).length > 1;
}

/**
 * Why a cross-part command is unavailable at this boundary — or `null` when it IS available.
 *
 * §8: phase 1's "not available across parts yet" copy is the WRONG string at a permanently
 * ineligible seam, because "yet" promises a Prison Epistles user a fix that is never coming.
 * `null` means the boundary is fine and the caller should not disable anything.
 *
 * ⚠️ **A contiguous seam now returns `null`, and used to return "Not available across parts yet."**
 * That string was correct in phase 1, when the five cross-part commands were unimplemented. They
 * are implemented — all five, both directions, at all three granularities — so the sentence became
 * a lie that actively DISABLED the feature it was describing: every caller treats a non-null reason
 * as "ineligible", so Join Up/Down and Move Text Up/Down stayed greyed out at exactly the
 * boundaries where they now work.
 *
 * §11 is explicit that a promise of a later fix must not outlive the fix. This is that rule applied
 * to its own copy: when the "yet" came true, the "yet" had to go.
 *
 * @param {Object} before
 * @param {Object} after
 * @returns {string|null} A sentence to show beneath the disabled command, or null when it is enabled
 */
export function getBoundaryDisabledReason(before, after) {
	const kind = classifyBoundary(before, after);

	if (kind === 'contiguous') {
		// Eligible, and implemented: the commands cross this seam. Nothing to explain, nothing to
		// disable. See the ⚠️ above before reintroducing a string here.
		return null;
	}

	if (kind === 'different-books') {
		const beforeName = lastRangeOf(before)?.bookName ?? 'These parts';
		const afterName = firstRangeOf(after)?.bookName ?? 'the next part';
		// Never-applicable: no phase will make two different books adjacent.
		return `${beforeName} and ${afterName} aren't adjacent in Scripture.`;
	}

	if (kind === 'overlap') {
		return 'These parts overlap, so this boundary has no defined position.';
	}

	return "These parts aren't adjacent in Scripture.";
}

/**
 * The part-delete confirmation (§4).
 *
 * ⚠️ The copy is ONE fixed sentence — title and message only, no listed consequences. §4 originally
 * required the warning to name three topology consequences (dead seam, newly reorderable, now
 * non-contiguous) plus the dissolve-at-one-part case; that requirement was retired in favour of a
 * single plain confirmation matching the Study / Study Group / Series modals. See §4 "Deletion".
 *
 * The topology is still COMPUTED and returned (`splitsRun`, `dissolves`) because it is true and
 * cheap, and the verify suite pins it. It is simply no longer rendered as copy. Do not reintroduce
 * consequence sentences here without revisiting that decision in the plan.
 *
 * Deleting an end part of a run splits nothing, so `splitsRun` is false there.
 *
 * @param {Array<Object>} parts - All parts of the series, including the one to be deleted
 * @param {string} partId
 * @returns {{ dissolves: boolean, splitsRun: boolean, title: string, message: string }}
 */
export function describePartDeletion(parts, partId) {
	const ordered = sortParts(parts);
	const index = ordered.findIndex((candidate) => candidate.id === partId);
	const target = ordered[index];
	const label = target?.title ?? 'this part';
	const title = 'Delete Series Part';
	const message = `Are you sure you want to delete the Series Part "${label}"? This action cannot be undone.`;

	// Down to one part: the series dissolves rather than the run splitting (§4).
	if (ordered.length <= 2) {
		return { dissolves: true, splitsRun: false, title, message };
	}

	// A seam dies only if the part had contiguous neighbours on BOTH sides — that is what makes it
	// interior to a run. Deleting the first or last part of a run just shortens it.
	const before = ordered[index - 1];
	const after = ordered[index + 1];
	const splitsRun =
		Boolean(before && after) &&
		isBoundaryContiguous(before, target) &&
		isBoundaryContiguous(target, after);

	return { dissolves: false, splitsRun, title, message };
}

/**
 * The series-delete confirmation (§4).
 *
 * The copy names the cascade ("and its parts") and states that it cannot be undone. It does not
 * state the part count; see §4 "Deletion".
 *
 * @param {Object} series
 * @returns {{ title: string, message: string }}
 */
export function describeSeriesDeletion(series) {
	const name = series?.name ?? 'this series';

	return {
		title: 'Delete Series',
		message: `Are you sure you want to delete the Series "${name}" and its parts? This action cannot be undone.`
	};
}

// ── internals ────────────────────────────────────────────────────────────────


/**
 * Parts in sequence order. `seriesOrder` is the user's arrangement and §4 forbids re-deriving it
 * from canonical order, so it is respected as-is when present.
 */
function sortParts(parts) {
	if (!Array.isArray(parts)) return [];
	return [...parts].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
}

/**
 * A part's passages sorted by position in Scripture. A part usually has one, but the
 * part-per-passage strategy and later edits allow several, and adjacency must compare the
 * *outermost* ranges rather than whichever row happened to be stored first.
 */
function sortedPassages(part) {
	const passages = part?.passages;
	if (!Array.isArray(passages) || passages.length === 0) return [];

	return [...passages].sort(
		(a, b) => a.fromChapter - b.fromChapter || a.fromVerse - b.fromVerse
	);
}

function firstRangeOf(part) {
	return normalizeRange(sortedPassages(part)[0]);
}

function lastRangeOf(part) {
	const passages = sortedPassages(part);
	return normalizeRange(passages[passages.length - 1]);
}

/**
 * Passage rows reach here from two directions — Drizzle (`bookId`) and the client payloads used by
 * the planner (`book`) — so both spellings are accepted rather than assuming one.
 */
function normalizeRange(passage) {
	if (!passage) return null;

	return {
		testament: passage.testament,
		book: passage.bookId ?? passage.book,
		bookName: passage.bookName ?? passage.bookId ?? passage.book,
		fromChapter: passage.fromChapter,
		fromVerse: passage.fromVerse,
		toChapter: passage.toChapter,
		toVerse: passage.toVerse
	};
}
