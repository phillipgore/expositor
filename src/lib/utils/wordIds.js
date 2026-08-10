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
