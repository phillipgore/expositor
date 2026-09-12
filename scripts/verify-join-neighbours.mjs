/**
 * Verify the enable/disable rule for Join Up and Join Down.
 *
 * ## The rule
 *
 * A join folds two items together, so it is meaningless without a neighbour of the same tier. Join Up
 * therefore requires something BEFORE the selection, and Join Down something AFTER it.
 *
 * ## Why this needed its own resolution rather than the existing flags
 *
 * The `is…FirstInPassage` flags answer "does this item lead its PASSAGE?", which is a different
 * question, and the difference produced two real defects that this file pins against regression:
 *
 *   - **wrongly disabled**: in a study with two passages, the second passage's first segment sets
 *     `isFirstInPassage`, yet a perfectly good predecessor sits in the passage above;
 *   - **wrongly enabled**: there were no `…LastInPassage` flags at all, so Join Down guessed from the
 *     part index and stayed enabled on the very last item of the study, where the only feedback was a
 *     server refusal after the click — on a destructive command with no undo.
 *
 * ⚠️ This pins the WITHIN-STUDY necessary condition only. A contiguous neighbouring part can still
 * offer a cross-part join past either edge; `MenuStructure.svelte` layers that on with the series
 * context, and the server remains the authority. Said plainly because a verifier that implied it
 * settled cross-part reachability would be claiming more than it checks.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-join-neighbours.mjs
 */

import {
	resolveJoinNeighbours,
	resolveJoinTier,
	flattenTier,
	passageIdOfItem
} from '../src/lib/utils/joinNeighbours.js';

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

const seg = (id) => ({ id });
const sec = (id, segments) => ({ id, segments });
const col = (id, sections) => ({ id, sections });

/**
 * A `passagesWithText` entry, built exactly the way the study layout builds one.
 *
 * ⚠️ Note what is NOT here: a top-level `id`. That is not a simplification — it is the real shape.
 * `fetchPassagesTextWithCache` returns `{ reference, text, fromCache }`, discarding the passage row
 * it was given, and the layout then attaches `structure: { passageId, columns }`. A fixture that
 * added `id` here would be a lie that made the test pass against a lookup that cannot work in the app.
 */
const passage = (columns, passageId = 'p1') => ({
	reference: 'Romans 1:1–5',
	text: 'some text',
	fromCache: true,
	structure: { passageId, columns }
});

// One passage: a column, two sections, three segments (2 + 1).
const single = [
	passage([col('c1', [sec('s1', [seg('g1'), seg('g2')]), sec('s2', [seg('g3')])])])
];

console.log('\n── the tier comes from the selection, Column ⊃ Section ⊃ Segment ──');

check('a column selection means column', resolveJoinTier({ columnId: 'c1' }), 'column');
check('a section selection means section', resolveJoinTier({ sectionId: 's1' }), 'section');
check('a segment selection means segment', resolveJoinTier({ segmentId: 'g1' }), 'segment');
// Precedence matters: a column selection also implies a section, and the old per-tier buttons
// resolved this the same way (Join Section was disabled while a column was active).
check(
	'a column wins over a section and a segment',
	resolveJoinTier({ columnId: 'c1', sectionId: 's1', segmentId: 'g1' }),
	'column'
);
check('nothing selected is null', resolveJoinTier({}), null);

console.log('\n── the FIRST item has no predecessor; the LAST has no successor ──');

const firstSeg = resolveJoinNeighbours(single, { segmentId: 'g1' });
assert('Join Up is unavailable on the first segment', firstSeg.hasPredecessor === false);
assert('but Join Down is available', firstSeg.hasSuccessor === true);

const middleSeg = resolveJoinNeighbours(single, { segmentId: 'g2' });
assert('a middle segment can join up', middleSeg.hasPredecessor === true);
assert('and down', middleSeg.hasSuccessor === true);

const lastSeg = resolveJoinNeighbours(single, { segmentId: 'g3' });
assert('the last segment can join up', lastSeg.hasPredecessor === true);
assert('but Join Down is unavailable on it', lastSeg.hasSuccessor === false);

console.log('\n── the same rule at section and column tiers ──');

// Sections span columns, so the tier is flattened across the whole study rather than within a parent.
const firstSec = resolveJoinNeighbours(single, { sectionId: 's1' });
assert('the first section cannot join up', firstSec.hasPredecessor === false);
assert('but can join down', firstSec.hasSuccessor === true);

const lastSec = resolveJoinNeighbours(single, { sectionId: 's2' });
assert('the last section can join up', lastSec.hasPredecessor === true);
assert('but not down', lastSec.hasSuccessor === false);

// A lone column is both first and last: neither direction has anywhere to go.
const onlyCol = resolveJoinNeighbours(single, { columnId: 'c1' });
assert('a sole column cannot join up', onlyCol.hasPredecessor === false);
assert('nor down', onlyCol.hasSuccessor === false);

console.log('\n── REGRESSION: a multi-passage study (the wrongly-DISABLED case) ──');

// Two passages. `g3` leads passage 2, so `isActiveSegmentFirstInPassage` is TRUE for it — yet g1/g2
// sit above it in the same study. The old guard disabled Join Up here; it must be available.
const multi = [
	passage([col('c1', [sec('s1', [seg('g1'), seg('g2')])])], 'p1'),
	passage([col('c2', [sec('s2', [seg('g3'), seg('g4')])])], 'p2')
];

const acrossPassage = resolveJoinNeighbours(multi, { segmentId: 'g3' });
assert(
	'the first segment of passage 2 CAN join up (a predecessor exists one passage above)',
	acrossPassage.hasPredecessor === true
);
assert('and can still join down', acrossPassage.hasSuccessor === true);

// The genuine first item of the whole study is still refused.
assert(
	'while the study’s very first segment still cannot',
	resolveJoinNeighbours(multi, { segmentId: 'g1' }).hasPredecessor === false
);

console.log('\n── REGRESSION: the last item of the study (the wrongly-ENABLED case) ──');

// The defect this rule was added for: Join Down stayed enabled on the final item because nothing
// tracked "last", so the refusal only arrived from the server after the click.
assert(
	'Join Down is unavailable on the study’s final segment',
	resolveJoinNeighbours(multi, { segmentId: 'g4' }).hasSuccessor === false
);
// Columns span passages too, so the last column of the last passage is the last column overall.
assert(
	'and on the final column',
	resolveJoinNeighbours(multi, { columnId: 'c2' }).hasSuccessor === false
);
assert(
	'while the first column of a two-column study can join down',
	resolveJoinNeighbours(multi, { columnId: 'c1' }).hasSuccessor === true
);

console.log('\n── reading order spans passages, and follows the structure’s nesting ──');

check('segments flatten across both passages', flattenTier(multi, 'segment').join(','), 'g1,g2,g3,g4');
check('as do columns', flattenTier(multi, 'column').join(','), 'c1,c2');
check('and sections', flattenTier(multi, 'section').join(','), 's1,s2');

console.log('\n── fails CLOSED on anything it cannot resolve ──');

// A destructive, undo-less command must never be offered when its target cannot be confirmed.
const unknown = resolveJoinNeighbours(single, { segmentId: 'does-not-exist' });
assert('an unknown id offers no join up', unknown.hasPredecessor === false);
assert('and none down', unknown.hasSuccessor === false);

const empty = resolveJoinNeighbours([], { segmentId: 'g1' });
assert('an empty study offers neither', empty.hasPredecessor === false && empty.hasSuccessor === false);

const noSelection = resolveJoinNeighbours(single, {});
assert(
	'and no selection offers neither',
	noSelection.hasPredecessor === false && noSelection.hasSuccessor === false
);

// Structure still streaming in: passages present but without a `structure` key.
const unstructured = resolveJoinNeighbours([{}], { segmentId: 'g1' });
assert(
	'a passage without structure offers neither',
	unstructured.hasPredecessor === false && unstructured.hasSuccessor === false
);

console.log('\n── REGRESSION: the owning passage id is read from `structure.passageId` ──');

// The defect that reached the user. The first version of this lookup ended `return p.id`, and
// `passagesWithText` entries have NO top-level `id` — so every join sent `passageId: undefined`,
// which `JSON.stringify` then dropped from the body entirely. The two directions failed differently:
// Join Down refused loudly (it needs the id to resolve the successor), while Join Up silently took
// `routeJoin`'s optional-passage branch and ran a within-passage join, having quietly lost the
// ability to cross a boundary at all.
//
// These assertions fail against `return p.id`, which is exactly what was missing.
check('a segment resolves to its passage', passageIdOfItem(multi, 'segment', 'g1'), 'p1');
check('one in the second passage resolves to THAT passage', passageIdOfItem(multi, 'segment', 'g3'), 'p2');
check('a section resolves', passageIdOfItem(multi, 'section', 's2'), 'p2');
check('a column resolves', passageIdOfItem(multi, 'column', 'c1'), 'p1');

// The shape contract itself, asserted directly: if a future refactor moves the id to the top level
// this still passes, but if it removes `structure.passageId` while the app depends on it, it fails.
assert(
	'the fixture has no top-level id — the real payload shape',
	multi.every((entry) => entry.id === undefined)
);
assert('yet every lookup above still resolved', passageIdOfItem(multi, 'segment', 'g4') === 'p2');

// Unresolvable items return null so callers can refuse. `joinBody` throws on null rather than
// sending a request without a passage — the silent-degradation path is closed deliberately.
check('an unknown id resolves to null', passageIdOfItem(multi, 'segment', 'nope'), null);
check('as does a wrong-tier lookup', passageIdOfItem(multi, 'column', 'g1'), null);
check('and an empty study', passageIdOfItem([], 'segment', 'g1'), null);

console.log('\n── a single-item study can be joined in neither direction ──');

const lonely = [passage([col('oc', [sec('os', [seg('og')])])])];
const only = resolveJoinNeighbours(lonely, { segmentId: 'og' });
assert('no predecessor', only.hasPredecessor === false);
assert('no successor', only.hasSuccessor === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
