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
 * The fix was to move the rule to the boundary where distribution genuinely
 * happens (export/print).
 *
 * ## A third axis: retrieval (`api.retrieval`)
 *
 * Once the copyright rule moved out, a separate question remained — may we issue
 * SEVERAL requests to assemble one passage? That is neither a transport ceiling
 * nor a copyright rule, so it is its own key.
 *
 * An earlier note here claimed chunking would be circumvention because the
 * "complete book" clause counts text reproduced rather than HTTP calls. That
 * argument does not hold: a study can already display a complete book as several
 * passages, which reproduces exactly the same text with exactly the same number
 * of requests. Chunking therefore reproduces nothing extra.
 *
 * The real reason ESV is unchunked is narrower and factual: Crossway enforces
 * completeness server-side, so chunking a whole-book request into sub-whole
 * pieces would make every piece succeed and defeat a control they deliberately
 * applied. NET has no such control, and its cap is our own guardrail, so NET
 * chunks freely. Hence `chunking` is per-translation rather than a global policy.
 *
 * On-screen study is now bounded by the genuine API ceiling per REQUEST (500
 * verses), not per passage: a NET passage may span a whole book (Psalms = 2,461
 * verses in 6 requests), and whole short books display correctly in both.

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
 * This is the ceiling for ONE API call — nothing to do with copyright. Note there
 * is intentionally no `maxBookPortion` here; see the module docblock for why it
 * moved to `restrictions.distribution`.
 *
 * ## `source` matters for what we tell the user
 *
 * `source` is either `'provider'` (the publisher documents this ceiling and the
 * API will reject a larger request) or `'self-imposed'` (our own engineering
 * guardrail; the API would happily serve more).
 *
 * Never attribute a self-imposed cap to the provider in user-facing copy. Doing
 * so previously sent a developer hunting through API docs for a limit that was
 * coming from this very file — the message said "the 500-verse-per-request limit
 * for NET" when NET publishes no such limit.
 *
 * @param {string} translationId - Translation ID
 * @returns {{ maxVerses: number|null, source: 'provider'|'self-imposed', description: string|null }}
 */
export function getRequestLimits(translationId) {
	const api = getApiConfig(translationId);
	const limits = api?.requestLimits || {};
	return {
		maxVerses: typeof limits.maxVerses === 'number' ? limits.maxVerses : null,
		// Absent `source` is treated as self-imposed: the safer assumption, since
		// claiming a provider limit we can't cite is the error we're guarding against.
		source: limits.source === 'provider' ? 'provider' : 'self-imposed',
		description: limits.description || null
	};
}

/**
 * Get the retrieval policy for a translation.
 *
 * This is the THIRD axis, distinct from the two above:
 *
 * - `requestLimits`  — how much may be asked for in ONE call (transport)
 * - `retrieval`      — whether we may issue SEVERAL calls to assemble a passage
 * - `distribution`   — how much may leave the app as an artifact (copyright)
 *
 * ## What `chunking` decides
 *
 * When `true`, a passage larger than `requestLimits.maxVerses` is fetched as
 * several sequential requests and concatenated, so passage size is decoupled
 * from request size and one passage can span a whole book. When `false`, a
 * passage is exactly one request and anything larger is refused at validation.
 *
 * ## Why it is per-translation rather than a global policy
 *
 * NET's cap is our own engineering guardrail, so chunking around it routes
 * around nothing. ESV's cap is Crossway's, and more importantly Crossway
 * enforces their quotation permission SERVER-SIDE: a request for a complete
 * book silently returns ~50% of it. Chunking a whole-book ESV request into
 * sub-whole pieces would make every piece succeed and would defeat that
 * control, so ESV is deliberately unchunked and their server arbitrates what
 * we may retrieve.
 *
 * Note this is NOT a copyright distinction — assembling a book from several
 * requests reproduces exactly as much text as assembling it from several
 * passages, which we already allow. It is about not routing around a control
 * a provider deliberately applied. Copyright is handled at export.
 *
 * @param {string} translationId - Translation ID
 * @returns {{ chunking: boolean, servesCompleteBook: 'always'|'partial'|'never'|null, description: string|null }}
 */
export function getRetrievalPolicy(translationId) {
	const api = getApiConfig(translationId);
	const retrieval = api?.retrieval || {};
	return {
		// Absent config means NO chunking: the conservative default, since
		// enabling it for a provider that polices completeness server-side
		// would silently circumvent that control.
		chunking: retrieval.chunking === true,
		servesCompleteBook: retrieval.servesCompleteBook || null,
		description: retrieval.description || null
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
 * ## `maxBookPortion` is currently null for BOTH translations
 *
 * The support below is retained because a future licence may genuinely express a
 * fraction-of-book rule, but neither current publisher does. In particular, do
 * not repopulate it from Crossway's "50% of the work in which quoted" clause:
 * that measures the ESV's share of the USER'S document, not the share of the
 * biblical book being quoted. Conflating the two is the original bug in this
 * codebase, and it survived one relocation already — see the
 * `maxBookPortionNote` in translations.json.

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
 * ## The limit only binds when the translation cannot be chunked
 *
 * For a translation with `retrieval.chunking` enabled, passage size is decoupled
 * from request size: the fetch layer divides an oversized passage into
 * request-sized pieces and concatenates them, so a passage may span a whole book
 * and this validator imposes no ceiling at all.
 *
 * For a translation without chunking (ESV), one passage is exactly one request,
 * so the per-request ceiling is also the per-passage ceiling and an oversized
 * selection is refused here.
 *
 * ## Why the message no longer says "will be split"
 *
 * Oversized selections used to be auto-split into several passages. That is no
 * longer done: silently turning one requested passage into six was surprising,
 * and passage shape is a document-structure decision that belongs to the user.
 * The message therefore names both remedies — add passages manually, or use a
 * translation that can serve the range in one passage — and lets the user choose.
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

	const { maxVerses, source } = getRequestLimits(translationId);
	const { chunking } = getRetrievalPolicy(translationId);

	// No request limit configured, or the fetch layer can assemble a passage from
	// several requests — either way there is no per-passage ceiling to enforce.
	if (maxVerses === null || chunking) {
		return { valid: true, verseCount, error: null };
	}

	if (verseCount > maxVerses) {
		// Attribute the cap accurately: a provider ceiling is a fact about their
		// API, while a self-imposed one is our choice. Saying "the NET API's limit"
		// for a number that came from our own config previously sent a developer
		// hunting through API docs for a limit that did not exist.
		const label = translationId ? translationId.toUpperCase() : 'this translation';
		const cause =
			source === 'provider'
				? `The ${label} API accepts at most ${maxVerses} verses per request, and one passage is one request.`
				: `Expositor loads at most ${maxVerses} verses per ${label} passage.`;

		return {
			valid: false,
			verseCount,
			error: `This passage spans ${verseCount} verses. ${cause} Add it as several smaller passages, or choose a translation that can load this range as one passage.`
		};
	}

	return { valid: true, verseCount, error: null };
}


/**
 * Split a verse range into as few sub-ranges as possible, each within the
 * translation's per-request limit.
 *
 * ## Why this exists — note this is now a FETCH-LAYER helper
 *
 * This used to expand one user-selected passage into several stored passages, so
 * that a long book arrived as multiple rows. That is no longer done: silently
 * turning a requested Psalms passage into six was surprising, and passage shape
 * is a document-structure decision belonging to the user.
 *
 * Its job now is to divide ONE passage into the several HTTP requests needed to
 * fetch it, for translations whose `retrieval.chunking` is enabled. The caller
 * concatenates the responses, so the division is invisible: one passage row, one
 * structure tree, one continuous text. Psalms is one NET passage fetched as 6
 * requests.
 *
 * Concatenation is safe because `wrapWords()` derives every `data-word-id` from
 * absolute book/chapter/verse, so a word's identity does not depend on which
 * chunk delivered it.
 *
 * ## Split rule: chapter-boundary greedy fill

 *
 * Chapters are accumulated in canonical order until adding the next one would
 * exceed the cap, then a new passage starts. Chapter boundaries are preserved
 * because they are meaningful to readers in a way that equal verse counts are
 * not — a passage ending mid-Psalm to balance verse totals would be worse than
 * one that is merely shorter. The trade-off is uneven passages (Psalm 117 has 2
 * verses; Psalm 119 has 176), which is accepted deliberately.
 *
 * A partial range is honoured: the first passage starts at `fromVerse` and the
 * last ends at `toVerse`, so splitting Romans 1:18–8:39 keeps those endpoints.
 *
 * ## Guarantee and its one exception
 *
 * Every returned passage is within the cap, EXCEPT where a single chapter alone
 * exceeds it — impossible in practice (the longest chapter in the Bible is Psalm
 * 119 at 176 verses, and the smallest cap in use is 500), but such a chapter is
 * emitted as its own oversized passage rather than silently dropped. Losing text
 * is a worse failure than returning a passage the caller will reject.
 *
 * @param {Object} range - { testament, book, fromChapter, fromVerse, toChapter, toVerse }
 * @param {string} translationId - Translation ID
 * @returns {Array<Object>} One or more passage objects covering the full range
 */
export function splitRangeIntoPassages(range, translationId) {
	const { testament, book, fromChapter, fromVerse, toChapter, toVerse } = range || {};
	const { maxVerses } = getRequestLimits(translationId);

	// Nothing to split against, or it already fits — return the range unchanged so
	// callers can use this unconditionally.
	if (
		maxVerses === null ||
		countVersesInRange(testament, book, fromChapter, fromVerse, toChapter, toVerse) <= maxVerses
	) {
		return [{ testament, book, fromChapter, fromVerse, toChapter, toVerse }];
	}

	/** @type {Array<Object>} */
	const passages = [];

	let startChapter = fromChapter;
	let startVerse = fromVerse;
	let runningTotal = 0;

	for (let ch = fromChapter; ch <= toChapter; ch += 1) {
		// Verses of THIS chapter that fall inside the requested range.
		const chapterVerses = getVerseCount(testament, book, ch);
		if (chapterVerses <= 0) continue;

		const chStart = ch === fromChapter ? fromVerse : 1;
		const chEnd = ch === toChapter ? Math.min(toVerse, chapterVerses) : chapterVerses;
		const chCount = Math.max(0, chEnd - chStart + 1);

		// Adding this chapter would overflow: close the current passage at the end
		// of the previous chapter first. Guarded on runningTotal so a lone oversized
		// chapter doesn't emit an empty passage.
		if (runningTotal > 0 && runningTotal + chCount > maxVerses) {
			const prevChapter = ch - 1;
			passages.push({
				testament,
				book,
				fromChapter: startChapter,
				fromVerse: startVerse,
				toChapter: prevChapter,
				toVerse: getVerseCount(testament, book, prevChapter)
			});
			startChapter = ch;
			startVerse = chStart;
			runningTotal = 0;
		}

		runningTotal += chCount;
	}

	// Final passage always ends at the caller's requested endpoint.
	passages.push({
		testament,
		book,
		fromChapter: startChapter,
		fromVerse: startVerse,
		toChapter,
		toVerse
	});

	return passages;
}

/**
 * Report whether a translation can serve a given range as a single passage, and
 * explain why not when it cannot.
 *
 * Intended for the New Study flow, so the user learns a range is unavailable in
 * their chosen translation *while selecting it* rather than after committing.
 * Returning structured reasons (rather than a bare boolean) lets the caller
 * suggest the specific remedy that applies.
 *
 * `reason` is one of:
 * - `'ok'`                — the range can be one passage
 * - `'exceeds-request'`   — too large for one request, and chunking is disabled
 * - `'complete-book'`     — the provider refuses a complete book of this size
 *
 * @param {Object} range - { testament, book, fromChapter, fromVerse, toChapter, toVerse }
 * @param {string} translationId - Translation ID
 * @returns {{ canBeSinglePassage: boolean, reason: 'ok'|'exceeds-request'|'complete-book', verseCount: number, message: string|null }}
 */
export function checkSinglePassageSupport(range, translationId) {
	const { testament, book, fromChapter, fromVerse, toChapter, toVerse } = range || {};
	const verseCount = countVersesInRange(
		testament,
		book,
		fromChapter,
		fromVerse,
		toChapter,
		toVerse
	);

	const { maxVerses } = getRequestLimits(translationId);
	const { chunking, servesCompleteBook } = getRetrievalPolicy(translationId);
	const label = translationId ? translationId.toUpperCase() : 'this translation';

	// Is the selection the entire book? Compared on verse totals rather than
	// chapter numbers so a range that merely starts at 1:1 isn't misjudged.
	const bookTotal = getBookVerseTotal(testament, book);
	const isCompleteBook = bookTotal > 0 && verseCount >= bookTotal;

	// A provider that only sometimes serves complete books ('partial') is the
	// interesting case: ESV serves short books whole but silently halves longer
	// ones. We cannot know the exact floor without probing every book, so we warn
	// only where the request limit would ALSO bite — those are the cases we can
	// state with certainty. Books between the (unknown) floor and the cap will
	// still fail at fetch time, where the truncation detector reports honestly.
	if (isCompleteBook && servesCompleteBook === 'partial' && maxVerses !== null) {
		if (verseCount > maxVerses) {
			return {
				canBeSinglePassage: false,
				reason: 'complete-book',
				verseCount,
				message: `${label} cannot load the complete book of ${book} (${verseCount} verses) as one passage. Add it as several smaller passages, or choose a translation that allows whole books.`
			};
		}
	}

	if (!chunking && maxVerses !== null && verseCount > maxVerses) {
		return {
			canBeSinglePassage: false,
			reason: 'exceeds-request',
			verseCount,
			message: `${label} loads at most ${maxVerses} verses per passage; this range is ${verseCount}. Add it as several smaller passages, or choose a translation that can load it in one.`
		};
	}

	return { canBeSinglePassage: true, reason: 'ok', verseCount, message: null };
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
		totalVerses += countVersesInRange(testament, book, fromChapter, fromVerse, toChapter, toVerse);

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
