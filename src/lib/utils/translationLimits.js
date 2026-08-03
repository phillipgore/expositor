/**
 * Translation Limits Utility
 *
 * Centralizes the per-translation limits imposed on us by the Bible-text
 * providers. All numbers are read from `translations.json` so there is a single
 * source of truth — if a provider changes a limit (or we buy a broader licence)
 * we update the JSON, not the code.
 *
 * ## Two DIFFERENT kinds of limit — do not conflate them
 *
 * This module deliberately separates two rules that come from two different
 * documents and govern two different acts. They used to be merged, which caused
 * a real bug (see below).
 *
 * 1. **Request limits** (`api.requestLimits`) — from the provider's *API Terms of
 *    Use*. These are technical ceilings on a single HTTP request. The ESV API
 *    rejects a request for more than 500 verses. This governs FETCHING and is
 *    enforced on create/edit of a study, before we ever call the API.
 *
 * 2. **Distribution limits** (`restrictions.distribution`) — from the provider's
 *    *quotation/publication permission* (the familiar copyright-page paragraph).
 *    Crossway allows up to 1,000 verses provided the quotation does not amount to
 *    a complete book and does not exceed 50% of the work quoting it. This governs
 *    REPRODUCING text in a distributable artifact, and is therefore enforced at
 *    EXPORT/PRINT time — not at fetch time, and not on on-screen study.
 *
 * ## Why the split matters (the bug it fixed)
 *
 * `maxBookPortion: 0.5` was previously stored under `api.requestLimits` and
 * enforced by `validatePassageLimits`. That applied a *publication* rule at
 * *fetch* time, with a surprising consequence: the effective per-passage cap
 * became `min(500, half the book)`, and since only ~11 books exceed 1,000 verses,
 * for most of the Bible the binding limit was half-a-book — well under 500. The
 * result was that **no complete book of the Bible could be studied**, in any
 * translation. Philemon (25 verses) was capped at ~12; Romans (433) at ~216.
 *
 * Splitting the fetch into several requests would NOT have been a fix: the
 * quotation permission's "complete book" clause is about how much text is
 * reproduced, not how many HTTP calls produced it. The actual fix was to move the
 * rule to the boundary where distribution genuinely happens.
 *
 * On-screen study is now bounded only by the genuine API ceiling (500 verses per
 * request), so whole short books display correctly.
 *
 * See COMPLIANCE.md for the full reasoning, citations and current posture.
 *
 * Safe for both server and client use — it only reads static metadata.
 *
 * @module translationLimits
 */

import translationsData from '$lib/data/translations.json';
import { countVersesInRange, getBookVerseTotal, getVerseCount } from './bibleData.js';

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
 * Get the raw restrictions block for a translation.
 *
 * @param {string} translationId - Translation ID (e.g., 'esv', 'net')
 * @returns {Object|null} The `restrictions` object from translations.json, or null
 */
function getRestrictions(translationId) {
	const translation = translationsData.find((t) => t.id === translationId);
	return translation?.restrictions || null;
}

/**
 * Get the per-request limits for a translation.
 *
 * This is the provider's TECHNICAL ceiling for one API call — nothing to do with
 * copyright. Note there is intentionally no `maxBookPortion` here; see the module
 * docblock for why it moved to `restrictions.distribution`.
 *
 * @param {string} translationId - Translation ID
 * @returns {{ maxVerses: number|null, description: string|null }}
 */
export function getRequestLimits(translationId) {
	const api = getApiConfig(translationId);
	const limits = api?.requestLimits || {};
	return {
		maxVerses: typeof limits.maxVerses === 'number' ? limits.maxVerses : null,
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
 * Get the distribution (copyright quotation) limits for a translation.
 *
 * These come from the publisher's quotation permission and apply when text
 * leaves the app as a distributable artifact (export/print) — NOT to fetching or
 * on-screen study.
 *
 * `enforcement` is either 'warn' (surface a warning, allow the action) or 'block'
 * (refuse the action). It lives in the JSON so the posture can be tightened at
 * release, or relaxed if we license broader access, without touching code.
 *
 * @param {string} translationId - Translation ID
 * @returns {{ maxVerses: number|null, maxBookPortion: number|null, allowCompleteBook: boolean, enforcement: 'warn'|'block', requiresAttribution: boolean }}
 */
export function getDistributionLimits(translationId) {
	const restrictions = getRestrictions(translationId);
	const dist = restrictions?.distribution || {};
	return {
		maxVerses: typeof dist.maxVerses === 'number' ? dist.maxVerses : null,
		maxBookPortion: typeof dist.maxBookPortion === 'number' ? dist.maxBookPortion : null,
		// Default to permissive only when the key is absent; an explicit false wins.
		allowCompleteBook: dist.allowCompleteBook !== false,
		enforcement: dist.enforcement === 'block' ? 'block' : 'warn',
		requiresAttribution: dist.requiresAttribution === true
	};
}

/**
 * Validate a single passage against the translation's per-request limit.
 *
 * Each passage maps to exactly one API request, so it must individually fit
 * within the provider's max-verses ceiling.
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

	const { maxVerses } = getRequestLimits(translationId);

	// No request limit configured for this translation — always valid.
	if (maxVerses === null) {
		return { valid: true, verseCount, error: null };
	}

	if (verseCount > maxVerses) {
		return {
			valid: false,
			verseCount,
			error: `This passage spans ${verseCount} verses, which exceeds the ${maxVerses}-verse-per-request limit for ${translationId.toUpperCase()}. Please choose a smaller range.`
		};
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

/**
 * Validate a set of passages against the translation's DISTRIBUTION limits, for
 * use at export/print time.
 *
 * Unlike the request limits, these are evaluated across the WHOLE artifact being
 * produced: total verses reproduced, portion of each book covered, and whether
 * any book is reproduced in its entirety.
 *
 * Per-book aggregation matters: a study may reach a complete book through several
 * passages (e.g. Romans 1–8 plus Romans 9–16), and the quotation permission cares
 * about the total, not how it was assembled.
 *
 * The return value distinguishes `blocked` from `warnings` so the caller can
 * respect the translation's `enforcement` posture without re-reading the JSON.
 *
 * @param {Array<Object>} passages - Array of passage objects
 * @param {string} translationId - Translation ID
 * @returns {{ compliant: boolean, blocked: boolean, warnings: string[], totalVerses: number }}
 */
export function validateExportLimits(passages, translationId) {
	const limits = getDistributionLimits(translationId);
	/** @type {string[]} */
	const warnings = [];

	// Aggregate verse coverage per book so multi-passage studies are measured on
	// their total footprint, not passage by passage.
	/** @type {Map<string, { testament: 'OT'|'NT', book: string, verses: Set<string> }>} */
	const byBook = new Map();
	let totalVerses = 0;

	for (const passage of passages || []) {
		const { testament, book, fromChapter, fromVerse, toChapter, toVerse } = passage || {};
		totalVerses += countVersesInRange(
			testament,
			book,
			fromChapter,
			fromVerse,
			toChapter,
			toVerse
		);

		const key = `${testament}:${book}`;
		if (!byBook.has(key)) {
			byBook.set(key, { testament, book, verses: new Set() });
		}
		const entry = byBook.get(key);
		if (!entry) continue;

		// Record concrete verse identities so passages that overlap (or that are
		// assembled from adjacent ranges) are not double-counted when compared
		// against the book total. The real per-chapter verse count bounds each
		// chapter's range so an intermediate chapter is enumerated exactly.
		for (let ch = fromChapter; ch <= toChapter; ch += 1) {
			const chapterVerses = getVerseCount(testament, book, ch);
			if (chapterVerses <= 0) continue;
			const start = ch === fromChapter ? fromVerse : 1;
			const end = ch === toChapter ? Math.min(toVerse, chapterVerses) : chapterVerses;
			for (let v = start; v <= end; v += 1) {
				entry.verses.add(`${ch}:${v}`);
			}
		}
	}

	const translationLabel = translationId ? translationId.toUpperCase() : 'this translation';

	// Total-verse ceiling for the artifact as a whole.
	if (limits.maxVerses !== null && totalVerses > limits.maxVerses) {
		warnings.push(
			`This export reproduces ${totalVerses} verses, which exceeds the ${limits.maxVerses}-verse quotation limit for ${translationLabel}.`
		);
	}

	// Per-book portion and complete-book checks.
	for (const { testament, book, verses } of byBook.values()) {
		const bookTotal = getBookVerseTotal(testament, book);
		if (bookTotal <= 0) continue;

		const covered = verses.size;

		if (!limits.allowCompleteBook && covered >= bookTotal) {
			warnings.push(
				`This export reproduces the complete book of ${book}. The ${translationLabel} quotation permission does not allow reproducing an entire book.`
			);
		} else if (limits.maxBookPortion !== null && covered > bookTotal * limits.maxBookPortion) {
			const pct = Math.round(limits.maxBookPortion * 100);
			warnings.push(
				`This export reproduces more than ${pct}% of ${book}, which exceeds the ${translationLabel} quotation limit.`
			);
		}
	}

	const compliant = warnings.length === 0;
	return {
		compliant,
		blocked: !compliant && limits.enforcement === 'block',
		warnings,
		totalVerses
	};
}
