/**
 * Verify adding a standalone study to a series (SERIES_PLAN §4 invariants, Q17, phase 3).
 *
 * §4's invariant table is deliberately uneven about what blocks, and that unevenness is the thing worth
 * pinning:
 *   - **translation must match** — enforced, because a series carries one export attribution;
 *   - multi-book is allowed (Prison Epistles is the motivating case, not an edge case);
 *   - a gap or an overlap WARNS and proceeds (Q7: a series need not be contiguous);
 *   - no hard part cap; soft-warn above ~30 (Q10).
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-membership.mjs
 */

import { planAddToSeries } from '../src/lib/utils/seriesMembership.js';

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

const romans = (id, order, fromChapter, toChapter, toVerse, translation = 'esv') => ({
	id,
	seriesOrder: order,
	translation,
	title: `Romans ${fromChapter}–${toChapter}`,
	passages: [
		{
			testament: 'NT',
			book: 'RO',
			bookName: 'Romans',
			fromChapter,
			fromVerse: 1,
			toChapter,
			toVerse
		}
	]
});

const other = (id, bookId, bookName, chapters, lastVerse, translation = 'esv') => ({
	id,
	translation,
	title: bookName,
	passages: [
		{
			testament: 'NT',
			book: bookId,
			bookName,
			fromChapter: 1,
			fromVerse: 1,
			toChapter: chapters,
			toVerse: lastVerse
		}
	]
});

const series = { id: 's', translation: 'esv' };
const parts = [romans('p1', 0, 1, 2, 29), romans('p2', 1, 3, 4, 25)];

console.log('\n── the happy case: a contiguous continuation is added silently ──');

const continuation = romans('new', 0, 5, 6, 23);
const contiguousAdd = planAddToSeries({ study: continuation, series, parts });
assert('it is accepted', contiguousAdd.ok);
check('with no warnings', contiguousAdd.warnings.length, 0);
check('and appended after the last part', contiguousAdd.seriesOrder, 2);

console.log('\n── §4: a translation mismatch REFUSES (the one blocking invariant) ──');

const netStudy = romans('net', 0, 5, 6, 23, 'net');
const mismatch = planAddToSeries({ study: netStudy, series, parts });
assert('it is refused', !mismatch.ok);
assert('naming both translations', /ESV/.test(mismatch.error) && /NET/.test(mismatch.error));
assert('and explaining why — one attribution', /attribution/.test(mismatch.error));
check('nothing is warned, because nothing proceeds', mismatch.warnings.length, 0);

// The series column is authoritative; with it absent the existing parts define the translation.
const inferred = planAddToSeries({ study: netStudy, series: { id: 's' }, parts });
assert('the translation is inferred from the parts when the series has none', !inferred.ok);

console.log('\n── §4/Q8: a DIFFERENT BOOK is allowed, and warns rather than blocking ──');

// Prison Epistles is the motivating case: four books, three permanently ineligible boundaries. Blocking
// this would forbid the series §4 names as legitimate.
const philippians = other('php', 'PHP', 'Philippians', 4, 23);
const multiBook = planAddToSeries({ study: philippians, series, parts });
assert('it is ACCEPTED', multiBook.ok);
check('with a warning', multiBook.warnings.length, 1);
assert('saying it starts a different book', /different book/.test(multiBook.warnings[0]));
assert(
	'and naming the consequence — dead structural commands (§8)',
	/structural commands will not work/.test(multiBook.warnings[0])
);

console.log('\n── §4/Q7: a GAP warns and proceeds ──');

// Romans 1–4 then Romans 8: chapters 5–7 belong to neither part.
const afterGap = romans('gap', 0, 8, 8, 39);
const gapAdd = planAddToSeries({ study: afterGap, series, parts });
assert('accepted', gapAdd.ok);
assert('with a gap warning', /gap in Scripture/.test(gapAdd.warnings[0] ?? ''));

console.log('\n── §4/Q7: an OVERLAP warns and proceeds ──');

// Romans 4–6 overlaps the existing Romans 3–4.
const overlapping = romans('ovl', 0, 4, 6, 23);
const overlapAdd = planAddToSeries({ study: overlapping, series, parts });
assert('accepted', overlapAdd.ok);
assert('with an overlap warning', /overlaps/.test(overlapAdd.warnings[0] ?? ''));

console.log('\n── a study already in a series is refused ──');

// Moving a part between series would also have to answer what happens to the series it leaves (§4: at
// one part, that series dissolves), so it is a different operation and is not silently performed here.
const alreadyPart = { ...romans('x', 0, 9, 10, 21), seriesId: 'other-series' };
const already = planAddToSeries({ study: alreadyPart, series, parts });
assert('refused', !already.ok);
assert('saying it already belongs to a series', /already part of a series/.test(already.error));

console.log('\n── Q10: above ~30 parts it soft-warns, and never caps ──');

const manyParts = Array.from({ length: 30 }, (_, i) => romans(`m${i}`, i, 1, 1, 32));
const thirtyFirst = planAddToSeries({ study: romans('n', 0, 1, 1, 32), series, parts: manyParts });
assert('still accepted at 31 parts', thirtyFirst.ok);
assert(
	'with a navigability warning',
	thirtyFirst.warnings.some((w) => /31 parts/.test(w))
);

const huge = Array.from({ length: 200 }, (_, i) => romans(`h${i}`, i, 1, 1, 32));
assert(
	'and still accepted at 201 — §5 treats Psalms at 150 parts as legitimate',
	planAddToSeries({ study: romans('n', 0, 1, 1, 32), series, parts: huge }).ok
);

console.log('\n── §4: seriesOrder is appended, never re-derived from canonical order ──');

// The existing parts are deliberately arranged against canonical order — a user teaching Romans 8
// first. A new part must land at the END, not where its verses would place it.
const reordered = [romans('later', 0, 8, 8, 39), romans('earlier', 1, 1, 7, 25)];
const appended = planAddToSeries({ study: romans('new', 0, 9, 10, 21), series, parts: reordered });
assert('accepted', appended.ok);
check('and appended after the highest existing order', appended.seriesOrder, 2);

// Non-consecutive orders (a part was deleted, leaving a gap — §4 says that gap is expected) must not
// produce a colliding order.
const withGap = [romans('a', 0, 1, 2, 29), romans('b', 5, 3, 4, 25)];
check(
	'a gap in seriesOrder does not cause a collision',
	planAddToSeries({ study: romans('c', 0, 5, 6, 23), series, parts: withGap }).seriesOrder,
	6
);

console.log('\n── degenerate input ──');

assert('a missing study is refused', !planAddToSeries({ study: null, series, parts }).ok);
check(
	'an empty series accepts the first part at order 0',
	planAddToSeries({ study: romans('f', 0, 1, 2, 29), series, parts: [] }).seriesOrder,
	0
);
assert(
	'and a study with no translation is not blocked on that ground',
	planAddToSeries({ study: { id: 'z', passages: [] }, series, parts }).ok
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
