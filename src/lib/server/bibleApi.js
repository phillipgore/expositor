/**
 * Bible API utilities for fetching passage text from translation APIs
 */

import { ESV_API_TOKEN, ESV_API_BASE_URL, NET_API_BASE_URL } from '$env/static/private';
import { getBookAbbreviation, countVersesInRange } from '$lib/utils/bibleData.js';
import {
	getRateLimits,
	getRetrievalPolicy,
	splitRangeIntoPassages
} from '$lib/utils/translationLimits.js';


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
 *
 * ⚠️ `range.fromChapter` MUST be the first chapter of the text actually passed in,
 * not of the passage it belongs to. Chapter numbers are inferred by counting `[1]`
 * verse markers forward from this value — the ESV text format gives no other
 * chapter signal — so if a passage is fetched in several requests, each response
 * must be normalized against ITS OWN starting chapter.
 *
 * Getting this wrong is silent and severe: every `data-word-id` after the first
 * chunk would carry the wrong chapter, and since all structure (columns,
 * sections, segments, connections) is keyed on those ids, the corruption would
 * surface much later as misplaced structure with no obvious cause.
 *
 * @param {string} text - Raw ESV text with brackets and formatting
 * @param {{fromChapter: number}} range - The range THIS text covers
 * @param {string} bookAbbr - Book abbreviation (e.g., "MT", "GE")
 * @returns {string} - Normalized text matching NET format
 */
function normalizeESVFormatting(text, range, bookAbbr) {
	if (!text) return text;

	// First chapter of THIS text — see the warning above.
	const fromChapter = range.fromChapter;


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

		// Detect SILENT TRUNCATION.
		//
		// Crossway enforces their quotation permission server-side, and they do it
		// without an error: requesting Revelation 1:1–22:21 returns HTTP 200 with
		// `canonical: "Revelation 1–12:8"` — exactly 202 of 404 verses, 50.0% of the
		// book. Nothing in the status or body signals a problem; the text simply
		// stops. Verified by probe on 2026-08-03.
		//
		// This is why a study could show half of Revelation with no warning at all,
		// which in turn was misread as an app bug and nearly became the justification
		// for a whole feature.
		//
		// Do NOT "fix" this by splitting the request into chunks and stitching the
		// halves together.
		//
		// Be precise about why, because the obvious reason is wrong. It is NOT that
		// chunking reproduces more text than we are otherwise allowed: a study can
		// already display a complete book as several passages, which puts exactly the
		// same words on screen via exactly the same number of requests. On copyright
		// grounds the two are indistinguishable, so "chunking reproduces too much"
		// does not hold.
		//
		// The actual reason is that Crossway applied a deliberate server-side control
		// and chunking would defeat it. Each sub-whole chunk returns complete text, so
		// every chunk would succeed and this detector would never fire — we would have
		// silently switched off a limit its owner chose to enforce. Declining to do
		// that is a choice about respecting their control, not a copyright deduction.
		//
		// This is why `api.retrieval.chunking` is false for ESV and true for NET:
		// NET's cap is our own guardrail with no control behind it. See COMPLIANCE.md.

		//
		// Count the verse markers we actually received and compare with what the
		// range should contain. Comparing `canonical` as a STRING was tried first and
		// produced false positives on four of nine probed passages: the API echoes
		// "Philemon" for a whole short book and "John 3:16–17" with an en-dash, so a
		// tail comparison flags perfectly good responses. Counting verses is robust
		// to all of those spellings.
		const canonical = data.canonical || '';
		if (text) {
			const expectedVerses = countVersesInRange(
				passage.testament,
				passage.bookId,
				passage.fromChapter,
				passage.fromVerse,
				passage.toChapter,
				passage.toVerse
			);
			const actualVerses = (text.match(/\[\d+\]/g) || []).length;
			const shortfall = expectedVerses - actualVerses;

			// TWO conditions, because a small shortfall is legitimate: the ESV omits
			// verses attested only in later manuscripts (John 5:4, Mark 9:44/46,
			// Acts 8:37 …), so a complete chapter can arrive one or two verses light.
			// Probed: Mark 9 returns 48/50 and John 5 returns 46/47 — both correct.
			// Truncation, by contrast, always removes about half the request
			// (Galatians 74/149, Romans 216/433). Requiring a proportional AND an
			// absolute gap separates the two cleanly, with a wide margin either side.
			const proportionallyShort = actualVerses < expectedVerses * 0.9;
			const substantiallyShort = shortfall > 15;

			if (expectedVerses > 0 && proportionallyShort && substantiallyShort) {
				console.error(
					`ESV API truncated the response: requested ${expectedVerses} verses, received ${actualVerses}` +
						(canonical ? ` (canonical: "${canonical}")` : '')
				);
				return {
					text: '',
					error:
						`The ESV licence does not allow a complete book to be retrieved at once, so this passage came back incomplete` +
						`${canonical ? ` (only ${canonical})` : ''} — ${actualVerses} of ${expectedVerses} verses. ` +
						`Request part of the book instead, or use the NET translation, which has no such restriction.`
				};
			}
		}

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
 * Fetch one contiguous range in a single API request.
 *
 * @param {Object} range - Passage-shaped object: { testament, bookId, bookName, fromChapter, fromVerse, toChapter, toVerse }
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<{text: string, error?: string}>}
 */
async function fetchRange(range, translation) {
	const reference = buildPassageReference(range);

	if (translation === 'esv') {
		return fetchESVPassage(reference, range);
	}
	if (translation === 'net') {
		return fetchNETPassage(reference);
	}
	return { text: '', error: `Unknown translation: ${translation}` };
}

/**
 * Fetch passage text for any translation.
 *
 * ## A passage is no longer limited to one request
 *
 * For translations whose `retrieval.chunking` is enabled, a passage larger than
 * the per-request ceiling is fetched as several sequential requests and the
 * results concatenated. This is what lets one passage span a whole book — Psalms
 * is a single passage assembled from 6 requests — instead of forcing the user to
 * break a long book into several passages just because of a transport limit.
 *
 * Concatenation is sound because `wrapWords()` derives every `data-word-id` from
 * absolute book/chapter/verse. A word's identity does not depend on which chunk
 * carried it, so the assembled HTML is byte-identical to what a single
 * hypothetical request would have produced.
 *
 * Chunks are fetched SEQUENTIALLY on purpose. `fetchPassagesText` already runs
 * several passages concurrently, so fetching chunks concurrently as well would
 * multiply the two bounds together (5 passages × 6 chunks = 30 simultaneous
 * requests) and defeat the rate-limit guard. Sequential chunks keep the ceiling
 * exactly where `getFetchConcurrency` set it.
 *
 * If ANY chunk fails the whole passage fails. Returning a partial passage would
 * be worse than an error: the text would look complete but silently omit a
 * stretch of verses, which is precisely the failure mode the ESV truncation
 * detector exists to prevent.
 *
 * @param {Object} passage - Passage object from database
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<{reference: string, text: string, error?: string}>}
 */
export async function fetchPassageText(passage, translation) {
	// The reference always describes the WHOLE passage, whatever the chunking, so
	// callers and cached rows keep a stable human-readable label.
	const reference = buildPassageReference(passage);

	const { chunking } = getRetrievalPolicy(translation);

	// Single-request path: no chunking configured, or the passage already fits.
	const chunks = chunking
		? splitRangeIntoPassages(
				{
					testament: passage.testament,
					book: passage.bookId,
					fromChapter: passage.fromChapter,
					fromVerse: passage.fromVerse,
					toChapter: passage.toChapter,
					toVerse: passage.toVerse
				},
				translation
			)
		: [passage];

	if (chunks.length <= 1) {
		const result = await fetchRange(passage, translation);
		return { reference, ...result };
	}

	console.log(
		`Fetching ${reference} as ${chunks.length} requests (${translation.toUpperCase()} chunking enabled).`
	);

	/** @type {string[]} */
	const parts = [];

	for (const chunk of chunks) {
		// splitRangeIntoPassages speaks `book`; the fetchers and the DB row speak
		// `bookId`/`bookName`. Translate here so each chunk is a complete
		// passage-shaped object — in particular `fromChapter` must be the chunk's
		// own first chapter, since ESV chapter inference counts forward from it.
		const chunkRange = {
			testament: chunk.testament,
			bookId: chunk.book,
			bookName: passage.bookName,
			fromChapter: chunk.fromChapter,
			fromVerse: chunk.fromVerse,
			toChapter: chunk.toChapter,
			toVerse: chunk.toVerse
		};

		const result = await fetchRange(chunkRange, translation);

		if (result.error || !result.text) {
			const chunkReference = buildPassageReference(chunkRange);
			return {
				reference,
				text: '',
				error:
					result.error ||
					`Part of this passage (${chunkReference}) came back empty, so it was not loaded.`
			};
		}

		parts.push(result.text);
	}

	// Join with a space: each part is a run of complete `<span class="verse">`
	// elements, so a separator keeps the boundary consistent with how verses are
	// joined inside a single response.
	return { reference, text: parts.join(' ') };
}


/**
 * Determine how many passage requests may run concurrently for a translation.
 *
 * Rather than firing every request at once (which could trip the provider's
 * rate limit on studies with many passages), we cap how many requests run
 * concurrently. This bounds the burst; the 429 retry in `fetchWithRateLimit`
 * handles any per-minute ceiling we still bump into. The cap is kept small by
 * default, and is further clamped down if a provider's published per-minute
 * limit happens to be lower than our default.
 *
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {number} Maximum number of concurrent requests
 */
function getFetchConcurrency(translation) {
	// Default burst-concurrency cap; conservative so we stay well-behaved.
	const DEFAULT_CONCURRENCY = 5;

	const { perMinute } = getRateLimits(translation);
	// Never run more concurrent requests than the provider's per-minute limit
	// (when it's lower than our default), and keep our small ceiling otherwise.
	return perMinute ? Math.max(1, Math.min(DEFAULT_CONCURRENCY, perMinute)) : DEFAULT_CONCURRENCY;
}

/**
 * Fetch text for multiple passages, always hitting the translation API.
 *
 * @param {Array<Object>} passages - Array of passage objects from database
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @returns {Promise<Array<{reference: string, text: string, error?: string}>>}
 */
export async function fetchPassagesText(passages, translation) {
	const tasks = passages.map((passage) => () => fetchPassageText(passage, translation));
	return runWithConcurrency(tasks, getFetchConcurrency(translation));
}

/**
 * Like {@link fetchPassagesText}, but serves any passage that already has cached
 * text (`passage.cachedText`) without hitting the API. Passages whose cache is
 * empty are fetched live; for each successful live fetch the optional
 * `onFetched` callback is invoked so the caller can persist the result back to
 * the cache (lazy backfill).
 *
 * Transient/failed fetches (error set, or empty text) are NOT passed to
 * `onFetched`, so failures aren't cached and will be retried on the next load.
 *
 * @param {Array<Object>} passages - Passage rows; may include a `cachedText` field
 * @param {string} translation - Translation ID (e.g., 'esv', 'net')
 * @param {Object} [options]
 * @param {(passage: Object, result: {reference: string, text: string}) => (void|Promise<void>)} [options.onFetched]
 *   - Called after a successful live fetch so the caller can persist the text.
 * @returns {Promise<Array<{reference: string, text: string, error?: string, fromCache: boolean}>>}
 */
export async function fetchPassagesTextWithCache(passages, translation, { onFetched } = {}) {
	const tasks = passages.map((passage) => async () => {
		if (passage.cachedText) {
			return {
				reference: buildPassageReference(passage),
				text: passage.cachedText,
				fromCache: true
			};
		}

		const result = await fetchPassageText(passage, translation);

		// Only persist genuine results so transient failures aren't cached.
		if (onFetched && !result.error && result.text) {
			try {
				await onFetched(passage, result);
			} catch (err) {
				// A cache-write failure must not break the page load; we just
				// fall back to fetching live again next time.
				console.error('Failed to cache passage text:', err);
			}
		}

		return { ...result, fromCache: false };
	});

	return runWithConcurrency(tasks, getFetchConcurrency(translation));
}
