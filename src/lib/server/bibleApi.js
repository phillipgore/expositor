/**
 * Bible API utilities for fetching passage text from translation APIs
 */

import { ESV_API_TOKEN, ESV_API_BASE_URL, NET_API_BASE_URL } from '$env/static/private';
import { getBookAbbreviation } from '$lib/utils/bibleData.js';
import { getRateLimits } from '$lib/utils/translationLimits.js';

/**
 * Run an array of async task factories with a bounded concurrency so we never
 * fire more than `limit` requests at the same instant. Results are returned in
 * the original order. This limits burst concurrency so a study with many
 * passages can't blast all of its requests simultaneously; combined with the
 * 429 retry in `fetchWithRateLimit`, it keeps us well-behaved against the
 * provider's rate limits.
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks - Task factories to execute
 * @param {number} limit - Maximum number of tasks running at once
 * @returns {Promise<T[]>} Results in the same order as `tasks`
 */
async function runWithConcurrency(tasks, limit) {
	const results = new Array(tasks.length);
	let nextIndex = 0;

	const workerCount = Math.max(1, Math.min(limit, tasks.length));

	async function worker() {
		while (true) {
			const current = nextIndex++;
			if (current >= tasks.length) return;
			results[current] = await tasks[current]();
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

/**
 * Fetch wrapper that respects HTTP 429 (Too Many Requests) by honoring the
 * provider's `Retry-After` header and retrying with exponential backoff. This
 * keeps us inside the translation API's rate limits even under bursty load
 * instead of hammering the endpoint and getting hard-blocked.
 *
 * @param {string} url - URL to fetch
 * @param {RequestInit} [options] - Fetch options (headers, etc.)
 * @param {number} [maxRetries=3] - Maximum number of retry attempts on 429
 * @returns {Promise<Response>} The fetch Response (may still be non-OK)
 */
async function fetchWithRateLimit(url, options = {}, maxRetries = 3) {
	let attempt = 0;

	while (true) {
		const response = await fetch(url, options);

		// Only 429 is retryable here; other statuses are handled by callers.
		if (response.status !== 429 || attempt >= maxRetries) {
			return response;
		}

		// Honor Retry-After when present (seconds or HTTP-date); otherwise fall
		// back to exponential backoff: 1s, 2s, 4s, ...
		const retryAfter = response.headers.get('retry-after');
		let delayMs;
		if (retryAfter) {
			const asSeconds = Number(retryAfter);
			if (!Number.isNaN(asSeconds)) {
				delayMs = asSeconds * 1000;
			} else {
				const asDate = Date.parse(retryAfter);
				delayMs = Number.isNaN(asDate) ? null : Math.max(0, asDate - Date.now());
			}
		}
		if (delayMs == null) {
			delayMs = 2 ** attempt * 1000;
		}

		console.warn(
			`Rate limited (429). Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries}).`
		);
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		attempt++;
	}
}

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
		.flatMap((token) => token.split(/(—|–)/).filter((s) => s.length > 0))
		.filter((word) => word.trim().length > 0);

	// Format chapter and verse with zero-padding
	const chapterPadded = chapter.toString().padStart(3, '0');
	const versePadded = verse.toString().padStart(3, '0');

	// Wrap each word with its data-word-id
	return words
		.map((word, index) => {
			const wordNum = (index + 1).toString().padStart(3, '0');
			const wordId = `${bookAbbr}-${chapterPadded}-${versePadded}-${wordNum}`;
			return `<span class="word" data-word-id="${wordId}">${word}</span>`;
		})
		.join(' ');
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

	// Detect which verse numbers start new paragraphs BEFORE stripping whitespace.
	// The ESV API uses double newlines (\n\n) before the first verse of a new paragraph.
	const paragraphStartVerses = new Set();
	// Match a double-newline followed by optional spaces and then a verse marker [n]
	const paragraphPattern = /\n\s*\n\s*\[(\d+)\]/g;
	let paragraphMatch;
	while ((paragraphMatch = paragraphPattern.exec(text)) !== null) {
		paragraphStartVerses.add(paragraphMatch[1]);
	}

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

		// Inject a paragraph break marker if this verse starts a new paragraph
		const paragraphMarker = paragraphStartVerses.has(verseNum)
			? '<span class="paragraph-break-marker"></span>'
			: '';

		// Clean up verse text and wrap words
		const cleanText = verseText.trim();
		const wrappedWords = wrapWords(cleanText, bookAbbr, currentChapter, parseInt(verseNum));

		return `<span class="verse" data-verse-id="${verseId}">${paragraphMarker}<span class="chapter-verse">${currentChapter}:${verseNum}</span> ${wrappedWords}</span> `;
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

		const response = await fetchWithRateLimit(url.toString(), {
			headers: {
				Authorization: `Token ${token}`
			}
		});

		if (response.status === 429) {
			// Still rate limited after retries — surface a friendly, honest
			// message rather than a raw status so the UI can explain the wait.
			return {
				text: '',
				error: 'The ESV translation service is busy right now. Please try again in a moment.'
			};
		}

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
		// Use 'para' formatting so paragraph-opening verses include a <p> tag,
		// which we can detect to add paragraph break markers.
		url.searchParams.set('formatting', 'para');

		const response = await fetchWithRateLimit(url.toString());

		if (response.status === 429) {
			return {
				text: '',
				error: 'The NET translation service is busy right now. Please try again in a moment.'
			};
		}

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
		// With formatting=para, paragraph-opening verses have text starting with <p> or <P>.
		const formattedText = data
			.map((verse) => {
				// Format chapter and verse with zero-padding
				const chapterPadded = verse.chapter.toString().padStart(3, '0');
				const versePadded = verse.verse.toString().padStart(3, '0');
				const verseId = `${bookAbbr}-${chapterPadded}-${versePadded}`;

				// Detect paragraph start: verse text begins with a <p> tag (any variant: <p>, <p class="...">, etc.)
				const isParagraphStart = /^<p[\s>]/i.test(verse.text.trim());

				// Strip all HTML tags (bold, paragraph, etc.) from verse text
				const cleanText = verse.text.replace(/<[^>]+>/g, '').trim();

				// Inject paragraph marker if this verse opens a new paragraph
				const paragraphMarker = isParagraphStart
					? '<span class="paragraph-break-marker"></span>'
					: '';

				// Wrap words in the verse text
				const wrappedWords = wrapWords(
					cleanText,
					bookAbbr,
					parseInt(verse.chapter),
					parseInt(verse.verse)
				);

				// Format as verse with data-verse-id wrapper
				return `<span class="verse" data-verse-id="${verseId}">${paragraphMarker}<span class="chapter-verse">${verse.chapter}:${verse.verse}</span> ${wrappedWords}</span>`;
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
 * Fetch text for multiple passages.
 *
 * Rather than firing every request at once (which could trip the provider's
 * rate limit on studies with many passages), we cap how many requests run
 * concurrently. This bounds the burst; the 429 retry in `fetchWithRateLimit`
 * handles any per-minute ceiling we still bump into. The cap is kept small by
 * default, and is further clamped down if a provider's published per-minute
 * limit happens to be lower than our default.
 *
 * @param {Array<Object>} passages - Array of passage objects from database
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<Array<{reference: string, text: string, error?: string}>>}
 */
export async function fetchPassagesText(passages, translation) {
	// Default burst-concurrency cap; conservative so we stay well-behaved.
	const DEFAULT_CONCURRENCY = 5;

	const { perMinute } = getRateLimits(translation);
	// Never run more concurrent requests than the provider's per-minute limit
	// (when it's lower than our default), and keep our small ceiling otherwise.
	const concurrency = perMinute
		? Math.max(1, Math.min(DEFAULT_CONCURRENCY, perMinute))
		: DEFAULT_CONCURRENCY;

	const tasks = passages.map((passage) => () => fetchPassageText(passage, translation));
	return runWithConcurrency(tasks, concurrency);
}
