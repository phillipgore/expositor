/**
 * # Word-id ordering
 *
 * Structure is anchored solely by `startingWordId` (`BOOK-CHAPTER-VERSE-WORD`), and every
 * boundary decision in the app is a comparison between two of them. `compareWordIds` used to
 * live in `src/lib/server/db/utils.js`, which imports `$lib/server/db/index.js` and therefore
 * `$env/static/private` — so importing it opens a database connection.
 *
 * That made the one function needed to *reason* about boundaries unreachable from anything that
 * is not a running server: the verifier scripts run under plain Node (`scripts/alias-loader.mjs`)
 * and would fail at import. It has been moved here, where it depends on nothing, and
 * `server/db/utils.js` re-exports it so every existing importer is untouched.
 *
 * ⚠️ **Moved, deliberately NOT copied.** A second implementation would be a second place for the
 * ordering rule to drift, and the rule is load-bearing for `passageJoin`, `passageReconcile` and
 * now series restructuring — the same "one concept, several uses" argument SERIES_PLAN §4 makes
 * for the adjacency predicate.
 *
 * @module wordIds
 */

/**
 * Compare two word IDs to determine their order.
 *
 * ⚠️ **The book segment is not compared.** Only indices 1–3 (chapter, verse, word) are read, so
 * `RO-001-001-001` and `JN-001-001-001` compare equal. That is safe for every current caller —
 * all of them order structure *within one passage*, which cannot span books — and it is preserved
 * here exactly as it behaved in `server/db/utils.js` rather than quietly "fixed", because
 * changing the ordering of existing structure is not a refactor.
 *
 * A missing id returns 0 (treated as equal) rather than throwing, also as before.
 *
 * @param {string} wordId1 - First word ID, e.g. `JN-001-001-005`
 * @param {string} wordId2 - Second word ID
 * @returns {number} Negative if wordId1 < wordId2, 0 if equal, positive if wordId1 > wordId2
 */
export function compareWordIds(wordId1, wordId2) {
	if (!wordId1 || !wordId2) return 0;

	const parts1 = wordId1.split('-');
	const parts2 = wordId2.split('-');

	// Compare chapter, verse, and word number (indices 1, 2, 3)
	for (let i = 1; i < 4; i++) {
		const num1 = parseInt(parts1[i], 10);
		const num2 = parseInt(parts2[i], 10);
		const diff = num1 - num2;
		if (diff !== 0) return diff;
	}

	return 0;
}

// ── Word-level passage bounds (SERIES_PLAN §8, word-granular parts) ─────────────────────────────
//
// A passage row's range is (fromChapter, fromVerse) → (toChapter, toVerse), plus two nullable word
// indices: `fromWord` (first word of the first verse; null = word 1) and `toWord` (last word of the
// last verse; null = to the end of that verse). Null-means-whole-verse is what lets every existing
// row stay valid untouched, and what lets "the word before word 1 of 5:1" be written without knowing
// how many words 4:19 has: it is simply (4, 19, null).
//
// Positions below are `{ chapter, verse, word }`, where `word` may be `Infinity` for "end of verse".
// Every comparison of a range edge in the app should go through these, so the rule lives once.

/** Parse `BOOK-CCC-VVV-WWW` into its numeric parts, or null if it is not one. */
export function parseWordIdParts(wordId) {
	if (typeof wordId !== 'string') return null;
	const parts = wordId.split('-');
	if (parts.length !== 4) return null;
	const chapter = parseInt(parts[1], 10);
	const verse = parseInt(parts[2], 10);
	const word = parseInt(parts[3], 10);
	if (![chapter, verse, word].every(Number.isFinite)) return null;
	return { book: parts[0], chapter, verse, word };
}

/** Is a word-bound value present (i.e. the edge falls inside a verse)? */
function hasWord(value) {
	return value !== null && value !== undefined;
}

/** First position a range covers. */
export function rangeStartPosition(range) {
	return {
		chapter: range.fromChapter,
		verse: range.fromVerse,
		word: hasWord(range.fromWord) ? range.fromWord : 1
	};
}

/** Last position a range covers (`word: Infinity` when it runs to the end of its last verse). */
export function rangeEndPosition(range) {
	return {
		chapter: range.toChapter,
		verse: range.toVerse,
		word: hasWord(range.toWord) ? range.toWord : Infinity
	};
}

/** Order two positions. Negative if a < b, 0 if equal, positive if a > b. */
export function comparePositions(a, b) {
	if (a.chapter !== b.chapter) return a.chapter - b.chapter;
	if (a.verse !== b.verse) return a.verse - b.verse;
	if (a.word === b.word) return 0;
	return a.word < b.word ? -1 : 1;
}

/** Does the range start part-way through its first verse? */
export function startsMidVerse(range) {
	return hasWord(range?.fromWord) && range.fromWord > 1;
}

/** Does the range stop part-way through its last verse? */
export function endsMidVerse(range) {
	return hasWord(range?.toWord);
}

/** Does this range start or end inside a verse? */
export function hasPartialVerse(range) {
	return startsMidVerse(range) || endsMidVerse(range);
}

/** Is a range non-empty — does its start come no later than its end? */
export function isNonEmptyRange(range) {
	return comparePositions(rangeStartPosition(range), rangeEndPosition(range)) <= 0;
}

/**
 * Is `wordId` inside `range`? Book is not compared (ranges never span books, and this mirrors
 * `compareWordIds`). Used to clip a passage's whole-verse text to its word bounds.
 */
export function isWordInRange(wordId, range) {
	const p = parseWordIdParts(wordId);
	if (!p) return false;
	const pos = { chapter: p.chapter, verse: p.verse, word: p.word };
	return (
		comparePositions(pos, rangeStartPosition(range)) >= 0 &&
		comparePositions(pos, rangeEndPosition(range)) <= 0
	);
}

/**
 * EXCLUSIVE end word id of a range: the first word NOT in it.
 *
 * Whole-verse end → word 1 of the following verse number (the long-standing `toVerse + 1` form; a
 * chapter rollover is resolved by `formatScriptureReference`, as before). Mid-verse end → the word
 * after `toWord` in the same verse, exactly how a segment boundary inside a verse is expressed.
 *
 * @param {string} bookAbbr - e.g. `IPE`
 * @param {{ toChapter: number, toVerse: number, toWord?: number|null }} range
 * @param {number} [chapterPad=3]
 * @param {number} [versePad=3]
 */
export function rangeEndWordId(bookAbbr, range, chapterPad = 3, versePad = 3) {
	const ch = String(range.toChapter).padStart(chapterPad, '0');
	if (hasWord(range.toWord)) {
		const v = String(range.toVerse).padStart(versePad, '0');
		return `${bookAbbr}-${ch}-${v}-${String(range.toWord + 1).padStart(3, '0')}`;
	}
	const v = String((range.toVerse ?? 0) + 1).padStart(versePad, '0');
	return `${bookAbbr}-${ch}-${v}-001`;
}

/** Normalise the two optional word fields so word 1 / end-of-verse are stored as null. */
export function normaliseWordBounds(range) {
	return {
		...range,
		fromWord: startsMidVerse(range) ? range.fromWord : null,
		toWord: endsMidVerse(range) ? range.toWord : null
	};
}
