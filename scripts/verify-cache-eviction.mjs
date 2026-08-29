/**
 * Verify cache eviction against the ESV local-storage clause (COMPLIANCE.md §5 item 1).
 *
 * > "You may not locally store more than 500 verses or one-half of any book of the Bible
 * > (whichever is less)."
 *
 * This was the document's only *genuine* violation — every other gap there is a defensible position;
 * this one contradicted an explicit clause, because `passage.cachedText` was unbounded.
 *
 * Run against the real `bible.json`, so the numbers are the licence's numbers and not a fixture's:
 * half of Galatians is 74, half of Romans 216, and Philemon is exempt because it has one chapter. A
 * verifier with invented verse counts would pass while the app shipped wrong ones.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-cache-eviction.mjs
 */

import { planCacheEviction, summariseCacheUsage } from '../src/lib/utils/cacheEviction.js';
import { resolveWhicheverIsLess, getCachingLimits } from '../src/lib/utils/translationLimits.js';
import { countVersesInRange, getBookVerseTotal } from '../src/lib/utils/bibleData.js';

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

/** A cached passage row, in the shape the runner selects. */
const row = (id, book, testament, fromChapter, fromVerse, toChapter, toVerse, cachedAt) => ({
	id,
	bookId: book,
	testament,
	fromChapter,
	fromVerse,
	toChapter,
	toVerse,
	textCachedAt: cachedAt ?? '2026-01-01T00:00:00Z',
	cachedText: 'CACHED'
});

console.log('\n── the licence numbers, read from bible.json rather than assumed ──');

const galatiansTotal = getBookVerseTotal('NT', 'GA');
const romansTotal = getBookVerseTotal('NT', 'RO');
check('Galatians has 149 verses', galatiansTotal, 149);
check('Romans has 433 verses', romansTotal, 433);
// The figures COMPLIANCE.md §1 quotes. If bible.json ever disagrees, every threshold below is wrong and
// this is where that shows up.
check(
	'half of Galatians floors to 74',
	resolveWhicheverIsLess({
		bookTotal: galatiansTotal,
		chapterCount: 6,
		maxVerses: 500,
		maxBookPortion: 0.5,
		shortBookChapterThreshold: 2
	}).allowed,
	74
);
check(
	'half of Romans floors to 216',
	resolveWhicheverIsLess({
		bookTotal: romansTotal,
		chapterCount: 16,
		maxVerses: 500,
		maxBookPortion: 0.5,
		shortBookChapterThreshold: 2
	}).allowed,
	216
);
// "Whichever is less" is ONE limit (COMPLIANCE.md §1.7). For a book bigger than 1000 verses the 500-verse
// ceiling binds instead of the portion, and the resolver must say which won or the message will misquote
// the licence back to the user.
const psalms = resolveWhicheverIsLess({
	bookTotal: 2461,
	chapterCount: 150,
	maxVerses: 500,
	maxBookPortion: 0.5,
	shortBookChapterThreshold: 2
});
check('for Psalms the 500-verse ceiling binds, not half the book', psalms.allowed, 500);
check('and it reports that the portion did NOT win', psalms.boundByPortion, false);

console.log('\n── the storage clause is read in full, not half of it ──');

const esv = getCachingLimits('esv');
check('maxVerses is read', esv.maxVerses, 500);
// ⚠️ The regression this pins: the caching block held `maxVerses: 500` ALONE, so 400 verses of Galatians
// would have been "compliant" while plainly breaching the half-book half of the same sentence.
check('maxBookPortion is read', esv.maxBookPortion, 0.5);
check('and the short-book carve-out is read', esv.shortBookChapterThreshold, 2);

console.log('\n── a book over half is evicted, one under half is kept ──');

// Galatians entire: 149 stored against an allowance of 74.
const whole = planCacheEviction([row('g', 'GA', 'NT', 1, 1, 6, 18)], 'esv');
check('storing all of Galatians evicts it', whole.evictIds.length, 1);
check('and names the portion limit as the reason', whole.reasons[0]?.reason, 'book-portion');
check('nothing is kept', whole.keptVerses, 0);

// Galatians 1–3 is 74 verses — exactly the allowance, so it must be KEPT. An off-by-one here would evict
// text the licence permits, which is a real cost (a re-fetch) for no compliance gain.
check('Galatians 1-3 is exactly 74 verses', countVersesInRange('NT', 'GA', 1, 1, 3, 29), 74);
const atLimit = planCacheEviction([row('g', 'GA', 'NT', 1, 1, 3, 29)], 'esv');
check('a book exactly AT its limit is kept', atLimit.evictIds.length, 0);
check('and counted as kept', atLimit.keptVerses, 74);

console.log("\n── the six short books may be stored whole (the licence's own parenthesis) ──");

// COMPLIANCE.md §1 lists these as the ONLY books the ESV permits in full. It is a CHAPTER-count rule:
// Philemon's 25 verses are irrelevant, its single chapter is the reason.
for (const [id, name, chapters, lastVerse] of [
	['PN', 'Philemon', 1, 25],
	['2JN', '2 John', 1, 13],
	['3JN', '3 John', 1, 14],
	['JD', 'Jude', 1, 25],
	['OB', 'Obadiah', 1, 21],
	['HG', 'Haggai', 2, 23]
]) {
	const testament = ['OB', 'HG'].includes(id) ? 'OT' : 'NT';
	const plan = planCacheEviction([row(id, id, testament, 1, 1, chapters, lastVerse)], 'esv');
	assert(`${name} may be stored whole`, plan.evictIds.length === 0 && plan.keptVerses > 0);
}

console.log('\n── the 500-verse ceiling binds across books, where no single book does ──');

// COMPLIANCE.md's own example of why a per-book check is not enough: neither book is past half, and only
// the total catches it. Matthew 1-10 is 315 and Luke 1-8 is 408; each is under its own half, their sum is
// not under 500.
const mt = countVersesInRange('NT', 'MT', 1, 1, 10, 42);
const lk = countVersesInRange('NT', 'LK', 1, 1, 8, 56);
assert('Matthew 1-10 is under half of Matthew', mt < getBookVerseTotal('NT', 'MT') / 2);
assert('Luke 1-8 is under half of Luke', lk < getBookVerseTotal('NT', 'LK') / 2);
assert('but together they exceed 500', mt + lk > 500);

const across = planCacheEviction(
	[
		row('m', 'MT', 'NT', 1, 1, 10, 42, '2026-03-02T00:00:00Z'),
		row('l', 'LK', 'NT', 1, 1, 8, 56, '2026-03-01T00:00:00Z')
	],
	'esv'
);
check('one of the two is evicted', across.evictIds.length, 1);
check('and the total ceiling is named, not the portion', across.reasons[0]?.reason, 'total-verses');
// Recency decides which survives: the newest-cached row is the text the user is most likely reading.
check('the more recently cached row survives', across.evictIds[0], 'l');
assert('what remains is within the cap', across.keptVerses <= 500);

console.log('\n── verses are counted by identity, so overlap is not double-counted ──');

// Two studies of the same range store ONE copy of those verses as far as the clause is concerned. Summing
// counts instead would report 234 and evict to fix a breach that is not happening.
const roRange = countVersesInRange('NT', 'RO', 1, 1, 4, 25);
check('Romans 1-4 is 117 verses', roRange, 117);
const overlap = planCacheEviction(
	[row('a', 'RO', 'NT', 1, 1, 4, 25), row('b', 'RO', 'NT', 1, 1, 4, 25)],
	'esv'
);
check('two identical rows are both kept', overlap.evictIds.length, 0);
check('and count once, not twice', overlap.keptVerses, roRange);

console.log('\n── NET is untouched: it declares no storage cap ──');

// The clause is Crossway's. Policing NET would enforce a term its publisher never set — and the runner
// groups by translation precisely so an ESV allowance cannot be consumed by NET rows.
const net = planCacheEviction([row('g', 'GA', 'NT', 1, 1, 6, 18)], 'net');
check('storing all of Galatians in NET evicts nothing', net.evictIds.length, 0);
check('and reports that no cap applies', net.limited, false);
check('while ESV reports that one does', whole.limited, true);

console.log('\n── cold rows and unmeasurable rows ──');

// A cold row occupies no storage; the clause is entirely about `cachedText`. Counting it toward the cap
// would evict warm rows to make room for text that is not there.
const cold = planCacheEviction(
	[
		{
			id: 'c',
			bookId: 'GA',
			testament: 'NT',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 6,
			toVerse: 18,
			cachedText: null
		}
	],
	'esv'
);
check('a row with no cached text is ignored', cold.evictIds.length, 0);

// ⚠️ The §1.8 defect class: a DB row carries `bookId`, an in-memory passage carries `book`. Reading only
// one spelling would make the planner measure zero verses.
//
// ⚠️⚠️ These assert the REASON, not merely that something was evicted — and that correction came from
// mutation-testing this file. Changing `rowBookId()` to read `bookId` only left the count at 1 and the
// check GREEN, because an unreadable row is still evicted, just as `unmeasurable`. The assertion was
// true for the wrong reason, which is the vacuous-truth failure COMPLIANCE.md §1.8 is about. Asserting
// the reason distinguishes "measured, and over half of Galatians" from "could not be read at all".
const bookSpelling = planCacheEviction(
	[
		{
			id: 'x',
			book: 'GA',
			testament: 'NT',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 6,
			toVerse: 18,
			cachedText: 'X',
			textCachedAt: '2026-01-01T00:00:00Z'
		}
	],
	'esv'
);
check(
	'the `book` spelling is MEASURED, not treated as unreadable',
	bookSpelling.reasons[0]?.reason,
	'book-portion'
);

// The boolean projection the study layout selects instead of the full HTML.
const hasCached = planCacheEviction(
	[
		{
			id: 'h',
			bookId: 'GA',
			testament: 'NT',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 6,
			toVerse: 18,
			hasCachedText: true,
			textCachedAt: '2026-01-01T00:00:00Z'
		}
	],
	'esv'
);
check(
	'the `hasCachedText` projection is measured too',
	hasCached.reasons[0]?.reason,
	'book-portion'
);

// An unidentifiable row stores text no cap can account for — the unbounded state this module ends.
const unknown = planCacheEviction(
	[
		{
			id: 'u',
			testament: 'NT',
			bookId: 'NOPE',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 1,
			toVerse: 5,
			cachedText: 'X'
		}
	],
	'esv'
);
check('an unmeasurable row is evicted', unknown.evictIds.length, 1);
check('under its own reason', unknown.reasons[0]?.reason, 'unmeasurable');

console.log('\n── the summary agrees with the enforcer ──');

// A second counter that disagreed with the enforcer would make both untrustworthy.
const summary = summariseCacheUsage([row('g', 'GA', 'NT', 1, 1, 6, 18)], 'esv');
check('it reports the stored total', summary.totalVerses, 149);
check('it reports the binding allowance', summary.byBook[0]?.allowed, 74);
check('it flags the breach', summary.overLimit, true);
// COMPLIANCE.md §1.8 records shipping an internal id into user copy as a defect in its own right.
check('and names the book readably, not as an id', summary.byBook[0]?.bookLabel, 'Galatians');

console.log('\n── the plan is deterministic ──');

// A planner that answers differently for the same input cannot be verified, and eviction is destructive.
const input = [
	row('a', 'RO', 'NT', 1, 1, 8, 39, '2026-01-01T00:00:00Z'),
	row('b', 'MT', 'NT', 1, 1, 10, 42, '2026-01-01T00:00:00Z'),
	row('c', 'LK', 'NT', 1, 1, 8, 56, '2026-01-01T00:00:00Z')
];
const first = planCacheEviction(input, 'esv');
const second = planCacheEviction([...input].reverse(), 'esv');
check(
	'the same rows in any order produce the same plan',
	JSON.stringify(first.evictIds.slice().sort()),
	JSON.stringify(second.evictIds.slice().sort())
);
assert('and the result is within the cap', first.keptVerses <= 500);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
