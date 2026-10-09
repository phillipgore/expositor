/**
 * Verify text provenance decisions (src/lib/utils/textProvenance.js).
 *
 * Pins the rules that make future re-anchoring possible: fingerprints tell OUR processing changes
 * apart from TRANSLATION changes, a differing refetch never overwrites the baseline, and anchor
 * context records the words around a start point.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-text-provenance.mjs
 */

import {
	buildVerseFingerprints,
	splitESVRawVerses,
	planProvenanceUpdate,
	planAnchorContexts,
	planBoundAnchors,
	extractWords
} from '../src/lib/utils/textProvenance.js';
import { TEXT_RULES_VERSION } from '../src/lib/utils/scriptureText.js';

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) pass += 1;
	else {
		fail += 1;
		console.log(`✗ ${label}\n    expected: ${e}\n    actual:   ${a}`);
	}
}

/** Build processed HTML the way wrapWords does. */
function html(verses) {
	return verses
		.map(
			([key, words]) =>
				`<span class="verse" data-verse-id="${key}"><span class="chapter-verse">x</span> ` +
				words
					.map(
						(w, i) =>
							`<span class="word" data-word-id="${key}-${String(i + 1).padStart(3, '0')}">${w}</span>`
					)
					.join(' ') +
				'</span>'
		)
		.join(' ');
}

// ── Fingerprints ─────────────────────────────────────────────────────────────
const raw14 =
	'<p class="poetry">Not so with the wicked!<p class="poetry">Instead they are like wind-driven chaff. </p>';
const fused = html([['PS-001-004', ['Not', 'so', 'with', 'the', 'wicked!Instead', 'they']]]);
const split = html([['PS-001-004', ['Not', 'so', 'with', 'the', 'wicked!', 'Instead', 'they']]]);
const fpFused = buildVerseFingerprints(fused, { 'PS-001-004': raw14 });
const fpSplit = buildVerseFingerprints(split, { 'PS-001-004': raw14 });
check('word count recorded', [fpFused['PS-001-004'].n, fpSplit['PS-001-004'].n], [6, 7]);
check(
	'same raw text → same raw hash',
	fpFused['PS-001-004'].raw === fpSplit['PS-001-004'].raw,
	true
);
check(
	'different words → different word hash',
	fpFused['PS-001-004'].words === fpSplit['PS-001-004'].words,
	false
);
check(
	'word boundaries matter, not just letters',
	buildVerseFingerprints(html([['X-001-001', ['ab', 'c']]]))['X-001-001'].words ===
		buildVerseFingerprints(html([['X-001-001', ['a', 'bc']]]))['X-001-001'].words,
	false
);
check(
	'raw whitespace is not a change',
	buildVerseFingerprints(split, { 'PS-001-004': 'a  b\n c' })['PS-001-004'].raw,
	buildVerseFingerprints(split, { 'PS-001-004': 'a b c' })['PS-001-004'].raw
);
check('missing raw → null, not a crash', buildVerseFingerprints(split)['PS-001-004'].raw, null);

// ── ESV raw split ────────────────────────────────────────────────────────────
const esvRaw =
	'    [13] Blessed be the LORD,\n Amen and Amen.\n\n    To the choirmaster.\n\n    [1] As a deer pants\n    [2] My soul thirsts';
check('ESV raw split infers the next chapter', Object.keys(splitESVRawVerses(esvRaw, 41, 'PS')), [
	'PS-041-013',
	'PS-042-001',
	'PS-042-002'
]);
check(
	'ESV leading title belongs to the first verse',
	splitESVRawVerses('A Psalm of David.\n\n    [1] O LORD', 3, 'PS')['PS-003-001'],
	'A Psalm of David. O LORD'
);

// ── Provenance update ────────────────────────────────────────────────────────
const now = new Date('2026-10-09T00:00:00Z');
const first = planProvenanceUpdate({}, { textSource: 'net:2019:x', fingerprints: fpFused }, now);
check(
	'first fetch records the baseline',
	[first.textSource, first.textRulesVersion, !!first.verseFingerprints],
	['net:2019:x', TEXT_RULES_VERSION, true]
);

const baseline = { textRulesVersion: 1, verseFingerprints: fpFused, textDrift: null };
check(
	'identical refetch writes nothing',
	planProvenanceUpdate(baseline, { textSource: 's', fingerprints: fpFused }, now),
	{}
);

const processing = planProvenanceUpdate(baseline, { textSource: 's', fingerprints: fpSplit }, now);
check(
	'processing change → drift, kind "processing"',
	processing.textDrift?.verses.map((v) => [v.verse, v.kind]),
	[['PS-001-004', 'processing']]
);
check('…and the baseline is NOT overwritten', 'verseFingerprints' in processing, false);

const revised = buildVerseFingerprints(split, { 'PS-001-004': raw14.replace('chaff', 'husks') });
check(
	'translation change → kind "translation"',
	planProvenanceUpdate(baseline, { textSource: 's', fingerprints: revised }, now).textDrift
		?.verses[0].kind,
	'translation'
);

const grown = { ...fpFused, ...buildVerseFingerprints(html([['PS-001-005', ['For', 'this']]])) };
const grow = planProvenanceUpdate(baseline, { textSource: 's', fingerprints: grown }, now);
check('new verses are added to the baseline', Object.keys(grow.verseFingerprints ?? {}), [
	'PS-001-004',
	'PS-001-005'
]);
check('…without drift', 'textDrift' in grow, false);

const already = { ...baseline, textDrift: processing.textDrift };
check(
	'the same drift seen again writes nothing',
	planProvenanceUpdate(already, { textSource: 's', fingerprints: fpSplit }, now),
	{}
);

// ── Anchor context ───────────────────────────────────────────────────────────────────────────
const two = html([
	['PS-001-004', ['Not', 'so', 'with', 'the', 'wicked!', 'Instead']],
	['PS-001-005', ['For', 'this', 'reason']]
]);
const rows = [
	{ id: 'a', startingWordId: 'PS-001-004-006' },
	{ id: 'b', startingWordId: 'PS-001-005-001', anchorContext: { wordId: 'PS-001-005-001' } },
	{ id: 'c', startingWordId: 'PS-001-005-002', anchorContext: { wordId: 'PS-001-005-001' } },
	{ id: 'd', startingWordId: 'PS-001-009-001' }
];
const current = { textRulesVersion: TEXT_RULES_VERSION, textDrift: null };
const ctx = planAnchorContexts(current, two, rows);
check(
	'only missing or moved anchors are written',
	ctx.map((c) => c.id),
	['a', 'c']
);
check('context crosses the verse boundary', ctx[0].anchorContext, {
	wordId: 'PS-001-004-006',
	word: 'Instead',
	before: ['the', 'wicked!'],
	after: ['For', 'this'],
	rulesVersion: TEXT_RULES_VERSION
});
check(
	'start points outside the text are skipped',
	ctx.some((c) => c.id === 'd'),
	false
);
check(
	'nothing recorded while drift is unresolved',
	planAnchorContexts(
		{ textRulesVersion: TEXT_RULES_VERSION, textDrift: { verses: [] } },
		two,
		rows
	),
	[]
);
check(
	'nothing recorded from text of unknown provenance',
	planAnchorContexts({ textDrift: null }, two, rows),
	[]
);
check(
	'nothing recorded from text made by other rules',
	planAnchorContexts({ textRulesVersion: TEXT_RULES_VERSION + 1, textDrift: null }, two, rows),
	[]
);

const bounds = planBoundAnchors(
	{ ...current, fromWord: 2, fromChapter: 1, fromVerse: 4, toWord: null, toChapter: 1, toVerse: 5 },
	two,
	'PS'
);
check(
	'mid-verse part bound anchored',
	[bounds.fromWordAnchor?.word, 'toWordAnchor' in bounds],
	['so', false]
);
check('extractWords keeps reading order', extractWords(two).length, 9);

console.log(`\ntext-provenance: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
