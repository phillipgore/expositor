/**
 * Utility functions for passage formatting and reference handling
 */

import { getTranslationMetadata } from './translationConfig.js';

/**
 * Format a passage reference for display
 * @param {Object} passage - Passage object with reference information
 * @param {string} passage.bookName - Name of the book
 * @param {number} passage.fromChapter - Starting chapter
 * @param {number} passage.fromVerse - Starting verse
 * @param {number} passage.toChapter - Ending chapter
 * @param {number} passage.toVerse - Ending verse
 * @returns {string} Formatted passage reference
 */
export function formatPassageReference(passage) {
	if (!passage || !passage.bookName) return '';
	
	const sameChapter = passage.fromChapter === passage.toChapter;
	const singleVerse = passage.fromVerse === passage.toVerse;
	
	if (sameChapter && singleVerse) {
		// Single verse: "John 3:16"
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
	} else if (sameChapter) {
		// Multiple verses same chapter: "John 3:16-17"
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
	} else {
		// Multiple chapters: "Genesis 1:1-2:3"
		return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
	}
}

/**
 * Get translation abbreviation from translation code
 * @param {string} translation - Translation code (e.g., 'esv', 'net')
 * @returns {string} Translation abbreviation in uppercase
 */
export function getTranslationAbbreviation(translation) {
	const metadata = getTranslationMetadata(translation || 'esv');
	return metadata?.abbreviation || translation?.toUpperCase() || 'ESV';
}

/**
 * Get copyright notice for a translation
 * @param {string} translation - Translation code (e.g., 'esv', 'net')
 * @returns {string|null} Copyright notice or null if not found
 */
export function getCopyrightNotice(translation) {
	const copyrightNotices = {
		esv: 'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.',
		net: 'Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved.'
	};
	
	return copyrightNotices[translation] || null;
}
