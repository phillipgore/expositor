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
 * @returns {string} Formatted passage reference (e.g., "John 3:16" or "Romans 8:28-39")
 */
export function formatPassageReference(passage) {
	const sameChapter = passage.fromChapter === passage.toChapter;
	const singleVerse = passage.fromVerse === passage.toVerse;
	
	if (sameChapter && singleVerse) {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
	} else if (sameChapter) {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
	} else {
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
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
