/**
 * Verify the whole-series export compliance check (SERIES_PLAN §10, Q32/Q33, phase 3).
 *
 * §10's worked case is the reason this exists: the whole of John in 21 one-chapter parts passes every
 * per-part check and fires no warning anywhere, while the series covers a complete book. The finer the
 * parting, the more thoroughly per-part validation goes quiet.
 *
 * So the assertions are mostly about the aggregate catching what the parts do not, and about NOT
 * double-counting overlapping parts (Q7 calls overlap normal).
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-export.mjs
 */

import { checkSeriesExport, collectSeriesPassages } from '../src/lib/utils/seriesExport.js';
import {
	validateStudyDisplayLimits,
	validateExportLimits
} from '../src/lib/utils/translationLimits.js';
import { getVerseCount, getBookVerseTotal } from '../src/lib/utils/bibleData.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
	} else {
		fail += 1;
		console.log(
			`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
		);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`✗ ${label}`);
	}
}

/** One part covering a chapter range of a book. */
const part = (order, bookId, testament, fromChapter, toChapter) => ({
	id: `p${order}`,
	seriesOrder: order,
	passages: [
		{
			testament,
			bookId,
			fromChapter,
			fromVerse: 1,
			toChapter,
			toVerse: getVerseCount(testament, bookId, toChapter),
			displayOrder: 0
		}
	]
});

console.log('\n── §10’s worked case: John in 21 one-chapter parts ──');

const JOHN_TOTAL = getBookVerseTotal('NT', 'JN');
console.log(`(measured: the book of John is ${JOHN_TOTAL} verses)`);

const johnParts = Array.from({ length: 21 }, (_, i) => part(i, 'JN', 'NT', i + 1, i + 1));

// The asymmetry §10 describes: EVERY part passes on its own.
const partWarnings = johnParts.flatMap(
	(p) => validateStudyDisplayLimits(p.passages, 'esv').warnings
);
check('not one per-part warning fires across all 21 parts', partWarnings.length, 0);

// And yet the series covers the complete book.
const johnResult = checkSeriesExport(johnParts, 'esv');
check('the series-wide check counts the whole book', johnResult.totalVerses, JOHN_TOTAL);
assert('it is not compliant', !johnResult.compliant);
assert('and it BLOCKS (Q32), where a single study would only warn', johnResult.blocked);
assert('with at least one warning to show', johnResult.warnings.length > 0);
check('and it reports the part count', johnResult.partCount, 21);

console.log('\n── Q32: it blocks even though per-part export only warns ──');

// The same passage set fed to the ordinary export check reports `blocked` from the translation's own
// `enforcement`, which is 'warn' everywhere today. Relying on that alone would let a whole-book series
// export silently — the exact outcome §10 says must not happen.
const asOrdinaryExport = validateExportLimits(collectSeriesPassages(johnParts), 'esv');
assert('the ordinary export check agrees it is non-compliant', !asOrdinaryExport.compliant);
check('but does NOT block, because enforcement is warn', asOrdinaryExport.blocked, false);
check('while the series check does block', johnResult.blocked, true);

console.log('\n── overlapping parts are not double-counted (Q7 calls overlap normal) ──');

// Romans 1–3 and Romans 3–5: chapter 3 is in both parts. A naive sum would count it twice and could
// invent a breach; `validateExportLimits()` uses a verse-identity Set, which is why this reuses it.
const overlapping = [part(0, 'RO', 'NT', 1, 3), part(1, 'RO', 'NT', 3, 5)];
const overlapResult = checkSeriesExport(overlapping, 'esv');

let romans1to5 = 0;
for (let c = 1; c <= 5; c += 1) romans1to5 += getVerseCount('NT', 'RO', c);
check('the union of the two parts is counted once', overlapResult.totalVerses, romans1to5);

const naiveSum = romans1to5 + getVerseCount('NT', 'RO', 3); // chapter 3 counted a second time
assert('which is fewer than a naive sum would give', overlapResult.totalVerses < naiveSum);
check('two parts reported', overlapResult.partCount, 2);
check('and two passages collected', overlapResult.passageCount, 2);

console.log('\n── a modest series is compliant and does not block ──');

// Romans 1–5 in two parts: well under both the 500-verse ceiling and half of Romans.
const modest = [part(0, 'RO', 'NT', 1, 2), part(1, 'RO', 'NT', 3, 5)];
const modestResult = checkSeriesExport(modest, 'esv');
assert('it is compliant', modestResult.compliant);
check('and does not block', modestResult.blocked, false);
check('with no warnings', modestResult.warnings.length, 0);

console.log(
	'\n── NET has no distribution cap, so the same series passes (§10: read the source) ──'
);

// The decisions log's "limit message attribution" row: a limit must be attributed to the licence that
// imposes it. NET's own guardrail is ours, not a licence term, so a whole-book NET series is fine.
const netWholeJohn = checkSeriesExport(johnParts, 'net');
assert('NET does not block a whole-book series', !netWholeJohn.blocked);
check('and raises no warnings', netWholeJohn.warnings.length, 0);
assert('while ESV does block the identical shape', johnResult.blocked);

console.log('\n── passages are collected in the USER’S order (§4), not canonical order ──');

// seriesOrder deliberately disagrees with canonical order — a user teaching Romans 8 first. Collection
// must follow their arrangement, since an exported document has to read in the declared order.
const reordered = [
	{
		id: 'later',
		seriesOrder: 0,
		passages: [
			{
				testament: 'NT',
				bookId: 'RO',
				fromChapter: 8,
				fromVerse: 1,
				toChapter: 8,
				toVerse: 39,
				displayOrder: 0
			}
		]
	},
	{
		id: 'earlier',
		seriesOrder: 1,
		passages: [
			{
				testament: 'NT',
				bookId: 'RO',
				fromChapter: 1,
				fromVerse: 1,
				toChapter: 7,
				toVerse: 25,
				displayOrder: 0
			}
		]
	}
];
const collected = collectSeriesPassages(reordered);
check('the first passage is the one the user put first', collected[0].fromChapter, 8);
check('and the second follows', collected[1].fromChapter, 1);

// Multi-passage parts keep their own displayOrder within the part.
const multi = [
	{
		id: 'p',
		seriesOrder: 0,
		passages: [
			{
				testament: 'NT',
				bookId: 'RO',
				fromChapter: 3,
				fromVerse: 1,
				toChapter: 3,
				toVerse: 31,
				displayOrder: 1
			},
			{
				testament: 'NT',
				bookId: 'RO',
				fromChapter: 1,
				fromVerse: 1,
				toChapter: 1,
				toVerse: 32,
				displayOrder: 0
			}
		]
	}
];
check('displayOrder orders passages within a part', collectSeriesPassages(multi)[0].fromChapter, 1);

console.log('\n── degenerate input is handled without throwing ──');

check('no parts yields no passages', collectSeriesPassages([]).length, 0);
check('a null list too', collectSeriesPassages(null).length, 0);
check(
	'a part with no passages contributes nothing',
	collectSeriesPassages([{ id: 'p', seriesOrder: 0 }]).length,
	0
);

const empty = checkSeriesExport([], 'esv');
assert('an empty series is compliant', empty.compliant);
check('and does not block', empty.blocked, false);
check('with zero verses', empty.totalVerses, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
