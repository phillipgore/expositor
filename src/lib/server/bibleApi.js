/**
 * Bible API utilities for fetching passage text from translation APIs
 */

import { ESV_API_TOKEN, ESV_API_BASE_URL, NET_API_BASE_URL } from '$env/static/private';
import { getBookAbbreviation } from '$lib/utils/bibleData.js';

/**
 * Wrap words in a verse text with span elements
 * @param {string} verseText - The text of the verse (without verse number)
 * @param {string} bookAbbr - Book abbreviation
 * @param {number} chapter - Chapter number
 * @param {number} verse - Verse number
 * @returns {string} - Text with words wrapped in spans
 */
function wrapWords(verseText, bookAbbr, chapter, verse) {
	if (!verseText) return '';
	
	// Split on whitespace first, then section em/en dashes (but not hyphens)
	const words = verseText
		.split(/\s+/)
		.flatMap(token => 
			token.split(/(—|–)/).filter(s => s.length > 0)
		)
		.filter(word => word.trim().length > 0);
	
	// Format chapter and verse with zero-padding
	const chapterPadded = chapter.toString().padStart(3, '0');
	const versePadded = verse.toString().padStart(3, '0');
	
	// Wrap each word with its data-word-id
	return words.map((word, index) => {
		const wordNum = (index + 1).toString().padStart(3, '0');
		const wordId = `${bookAbbr}-${chapterPadded}-${versePadded}-${wordNum}`;
		return `<span class="word" data-word-id="${wordId}">${word}</span>`;
	}).join(' ');
}

/**
 * Build passage reference string for API calls
 * @param {Object} passage - Passage object from database
 * @returns {string} - Reference string (e.g., "John 3:16-17")
 */
function buildPassageReference(passage) {
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
 * Normalize ESV text formatting to match NET Bible format
 * @param {string} text - Raw ESV text with brackets and formatting
 * @param {Object} passage - Passage object to determine chapter ranges
 * @param {string} bookAbbr - Book abbreviation (e.g., "MT", "GE")
 * @returns {string} - Normalized text matching NET format
 */
function normalizeESVFormatting(text, passage, bookAbbr) {
	if (!text) return text;

	// Get the range of chapters in this passage
	const fromChapter = passage.fromChapter;

	// Remove all paragraph breaks and extra whitespace
	// Replace multiple spaces/newlines with single space
	let normalized = text.replace(/\s+/g, ' ').trim();

	// Track current chapter as we process verse numbers
	let currentChapter = fromChapter;
	let isFirstVerse = true;

	// Replace all [n] patterns with chapter:verse format wrapped in span
	// Also wrap each verse with data-verse-id and wrap individual words
	normalized = normalized.replace(/\[(\d+)\]([^\[]*)/g, (match, verseNum, verseText) => {
		// If this is verse 1 and not the first verse we've seen, increment chapter
		if (verseNum === '1' && !isFirstVerse) {
			currentChapter++;
		}
		isFirstVerse = false;
		
		// Format chapter and verse with zero-padding
		const chapterPadded = currentChapter.toString().padStart(3, '0');
		const versePadded = verseNum.padStart(3, '0');
		const verseId = `${bookAbbr}-${chapterPadded}-${versePadded}`;
		
		// Clean up verse text and wrap words
		const cleanText = verseText.trim();
		const wrappedWords = wrapWords(cleanText, bookAbbr, currentChapter, parseInt(verseNum));
		
		return `<span class="verse" data-verse-id="${verseId}"><span class="chapter-verse">${currentChapter}:${verseNum}</span> ${wrappedWords}</span> `;
	});

	return normalized.trim();
}

/**
 * Fetch passage text from ESV API
 * @param {string} reference - Passage reference (e.g., "John 3:16-17")
 * @param {Object} passage - Passage object from database
 * @returns {Promise<{text: string, error?: string}>}
 */
async function fetchESVPassage(reference, passage) {
	const token = ESV_API_TOKEN;
	const baseUrl = ESV_API_BASE_URL || 'https://api.esv.org/v3/passage';

	// Debug logging
	console.log('ESV API Debug:');
	console.log('- Token exists:', !!token);
	console.log('- Token length:', token?.length || 0);
	console.log('- Base URL:', baseUrl);
	console.log('- Reference:', reference);

	if (!token) {
		return { text: '', error: 'ESV API token not configured' };
	}

	try {
		const url = new URL(`${baseUrl}/text/`);
		url.searchParams.set('q', reference);
		url.searchParams.set('include-passage-references', 'false');
		url.searchParams.set('include-verse-numbers', 'true');
		url.searchParams.set('include-footnotes', 'false');
		url.searchParams.set('include-headings', 'false');
		url.searchParams.set('include-short-copyright', 'false');

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Token ${token}`
			}
		});

		if (!response.ok) {
			throw new Error(`ESV API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		let text = data.passages?.[0] || '';

		// Get book abbreviation
		const bookAbbr = getBookAbbreviation(passage.bookName);
		if (!bookAbbr) {
			console.error('Could not find book abbreviation for:', passage.bookName);
			return { text: '', error: 'Invalid book name' };
		}

		// Normalize ESV formatting to match NET format
		text = normalizeESVFormatting(text, passage, bookAbbr);

		return { text: text.trim() };
	} catch (error) {
		console.error('Error fetching ESV passage:', error);
		return { text: '', error: error.message };
	}
}

/**
 * Fetch passage text from NET API
 * @param {string} reference - Passage reference (e.g., "John 3:16-17")
 * @returns {Promise<{text: string, error?: string}>}
 */
async function fetchNETPassage(reference) {
	const baseUrl = NET_API_BASE_URL || 'https://labs.bible.org/api/';

	try {
		const url = new URL(baseUrl);
		url.searchParams.set('passage', reference);
		url.searchParams.set('type', 'json');
		url.searchParams.set('formatting', 'plain');

		const response = await fetch(url.toString());

		if (!response.ok) {
			throw new Error(`NET API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		// Get book abbreviation from first verse (all verses should have same book)
		const bookName = data[0]?.bookname;
		const bookAbbr = getBookAbbreviation(bookName);
		
		if (!bookAbbr) {
			console.error('Could not find book abbreviation for:', bookName);
			return { text: '', error: 'Invalid book name' };
		}

		// Format JSON verses to match the current display format
		// Each verse object has: { bookname, chapter, verse, text }
		const formattedText = data
			.map((verse) => {
				// Format chapter and verse with zero-padding
				const chapterPadded = verse.chapter.toString().padStart(3, '0');
				const versePadded = verse.verse.toString().padStart(3, '0');
				const verseId = `${bookAbbr}-${chapterPadded}-${versePadded}`;
				
				// Wrap words in the verse text
				const wrappedWords = wrapWords(verse.text, bookAbbr, parseInt(verse.chapter), parseInt(verse.verse));
				
				// Format as verse with data-verse-id wrapper
				return `<span class="verse" data-verse-id="${verseId}"><span class="chapter-verse">${verse.chapter}:${verse.verse}</span> ${wrappedWords}</span>`;
			})
			.join(' ');

		return { text: formattedText.trim() };
	} catch (error) {
		console.error('Error fetching NET passage:', error);
		return { text: '', error: error.message };
	}
}

/**
 * Fetch passage text for any translation
 * @param {Object} passage - Passage object from database
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<{reference: string, text: string, error?: string}>}
 */
export async function fetchPassageText(passage, translation) {
	const reference = buildPassageReference(passage);

	let result;
	if (translation === 'esv') {
		result = await fetchESVPassage(reference, passage);
	} else if (translation === 'net') {
		result = await fetchNETPassage(reference);
	} else {
		result = { text: '', error: `Unknown translation: ${translation}` };
	}

	return {
		reference,
		...result
	};
}

/**
 * Fetch text for multiple passages
 * @param {Array<Object>} passages - Array of passage objects from database
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<Array<{reference: string, text: string, error?: string}>>}
 */
export async function fetchPassagesText(passages, translation) {
	const promises = passages.map((passage) => fetchPassageText(passage, translation));
	return Promise.all(promises);
}
