/**
 * Verify word-level passage bounds (SERIES_PLAN §8, stage 1 of word-granular parts; migration 0048).
 *
 * A part may now begin or end part-way through a verse. These assertions pin the pure rules every
 * other layer relies on: position ordering, the adjacency predicate at a word seam, coalescing a
 * split verse back together, the a/b reference labels, clipping whole-verse HTML to a part's words,
 * and the edit-flow refusal that stops a re-division from rounding a split away.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-word-bounds.mjs
 */

import {
	comparePositions,
	rangeStartPosition,
	rangeEndPosition,
	isWordInRange,
	isNonEmptyRange,
	rangeEndWordId,
	hasPartialVerse
} from '../src/lib/utils/wordIds.js';
import { classifyBoundary } from '../src/lib/utils/seriesRuns.js';
import { coalesceRanges, describeMidVerseBlock } from '../src/lib/utils/seriesSeams.js';
import { planPartJoin } from '../src/lib/utils/seriesRestructure.js';
import { formatPassageReference } from '../src/lib/utils/passageFormatting.js';
import { clipPassageHtml } from '../src/lib/utils/passageText.js';

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
	if (actual === expected) pass += 1;
	else {
		fail += 1;
		console.log(`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
	}
}
function assert(label, condition) {
	if (condition) pass += 1;
	else {
		fail += 1;
		console.log(`✗ ${label}`);
	}
}

const ipe = (fc, fv, tc, tv, extra = {}) => ({
	testament: 'NT',
	bookId: 'IPE',
	bookName: '1 Peter',
	fromChapter: fc,
	fromVerse: fv,
	toChapter: tc,
	toVerse: tv,
	...extra
});
const part = (id, order, ...passages) => ({ id, title: id, seriesOrder: order, passages });
const pos = (chapter, verse, word) => ({ chapter, verse, word });

console.log('\n── positions ──');
check('null bounds start at word 1', rangeStartPosition(ipe(4, 1, 4, 19)).word, 1);
check('null bounds end at end of verse', rangeEndPosition(ipe(4, 1, 4, 19)).word, Infinity);
assert('word order inside a verse', comparePositions(pos(4, 12, 3), pos(4, 12, 4)) < 0);
assert('end-of-verse sorts after any word', comparePositions(pos(4, 12, Infinity), pos(4, 12, 99)) > 0);
assert('a word is inside a whole-verse range', isWordInRange('IPE-004-012-005', ipe(4, 1, 4, 19)));
const fromFive = ipe(4, 12, 5, 14, { fromWord: 5 });
assert('excluded before fromWord', !isWordInRange('IPE-004-012-004', fromFive));
assert('included at fromWord', isWordInRange('IPE-004-012-005', fromFive));
assert('excluded after toWord', !isWordInRange('IPE-004-012-005', ipe(4, 1, 4, 12, { toWord: 4 })));
assert('a single partial word is non-empty', isNonEmptyRange(ipe(4, 12, 4, 12, { fromWord: 5, toWord: 5 })));
assert('reversed words are empty', !isNonEmptyRange(ipe(4, 12, 4, 12, { fromWord: 6, toWord: 5 })));
assert('word 1 is not a partial start', !hasPartialVerse(ipe(4, 1, 4, 19, { fromWord: 1 })));

console.log('\n── exclusive end word id ──');
check('whole-verse end is next verse word 1', rangeEndWordId('IPE', ipe(4, 1, 4, 19)), 'IPE-004-020-001');
check('mid-verse end is the next word', rangeEndWordId('IPE', ipe(4, 1, 4, 12, { toWord: 4 })), 'IPE-004-012-005');

console.log('\n── classifyBoundary at a word seam ──');
const a = part('A', 1, ipe(4, 1, 4, 12, { toWord: 4 }));
const b = part('B', 2, fromFive);
const bFrom = (w) => part('B', 2, ipe(4, 12, 5, 14, { fromWord: w }));
check('next word in the same verse is contiguous', classifyBoundary(a, b), 'contiguous');
check('a shared word overlaps', classifyBoundary(a, bFrom(4)), 'overlap');
check('a skipped word is a gap', classifyBoundary(a, bFrom(6)), 'gap');
check('whole verse then its own second half overlaps', classifyBoundary(part('A', 1, ipe(4, 1, 4, 12)), b), 'overlap');
check('ending mid-verse then the next verse is a gap', classifyBoundary(a, part('B', 2, ipe(4, 13, 5, 14))), 'gap');
check('starting mid-verse after a whole previous verse is a gap', classifyBoundary(part('A', 1, ipe(4, 1, 4, 11)), b), 'gap');
check(
	'whole-verse seams are unchanged',
	classifyBoundary(part('A', 1, ipe(4, 1, 4, 19)), part('B', 2, ipe(5, 1, 5, 14))),
	'contiguous'
);

console.log('\n── coalescing and Join Parts close the verse back up ──');
const merged = coalesceRanges([a.passages[0], b.passages[0]]);
check('one range', merged.length, 1);
check('starting whole-verse', merged[0].fromWord ?? null, null);
check('ending whole-verse (5:14 had no toWord)', merged[0].toWord, null);
const span = (r) => `${r.fromChapter}:${r.fromVerse}-${r.toChapter}:${r.toVerse}`;
check('from 4:1 to 5:14', span(merged[0]), '4:1-5:14');

const join = planPartJoin({ parts: [a, b], partId: 'A', direction: 'next', translationId: 'esv' });
assert('Join Parts accepts a word seam', join.ok);
check('and coalesces it', join.passages.length, 1);
check('to a whole-verse end', join.passages[0].toWord, null);

console.log('\n── reference labels ──');
check('whole verses unchanged', formatPassageReference(ipe(4, 1, 4, 19)), '1 Peter 4:1-19');
check('ending mid-verse is "a"', formatPassageReference(a.passages[0]), '1 Peter 4:1-12a');
check('starting mid-verse is "b"', formatPassageReference(fromFive), '1 Peter 4:12b-5:14');
check(
	'a single split verse shows its suffix',
	formatPassageReference(ipe(4, 12, 4, 12, { fromWord: 5 })),
	'1 Peter 4:12b-12'
);

console.log('\n── clipping whole-verse HTML ──');
const word = (v, i, t) => `<span class="word" data-word-id="IPE-004-0${v}-00${i}">${t}</span>`;
const verse = (v, words) =>
	`<span class="verse" data-verse-id="IPE-004-0${v}"><span class="chapter-verse">4:${v}</span> ${words}</span>`;
const html =
	verse(11, word(11, 1, 'x')) +
	' ' +
	verse(12, ['Beloved,', 'do', 'not', 'be', 'surprised'].map((t, i) => word(12, i + 1, t)).join(' '));
const ids = (s) => [...s.matchAll(/data-word-id="([^"]+)"/g)].map((m) => m[1].slice(-6));

check('a whole-verse range is untouched', clipPassageHtml(html, ipe(4, 11, 4, 12)), html);
const head = clipPassageHtml(html, ipe(4, 11, 4, 12, { toWord: 3 }));
check('ending at word 3 keeps 4:11 and words 1–3', ids(head).join(), '11-001,12-001,12-002,12-003');
assert('marks the partial verse "a"', head.includes('data-verse-id="IPE-004-012" data-partial="a"'));
const tail = clipPassageHtml(html, ipe(4, 12, 4, 12, { fromWord: 4 }));
check('starting at word 4 keeps words 4–5', ids(tail).join(), '12-004,12-005');
assert('marks the partial verse "b"', tail.includes('data-partial="b"'));
check('the two halves share no word', ids(head).filter((x) => ids(tail).includes(x)).length, 0);
const verse12 = new Set([...ids(head), ...ids(tail)].filter((x) => x.startsWith('12')));
check('and together cover every word of the verse', verse12.size, 5);

console.log('\n── the edit flow refuses mid-verse parts ──');
check('whole-verse series pass', describeMidVerseBlock([part('A', 1, ipe(4, 1, 4, 19))]), null);
const block = describeMidVerseBlock([a, b, part('C', 3, ipe(5, 1, 5, 14))]);
assert('a mid-verse series is refused', typeof block === 'string');
assert('naming each affected part and only those', /\(A, B\)/.test(block ?? ''));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

