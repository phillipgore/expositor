/**
 * Verify Move Selected Up / Down's pure destination logic (SERIES_PLAN §8).
 *
 * ## The defect this exists to pin
 *
 * Order is DERIVED from `startingWordId` — there is no `order` column at any of the three tiers — so
 * moving a **middle** item between containers silently tears the reading order apart. Column 1 with
 * sections {1:1, 2:1, 3:1} and column 2 with {4:1, 5:1}: move 2:1 rightwards and you get {1:1, 3:1}
 * and {2:1, 4:1, 5:1}, reading 1, 3, 2, 4, 5, with two columns claiming overlapping extents.
 *
 * Nothing downstream catches it. `reanchor.js` re-anchors each column from its own first segment and
 * reports success, because each column is internally consistent — only the relationship between them
 * is broken. That is the `analyzeJoin()`-style failure SERIES_PLAN §8 warns about: a confident,
 * incorrect result rather than a fault.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-item-transfer.mjs
 */

import {
	locateItem,
	isAtContainerEdge,
	resolveWithinPassage,
	resolveIntoPassage,
	wouldEmptyPassage
} from '../src/lib/utils/itemTransfer.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

const w = (chapter, verse) =>
	`RO-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-001`;

const seg = (id, c, v) => ({ id, startingWordId: w(c, v) });
const sec = (id, c, v, segments) => ({ id, startingWordId: w(c, v), segments });
const col = (id, c, v, sections) => ({ id, startingWordId: w(c, v), sections });

// Column 1: sections s1 {1:1}, s2 {2:1}, s3 {3:1}.  Column 2: s4 {4:1}, s5 {5:1}.
const tree = [
	col('c1', 1, 1, [
		sec('s1', 1, 1, [seg('g1', 1, 1)]),
		sec('s2', 2, 1, [seg('g2', 2, 1)]),
		sec('s3', 3, 1, [seg('g3', 3, 1)])
	]),
	col('c2', 4, 1, [sec('s4', 4, 1, [seg('g4', 4, 1)]), sec('s5', 5, 1, [seg('g5', 5, 1)])])
];

console.log('\n── Locating an item reports its index among ordered siblings ──');
check('s2 is index 1 of column 1', locateItem(tree, 'section', 's2')?.index, 1);
check('s2 knows its column', locateItem(tree, 'section', 's2')?.column?.id, 'c1');
check('g4 knows its section', locateItem(tree, 'segment', 'g4')?.section?.id, 's4');
check('c2 is index 1 of the passage', locateItem(tree, 'column', 'c2')?.index, 1);
check('an unknown id is not located', locateItem(tree, 'section', 'nope'), null);

console.log('\n── REGRESSION: a MIDDLE item may never move ──');
const midUp = resolveWithinPassage(tree, 'section', 's2', 'up');
const midDown = resolveWithinPassage(tree, 'section', 's2', 'down');
check('s2 cannot move up', midUp.kind, 'blocked');
check('s2 cannot move down', midDown.kind, 'blocked');
check('and the refusal explains reading order', midUp.reason?.includes('reading order'), true);
// The crucial half: 'blocked' is NOT 'none', so no part-tier fallback may rescue it.
check('blocked is distinct from no-neighbour', midUp.kind === 'none', false);

console.log('\n── Edge items move to the ADJACENT COLUMN, not the next part ──');
const s3Down = resolveWithinPassage(tree, 'section', 's3', 'down');
check('s3 (last of column 1) moves down into column 2', s3Down.targetColumn?.id, 'c2');
check('  and that is a within-passage move', s3Down.kind, 'within');
const s4Up = resolveWithinPassage(tree, 'section', 's4', 'up');
check('s4 (first of column 2) moves up into column 1', s4Up.targetColumn?.id, 'c1');

console.log('\n── ...and fall through to the part tier only when no column is adjacent ──');
check(
	's1 (first of the FIRST column) has no column above',
	resolveWithinPassage(tree, 'section', 's1', 'up').kind,
	'none'
);
check(
	's5 (last of the LAST column) has no column below',
	resolveWithinPassage(tree, 'section', 's5', 'down').kind,
	'none'
);
// A column has no containing column, so a column move is ALWAYS a part move — but only from the
// passage's OUTER edge. c1 is first, so it may move up (nothing above it in this passage) and is
// blocked downwards, where it would land after c2 and read out of order.
check(
	'the first column falls through to the part tier upwards',
	resolveWithinPassage(tree, 'column', 'c1', 'up').kind,
	'none'
);
check(
	'the last column falls through to the part tier downwards',
	resolveWithinPassage(tree, 'column', 'c2', 'down').kind,
	'none'
);
check(
	'but the first column is blocked DOWNWARDS',
	resolveWithinPassage(tree, 'column', 'c1', 'down').kind,
	'blocked'
);
// ...but a middle column is still refused outright rather than falling through.
const midColTree = [tree[0], tree[1], col('c3', 6, 1, [sec('s6', 6, 1, [seg('g6', 6, 1)])])];
check(
	'a MIDDLE column is blocked, not passed to the part tier',
	resolveWithinPassage(midColTree, 'column', 'c2', 'up').kind,
	'blocked'
);

console.log('\n── A segment moves to the adjacent SECTION, which may be in the same column ──');
const g2Up = resolveWithinPassage(tree, 'segment', 'g2', 'up');
check('g2 moves up into s1 — the nearer neighbour', g2Up.targetSection?.id, 's1');
check('  staying inside column 1', g2Up.targetColumn?.id, 'c1');
// At a column edge the neighbouring section is in the next column, and the search must cross to it.
const g3Down = resolveWithinPassage(tree, 'segment', 'g3', 'down');
check('g3 crosses into s4', g3Down.targetSection?.id, 's4');
check('  which lives in column 2', g3Down.targetColumn?.id, 'c2');

console.log('\n── Landing in another passage always targets its OUTER edge ──');
check(
	'moving up lands in the destination LAST column',
	resolveIntoPassage(tree, 'section', 'up').targetColumn?.id,
	'c2'
);
check(
	'moving down lands in the destination FIRST column',
	resolveIntoPassage(tree, 'section', 'down').targetColumn?.id,
	'c1'
);
check(
	'a segment moving up lands in the last section',
	resolveIntoPassage(tree, 'segment', 'up').targetSection?.id,
	's5'
);
check(
	'a segment moving down lands in the first section',
	resolveIntoPassage(tree, 'segment', 'down').targetSection?.id,
	's1'
);
check('a column needs no parent container', resolveIntoPassage(tree, 'column', 'up').targetColumn, null);
check('an empty destination offers nothing', resolveIntoPassage([], 'section', 'up').targetColumn, null);

console.log('\n── Emptying a part is Join Parts, and is refused under this name ──');
const lone = [col('only', 1, 1, [sec('onlysec', 1, 1, [seg('onlyseg', 1, 1)])])];
check('the only column would empty the passage', wouldEmptyPassage(lone, 'column'), true);
check('the only section would too', wouldEmptyPassage(lone, 'section'), true);
check('the only segment would too', wouldEmptyPassage(lone, 'segment'), true);
check('but not when siblings remain', wouldEmptyPassage(tree, 'section'), false);
check('nor for a column among several', wouldEmptyPassage(tree, 'column'), false);

console.log('\n── Ordering is taken from anchors, never from array position ──');
// The same column with its sections supplied OUT of order. `passageSequence.js` sorts before handing
// the tree over, but the edge test must not depend on that having happened.
const shuffled = [
	col('c1', 1, 1, [
		sec('s3', 3, 1, [seg('g3', 3, 1)]),
		sec('s1', 1, 1, [seg('g1', 1, 1)]),
		sec('s2', 2, 1, [seg('g2', 2, 1)])
	]),
	tree[1]
];
check('s1 is still first despite arriving second', locateItem(shuffled, 'section', 's1')?.index, 0);
check(
	's3 is still last despite arriving first',
	isAtContainerEdge(locateItem(shuffled, 'section', 's3'), 'down'),
	true
);
check(
	's3 is therefore still blocked upwards',
	resolveWithinPassage(shuffled, 'section', 's3', 'up').kind,
	'blocked'
);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);


