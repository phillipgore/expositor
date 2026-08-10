/**
 * Verify cross-part connection classification and stub labelling (SERIES_PLAN §8 (c), phase 3).
 *
 * Phase 2 shipped Q23 strategy (b): a connection spanning two parts is deleted, with the count shown
 * first. Phase 3 is (c): keep it, and draw a stub at the edge of the part that still holds an endpoint.
 *
 * The properties that matter:
 *   - both endpoints present → a normal arc, unchanged;
 *   - one present → a stub, and the RIGHT end is identified as the present one;
 *   - neither present → not drawn at all, because widening the query to the series returns rows
 *     belonging to parts that are neither end;
 *   - each end is read from the column matching its own type (§8's Q42 requirement);
 *   - the label names the part by its position in `seriesOrder`, never by canonical order (§4).
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-connection-stubs.mjs
 */

import {
	classifyConnections,
	endpointOf,
	stubLabel,
	buildOwnershipIndex
} from '../src/lib/utils/connectionStubs.js';

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

const seg = (id, from, to) => ({
	id,
	fromType: 'segment',
	toType: 'segment',
	fromSegmentId: from,
	toSegmentId: to
});

console.log('\n── endpoints are read from the column matching their own type (§8 Q42) ──');

check('a segment end reads fromSegmentId', endpointOf(seg('k', 'a', 'b'), 'from').id, 'a');
check('and the to end reads toSegmentId', endpointOf(seg('k', 'a', 'b'), 'to').id, 'b');

// ⚠️ The trap §8 names: the two ends are independently typed, and a stale id of another type must not
// decide the answer. `fromType` is 'column' here while `fromSegmentId` still holds a value.
const crossType = {
	id: 'k2',
	fromType: 'column',
	toType: 'segment',
	fromColumnId: 'colX',
	fromSegmentId: 'STALE',
	toSegmentId: 'b'
};
check('a column-typed end reads fromColumnId', endpointOf(crossType, 'from').id, 'colX');
check('and reports its type', endpointOf(crossType, 'from').type, 'column');
assert(
	'never the stale segment id of a different type',
	endpointOf(crossType, 'from').id !== 'STALE'
);

const sectionEnd = {
	id: 'k3',
	fromType: 'section',
	toType: 'section',
	fromSectionId: 's1',
	toSectionId: 's2'
};
check('a section end reads fromSectionId', endpointOf(sectionEnd, 'from').id, 's1');

// A missing type defaults to segment, matching the schema default.
check(
	'an absent type falls back to segment',
	endpointOf({ fromSegmentId: 'z' }, 'from').type,
	'segment'
);

console.log('\n── a connection with BOTH ends present is a normal arc, unchanged ──');

const presentHere = new Set(['a', 'b', 'c']);
const bothHere = classifyConnections([seg('k', 'a', 'b')], presentHere);
check('one local connection', bothHere.local.length, 1);
check('no stubs', bothHere.stubs.length, 0);
check('nothing foreign', bothHere.foreign.length, 0);

console.log('\n── one end present → a stub, with the present end identified correctly ──');

// The `from` end is here; the `to` end moved to another part.
const fromHere = classifyConnections([seg('k', 'a', 'GONE')], presentHere);
check('it is a stub, not a local arc', fromHere.stubs.length, 1);
check('and not dropped as foreign', fromHere.foreign.length, 0);
check('the present end is `from`', fromHere.stubs[0].presentEnd, 'from');
check('and the absent end is `to`', fromHere.stubs[0].absentEnd, 'to');

// The mirror: the `to` end is here instead. Asserted because getting this backwards would draw the stub
// from a point that is not on the page.
const toHere = classifyConnections([seg('k', 'GONE', 'b')], presentHere);
check('the present end is `to`', toHere.stubs[0].presentEnd, 'to');
check('and the absent end is `from`', toHere.stubs[0].absentEnd, 'from');

console.log('\n── neither end present → not drawn at all ──');

// ⚠️ This case exists BECAUSE phase 3 widens the connection query from one study to the whole series.
// Once widened it returns rows belonging to parts that are neither end of this page, and without this
// third outcome each would be drawn as a stub on every part of the series.
const neither = classifyConnections([seg('k', 'GONE1', 'GONE2')], presentHere);
check('no local arc', neither.local.length, 0);
check('no stub', neither.stubs.length, 0);
check('classified as foreign', neither.foreign.length, 1);

console.log('\n── mixed input is separated correctly in one pass ──');

const mixed = classifyConnections(
	[
		seg('local1', 'a', 'b'),
		seg('stub1', 'c', 'GONE'),
		seg('stub2', 'GONE', 'a'),
		seg('foreign1', 'X', 'Y')
	],
	presentHere
);
check('one local', mixed.local.length, 1);
check('two stubs', mixed.stubs.length, 2);
check('one foreign', mixed.foreign.length, 1);
check(
	'and every connection is accounted for exactly once',
	mixed.local.length + mixed.stubs.length + mixed.foreign.length,
	4
);

console.log(
	'\n── a cross-TYPE connection can stub too (§8: “a cross-column connection at a boundary”) ──'
);

const colStub = classifyConnections([crossType], new Set(['colX']));
check('the column end is recognised as present', colStub.stubs.length, 1);
check('with `from` as the present end', colStub.stubs[0].presentEnd, 'from');

// And the complement: with only the segment end present, the same row stubs from the other side.
const segStub = classifyConnections([crossType], new Set(['b']));
check('the segment end alone also stubs', segStub.stubs.length, 1);
check('from the `to` side', segStub.stubs[0].presentEnd, 'to');

console.log('\n── an endpoint with a NULL id is never treated as present ──');

// A row whose typed column is null must not match an empty-string or undefined id in the present set.
const nullEnd = {
	id: 'k',
	fromType: 'segment',
	toType: 'segment',
	fromSegmentId: null,
	toSegmentId: 'b'
};
const nullResult = classifyConnections([nullEnd], new Set(['b']));
check('it stubs from the end that has an id', nullResult.stubs[0].presentEnd, 'to');
check('and is not mistaken for a local arc', nullResult.local.length, 0);

// ⚠️ The case the `Boolean(id)` guard actually exists for, added after mutation testing showed the guard
// could be removed with everything still green. `Set.has(null)` is TRUE when the set contains null, and a
// null can enter the present set from any row whose typed column is empty. Without the guard this
// connection — which reaches out of the part — would be classified as a purely local arc and drawn as a
// complete link to a segment that is not there.
const presentWithNull = new Set(['b', null]);
const nullTrap = classifyConnections([nullEnd], presentWithNull);
check('a null id does not count as present even when the set holds null', nullTrap.local.length, 0);
check('it is still a stub', nullTrap.stubs.length, 1);
check('from the real end', nullTrap.stubs[0].presentEnd, 'to');

// And both ends null: nothing is present, so nothing is drawn.
const bothNull = classifyConnections(
	[{ id: 'k', fromType: 'segment', toType: 'segment', fromSegmentId: null, toSegmentId: null }],
	presentWithNull
);
check('a connection with two null ends is foreign, not local', bothNull.foreign.length, 1);
check('and produces no stub', bothNull.stubs.length, 0);

console.log('\n── the label names the part by its seriesOrder position (§4), with its title ──');

// Supplied in an order that disagrees with array position, as a deliberately re-ordered series would be:
// the caller passes parts already sorted by seriesOrder, so position is index + 1.
const orderedParts = [
	{ id: 'p1', title: 'Romans 1–2' },
	{ id: 'p2', title: 'Romans 3–4' },
	{ id: 'p3', title: 'Romans 5–6' }
];

check(
	'the second part is "Part 2" with its title',
	stubLabel({ orderedParts, partId: 'p2' }),
	'Continues in Part 2: Romans 3–4'
);
check(
	'the first is Part 1',
	stubLabel({ orderedParts, partId: 'p1' }),
	'Continues in Part 1: Romans 1–2'
);
check(
	'a part with no title still gets its number',
	stubLabel({ orderedParts: [{ id: 'x', title: null }], partId: 'x' }),
	'Continues in Part 1'
);

// An unresolvable part gets a vague label rather than suppressing the stub: the arc is still true —
// something DOES continue off this page — and phase 2's alternative was silently losing the connection.
check(
	'an unknown part is still labelled, not dropped',
	stubLabel({ orderedParts, partId: 'nope' }),
	'Continues in another part'
);
check(
	'and so is a null part id',
	stubLabel({ orderedParts, partId: null }),
	'Continues in another part'
);
check(
	'and an empty parts list',
	stubLabel({ orderedParts: [], partId: 'p1' }),
	'Continues in another part'
);

console.log('\n── ownership index maps every structure level to its part ──');

const index = buildOwnershipIndex([
	{
		id: 'partA',
		columns: [{ id: 'cA', sections: [{ id: 'sA', segments: [{ id: 'gA1' }, { id: 'gA2' }] }] }]
	},
	{
		id: 'partB',
		columns: [{ id: 'cB', sections: [{ id: 'sB', segments: [{ id: 'gB1' }] }] }]
	}
]);

check('a segment resolves to its part', index.get('gA2'), 'partA');
check('a section does too', index.get('sB'), 'partB');
check('and a column', index.get('cA'), 'partA');
check('an unknown id resolves to nothing', index.get('nope'), undefined);
check('every id is indexed', index.size, 7);

// Degenerate shapes must not throw: the study layout builds this from streamed data that may be partial.
check('an empty list yields an empty index', buildOwnershipIndex([]).size, 0);
check('a null list does too', buildOwnershipIndex(null).size, 0);
check('a part with no columns is skipped', buildOwnershipIndex([{ id: 'p' }]).size, 0);
check(
	'a column with no sections is still indexed itself',
	buildOwnershipIndex([{ id: 'p', columns: [{ id: 'c' }] }]).get('c'),
	'p'
);

console.log('\n── the end-to-end shape: a stub knows which part to name ──');

// This is the composition the overlay performs: classify against what is mounted, then resolve the
// absent endpoint's id through the ownership index to get a label.
const conn = seg('k', 'gA1', 'gB1');
const onPartA = classifyConnections([conn], new Set(['cA', 'sA', 'gA1', 'gA2']));
check('it stubs on part A', onPartA.stubs.length, 1);
const absent = endpointOf(onPartA.stubs[0].connection, onPartA.stubs[0].absentEnd);
check('the absent endpoint is gB1', absent.id, 'gB1');
check('which the index places in partB', index.get(absent.id), 'partB');
check(
	'so the label names part 2',
	stubLabel({
		orderedParts: [
			{ id: 'partA', title: 'A' },
			{ id: 'partB', title: 'B' }
		],
		partId: index.get(absent.id)
	}),
	'Continues in Part 2: B'
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
