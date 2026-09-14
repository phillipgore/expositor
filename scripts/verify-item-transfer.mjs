/**
 * Verify Move Selected Up / Down's destination logic (SERIES_PLAN §8).
 *
 * ## The rule under test
 *
 * One rule at three tiers: **be at your container's edge, and have an adjacent container of the same
 * kind in reading order.** A segment moves between sections, a section between columns, a column
 * between parts — and the adjacency is resolved over the WHOLE sequence, so the neighbouring container
 * may sit in another passage or another part without that being a special case.
 *
 * ## The defect this exists to pin
 *
 * Order is DERIVED from `startingWordId` — there is no `order` column at any tier — so moving a
 * **middle** item silently tears the reading order apart. Column 1 with sections {1:1, 2:1, 3:1} and
 * column 2 with {4:1, 5:1}: move 2:1 rightwards and you get {1:1, 3:1} and {2:1, 4:1, 5:1}, reading
 * 1, 3, 2, 4, 5, with two columns claiming overlapping extents.
 *
 * Nothing downstream catches it. `reanchor.js` re-anchors each column from its own first segment and
 * reports success, because each column is internally consistent — only the relationship between them
 * is broken. That is the confident-but-wrong failure §8 warns about.
 *
 * ⚠️ An earlier version asserted a TWO-TIER rule ("adjacent column first, adjacent part otherwise").
 * Those assertions were inverted rather than extended when the rule became one search: a section in
 * the last column of part A now moves into part B's first COLUMN, because that is the next column in
 * reading order — not because "part" is a fallback tier.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-item-transfer.mjs
 */

import {
	locateItem,
	isAtContainerEdge,
	locateInSequence,
	flattenContainers,
	resolveTransfer,
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

// ── The fixture: a two-part series ──
//
// Part A (study "A"): column A1 {s1, s2}, column A2 {s3}.
// Part B (study "B"): column B1 {s4}, column B2 {s5}.
//
// Reading order of sections:  s1 s2 s3 | s4 s5
// Reading order of columns :  A1 A2    | B1 B2
const sequence = [
	{
		passageId: 'passA',
		studyId: 'A',
		tree: [
			col('A1', 1, 1, [
				sec('s1', 1, 1, [seg('g1', 1, 1), seg('g2', 1, 5)]),
				sec('s2', 1, 10, [seg('g3', 1, 10)])
			]),
			col('A2', 2, 1, [sec('s3', 2, 1, [seg('g4', 2, 1)])])
		]
	},
	{
		passageId: 'passB',
		studyId: 'B',
		tree: [
			col('B1', 3, 1, [sec('s4', 3, 1, [seg('g5', 3, 1)])]),
			col('B2', 4, 1, [sec('s5', 4, 1, [seg('g6', 4, 1)])])
		]
	}
];

const move = (granularity, itemId, direction) =>
	resolveTransfer({ sequence, granularity, itemId, direction });


console.log('\n── containers are the PARENT tier, flattened in reading order ──');
check('a section moves between COLUMNS', flattenContainers(sequence, 'section').map((c) => c.id).join(' '), 'A1 A2 B1 B2');
check('a segment moves between SECTIONS', flattenContainers(sequence, 'segment').map((c) => c.id).join(' '), 's1 s2 s3 s4 s5');
// A part is not a row — it is consecutive sequence entries sharing a studyId.
check('a column moves between PARTS', flattenContainers(sequence, 'column').map((c) => c.id).join(' '), 'A B');

console.log('\n── REGRESSION: a MIDDLE item may never move, whatever lies beyond ──');
// s1 is first of column A1, so it may not move DOWN — s2 follows it in the same column.
const midDown = move('section', 's1', 'down');
check('the first section of a column cannot move down', midDown.ok, false);
check('  and the refusal names reading order', midDown.reason?.includes('reading order'), true);
check('  naming the right container', midDown.reason?.includes('column'), true);
// g1 is first of section s1, so it may not move down past g2.
check('the first segment of a section cannot move down', move('segment', 'g1', 'down').ok, false);
check('  and the message names sections', move('segment', 'g1', 'down').reason?.includes('section'), true);

console.log('\n── SECTION moves between COLUMNS, including across a part seam ──');
const s2Down = move('section', 's2', 'down');
check('the last section of A1 moves down into A2', s2Down.targetColumnId, 'A2');
check('  staying inside its passage', s2Down.crossesPassage, false);
check('  and inside its part', s2Down.crossesPart, false);

// s3 is the only section of A2, which is the LAST column of part A. The next column in reading order
// is B1 — in the next part. That is a column move that happens to cross a part.
const s3Down = move('section', 's3', 'down');
check('the last section of part A moves into part B’s FIRST column', s3Down.targetColumnId, 'B1');
check('  crossing a passage', s3Down.crossesPassage, true);
check('  and crossing a part', s3Down.crossesPart, true);
check('  landing in part B', s3Down.targetStudyId, 'B');

// The mirror: s4 moves back up into A2, the last column of part A.
const s4Up = move('section', 's4', 'up');
check('and the mirror move returns it to part A’s LAST column', s4Up.targetColumnId, 'A2');
check('  crossing back', s4Up.crossesPart, true);

console.log('\n── SEGMENT moves between SECTIONS, including across a part seam ──');
const g3Down = move('segment', 'g3', 'down');
check('the last segment of s2 moves into s3', g3Down.targetSectionId, 's3');
check('  carrying the section’s column', g3Down.targetColumnId, 'A2');
check('  without leaving the passage', g3Down.crossesPassage, false);

// g4 is the last segment of the last section of part A. Its next section is s4 in part B.
const g4Down = move('segment', 'g4', 'down');
check('the last segment of part A moves into part B’s FIRST section', g4Down.targetSectionId, 's4');
check('  which is at part B’s outer edge, never mid-stack', g4Down.targetColumnId, 'B1');
check('  crossing a part', g4Down.crossesPart, true);

console.log('\n── COLUMN moves between PARTS, and only between parts ──');
const a2Down = move('column', 'A2', 'down');
check('the last column of part A moves down into part B', a2Down.targetStudyId, 'B');
check('  crossing a part', a2Down.crossesPart, true);
check('  and needs no target column', a2Down.targetColumnId, null);

// ⚠️ A1 is NOT at the edge of its part (A2 follows it), so it cannot move down — even though part B
// plainly exists. Container-edge and container-adjacency are independent requirements.
const a1Down = move('column', 'A1', 'down');
check('a non-final column cannot move down to the next part', a1Down.ok, false);
check('  refused for reading order, not for a missing part', a1Down.reason?.includes('reading order'), true);


console.log('\n── the outer edges of the whole series are closed ──');
check('nothing precedes the first section', move('section', 's1', 'up').ok, false);
check('  and it says which container is missing', move('section', 's1', 'up').reason?.includes('no column before'), true);
check('nothing follows the last section', move('section', 's5', 'down').ok, false);
check('nothing precedes the first segment', move('segment', 'g1', 'up').ok, false);
check('nothing follows the last segment', move('segment', 'g6', 'down').ok, false);
check('nothing precedes the first part’s first column', move('column', 'A1', 'up').ok, false);
check('  naming the missing part', move('column', 'A1', 'up').reason?.includes('no part before'), true);
check('nothing follows the last part’s last column', move('column', 'B2', 'down').ok, false);

console.log('\n── locating works across the whole sequence, not one passage ──');
check('a part-B section is found', locateInSequence(sequence, 'section', 's4')?.passageIndex, 1);
check('  and knows its container', locateInSequence(sequence, 'section', 's4')?.containerId, 'B1');
check('a segment knows its section', locateInSequence(sequence, 'segment', 'g5')?.containerId, 's4');
check('a column knows its part', locateInSequence(sequence, 'column', 'B1')?.containerId, 'B');
check('an unknown id is not located', locateInSequence(sequence, 'section', 'nope'), null);

console.log('\n── emptying a part is Join Parts, and is refused under this name ──');
const lone = [col('only', 1, 1, [sec('onlysec', 1, 1, [seg('onlyseg', 1, 1)])])];
check('the only column would empty the passage', wouldEmptyPassage(lone, 'column'), true);
check('the only section would too', wouldEmptyPassage(lone, 'section'), true);
check('the only segment would too', wouldEmptyPassage(lone, 'segment'), true);
check('but not when siblings remain', wouldEmptyPassage(sequence[0].tree, 'section'), false);

console.log('\n── ordering is taken from anchors, never from array position ──');
const shuffled = [
	{
		passageId: 'p',
		studyId: 'A',
		tree: [
			col('c1', 1, 1, [
				sec('z3', 3, 1, [seg('x3', 3, 1)]),
				sec('z1', 1, 1, [seg('x1', 1, 1)]),
				sec('z2', 2, 1, [seg('x2', 2, 1)])
			]),
			col('c2', 4, 1, [sec('z4', 4, 1, [seg('x4', 4, 1)])])
		]
	}
];
check('z1 is first despite arriving second', locateItem(shuffled[0].tree, 'section', 'z1')?.index, 0);
check('z3 is last despite arriving first', isAtContainerEdge(locateItem(shuffled[0].tree, 'section', 'z3'), 'down'), true);
check(
	'so z3 — not z2 — is the one that may move down',
	resolveTransfer({ sequence: shuffled, granularity: 'section', itemId: 'z3', direction: 'down' }).targetColumnId,
	'c2'
);
check(
	'and z2 is refused',
	resolveTransfer({ sequence: shuffled, granularity: 'section', itemId: 'z2', direction: 'down' }).ok,
	false
);

console.log('\n── a part holding SEVERAL passages is one container for a column ──');
// Column moves are between PARTS, so a column in part A's second passage has a previous column inside
// its own part — which is a passage crossing but NOT a part crossing.
const multi = [
	{ passageId: 'a1', studyId: 'A', tree: [col('m1', 1, 1, [sec('ms1', 1, 1, [seg('mg1', 1, 1)])])] },
	{ passageId: 'a2', studyId: 'A', tree: [col('m2', 2, 1, [sec('ms2', 2, 1, [seg('mg2', 2, 1)])])] },
	{ passageId: 'b1', studyId: 'B', tree: [col('m3', 3, 1, [sec('ms3', 3, 1, [seg('mg3', 3, 1)])])] }
];
check('the two passages of part A are ONE container', flattenContainers(multi, 'column').length, 2);
// m1 is not the last column of part A (m2 follows, in the next passage), so it cannot move down.
check('a column mid-part cannot move down', resolveTransfer({ sequence: multi, granularity: 'column', itemId: 'm1', direction: 'down' }).ok, false);
// m2 IS the last column of part A, so it moves into part B.
const m2Down = resolveTransfer({ sequence: multi, granularity: 'column', itemId: 'm2', direction: 'down' });
check('the part’s last column moves to the next part', m2Down.targetStudyId, 'B');
check('  crossing a part', m2Down.crossesPart, true);
// But a SECTION in passage a1 has a perfectly good next column (m2) inside its own part.
const ms1Down = resolveTransfer({ sequence: multi, granularity: 'section', itemId: 'ms1', direction: 'down' });
check('a section crosses a PASSAGE without crossing a part', ms1Down.targetColumnId, 'm2');
check('  crossesPassage is true', ms1Down.crossesPassage, true);
check('  but crossesPart is false', ms1Down.crossesPart, false);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

