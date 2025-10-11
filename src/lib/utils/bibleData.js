/**
 * Bible Data Utility Module
 * 
 * Provides utility functions for accessing and manipulating Bible data.
 * Includes error handling for malformed data structures.
 * 
 * @module bibleData
 */

import bibleData from '$lib/data/bible.json';

// Extract and cache Bible data structure
let testamentData, otBookData, ntBookData;

try {
	testamentData = bibleData[0]?.testamentData;
	if (!testamentData || !Array.isArray(testamentData)) {
		throw new Error('Invalid testament data structure');
	}
	otBookData = testamentData[0]?.bookData;
	ntBookData = testamentData[1]?.bookData;
	
	if (!otBookData || !ntBookData) {
		throw new Error('Missing Old Testament or New Testament book data');
	}
} catch (error) {
	console.error('Failed to load Bible data:', error);
	// Fallback to empty arrays to prevent crashes
	testamentData = [];
	otBookData = [];
	ntBookData = [];
}

/**
 * Gets the book data for a specified testament.
 * 
 * @param {('OT'|'NT')} testament - Testament identifier
 * @returns {Array} Array of book objects
 */
export function getBookData(testament) {
	try {
		return testament === 'OT' ? otBookData : ntBookData;
	} catch (error) {
		console.error('Error in getBookData:', error);
		return [];
	}
}

/**
 * Generates radio button properties for testament selection (OT/NT).
 * 
 * @param {('OT'|'NT')} selectedTestament - Currently selected testament
 * @param {string} passageId - Unique passage ID for element IDs
 * @returns {Array} Array of radio button property objects
 */
export function getTestaments(selectedTestament, passageId) {
	try {
		if (!testamentData || !Array.isArray(testamentData)) {
			console.error('Invalid testament data');
			return [];
		}

		const radioButtonTestaments = [];

		testamentData.forEach((testament) => {
			if (!testament._id || !testament.title) {
				console.warn('Skipping invalid testament entry:', testament);
				return;
			}

			radioButtonTestaments.push({
				id: `${testament._id}-${passageId}`,
				value: testament._id,
				text: testament.title,
				isChecked: testament._id === selectedTestament
			});
		});

		return radioButtonTestaments;
	} catch (error) {
		console.error('Error in getTestaments:', error);
		return [];
	}
}

/**
 * Generates select option properties for book selection.
 * 
 * @param {('OT'|'NT')} testament - Testament to get books from
 * @param {string} selectedBook - Currently selected book ID
 * @returns {Array} Array of book option objects
 */
export function getBooks(testament, selectedBook) {
	try {
		const bookData = getBookData(testament);
		
		if (!bookData || !Array.isArray(bookData)) {
			console.error('Invalid book data structure for testament:', testament);
			return [];
		}

		const books = [];

		bookData.forEach((book) => {
			if (!book._id || !book.title) {
				console.warn('Skipping invalid book entry:', book);
				return;
			}

			books.push({
				id: book._id,
				value: book._id,
				text: book.title,
				isSelected: book._id === selectedBook
			});
		});

		return books;
	} catch (error) {
		console.error('Error in getBooks:', error);
		return [];
	}
}

/**
 * Gets a specific book object by ID and testament.
 * 
 * @param {('OT'|'NT')} testament - Testament the book belongs to
 * @param {string} bookId - Book ID to find
 * @returns {Object|null} Book object or null if not found
 */
export function getBook(testament, bookId) {
	try {
		const bookData = getBookData(testament);
		const book = bookData.find((b) => b._id === bookId);
		
		if (!book) {
			console.warn(`Book not found: ${bookId} in ${testament}`);
			return null;
		}
		
		return book;
	} catch (error) {
		console.error('Error in getBook:', error);
		return null;
	}
}

/**
 * Generates select option properties for chapter selection.
 * 
 * @param {('OT'|'NT')} testament - Testament the book belongs to
 * @param {string} bookId - Book ID to get chapters from
 * @param {number} selectedChapter - Currently selected chapter
 * @param {number} [minChapter=1] - Minimum chapter number to include
 * @returns {Array} Array of chapter option objects
 */
export function getChapters(testament, bookId, selectedChapter, minChapter = 1) {
	try {
		const book = getBook(testament, bookId);
		
		if (!book || typeof book.chapterCount !== 'number') {
			console.error('Invalid book or missing chapterCount:', book);
			return [];
		}

		const chapters = [];

		for (let i = minChapter; i <= book.chapterCount; i++) {
			chapters.push({
				id: i,
				value: i,
				text: i.toString(),
				isSelected: i === selectedChapter
			});
		}

		return chapters;
	} catch (error) {
		console.error('Error in getChapters:', error);
		return [];
	}
}

/**
 * Gets the verse count for a specific chapter.
 * 
 * @param {('OT'|'NT')} testament - Testament the book belongs to
 * @param {string} bookId - Book ID
 * @param {number} chapterNum - Chapter number
 * @returns {number} Number of verses in the chapter, or 0 if not found
 */
export function getVerseCount(testament, bookId, chapterNum) {
	try {
		const book = getBook(testament, bookId);
		
		if (!book || !book.chapterData || !book.chapterData[0]) {
			console.error('Invalid book structure or missing chapterData');
			return 0;
		}

		const verseCount = book.chapterData[0][chapterNum.toString()];
		
		if (typeof verseCount !== 'number') {
			console.warn(`Verse count not found for ${bookId} chapter ${chapterNum}`);
			return 0;
		}

		return verseCount;
	} catch (error) {
		console.error('Error in getVerseCount:', error);
		return 0;
	}
}

/**
 * Generates select option properties for verse selection.
 * 
 * @param {('OT'|'NT')} testament - Testament the book belongs to
 * @param {string} bookId - Book ID to get verses from
 * @param {number} chapterNum - Chapter number to get verse count from
 * @param {number} selectedVerse - Currently selected verse
 * @param {number} [minVerse=1] - Minimum verse number to include
 * @returns {Array} Array of verse option objects
 */
export function getVerses(testament, bookId, chapterNum, selectedVerse, minVerse = 1) {
	try {
		const verseCount = getVerseCount(testament, bookId, chapterNum);
		
		if (verseCount === 0) {
			console.error('No verses found for the specified chapter');
			return [];
		}

		const verses = [];

		for (let i = minVerse; i <= verseCount; i++) {
			verses.push({
				id: i,
				value: i,
				text: i.toString(),
				isSelected: i === selectedVerse
			});
		}

		return verses;
	} catch (error) {
		console.error('Error in getVerses:', error);
		return [];
	}
}

/**
 * Gets default passage values for a new passage.
 * 
 * @returns {Object} Default passage object (without ID)
 */
export function getDefaultPassageValues() {
	try {
		const bookData = getBookData('NT');
		
		if (!bookData || bookData.length === 0) {
			console.error('No New Testament books available');
			return {
				testament: 'NT',
				book: '',
				fromChapter: 1,
				toChapter: 1,
				fromVerse: 1,
				toVerse: 1
			};
		}

		const firstBook = bookData[0];
		const verseCount = getVerseCount('NT', firstBook._id, 1);

		return {
			testament: 'NT',
			book: firstBook._id,
			fromChapter: 1,
			toChapter: 1,
			fromVerse: 1,
			toVerse: verseCount || 1
		};
	} catch (error) {
		console.error('Error in getDefaultPassageValues:', error);
		return {
			testament: 'NT',
			book: '',
			fromChapter: 1,
			toChapter: 1,
			fromVerse: 1,
			toVerse: 1
		};
	}
}

/**
 * Validates that a passage has valid testament, book, chapter, and verse values.
 * 
 * @param {Object} passage - Passage object to validate
 * @returns {boolean} True if passage is valid
 */
export function isValidPassage(passage) {
	try {
		if (!passage || typeof passage !== 'object') {
			return false;
		}

		const { testament, book, fromChapter, toChapter, fromVerse, toVerse } = passage;

		// Check testament
		if (testament !== 'OT' && testament !== 'NT') {
			return false;
		}

		// Check book exists
		const bookObj = getBook(testament, book);
		if (!bookObj) {
			return false;
		}

		// Check chapter ranges
		if (fromChapter < 1 || toChapter < fromChapter || toChapter > bookObj.chapterCount) {
			return false;
		}

		// Check verse ranges
		const fromVerseCount = getVerseCount(testament, book, fromChapter);
		const toVerseCount = getVerseCount(testament, book, toChapter);

		if (fromVerse < 1 || fromVerse > fromVerseCount) {
			return false;
		}

		if (toVerse < 1 || toVerse > toVerseCount) {
			return false;
		}

		// If same chapter, toVerse should be >= fromVerse
		if (fromChapter === toChapter && toVerse < fromVerse) {
			return false;
		}

		return true;
	} catch (error) {
		console.error('Error in isValidPassage:', error);
		return false;
	}
}
