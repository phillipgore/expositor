/**
 * Verify structure-transfer decisions for Split Part / Join Parts (SERIES_PLAN §8, phase 2).
 *
 * These decisions govern which `passage_column` / `passage_section` / `passage_segment` rows change
 * parent when a part is split or joined, and which `segment_connection` rows survive. Getting them
 * wrong is not a cosmetic bug: `passage_column.passage_id` is ON DELETE CASCADE, so a column left
 * behind on a passage row that is about to be deleted takes its sections, segments, headings, notes
 * and commentary with it, silently, while the operation reports success.
 *
 * ⚠️ **What this file does NOT verify.** It exercises the pure decision layer only. It does not
 * execute Drizzle, does not open a database, and therefore does NOT prove that Postgres cascades
 * as described above — only that the planner never asks for a delete that would rely on it. The
 * executor in `src/lib/server/db/seriesStructure.js` remains unverified until a split is run on
 * dev. Stated because a verifier that implies more coverage than it has is the failure COMPLIANCE
 * §1.8 records, and this feature has already shipped one vacuously-true assertion.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-structure.mjs
 */

import {
	planStructureSplit,
	planStructureMove,
	planConnectionOwnership
} from '../src/lib/utils/seriesStructurePlan.js';
import { compareWordIds } from '../src/lib/utils/wordIds.js';

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

/** Word id in the real format: BOOK-CHAPTER-VERSE-WORD, zero-padded to 3. */
const w = (chapter, verse, word = 1) =>
	`RO-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-${String(word).padStart(3, '0')}`;

const seg = (id, wordId) => ({ id, startingWordId: wordId });
const sec = (id, wordId, segments) => ({ id, startingWordId: wordId, segments });
const col = (id, wordId, sections) => ({ id, startingWordId: wordId, sections });

console.log('\n── word-id ordering (the predicate everything below rests on) ──');

assert('chapter dominates verse', compareWordIds(w(2, 1), w(1, 99)) > 0);
assert('verse breaks a chapter tie', compareWordIds(w(3, 5), w(3, 6)) < 0);
assert('word breaks a verse tie', compareWordIds(w(3, 5, 2), w(3, 5, 1)) > 0);
assert('identical ids compare equal', compareWordIds(w(4, 4), w(4, 4)) === 0);
// Documented limitation, asserted so a future "fix" is a deliberate choice, not a surprise.
assert(
	'the book segment is NOT compared (documented, load-bearing for existing data)',
	compareWordIds('RO-001-001-001', 'JN-001-001-001') === 0
);

console.log('\n── §8 Split: a column wholly past the boundary re-parents whole ──');

// Romans 1–3 split at 3:1. Two columns, cleanly either side.
const clean = [
	col('c1', w(1, 1), [sec('s1', w(1, 1), [seg('g1', w(1, 1)), seg('g2', w(2, 1))])]),
	col('c2', w(3, 1), [sec('s2', w(3, 1), [seg('g3', w(3, 1))])])
];

const cleanSplit = planStructureSplit(clean, w(3, 1));
check('one column moves', cleanSplit.moveColumns.length, 1);
check('and it is the far-side one', cleanSplit.moveColumns[0], 'c2');
check('nothing needs cloning', cleanSplit.cloneColumns.length, 0);
check('one segment moves', cleanSplit.movedSegmentIds.length, 1);
check('two segments stay', cleanSplit.stayingSegmentIds.length, 2);

console.log('\n── §8 Split: a STRADDLING column is cloned, never re-parented ──');

// One column spanning Rom 1–3, split at 3:1: the risky case.
const straddle = [
	col('c1', w(1, 1), [
		sec('s1', w(1, 1), [seg('g1', w(1, 1)), seg('g2', w(2, 1))]),
		sec('s2', w(2, 15), [seg('g3', w(2, 15)), seg('g4', w(3, 1)), seg('g5', w(3, 10))])
	])
];

const straddleSplit = planStructureSplit(straddle, w(3, 1));
assert(
	'the straddling column is NOT re-parented — that would drag part 1’s verses across',
	!straddleSplit.moveColumns.includes('c1')
);
check('it is cloned instead', straddleSplit.cloneColumns.length, 1);
check('only the straddling section is cloned', straddleSplit.cloneColumns[0].sections.length, 1);
check('cloned from the right section', straddleSplit.cloneColumns[0].sections[0].from.id, 's2');
check('two of its segments move', straddleSplit.cloneColumns[0].sections[0].segmentIds.length, 2);
assert(
	'the segment AT the boundary moves (the boundary word belongs to part 2)',
	straddleSplit.movedSegmentIds.includes('g4')
);
assert('the one after it moves too', straddleSplit.movedSegmentIds.includes('g5'));
assert('the one before it stays', straddleSplit.stayingSegmentIds.includes('g3'));
assert('the wholly-earlier section stays entirely', straddleSplit.stayingSegmentIds.includes('g1'));

console.log('\n── every segment is accounted for, exactly once ──');

// The invariant that makes silent loss impossible: a segment in neither list has been forgotten,
// and one in both would be duplicated.
const allIds = ['g1', 'g2', 'g3', 'g4', 'g5'];
const seen = [...straddleSplit.movedSegmentIds, ...straddleSplit.stayingSegmentIds];
check('no segment is lost or duplicated', seen.length, allIds.length);
check('and the sets agree', [...seen].sort().join(','), allIds.join(','));

console.log('\n── boundary at the very start moves everything (no empty first part) ──');

const allMove = planStructureSplit(straddle, w(1, 1));
check('the whole column re-parents', allMove.moveColumns.length, 1);
check('nothing is cloned — there is no straddle', allMove.cloneColumns.length, 0);
check('nothing stays', allMove.stayingSegmentIds.length, 0);

console.log('\n── a boundary past the end moves nothing ──');

const noneMove = planStructureSplit(straddle, w(16, 27));
check('no column moves', noneMove.moveColumns.length, 0);
check('no clone', noneMove.cloneColumns.length, 0);
check('every segment stays', noneMove.stayingSegmentIds.length, 5);

console.log('\n── §8 Join: every column re-parents, nothing is folded ──');

const absorbed = [
	col('d1', w(4, 1), [sec('t1', w(4, 1), [seg('h1', w(4, 1))])]),
	col('d2', w(5, 1), [sec('t2', w(5, 1), [seg('h2', w(5, 1))])])
];

const move = planStructureMove(absorbed);
check('both columns move', move.moveColumns.length, 2);
check('both segments come with them', move.movedSegmentIds.length, 2);
assert(
	'Join Parts does not collapse two columns into one — that would be Join Column',
	move.moveColumns.length === absorbed.length
);
check('an empty tree is a no-op, not a crash', planStructureMove([]).moveColumns.length, 0);

console.log('\n── Q42/§8: connection ownership reads the endpoint matching its own type ──');

const moved = { segmentIds: ['g4', 'g5'], sectionIds: [], columnIds: [] };
const target = { studyId: 'part2', seriesId: 'series1' };

const both = {
	id: 'k1',
	fromType: 'segment',
	toType: 'segment',
	fromSegmentId: 'g4',
	toSegmentId: 'g5'
};
const oneEnd = {
	id: 'k2',
	fromType: 'segment',
	toType: 'segment',
	fromSegmentId: 'g1',
	toSegmentId: 'g4'
};
const neither = {
	id: 'k3',
	fromType: 'segment',
	toType: 'segment',
	fromSegmentId: 'g1',
	toSegmentId: 'g2'
};

const owned = planConnectionOwnership([both, oneEnd, neither], moved, target);
check('a wholly-moved connection is re-owned', owned.reown.length, 1);
check('re-owned to the receiving part', owned.reown[0].studyId, 'part2');
check('and stamped with the series (migration 0046’s column)', owned.reown[0].seriesId, 'series1');
check('a one-ended connection straddles', owned.straddling.length, 1);
check('it is the right one', owned.straddling[0].id, 'k2');
check('an untouched connection is left alone', owned.unaffected.length, 1);

console.log('\n── the cross-type trap: a stale id of another type must not decide ──');

// fromType is 'column', so ONLY fromColumnId may be consulted. fromSegmentId still holds a moved
// id — the kind of stale value a previous edit leaves behind. Reading all three columns would
// wrongly call this end "moved" and silently re-own a connection that did not move.
const crossType = {
	id: 'k4',
	fromType: 'column',
	toType: 'column',
	fromColumnId: 'cX',
	toColumnId: 'cY',
	fromSegmentId: 'g4',
	toSegmentId: 'g5'
};

const crossResult = planConnectionOwnership([crossType], moved, target);
check('a column-typed connection is untouched by a segment move', crossResult.unaffected.length, 1);
check('not re-owned', crossResult.reown.length, 0);
check('not reported as straddling', crossResult.straddling.length, 0);

console.log('\n── column- and section-anchored moves are handled (§8 requires all three) ──');

const colMoved = { segmentIds: [], sectionIds: [], columnIds: ['cX', 'cY'] };
const colOwned = planConnectionOwnership([crossType], colMoved, target);
check('both column ends moved ⇒ re-owned', colOwned.reown.length, 1);

const sectionConn = {
	id: 'k5',
	fromType: 'section',
	toType: 'segment',
	fromSectionId: 's2',
	toSegmentId: 'g1'
};
const mixed = planConnectionOwnership(
	[sectionConn],
	{ segmentIds: [], sectionIds: ['s2'], columnIds: [] },
	target
);
check('a mixed-type connection with one end moved straddles', mixed.straddling.length, 1);

console.log('\n── defaults and empties ──');

// fromType/toType default to 'segment' in the schema; a row read before that default applied must
// still be classified, not silently skipped.
const untyped = { id: 'k6', fromSegmentId: 'g4', toSegmentId: 'g5' };
check(
	'a row with no explicit type falls back to segment',
	planConnectionOwnership([untyped], moved, target).reown.length,
	1
);
check('no connections is a no-op', planConnectionOwnership([], moved, target).reown.length, 0);
check(
	'a null series id is preserved as null, not undefined',
	planConnectionOwnership([both], moved, { studyId: 'p', seriesId: null }).reown[0].seriesId,
	null
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
