/**
 * Verify sequence-scope resolution for the five cross-boundary commands (SERIES_PLAN §8).
 *
 * §8's central obstacle is that Join Column / Join Section / Join Segment / Move Text Up / Move Text
 * Down are all scoped to ONE passage — seven separate sites assume it, down to a guard string reading
 * "Cannot join the first segment in a passage". `resolveScope()` replaces that question with "what
 * precedes this item in the whole sequence, and may we reach it?".
 *
 * The properties pinned here are the ones a passage-scoped implementation gets wrong:
 *   - an item first in its passage but NOT first in the sequence has a target, across the boundary;
 *   - an item first in the sequence has none, and that refusal is permanent;
 *   - an ineligible seam refuses with its own reason and never says "yet" (§11);
 *   - the same seam is judged identically from both directions.
 *
 * ⚠️ This is the pure decision layer. It opens no database and does NOT prove that the five commands
 * consult it — that is the endpoints' job, and until they do, this verifies a capability rather than
 * a behaviour. Said plainly because a verifier implying more reach than it has is the failure
 * COMPLIANCE.md §1.8 records.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-sequence-scope.mjs
 */

import {
	resolveScope,
	flattenSequence,
	isPassageSeamEligible,
	classifyPassageSeam
} from '../src/lib/utils/sequenceScope.js';
// Imported so the COMPOSITION of scope resolution and boundary arithmetic can be pinned here, which
// is what Join Segment actually performs. The two are verified independently elsewhere.
import { planBoundaryShift, countVerses } from '../src/lib/utils/boundaryMove.js';

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

/** Word id in the real format. */
const w = (book, chapter, verse, word = 1) =>
	`${book}-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-${String(word).padStart(3, '0')}`;

const seg = (id, wordId) => ({ id, startingWordId: wordId });
const sec = (id, wordId, segments) => ({ id, startingWordId: wordId, segments });
const col = (id, wordId, sections) => ({ id, startingWordId: wordId, sections });

/** A passage row as Drizzle returns it (bookId, not book). */
const row = (id, bookId, fromChapter, fromVerse, toChapter, toVerse, bookName) => ({
	id,
	testament: 'NT',
	bookId,
	bookName,
	fromChapter,
	fromVerse,
	toChapter,
	toVerse
});

// Romans 1–2 then Romans 3–4: contiguous, since Rom 2 has 29 verses and part two starts at 3:1.
const romansOneTwo = row('p1', 'RO', 1, 1, 2, 29, 'Romans');
const romansThreeFour = row('p2', 'RO', 3, 1, 4, 25, 'Romans');

const contiguousSequence = [
	{
		passageId: 'p1',
		passage: romansOneTwo,
		tree: [
			col('c1', w('RO', 1, 1), [
				sec('s1', w('RO', 1, 1), [seg('g1', w('RO', 1, 1)), seg('g2', w('RO', 2, 1))])
			])
		]
	},
	{
		passageId: 'p2',
		passage: romansThreeFour,
		tree: [
			col('c2', w('RO', 3, 1), [
				sec('s2', w('RO', 3, 1), [seg('g3', w('RO', 3, 1)), seg('g4', w('RO', 4, 1))])
			])
		]
	}
];

console.log('\n── seam eligibility is borrowed from the run predicate (§4, §8) ──');

assert('Rom 1–2 → Rom 3–4 is contiguous', isPassageSeamEligible(romansOneTwo, romansThreeFour));
check('and classified as such', classifyPassageSeam(romansOneTwo, romansThreeFour), 'contiguous');

// Ephesians → Philippians: the Prison Epistles case §8 says is permanently ineligible.
const eph = row('e1', 'EPH', 6, 1, 6, 24, 'Ephesians');
const phil = row('f1', 'PHP', 1, 1, 1, 30, 'Philippians');
check('different books is its own kind', classifyPassageSeam(eph, phil), 'different-books');
assert('and is not eligible', !isPassageSeamEligible(eph, phil));

// A gap: Rom 1–2 then Rom 5–6, missing chapters 3 and 4.
const romFiveSix = row('p9', 'RO', 5, 1, 6, 23, 'Romans');
check('a gap is a gap', classifyPassageSeam(romansOneTwo, romFiveSix), 'gap');

// Overlap: Rom 1–3 then Rom 3–5, with chapter 3 in both. Q40, ratified as ineligible.
const romOneThree = row('p7', 'RO', 1, 1, 3, 31, 'Romans');
const romThreeFive = row('p8', 'RO', 3, 1, 5, 21, 'Romans');
check('overlap is its own third state', classifyPassageSeam(romOneThree, romThreeFive), 'overlap');
assert('and is excluded', !isPassageSeamEligible(romOneThree, romThreeFive));

console.log('\n── flattening keeps passage identity, and does not re-sort across passages ──');

const flat = flattenSequence(contiguousSequence, 'segment');
check('every segment appears once', flat.length, 4);
check('in sequence then word order', flat.map((e) => e.id).join(','), 'g1,g2,g3,g4');

// ⚠️ The check above does NOT test the sort: the fixture is already stored in order, so removing the
// sort entirely leaves it passing. Found by mutation testing — deleting the `local.sort(...)` line
// kept all 54 assertions green, which made the sort's own assertion vacuous in exactly the way
// COMPLIANCE.md §1.8 describes. This fixture stores its segments BACKWARDS, so only a real sort can
// produce the right answer.
const unsortedSequence = [
	{
		passageId: 'u1',
		passage: romansOneTwo,
		tree: [
			col('uc', w('RO', 1, 1), [
				// Stored 2:1 before 1:1 — the order a DB row scan may legitimately return.
				sec('us', w('RO', 1, 1), [seg('later', w('RO', 2, 1)), seg('earlier', w('RO', 1, 1))])
			])
		]
	}
];
check(
	'segments are ordered by word id, not by stored order',
	flattenSequence(unsortedSequence, 'segment')
		.map((e) => e.id)
		.join(','),
	'earlier,later'
);
// And the consequence that matters: "previous" must mean canonically previous, so a join folds into
// the right neighbour even when the rows arrive out of order.
check(
	'so “previous” resolves canonically, not by storage order',
	resolveScope({
		sequence: unsortedSequence,
		granularity: 'segment',
		itemId: 'later',
		direction: 'previous'
	}).target.id,
	'earlier'
);
check('the first two belong to passage 1', flat[1].passageId, 'p1');
check('the last two to passage 2', flat[2].passageId, 'p2');
check('and the index tracks the passage', flat[2].passageIndex, 1);

// Granularity is a parameter, not three near-copies of the walk.
check('sections flatten to two', flattenSequence(contiguousSequence, 'section').length, 2);
check('columns flatten to two', flattenSequence(contiguousSequence, 'column').length, 2);
check(
	'a section entry carries its column',
	flattenSequence(contiguousSequence, 'section')[0].column.id,
	'c1'
);

console.log('\n── §8: an item first in its PASSAGE still has a previous item in the SEQUENCE ──');

// This is the whole point. `g3` is the first segment of passage 2, so every passage-scoped guard in
// the codebase would refuse it with "Cannot join the first segment in a passage" — a sentence that is
// false here, because Rom 2:1 precedes it and the seam abuts.
const acrossBack = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g3',
	direction: 'previous'
});
assert('the join is permitted', acrossBack.ok);
check('the target is the last segment of the PREVIOUS passage', acrossBack.target.id, 'g2');
assert('and it is reported as crossing a boundary', acrossBack.crossesBoundary);
check('with no refusal reason', acrossBack.reason, null);

// The mirror: the last segment of passage 1 moving forwards.
const acrossForward = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g2',
	direction: 'next'
});
assert('moving forward across the seam is permitted too', acrossForward.ok);
check('and lands on the first segment of the next passage', acrossForward.target.id, 'g3');
assert('also flagged as crossing', acrossForward.crossesBoundary);

console.log('\n── an operation inside one passage is NOT flagged as crossing ──');

const inside = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g2',
	direction: 'previous'
});
assert('it is permitted', inside.ok);
check('its target is the sibling segment', inside.target.id, 'g1');
assert(
	'and crossesBoundary is false, so the caller adjusts no passage ranges',
	inside.crossesBoundary === false
);
check('no seam was involved', inside.seamKind, null);

console.log('\n── the SAME seam is judged identically from both directions ──');

// The property most likely to be got wrong, and the most confusing failure if it is: classifying the
// seam in gesture order rather than sequence order makes Move Text Down legal exactly where Move Text
// Up is illegal, at one and the same boundary. Asserted on an ineligible seam, where the asymmetry
// would actually show.
const bookBoundarySequence = [
	{
		passageId: 'e1',
		passage: eph,
		tree: [col('ec', w('EPH', 6, 1), [sec('es', w('EPH', 6, 1), [seg('eg', w('EPH', 6, 1))])])]
	},
	{
		passageId: 'f1',
		passage: phil,
		tree: [col('fc', w('PHP', 1, 1), [sec('fs', w('PHP', 1, 1), [seg('fg', w('PHP', 1, 1))])])]
	}
];

const backwards = resolveScope({
	sequence: bookBoundarySequence,
	granularity: 'segment',
	itemId: 'fg',
	direction: 'previous'
});
const forwards = resolveScope({
	sequence: bookBoundarySequence,
	granularity: 'segment',
	itemId: 'eg',
	direction: 'next'
});

assert('backwards is refused', !backwards.ok);
assert('forwards is refused', !forwards.ok);
check('both name the same seam kind', backwards.seamKind, forwards.seamKind);
check('and it is different-books', backwards.seamKind, 'different-books');
check('with identical wording either way', backwards.reason, forwards.reason);

console.log('\n── §11: the two refusals are distinguishable, and neither says “yet” ──');

// Refusal one: nothing precedes this anywhere in the sequence.
const atStart = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g1',
	direction: 'previous'
});
assert('the very first item is refused', !atStart.ok);
check('with no seam kind, because no seam was reached', atStart.seamKind, null);
assert('and it says nothing precedes it', /Nothing precedes/.test(atStart.reason));

// Refusal two: a neighbour exists, but across an ineligible seam. Different cause, different words.
assert('the ineligible-seam refusal names the books', /Ephesians/.test(backwards.reason));
assert('and mentions adjacency in Scripture', /adjacent in Scripture/.test(backwards.reason));
assert('the two refusals are worded differently', atStart.reason !== backwards.reason);

// The §11 rule that a permanently dead seam must never be described as "not yet". Every refusal this
// module produces is permanent, so none of them may contain that promise.
for (const [label, result] of [
	['start of sequence', atStart],
	['different books', backwards],
	[
		'gap',
		resolveScope({
			sequence: [
				{ passageId: 'p1', passage: romansOneTwo, tree: contiguousSequence[0].tree },
				{ passageId: 'p9', passage: romFiveSix, tree: contiguousSequence[1].tree }
			],
			granularity: 'segment',
			itemId: 'g3',
			direction: 'previous'
		})
	],
	[
		'overlap',
		resolveScope({
			sequence: [
				{ passageId: 'p7', passage: romOneThree, tree: contiguousSequence[0].tree },
				{ passageId: 'p8', passage: romThreeFive, tree: contiguousSequence[1].tree }
			],
			granularity: 'segment',
			itemId: 'g3',
			direction: 'previous'
		})
	]
]) {
	assert(`the ${label} refusal never promises “yet”`, !/\byet\b/i.test(result.reason ?? ''));
	assert(`the ${label} refusal gives a reason at all`, Boolean(result.reason));
}

console.log('\n── the last item has nowhere to go forwards ──');

const atEnd = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g4',
	direction: 'next'
});
assert('refused', !atEnd.ok);
assert('and says nothing follows it', /Nothing follows/.test(atEnd.reason));

console.log('\n── degenerate input is refused, never guessed at ──');

check(
	'an unknown item id is not silently the first item',
	resolveScope({ sequence: contiguousSequence, granularity: 'segment', itemId: 'nope' }).ok,
	false
);
check(
	'an empty sequence resolves nothing',
	resolveScope({ sequence: [], granularity: 'segment', itemId: 'g1' }).ok,
	false
);
check('an empty sequence flattens to nothing', flattenSequence([], 'segment').length, 0);
check('a null sequence does not throw', flattenSequence(null, 'segment').length, 0);

console.log('\n── the single-study multi-passage case §8 says is broken TODAY ──');

// §8: "A study holding Romans 1–8 and Romans 9–16 as two passages cannot Join Segment across that
// boundary today. Cross-part is therefore a generalisation of a defect that already exists one level
// down." Both passages here belong to ONE study, and the resolution is the same — which is the point
// of taking a sequence rather than a pair of parts.
const oneStudyTwoPassages = [
	{
		passageId: 'a1',
		passage: row('a1', 'RO', 1, 1, 8, 39, 'Romans'),
		tree: [col('ac', w('RO', 1, 1), [sec('as', w('RO', 1, 1), [seg('ag', w('RO', 1, 1))])])]
	},
	{
		passageId: 'a2',
		passage: row('a2', 'RO', 9, 1, 16, 27, 'Romans'),
		tree: [col('bc', w('RO', 9, 1), [sec('bs', w('RO', 9, 1), [seg('bg', w('RO', 9, 1))])])]
	}
];

const withinStudy = resolveScope({
	sequence: oneStudyTwoPassages,
	granularity: 'segment',
	itemId: 'bg',
	direction: 'previous'
});
assert('a cross-passage join within one study resolves', withinStudy.ok);
check('to the previous passage’s segment', withinStudy.target.id, 'ag');
assert('and is flagged as crossing a boundary', withinStudy.crossesBoundary);

console.log('\n── the composed cross-part Join Segment (§8: scope + boundary together) ──');

// The two modules are verified separately above and in verify-boundary-move.mjs, but Join Segment
// uses them TOGETHER, and the composition is where the meaning lives: resolveScope finds the
// predecessor across the seam, then the boundary moves so the verses follow the structure. Pinned
// here because a correct scope resolution plus a correct shift can still be wired together wrongly —
// which is exactly the class of defect that produced the duplicated-verses bug in the split endpoint.
//
// Setup mirrors crossPartJoin.js: joining part 2's first segment (g3, anchored 3:1) into part 1's
// last (g2). g3 runs until the next segment begins at 3:10 — structure has implicit extent — so the
// new boundary is that anchor, and Romans 3:1–3:9 moves to part 1.
const composed = resolveScope({
	sequence: contiguousSequence,
	granularity: 'segment',
	itemId: 'g3',
	direction: 'previous'
});
check('the predecessor is found across the seam', composed.target.id, 'g2');
check('and it lives in the earlier passage', composed.target.passageIndex, 0);
check('while the active segment is in the later one', composed.active.passageIndex, 1);

const shifted = planBoundaryShift({
	before: romansOneTwo,
	after: romansThreeFour,
	// The anchor of the segment FOLLOWING g3 inside its own passage.
	newBoundaryWordId: w('RO', 3, 10)
});
assert('the boundary shift is accepted', shifted.ok);
check(
	'part 1 now ends where the joined segment ended',
	`${shifted.before.toChapter}:${shifted.before.toVerse}`,
	'3:9'
);
check(
	'part 2 now starts after it',
	`${shifted.after.fromChapter}:${shifted.after.fromVerse}`,
	'3:10'
);
check('the earlier part received, so content moved backward', shifted.direction, 'backward');
assert(
	'and coverage is conserved, so §10.1 may still skip the export re-check',
	countVerses(romansOneTwo) + countVerses(romansThreeFour) ===
		countVerses(shifted.before) + countVerses(shifted.after)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
