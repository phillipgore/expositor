/**
 * # Text provenance: recording what word ids were built from
 *
 * A word id (`PS-001-004-006`) is a POSITION, not a word. Structure (column / section / segment
 * `startingWordId`, passage `fromWord` / `toWord`) is stored against those positions, so any change
 * to the words of a verse — a fix to our own text processing, or a translator's revision — can
 * silently move a user's boundary onto a neighbouring word. (It happened on 2026-10-09: the NET
 * poetry fix split fused words like `wicked!Instead`.)
 *
 * Re-anchoring is NOT built yet. This module records what it will need, so that whichever source we
 * end up comparing against — an old edition, a publisher's change list, or a best guess reviewed by
 * the user — the work is possible and its uncertainty measurable:
 *
 * 1. **Provenance** (`textSource`, `textRulesVersion`, `textFetchedAt`): which provider and which
 *    version of our processing rules produced the word ids.
 * 2. **Per-verse fingerprints** (`verseFingerprints`): a hash of the provider's raw verse text, and a
 *    hash + count of the words we derived. Raw same + words different ⇒ OUR processing changed.
 *    Raw different ⇒ THE TRANSLATION changed. Hashes, not text: outside the ESV storage cap, and
 *    they survive cache eviction.
 * 3. **Drift log** (`textDrift`): verses whose refetched text differs from the baseline.
 * 4. **Anchor context** (`anchorContext`, `fromWordAnchor`, `toWordAnchor`): the word at each start
 *    point and two on each side, so it can be found again by content when positions shift.
 *
 * ## ⚠️ The invariant
 *
 * The baseline describes the text the user's word ids were built on. It may only be REPLACED in the
 * same step that re-anchors the passage's structure. Until that step exists, a refetch that differs
 * is recorded in `textDrift` and the baseline is left untouched — overwriting it would destroy the
 * one record of what the structure was anchored to.
 *
 * Bump `TEXT_RULES_VERSION` (scriptureText.js) for ANY change that can alter the words or their
 * order, and keep the previous rules callable when you do.
 *
 * Pure apart from `node:crypto`: no database, no `$env`, so verifier scripts can run it.
 *
 * @module textProvenance
 */

import { createHash } from 'node:crypto';
import { TEXT_RULES_VERSION } from './scriptureText.js';

/** Words of context kept on each side of an anchor. */
export const ANCHOR_CONTEXT_WORDS = 2;

/** Short, stable hash. 16 hex chars (64 bits) is ample for change detection within one verse. */
export function hashText(value) {
	return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

/** Whitespace-insensitive provider text, so reflowed line breaks do not count as a change. */
export function normaliseRaw(text) {
	return (text || '').replace(/\s+/g, ' ').trim();
}

/** `PS-001-004` — the key used in `verseFingerprints`. */
export function verseKey(bookAbbr, chapter, verse) {
	return `${bookAbbr}-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}`;
}

/**
 * Split raw ESV `/text/` output into per-verse provider text, BEFORE any of our processing, with
 * the same chapter inference as `normalizeESVFormatting` (a `[1]` after the first verse starts the
 * next chapter). Text before the first marker (a psalm title) belongs to that first verse; a title
 * between psalms is in the previous verse's slice, as the provider sent it — `raw` hashes describe
 * the provider's text, not our placement of it.
 *
 * @param {string} text - raw ESV passage text
 * @param {number} fromChapter - first chapter of THIS text
 * @param {string} bookAbbr
 * @returns {Record<string, string>}
 */
export function splitESVRawVerses(text, fromChapter, bookAbbr) {
	/** @type {Record<string, string>} */
	const out = {};
	if (!text) return out;
	const parts = text.split(/\[(\d+)\]/);
	let lead = parts[0];
	let chapter = fromChapter;
	for (let i = 1; i < parts.length; i += 2) {
		const verse = Number(parts[i]);
		if (verse === 1 && i > 1) chapter += 1;
		out[verseKey(bookAbbr, chapter, verse)] = normaliseRaw(`${lead} ${parts[i + 1]}`);
		lead = '';
	}
	return out;
}

const WORD_SPAN = /<span class="word" data-word-id="([^"]+)">([^<]*)<\/span>/g;

/**
 * Ordered `[wordId, word]` pairs from processed passage HTML (the output of `wrapWords`).
 * @param {string} html
 * @returns {Array<[string, string]>}
 */
export function extractWords(html) {
	/** @type {Array<[string, string]>} */
	const out = [];
	if (!html) return out;
	for (const m of html.matchAll(WORD_SPAN)) out.push([m[1], m[2]]);
	return out;
}

/**
 * Per-verse fingerprints for a fetched passage.
 *
 * @param {string} html - processed (UNCLIPPED) passage HTML
 * @param {Record<string, string>} [rawByVerse] - provider text per verse key
 * @returns {Record<string, { raw: string|null, words: string, n: number }>}
 */
export function buildVerseFingerprints(html, rawByVerse = {}) {
	/** @type {Map<string, string[]>} */
	const byVerse = new Map();
	for (const [id, word] of extractWords(html)) {
		const key = id.slice(0, id.lastIndexOf('-'));
		const list = byVerse.get(key);
		if (list) list.push(word);
		else byVerse.set(key, [word]);
	}
	/** @type {Record<string, { raw: string|null, words: string, n: number }>} */
	const out = {};
	for (const [key, words] of byVerse) {
		const raw = rawByVerse[key];
		out[key] = {
			raw: raw ? hashText(normaliseRaw(raw)) : null,
			// Joined with U+0001 so ["ab","c"] and ["a","bc"] hash differently.
			words: hashText(words.join('\u0001')),
			n: words.length
		};
	}
	return out;
}

/**
 * Decide what to write to a passage's provenance columns after a successful fetch.
 *
 * - No baseline yet: record this fetch as the baseline.
 * - Baseline exists: verses not in it are ADDED (the range grew); verses that differ are recorded in
 *   `textDrift` and their baseline is KEPT (see the invariant above).
 *
 * Per differing verse, `kind` is `translation` when the provider's raw text changed, otherwise
 * `processing` (raw unchanged or unknown, but our derived words changed).
 *
 * @param {{ textRulesVersion?: number|null, verseFingerprints?: any, textDrift?: any }} current
 * @param {{ textSource: string, fingerprints: Record<string, any> }} fetched
 * @param {Date} [now]
 * @returns {Record<string, any>} columns to set; empty when nothing changed
 */
export function planProvenanceUpdate(current, fetched, now = new Date()) {
	const baseline = current?.verseFingerprints;
	if (!baseline || !current?.textRulesVersion) {
		return {
			textSource: fetched.textSource,
			textRulesVersion: TEXT_RULES_VERSION,
			textFetchedAt: now,
			verseFingerprints: fetched.fingerprints
		};
	}

	const merged = { ...baseline };
	let added = false;
	const drift = [];
	for (const [key, fp] of Object.entries(fetched.fingerprints)) {
		const old = baseline[key];
		if (!old) {
			merged[key] = fp;
			added = true;
			continue;
		}
		const rawChanged = !!(old.raw && fp.raw && old.raw !== fp.raw);
		if (old.words === fp.words && !rawChanged) continue;
		drift.push({ verse: key, kind: rawChanged ? 'translation' : 'processing', was: old, now: fp });
	}

	/** @type {Record<string, any>} */
	const set = {};
	if (added) set.verseFingerprints = merged;
	if (drift.length) {
		// Merge with earlier unresolved drift; the latest observation per verse wins.
		const previous = Array.isArray(current.textDrift?.verses) ? current.textDrift.verses : [];
		const byVerse = new Map(previous.map((d) => [d.verse, d]));
		const before = JSON.stringify([...byVerse.values()]);
		for (const d of drift) byVerse.set(d.verse, d);
		const verses = [...byVerse.values()];
		// Same drift seen again on every load: don't rewrite the row each time.
		if (JSON.stringify(verses) !== before) {
			set.textDrift = {
				detectedAt: now.toISOString(),
				baselineRulesVersion: current.textRulesVersion,
				currentRulesVersion: TEXT_RULES_VERSION,
				currentSource: fetched.textSource,
				verses
			};
		}
	}
	return set;
}

/** wordId → index into `extractWords()` output. */
export function indexWords(words) {
	return new Map(words.map((w, i) => [w[0], i]));
}

/**
 * The words around `wordId` in reading order (crossing verse boundaries within the passage).
 *
 * @param {Array<[string, string]>} words
 * @param {Map<string, number>} index
 * @param {string} wordId
 */
export function buildAnchorContext(words, index, wordId) {
	const i = index.get(wordId);
	if (i === undefined) return null;
	return {
		wordId,
		word: words[i][1],
		before: words.slice(Math.max(0, i - ANCHOR_CONTEXT_WORDS), i).map((w) => w[1]),
		after: words.slice(i + 1, i + 1 + ANCHOR_CONTEXT_WORDS).map((w) => w[1]),
		rulesVersion: TEXT_RULES_VERSION
	};
}

/**
 * Is this passage's text known to be what its word ids were set against, under the current rules?
 * Only then may anchor context be recorded from it.
 *
 * @param {{ textRulesVersion?: number|null, textDrift?: any }} passageRow
 */
export function isTextCurrent(passageRow) {
	return passageRow?.textRulesVersion === TEXT_RULES_VERSION && !passageRow?.textDrift;
}

/**
 * Which column/section/segment anchor contexts need (re)writing: missing, or recorded for a
 * different word id (the start point moved since). Returns nothing unless `isTextCurrent`: text
 * from other rules, of unknown provenance, or with unresolved drift may not be what the ids were set
 * against, and recording from it would store the wrong surrounding words.
 *
 * @param {{ textRulesVersion?: number|null, textDrift?: any }} passageRow
 * @param {string} html - UNCLIPPED processed passage HTML
 * @param {Array<{ id: string, startingWordId: string, anchorContext?: any }>} rows
 * @returns {Array<{ id: string, anchorContext: { wordId: string, word: string, before: string[], after: string[], rulesVersion: number } }>}
 */
export function planAnchorContexts(passageRow, html, rows) {
	if (!isTextCurrent(passageRow) || !html || !rows?.length) return [];
	const pending = rows.filter((r) => r.anchorContext?.wordId !== r.startingWordId);
	if (!pending.length) return [];
	const words = extractWords(html);
	const index = indexWords(words);
	const out = [];
	for (const r of pending) {
		const ctx = buildAnchorContext(words, index, r.startingWordId);
		if (ctx) out.push({ id: r.id, anchorContext: ctx });
	}
	return out;
}

/**
 * Anchor context for a passage's mid-verse bounds (`fromWord` / `toWord`) when missing or stale.
 *
 * @param {any} passageRow
 * @param {string} html - UNCLIPPED processed passage HTML
 * @param {string} bookAbbr
 * @returns {{ fromWordAnchor?: object, toWordAnchor?: object }}
 */
export function planBoundAnchors(passageRow, html, bookAbbr) {
	/** @type {Record<string, object>} */
	const set = {};
	if (!isTextCurrent(passageRow) || !html || !bookAbbr) return set;
	const edges = [
		['fromWordAnchor', passageRow.fromWord, passageRow.fromChapter, passageRow.fromVerse],
		['toWordAnchor', passageRow.toWord, passageRow.toChapter, passageRow.toVerse]
	];
	let words = null;
	let index = null;
	for (const [field, word, chapter, verse] of edges) {
		if (word === null || word === undefined) continue;
		const wordId = `${verseKey(bookAbbr, chapter, verse)}-${String(word).padStart(3, '0')}`;
		if (passageRow[field]?.wordId === wordId) continue;
		words ??= extractWords(html);
		index ??= indexWords(words);
		const ctx = buildAnchorContext(words, index, wordId);
		if (ctx) set[field] = ctx;
	}
	return set;
}
