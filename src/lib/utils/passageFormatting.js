/**
 * Passage Formatting Utilities
 * 
 * Functions for formatting Bible passage references for display.
 */

/**
 * Format a passage reference for display
 * 
 * @param {Object} passage - The passage object with book, chapter, and verse info
 * @param {string} passage.bookName - Name of the Bible book
 * @param {number} passage.fromChapter - Starting chapter
 * @param {number} passage.fromVerse - Starting verse
 * @param {number} passage.toChapter - Ending chapter
 * @param {number} passage.toVerse - Ending verse
 * @param {number|null} [passage.fromWord] - First word of the first verse (null = whole verse)
 * @param {number|null} [passage.toWord] - Last word of the last verse (null = whole verse)
 * @returns {string} Formatted passage reference (e.g., "John 3:16" or "Romans 8:28-39")
 */
export function formatPassageReference(passage) {
	const sameChapter = passage.fromChapter === passage.toChapter;
	const singleVerse = passage.fromVerse === passage.toVerse;

	// Word-level bounds (migration 0048) use the same a/b convention as a verse subdivided between
	// segments (`passageText.js`): the half of a verse after the split is "b", the half before it "a".
	// A range starting mid-verse begins with the later half; one ending mid-verse ends with the
	// earlier half. Null word bounds add nothing, so whole-verse ranges read exactly as before.
	const fromSuffix = (passage.fromWord ?? 1) > 1 ? 'b' : '';
	const toSuffix = passage.toWord !== null && passage.toWord !== undefined ? 'a' : '';

	if (sameChapter && singleVerse && !fromSuffix && !toSuffix) {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
	} else if (sameChapter) {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}${fromSuffix}-${passage.toVerse}${toSuffix}`;
	} else {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}${fromSuffix}-${passage.toChapter}:${passage.toVerse}${toSuffix}`;
	}
}

/**
 * Format multiple passages as a comma-separated list
 * 
 * @param {Array} passages - Array of passage objects
 * @returns {string} Formatted string of passages
 */
export function formatPassageList(passages) {
	if (!passages || passages.length === 0) return '';
	return passages.map(p => formatPassageReference(p)).join(', ');
}
