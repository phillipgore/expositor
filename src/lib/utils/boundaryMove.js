/**
 * # Boundary moves: what happens to the two passage ranges (SERIES_PLAN §8, step 2)
 *
 * `sequenceScope.js` decides *whether* a structural command may cross a boundary and *what* it acts
 * on. This module answers the question that follows: when structure moves from one passage to its
 * neighbour, **where does each passage now end and begin?**
 *
 * §8's "what a boundary move must do" lists eight steps. Step 2 is "adjust both parts' passage
 * ranges", and it is the step that makes a boundary move mean anything: moving a segment row between
 * parts without moving the verses it covers would leave part n rendering text that part n−1 now owns.
 * The structure would be in the new part and the words would still be in the old one.
 *
 * ## Verse-conservative, and that is a load-bearing property
 *
 * A boundary move relocates verses between two adjacent parts; it never creates or destroys any. §10.1
 * depends on exactly this: because the series' total coverage is unchanged, **no boundary move can
 * change the export position**, so `validateExportLimits()` need not be re-run. `planBoundaryShift()`
 * therefore returns both new ranges together and reports the verse count that moved, so a caller can
 * assert conservation rather than assume it.
 *
 * ⚠️ Display compliance is a different matter and is NOT conservative — the receiving part grows, and
 * the display cap is per page. §10.1's worked example is a part at 211 verses that one Move Text Up
 * gesture pushes to 217, over half of Romans. That check belongs to the caller (it needs the
 * translation), but this module gives it the ranges to check.
 *
 * @module boundaryMove
 */

import { getVerseCount } from './bibleData.js';

/** Book id from either spelling. DB rows carry `bookId`; in-memory ranges carry `book`. */
function bookOf(range) {
	return range?.bookId ?? range?.book ?? null;
}

/**
 * Parse a `BOOK-CHAPTER-VERSE-WORD` id into its chapter and verse.
 *
 * ⚠️ Only chapter and verse are read. The word index is deliberately ignored: passage ranges are
 * verse-granular (`fromVerse`/`toVerse`), so a boundary landing mid-verse still moves the whole verse.
 * A segment may legitimately begin mid-verse — `passageReconcile.js` says so explicitly — which means
 * a move can put a passage boundary inside a verse that both parts partly display. Recorded rather
 * than silently truncated: the range arithmetic below rounds to whole verses, and the structure keeps
 * its exact word anchor, so the *rendering* stays correct while the range stays verse-granular.
 */
function parseAnchor(wordId) {
	if (typeof wordId !== 'string') return null;
	const parts = wordId.split('-');
	if (parts.length < 3) return null;
	const chapter = parseInt(parts[1], 10);
	const verse = parseInt(parts[2], 10);
	if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
	return { chapter, verse };
}

/** The (chapter, verse) immediately before this one, or null at the start of the book. */
function previousVerse(testament, book, chapter, verse) {
	if (verse > 1) return { chapter, verse: verse - 1 };
	if (chapter <= 1) return null;
	const length = getVerseCount(testament, book, chapter - 1);
	if (!length) return null;
	return { chapter: chapter - 1, verse: length };
}

/** Verses in a range, summing real chapter lengths rather than assuming equal ones. */
export function countVerses(range) {
	if (!range) return 0;
	const testament = range.testament;
	const book = bookOf(range);
	let total = 0;
	for (let c = range.fromChapter; c <= range.toChapter; c += 1) {
		const length = getVerseCount(testament, book, c);
		if (!length) return 0;
		const from = c === range.fromChapter ? range.fromVerse : 1;
		const to = c === range.toChapter ? Math.min(range.toVerse, length) : length;
		total += Math.max(0, to - from + 1);
	}
	return total;
}

/**
 * Recompute two adjacent passage ranges after the boundary between them moves.
 *
 * The boundary is expressed as `newBoundaryWordId`: the first word that belongs to the LATER passage
 * after the move. Everything before it belongs to the earlier passage. One parameter, not two, because
 * the two ranges must abut exactly — deriving both from a single boundary makes a gap or an overlap
 * unrepresentable rather than merely discouraged.
 *
 * Both directions are the same arithmetic. Moving content backwards (Join Segment, Move Text Up) pushes
 * the boundary later; moving it forwards (Move Text Down) pulls the boundary earlier. Writing them as
 * one function is why the pair cannot disagree about where the seam ended up.
 *
 * @param {Object} params
 * @param {Object} params.before - The earlier passage row
 * @param {Object} params.after - The later passage row
 * @param {string} params.newBoundaryWordId - First word id belonging to `after` after the move
 * @returns {{ ok: boolean, error: string|null, before: Object|null, after: Object|null, versesMoved: number, direction: 'backward'|'forward'|'none' }}
 */
export function planBoundaryShift({ before, after, newBoundaryWordId }) {
	// The cast is on `direction` alone and is not cosmetic: without it the literal 'none' widens to
	// `string`, which does not satisfy the documented union, and svelte-check reported the same error
	// once per early return — seven identical failures from one inference.
	const fail = (/** @type {string} */ error) => ({
		ok: false,
		error,
		before: /** @type {Object|null} */ (null),
		after: /** @type {Object|null} */ (null),
		versesMoved: 0,
		direction: /** @type {'backward'|'forward'|'none'} */ ('none')
	});

	if (!before || !after) return fail('Both passages are required to move a boundary.');

	const book = bookOf(before);
	// Different books never abut (§8: Eph 6:24 → Phil 1:1 is a seam, not a continuation), so there is
	// no boundary between them to move. Checked before any arithmetic, because verse arithmetic across
	// books is meaningless rather than merely wrong.
	if (book !== bookOf(after) || before.testament !== after.testament) {
		return fail('These passages are in different books, so there is no boundary to move.');
	}

	const anchor = parseAnchor(newBoundaryWordId);
	if (!anchor) return fail('The new boundary could not be read as a position in the text.');

	// The earlier passage now ends at the verse before the boundary.
	const end = previousVerse(before.testament, book, anchor.chapter, anchor.verse);
	if (!end) {
		return fail('The new boundary would leave the earlier passage with no verses.');
	}

	const newBefore = {
		...before,
		toChapter: end.chapter,
		toVerse: end.verse
	};
	const newAfter = {
		...after,
		fromChapter: anchor.chapter,
		fromVerse: anchor.verse
	};

	// Neither passage may be emptied. A boundary move relocates content between two parts; a move that
	// consumes one of them entirely is a Join Parts, which is a different command with a different
	// confirmation — and performing it under this name would delete a part the user did not ask to
	// lose. Refused rather than silently promoted.
	if (
		newBefore.fromChapter > newBefore.toChapter ||
		(newBefore.fromChapter === newBefore.toChapter && newBefore.fromVerse > newBefore.toVerse)
	) {
		return fail(
			'That would move every verse out of the earlier part. Use Join Parts to merge them instead.'
		);
	}
	if (
		newAfter.fromChapter > newAfter.toChapter ||
		(newAfter.fromChapter === newAfter.toChapter && newAfter.fromVerse > newAfter.toVerse)
	) {
		return fail(
			'That would move every verse out of the later part. Use Join Parts to merge them instead.'
		);
	}

	// Verse conservation, asserted rather than assumed: the two new ranges must together cover exactly
	// what the two old ones did. If this ever fails, a boundary move has invented or destroyed verses
	// and §10.1's "export is provably unaffected" no longer holds.
	const oldTotal = countVerses(before) + countVerses(after);
	const newTotal = countVerses(newBefore) + countVerses(newAfter);
	if (oldTotal !== newTotal) {
		return fail(
			`Refusing the move: it would change the verses covered (${oldTotal} → ${newTotal}).`
		);
	}

	const versesMoved = Math.abs(countVerses(newBefore) - countVerses(before));

	// Which way did the CONTENT move? Compared directly on (chapter, verse) rather than by synthesising
	// word ids for `compareWordIds`: doing that would have relied on its book segment being ignored,
	// which is a documented quirk of that function rather than a property to build on.
	//
	// ⚠️ `direction` names where the CONTENT went, which is the opposite of where the boundary went.
	// Worked through explicitly, because the first version returned the boundary's direction under a
	// name describing the content's, and every caller using it to pick §10.1's "receiver" would then
	// have grown the wrong part:
	//
	//   Boundary moved LATER  (delta > 0) → the earlier part now extends further → the earlier part
	//                                        RECEIVED verses → content moved BACKWARD.
	//   Boundary moved EARLIER (delta < 0) → the later part now starts sooner → the later part
	//                                        RECEIVED verses → content moved FORWARD.
	//
	// §10.1: "All three Joins fold backwards, so they grow part n−1. moveSegmentTextUp grows the
	// previous item; moveSegmentTextDown the next." So 'backward' is the Joins and Move Text Up, and
	// the receiver is `before`; 'forward' is Move Text Down, and the receiver is `after`.
	const boundaryDelta =
		anchor.chapter !== after.fromChapter
			? anchor.chapter - after.fromChapter
			: anchor.verse - after.fromVerse;

	const direction = boundaryDelta > 0 ? 'backward' : boundaryDelta < 0 ? 'forward' : 'none';

	return {
		ok: true,
		error: null,
		before: newBefore,
		after: newAfter,
		versesMoved,
		// Where the CONTENT went — see the derivation above. §10.1's "which part is the receiver
		// depends on the command" reads this to know which part to re-check.
		direction
	};
}
