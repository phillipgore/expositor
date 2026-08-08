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
 * §8's table has four rows, and the fourth is undecided (Q40: overlapping parts). A boolean would
 * have to fold overlap into either "contiguous" or "gap", and both are wrong — overlap is neither.
 * Worse, §8/§11 need to tell *not-implemented* apart from *never-applicable* when explaining a
 * dead boundary: "not available across parts yet" for a contiguous seam awaiting phase 2, and
 * "these parts aren't adjacent in Scripture" for one that will never be eligible. A single "yet"
 * message promises a Prison Epistles user a fix that is never coming (§8). The reason strings need
 * to know *why* a boundary is dead, which a boolean cannot say.
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
 * The two reason strings §11 option (1) requires — and it must be two, not one.
 *
 * §8: phase 1's "not available across parts yet" copy is the WRONG string at a permanently
 * ineligible seam, because "yet" promises a Prison Epistles user a fix that is never coming.
 * `null` means the boundary is fine and the caller should not disable anything.
 *
 * @param {Object} before
 * @param {Object} after
 * @returns {string|null}
 */
export function getBoundaryDisabledReason(before, after) {
	const kind = classifyBoundary(before, after);

	if (kind === 'contiguous') {
		// Eligible in principle, unimplemented in phase 1. "Yet" is honest here.
		return 'Not available across parts yet.';
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
 * The part-delete warning (§4).
 *
 * §4 requires this to name three consequences, "all arriving later than the gesture, which is why
 * the warning must name them" — a permanently dead seam, previously-rigid parts becoming
 * reorderable, and the series becoming non-contiguous. All three follow from whether the deleted
 * part sits *inside* a run, which is why this lives beside the run helper instead of in the modal:
 * the copy is a consequence of the topology, not of the click.
 *
 * Deleting an end part of a run splits nothing, so claiming a dead seam there would be false.
 *
 * @param {Array<Object>} parts - All parts of the series, including the one to be deleted
 * @param {string} partId
 * @returns {{ dissolves: boolean, splitsRun: boolean, title: string, message: string, consequences: string[] }}
 */
export function describePartDeletion(parts, partId) {
	const ordered = sortParts(parts);
	const index = ordered.findIndex((candidate) => candidate.id === partId);
	const target = ordered[index];
	const label = target?.title ?? 'this part';

	// Down to one part: the series dissolves rather than the run splitting (§4). Reported on its
	// own because "the series will no longer exist" outranks any statement about seams.
	if (ordered.length <= 2) {
		const survivor = ordered.find((candidate) => candidate.id !== partId);

		return {
			dissolves: true,
			splitsRun: false,
			title: 'Delete Part',
			message: `Delete “${label}”?`,
			consequences: [
				survivor
					? `This leaves one part, so the series will be dissolved and “${survivor.title ?? 'the remaining part'}” will become a standalone study.`
					: 'This removes the last part, so the series will be dissolved.',
				'This cannot be undone.'
			]
		};
	}

	// A seam dies only if the part had contiguous neighbours on BOTH sides — that is what makes it
	// interior to a run. Deleting the first or last part of a run just shortens it.
	const before = ordered[index - 1];
	const after = ordered[index + 1];
	const splitsRun =
		Boolean(before && after) &&
		isBoundaryContiguous(before, target) &&
		isBoundaryContiguous(target, after);

	const consequences = [];

	if (splitsRun) {
		// §4's worked example: "Deleting Part 8 (Romans 8) removes Romans 8 from the series and
		// splits it into two blocks: Parts 1–7 and Parts 9–16."
		consequences.push(
			`Its verses leave the series, splitting it into two blocks: “${before.title ?? 'the earlier part'}” and “${after.title ?? 'the later part'}” are no longer adjacent.`
		);
		// Consequence 1 — permanently dead seam, and never "yet".
		consequences.push('Structural commands will no longer work across that gap.');
		// Consequence 2 — surprising unless stated.
		consequences.push('Parts that could not be reordered before may now be reordered.');
		// Consequence 3 — the Q7 non-contiguous case.
		consequences.push('The series will no longer cover a continuous passage.');
	} else {
		consequences.push('Its verses leave the series.');
	}

	consequences.push('This cannot be undone.');

	return {
		dissolves: false,
		splitsRun,
		title: 'Delete Part',
		message: `Delete “${label}”?`,
		consequences
	};
}

/**
 * The series-delete confirmation (§4).
 *
 * "one action destroys every part with all its structure, notes and commentary, so the
 * confirmation must state the part count and that it cannot be undone."
 *
 * @param {Object} series
 * @param {number} partCount
 * @returns {{ title: string, message: string, consequences: string[] }}
 */
export function describeSeriesDeletion(series, partCount) {
	const name = series?.name ?? 'this series';

	return {
		title: 'Delete Series',
		message: `Delete the series “${name}”?`,
		consequences: [
			`This permanently deletes all ${partCount} ${partCount === 1 ? 'part' : 'parts'}, including their structure, notes and commentary.`,
			'This cannot be undone.'
		]
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
