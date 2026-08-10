/**
 * Verify run-based reordering (SERIES_PLAN §4, phase 3).
 *
 * §4: "reordering permutes runs. Parts within a run are rigid, and runs are never interleaved."
 *
 * The properties that matter are mostly refusals and invariants:
 *   - a contiguous series has ONE run and cannot be reordered at all (§11: no dead drag handle);
 *   - a run moves as a rigid block — its parts keep their relative order;
 *   - runs are never interleaved;
 *   - every part is still present exactly once afterwards.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-reorder.mjs
 */

import { describeRuns, planRunReorder } from '../src/lib/utils/seriesReorder.js';

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

/** A part covering one Romans range. */
const ro = (id, order, fromChapter, toChapter, toVerse, title) => ({
	id,
	seriesOrder: order,
	title: title ?? `Romans ${fromChapter}–${toChapter}`,
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

/** A part covering a whole short book, for multi-run fixtures. */
const book = (id, order, bookId, bookName, chapters, lastVerse) => ({
	id,
	seriesOrder: order,
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

console.log('\n── §4: a contiguous series is ONE run and cannot be reordered ──');

// Romans 1–2, 3–4, 5–6: every seam abuts, so this is a single rigid run.
const contiguous = [ro('a', 0, 1, 2, 29), ro('b', 1, 3, 4, 25), ro('c', 2, 5, 6, 23)];
const described = describeRuns(contiguous);
check('one run', described.runs.length, 1);
check('holding all three parts', described.runs[0].partCount, 3);
check('and it is NOT reorderable', described.reorderable, false);

const refused = planRunReorder({ parts: contiguous, fromIndex: 0, toIndex: 1 });
assert('a reorder attempt is refused', !refused.ok);
assert('with a reason that explains why', /one continuous run/.test(refused.error ?? ''));
check('and nothing is written', refused.updates.length, 0);

console.log('\n── Prison Epistles: four books, four runs, freely permutable (§4’s table) ──');

const prison = [
	book('eph', 0, 'EPH', 'Ephesians', 6, 24),
	book('php', 1, 'PHP', 'Philippians', 4, 23),
	book('col', 2, 'COL', 'Colossians', 4, 18),
	book('phm', 3, 'PHM', 'Philemon', 1, 25)
];
const prisonRuns = describeRuns(prison);
check('four runs', prisonRuns.runs.length, 4);
check(
	'each holding one part',
	prisonRuns.runs.every((r) => r.partCount === 1),
	true
);
check('and it IS reorderable', prisonRuns.reorderable, true);
check('runs are named for their part', prisonRuns.runs[0].title, 'Ephesians');

console.log('\n── moving a run rewrites seriesOrder, and every part survives ──');

const moved = planRunReorder({ parts: prison, fromIndex: 3, toIndex: 0 });
assert('the move is accepted', moved.ok);
check('Philemon is now first', moved.order[0], 'phm');
check(
	'followed by the other three in their original order',
	moved.order.join(','),
	'phm,eph,php,col'
);
check('all four parts are still present', moved.order.length, 4);
check('and none is duplicated', new Set(moved.order).size, 4);

// Only the parts whose value actually changed are written.
check('four updates, since every position shifted', moved.updates.length, 4);
check('Philemon takes order 0', moved.updates.find((u) => u.id === 'phm')?.seriesOrder, 0);
check('and Colossians order 3', moved.updates.find((u) => u.id === 'col')?.seriesOrder, 3);

console.log('\n── §4: a run moves as a RIGID BLOCK — its parts keep their relative order ──');

// Two runs: Romans 1–4 in two contiguous parts, then Philippians. Moving the Romans run must carry both
// of its parts, in order — the property that distinguishes reordering runs from reordering parts.
const mixed = [
	ro('r1', 0, 1, 2, 29),
	ro('r2', 1, 3, 4, 25),
	book('php', 2, 'PHP', 'Philippians', 4, 23)
];
const mixedRuns = describeRuns(mixed);
check('two runs', mixedRuns.runs.length, 2);
check('the first holds both Romans parts', mixedRuns.runs[0].partCount, 2);
check('and is named for its span', mixedRuns.runs[0].title, 'Romans 1–2 → Romans 3–4');
check('the second holds Philippians alone', mixedRuns.runs[1].partCount, 1);

const blockMoved = planRunReorder({ parts: mixed, fromIndex: 0, toIndex: 1 });
assert('moving the Romans run is accepted', blockMoved.ok);
check('Philippians is now first', blockMoved.order[0], 'php');
check('and the two Romans parts follow IN ORDER', blockMoved.order.join(','), 'php,r1,r2');

// The invariant that would break if parts were permuted individually rather than as a run.
const romansPositions = ['r1', 'r2'].map((id) => blockMoved.order.indexOf(id));
assert('r1 still precedes r2', romansPositions[0] < romansPositions[1]);
assert(
	'and they remain adjacent, never interleaved',
	romansPositions[1] - romansPositions[0] === 1
);

console.log('\n── runs are never interleaved, whatever the requested position ──');

// Three runs; move the last to the middle. Each run must stay whole.
const threeRuns = [
	ro('r1', 0, 1, 2, 29),
	ro('r2', 1, 3, 4, 25),
	book('php', 2, 'PHP', 'Philippians', 4, 23),
	book('col', 3, 'COL', 'Colossians', 4, 18)
];
check('three runs', describeRuns(threeRuns).runs.length, 3);
const interleaveTest = planRunReorder({ parts: threeRuns, fromIndex: 2, toIndex: 0 });
check('Colossians moves to the front', interleaveTest.order.join(','), 'col,r1,r2,php');
const idx = (id) => interleaveTest.order.indexOf(id);
assert('the Romans run is still contiguous', idx('r2') - idx('r1') === 1);

console.log('\n── degenerate requests are refused rather than guessed at ──');

assert(
	'an out-of-range source run',
	!planRunReorder({ parts: prison, fromIndex: 9, toIndex: 0 }).ok
);
assert(
	'an out-of-range destination',
	!planRunReorder({ parts: prison, fromIndex: 0, toIndex: 9 }).ok
);
assert('a negative index', !planRunReorder({ parts: prison, fromIndex: -1, toIndex: 0 }).ok);
assert('a non-integer index', !planRunReorder({ parts: prison, fromIndex: 1.5, toIndex: 0 }).ok);

// Moving a run to where it already is is a no-op, not an error: a drag that ends where it began is a
// perfectly ordinary gesture and must not raise anything.
const noop = planRunReorder({ parts: prison, fromIndex: 1, toIndex: 1 });
assert('moving a run onto itself succeeds', noop.ok);
check('and writes nothing', noop.updates.length, 0);
check('while still reporting the order', noop.order.length, 4);

console.log('\n── an empty or single-part series has nothing to reorder ──');

check('no parts', describeRuns([]).runs.length, 0);
check('and is not reorderable', describeRuns([]).reorderable, false);
check('one part is one run', describeRuns([ro('a', 0, 1, 2, 29)]).runs.length, 1);
check('and still not reorderable', describeRuns([ro('a', 0, 1, 2, 29)]).reorderable, false);
assert(
	'a reorder on one part is refused',
	!planRunReorder({ parts: [ro('a', 0, 1, 2, 29)], fromIndex: 0, toIndex: 0 }).ok
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
