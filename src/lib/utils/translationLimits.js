/**
 * Translation Limits Utility
 *
 * Centralizes enforcement of the per-translation request/rate limits that the
 * Bible-text providers impose on us. All numbers are read from
 * `translations.json` so there is a single source of truth — if a provider
 * changes a limit we update the JSON, not the code.
 *
 * Why this exists: the ESV API caps a single request at 500 verses (or half a
 * book, whichever is smaller) and rate-limits us to 60 requests/minute. Without
 * guarding for these, a large passage range would be rejected by the API, and
 * studies with many passages could blow past the per-minute ceiling. This
 * module lets the create/edit study flows validate a passage set BEFORE we ever
 * hit the API, and exposes the rate-limit numbers used to throttle outbound
 * requests.
 *
 * Safe for both server and client use — it only reads static metadata.
 *
 * @module translationLimits
 */

import translationsData from '$lib/data/translations.json';
import { countVersesInRange, getBookVerseTotal } from './bibleData.js';

/**
 * Get the raw API config block for a translation.
 *
 * @param {string} translationId - Translation ID (e.g., 'esv', 'net')
 * @returns {Object|null} The `api` object from translations.json, or null
 */
function getApiConfig(translationId) {
	const translation = translationsData.find((t) => t.id === translationId);
	return translation?.api || null;
}

/**
 * Get the per-request limits for a translation (max verses / max book portion).
 *
 * @param {string} translationId - Translation ID
 * @returns {{ maxVerses: number|null, maxBookPortion: number|null, description: string|null }}
 */
export function getRequestLimits(translationId) {
	const api = getApiConfig(translationId);
	const limits = api?.requestLimits || {};
	return {
		maxVerses: typeof limits.maxVerses === 'number' ? limits.maxVerses : null,
		maxBookPortion: typeof limits.maxBookPortion === 'number' ? limits.maxBookPortion : null,
		description: limits.description || null
	};
}

/**
 * Get the rate limits for a translation (per minute/hour/day).
 *
 * @param {string} translationId - Translation ID
 * @returns {{ perMinute: number|null, perHour: number|null, perDay: number|null }}
 */
export function getRateLimits(translationId) {
	const api = getApiConfig(translationId);
	const limits = api?.rateLimits || {};
	return {
		perMinute: typeof limits.perMinute === 'number' ? limits.perMinute : null,
		perHour: typeof limits.perHour === 'number' ? limits.perHour : null,
		perDay: typeof limits.perDay === 'number' ? limits.perDay : null
	};
}

/**
 * Validate a single passage against the translation's per-request limits.
 *
 * Each passage maps to exactly one API request, so it must individually fit
 * within the provider's max-verses and max-book-portion caps.
 *
 * @param {Object} passage - Passage with { testament, book, fromChapter, fromVerse, toChapter, toVerse }
 * @param {string} translationId - Translation ID (e.g., 'esv', 'net')
 * @returns {{ valid: boolean, verseCount: number, error: string|null }}
 */
export function validatePassageLimits(passage, translationId) {
	const { testament, book, fromChapter, fromVerse, toChapter, toVerse } = passage || {};

	const verseCount = countVersesInRange(
		testament,
		book,
		fromChapter,
		fromVerse,
		toChapter,
		toVerse
	);

	const { maxVerses, maxBookPortion } = getRequestLimits(translationId);

	// No limits configured for this translation (e.g., NET) — always valid.
	if (maxVerses === null && maxBookPortion === null) {
		return { valid: true, verseCount, error: null };
	}

	// Enforce the absolute verse cap.
	if (maxVerses !== null && verseCount > maxVerses) {
		return {
			valid: false,
			verseCount,
			error: `This passage spans ${verseCount} verses, which exceeds the ${maxVerses}-verse limit for ${translationId.toUpperCase()}. Please choose a smaller range.`
		};
	}

	// Enforce the "no more than X portion of a book" cap.
	if (maxBookPortion !== null) {
		const bookTotal = getBookVerseTotal(testament, book);
		if (bookTotal > 0 && verseCount > bookTotal * maxBookPortion) {
			const pct = Math.round(maxBookPortion * 100);
			return {
				valid: false,
				verseCount,
				error: `This passage covers more than ${pct}% of the book, which exceeds the ${translationId.toUpperCase()} request limit. Please choose a smaller range.`
			};
		}
	}

	return { valid: true, verseCount, error: null };
}

/**
 * Validate an array of passages against a translation's per-request limits.
 * Returns the first error encountered (so the user sees one clear message).
 *
 * @param {Array<Object>} passages - Array of passage objects
 * @param {string} translationId - Translation ID
 * @returns {{ valid: boolean, error: string|null, totalVerses: number }}
 */
export function validatePassagesLimits(passages, translationId) {
	let totalVerses = 0;

	for (const passage of passages || []) {
		const result = validatePassageLimits(passage, translationId);
		totalVerses += result.verseCount;
		if (!result.valid) {
			return { valid: false, error: result.error, totalVerses };
		}
	}

	return { valid: true, error: null, totalVerses };
}
