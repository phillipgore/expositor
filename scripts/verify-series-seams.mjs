/**
 * Verify seam diffing for re-serializing an existing series (SERIES_PLAN §5, §8).
 *
 * The properties that matter are preservation guarantees and refusals:
 *
 *   - a series recomposes to the passage list it was CREATED from, so the user edits what they
 *     typed rather than the parts it became;
 *   - re-serializing with an unchanged setting is a NO-OP — no splits, no joins, every part
 *     untouched. This is the property the whole feature rests on: an operation emitted for a part
 *     that did not need to change is an operation that can destroy the user's work in it;
 *   - a coarser setting emits joins, a finer one emits splits, and in both cases every part not at
 *     a changed seam is reported untouched;
 *   - run structure is invariant, so re-serializing never changes what can be reordered;
 *   - a multi-run series keeps the user's run ORDER through the round trip (§4: reordering permutes
 *     runs, and that arrangement is theirs).
 *
 * The Matthew case from the design discussion is pinned explicitly: Matthew 5 and Matthew 6 are one
 * rigid run, so no seam operation may ever present them as reorderable.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-seams.mjs
 */

import {
	recomposePassages,
	coalesceRanges,
	getCurrentSeams,
	getDesiredSeams,
	diffSeams,
	fingerprintParts
} from '../src/lib/utils/seriesSeams.js';
import { planSeriesParts, readDivisionRequest } from '../src/lib/utils/seriesPlanning.js';
import { computeRuns } from '../src/lib/utils/seriesRuns.js';
import { describeRuns, planRunReorder } from '../src/lib/utils/seriesReorder.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
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

/** Real Romans verse counts, so adjacency is judged against the same data the app uses. */
const ROMANS_VERSES = {
	1: 32,
	2: 29,
	3: 31,
	4: 25,
	5: 21,
	6: 23,
	7: 25,
	8: 39,
	9: 33,
	10: 21,
	11: 36,
	12: 21,
	13: 14,
	14: 23,
	15: 33,
	16: 27
};

/** A Romans part spanning whole chapters. */
const ro = (id, order, fromChapter, toChapter) => ({
	id,
	seriesOrder: order,
	title: `Romans ${fromChapter}–${toChapter}`,
	passages: [
		{
			testament: 'NT',
			book: 'RO',
			bookName: 'Romans',
			fromChapter,
			fromVerse: 1,
			toChapter,
			toVerse: ROMANS_VERSES[toChapter]
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

console.log('\n── recomposition: a series edits as the study it was created from ──');

// Romans 1–6 taught two chapters at a time. The user typed ONE passage; they must edit one.
const romans3 = [ro('a', 0, 1, 2), ro('b', 1, 3, 4), ro('c', 2, 5, 6)];
const recomposed = recomposePassages(romans3);
check('sixteen-chapter study divided in three recomposes to one passage', recomposed.length, 1);
check('starting where the first part starts', recomposed[0].fromChapter, 1);
check('and ending where the last part ends', recomposed[0].toChapter, 6);
check('with the original opening verse', recomposed[0].fromVerse, 1);
check('and the original closing verse', recomposed[0].toVerse, ROMANS_VERSES[6]);

// Prison Epistles: four books, three permanently ineligible boundaries (§4's motivating example).
const prison = [
	book('e', 0, 'EP', 'Ephesians', 6, 24),
	book('p', 1, 'PH', 'Philippians', 4, 23),
	book('c', 2, 'CO', 'Colossians', 4, 18),
	book('n', 3, 'PN', 'Philemon', 1, 25)
];
check('four separate books recompose to four passages', recomposePassages(prison).length, 4);

// A gap left by a part delete must NOT be closed by recomposition — the verses are gone, and
// merging across the hole would silently put them back.
const withGap = [ro('a', 0, 1, 2), ro('c', 1, 5, 6)];
check('a gap is preserved, not silently closed', recomposePassages(withGap).length, 2);

check('an empty series recomposes to nothing', recomposePassages([]).length, 0);
check('coalescing nothing yields nothing', coalesceRanges([]).length, 0);

console.log('\n── the no-op: re-serializing an unchanged shape touches NOTHING ──');

// This is the property the feature rests on. Two chapters per part, planned from the recomposed
// passages, must reproduce exactly the parts that already exist.
const samePlan = planSeriesParts({
	passages: recomposed.map((r) => ({ ...r, book: r.book })),
	chaptersPerPart: 2,
	translationId: 'esv',
	baseTitle: 'Romans'
});
const noop = diffSeams({ parts: romans3, plannedParts: samePlan.parts });

check('no splits', noop.splits.length, 0);
check('no joins', noop.joins.length, 0);
check('no refusals', noop.refusals.length, 0);
check('every part reported untouched', noop.unchangedPartIds, ['a', 'b', 'c']);
check('and none touched', noop.touchedPartIds.length, 0);
assert('run shape preserved', noop.runShapePreserved);

console.log('\n── a FINER setting splits, and touches only the parts that divide ──');

// One chapter per part: every existing part must divide once, at its own midpoint.
const finerPlan = planSeriesParts({
	passages: recomposed,
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Romans'
});
const finer = diffSeams({ parts: romans3, plannedParts: finerPlan.parts });

check('three parts each divide once', finer.splits.length, 3);
check('no joins', finer.joins.length, 0);
check('no refusals', finer.refusals.length, 0);
check('part a divides after chapter 1', finer.splits.find((s) => s.partId === 'a').afterChapters, [
	1
]);
check('part b divides after chapter 3', finer.splits.find((s) => s.partId === 'b').afterChapters, [
	3
]);
assert('run shape preserved', finer.runShapePreserved);

// A part that already matches the desired shape must not be named at all.
const romans6 = [
	ro('a', 0, 1, 1),
	ro('b', 1, 2, 2),
	ro('c', 2, 3, 3),
	ro('d', 3, 4, 5),
	ro('e', 4, 6, 6)
];
const partialPlan = planSeriesParts({
	passages: recomposePassages(romans6),
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Romans'
});
const partial = diffSeams({ parts: romans6, plannedParts: partialPlan.parts });
check('only the one oversized part is split', partial.splits.length, 1);
check('and it is the right one', partial.splits[0].partId, 'd');
check('the four already-correct parts are untouched', partial.unchangedPartIds, [
	'a',
	'b',
	'c',
	'e'
]);

console.log('\n── a COARSER setting joins, collapsing consecutive seams into one group ──');

// Six one-chapter parts, re-serialized at three chapters per part: two joins of three parts each.
const coarserPlan = planSeriesParts({
	passages: recomposePassages(romans6),
	chaptersPerPart: 3,
	translationId: 'esv',
	baseTitle: 'Romans'
});
const coarser = diffSeams({ parts: romans6, plannedParts: coarserPlan.parts });

check('no splits', coarser.splits.length, 0);
check('two join groups', coarser.joins.length, 2);
check('the first keeps part a', coarser.joins[0].keepId, 'a');
check('absorbing b and c in order', coarser.joins[0].absorbIds, ['b', 'c']);
check('no refusals', coarser.refusals.length, 0);
assert('run shape preserved', coarser.runShapePreserved);

console.log('\n── §4: chronological parts are RIGID — Matthew 6 can never precede Matthew 5 ──');

// The case from the design discussion, pinned so no future change can reintroduce it.
const mt = (id, order, chapter, lastVerse) => ({
	id,
	seriesOrder: order,
	title: `Matthew ${chapter}`,
	passages: [
		{
			testament: 'NT',
			book: 'MT',
			bookName: 'Matthew',
			fromChapter: chapter,
			fromVerse: 1,
			toChapter: chapter,
			toVerse: lastVerse
		}
	]
});
const matthew = [mt('m5', 0, 5, 48), mt('m6', 1, 6, 34)];

check('Matthew 5 then Matthew 6 is ONE run', computeRuns(matthew).length, 1);
check('so there is nothing to reorder', describeRuns(matthew).reorderable, false);
assert(
	'and a reorder is refused outright',
	!planRunReorder({ parts: matthew, fromIndex: 1, toIndex: 0 }).ok
);

// Re-serializing must not change that. Joining the two into one part still leaves one run.
const matthewJoined = planSeriesParts({
	passages: recomposePassages(matthew),
	chaptersPerPart: 2,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
const matthewDiff = diffSeams({ parts: matthew, plannedParts: matthewJoined.parts });
assert('re-serializing preserves run shape', matthewDiff.runShapePreserved);
check('the resulting shape is still one run', computeRuns(matthewJoined.parts).length, 1);
check('and still not reorderable', describeRuns(matthewJoined.parts).reorderable, false);

// ⚠️ These two fixtures exist because a NAIVE adjacency rule — "same book, next chapter" — passes
// every whole-chapter test above. Both cases below distinguish it from the real predicate, which
// consults actual verse counts. Without them, `abuts()` could be quietly re-implemented (rather
// than borrowed from `classifyBoundary()`) and nothing would notice, which is the fifth-copy
// divergence the module docblock warns about.

// A part ending MID-CHAPTER, with the next part resuming at the very next verse. Genuinely
// contiguous; the naive rule calls it a gap because the chapter number did not advance.
const midChapter = [
	{
		id: 'x',
		seriesOrder: 0,
		title: 'Romans 1:1–2:15',
		passages: [
			{
				testament: 'NT',
				book: 'RO',
				bookName: 'Romans',
				fromChapter: 1,
				fromVerse: 1,
				toChapter: 2,
				toVerse: 15
			}
		]
	},
	{
		id: 'y',
		seriesOrder: 1,
		title: 'Romans 2:16–3:31',
		passages: [
			{
				testament: 'NT',
				book: 'RO',
				bookName: 'Romans',
				fromChapter: 2,
				fromVerse: 16,
				toChapter: 3,
				toVerse: 31
			}
		]
	}
];
check('a mid-chapter seam is contiguous: ONE run', computeRuns(midChapter).length, 1);
check('and it is a real seam', getCurrentSeams(midChapter).length, 1);
check('recomposing merges it back into one passage', recomposePassages(midChapter).length, 1);

// A part ending BEFORE its chapter's last verse, with the next starting at the next chapter.
// Romans 2 has 29 verses, so ending at 2:20 leaves 2:21–29 out: a gap, not a continuation. The
// naive rule calls it contiguous because 3 === 2 + 1 — the exact Matthew 5:48 mistake.
const truncated = [
	{
		id: 'x',
		seriesOrder: 0,
		title: 'Romans 1–2:20',
		passages: [
			{
				testament: 'NT',
				book: 'RO',
				bookName: 'Romans',
				fromChapter: 1,
				fromVerse: 1,
				toChapter: 2,
				toVerse: 20
			}
		]
	},
	{
		id: 'y',
		seriesOrder: 1,
		title: 'Romans 3',
		passages: [
			{
				testament: 'NT',
				book: 'RO',
				bookName: 'Romans',
				fromChapter: 3,
				fromVerse: 1,
				toChapter: 3,
				toVerse: 31
			}
		]
	}
];
check('dropped verses make a GAP, not a continuation: two runs', computeRuns(truncated).length, 2);
check('so there is no seam between them', getCurrentSeams(truncated).length, 0);
check('and recomposition keeps them separate', recomposePassages(truncated).length, 2);

console.log("\n── §4: a multi-run series keeps the USER'S run order through the round trip ──");

// Philippians taught BEFORE Ephesians: a legitimate teaching choice, because no verse arithmetic
// connects two books. Re-serializing must not quietly restore canonical order.
const taughtOutOfOrder = [
	book('p', 0, 'PH', 'Philippians', 4, 23),
	book('e', 1, 'EP', 'Ephesians', 6, 24)
];
const roundTripped = recomposePassages(taughtOutOfOrder);
check('recomposes to two passages', roundTripped.length, 2);
check('Philippians still first', roundTripped[0].book, 'PH');
check('Ephesians still second', roundTripped[1].book, 'EP');

const replanned = planSeriesParts({
	passages: roundTripped,
	translationId: 'esv',
	baseTitle: 'Prison Epistles',
	chaptersPerPassage: [0, 0]
});
check(
	'and the replanned series keeps that order',
	replanned.parts.map((p) => p.passages[0].book),
	['PH', 'EP']
);

// Run boundaries are never offered as seams: joining across one is refused by planPartJoin(), so
// emitting it here would produce an operation the endpoint rejects at commit.
check('a four-book series has no intra-run seams', getCurrentSeams(prison).length, 0);
const prisonDiff = diffSeams({
	parts: prison,
	plannedParts: planSeriesParts({
		passages: recomposePassages(prison),
		translationId: 'esv',
		baseTitle: 'Prison Epistles',
		chaptersPerPassage: [0, 0, 0, 0]
	}).parts
});
check('so nothing is joined across book boundaries', prisonDiff.joins.length, 0);
check('and nothing is split', prisonDiff.splits.length, 0);
check('every part untouched', prisonDiff.unchangedPartIds.length, 4);

console.log('\n── the staleness fingerprint notices what a timestamp would miss ──');

const before = fingerprintParts(romans3);
check('stable across repeated calls', fingerprintParts(romans3), before);
check(
	'and independent of the order rows arrive in',
	fingerprintParts([romans3[2], romans3[0], romans3[1]]),
	before
);

// The mutation most likely to invalidate a plan: someone splits a part in another tab. This is
// exactly the case `study_series.updatedAt` would miss, because Split Part writes part rows.
const afterSplit = [ro('a', 0, 1, 1), ro('x', 1, 2, 2), ro('b', 2, 3, 4), ro('c', 3, 5, 6)];
assert('a split elsewhere changes the fingerprint', fingerprintParts(afterSplit) !== before);

// A range change with no change to part identity must also be caught.
const afterRangeChange = [ro('a', 0, 1, 3), ro('b', 1, 4, 4), ro('c', 2, 5, 6)];
assert('a moved boundary changes it too', fingerprintParts(afterRangeChange) !== before);

// A pure reorder changes seriesOrder and nothing else; the plan is still stale.
const afterReorder = [
	{ ...prison[1], seriesOrder: 0 },
	{ ...prison[0], seriesOrder: 1 },
	prison[2],
	prison[3]
];
assert('a reorder changes it as well', fingerprintParts(afterReorder) !== fingerprintParts(prison));

console.log('\n── an extent change is REFUSED, never answered as a division ──');

// ⚠️ The silent-wrong-answer this guard exists to stop. Shrinking Matthew 1–8 to Matthew 1–5 once
// produced `join p5 ← [p6,p7,p8]` — and a join COALESCES ranges, so chapters 6–8 would have stayed
// in the study while the save reported success. The user asked for them to be gone.
const mtChapterPart = (n, order, lastVerse) => ({
	id: `m${n}`,
	seriesOrder: order,
	title: `Matthew ${n}`,
	passages: [
		{
			testament: 'NT',
			book: 'MT',
			bookName: 'Matthew',
			fromChapter: n,
			fromVerse: 1,
			toChapter: n,
			toVerse: lastVerse
		}
	]
});
const MT_VERSES = { 1: 25, 2: 23, 3: 17, 4: 25, 5: 48, 6: 34, 7: 29, 8: 34 };
const mtParts = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => mtChapterPart(n, i, MT_VERSES[n]));

const shrunk = planSeriesParts({
	passages: [
		{
			testament: 'NT',
			book: 'MT',
			bookName: 'Matthew',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 5,
			toVerse: MT_VERSES[5]
		}
	],
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
const shrinkDiff = diffSeams({ parts: mtParts, plannedParts: shrunk.parts });

check('a shrink emits NO joins', shrinkDiff.joins.length, 0);
check('and no splits', shrinkDiff.splits.length, 0);
check('it refuses instead', shrinkDiff.refusals.length, 1);
assert(
	'naming the passage change as the reason',
	shrinkDiff.refusals[0].includes('passages of this study changed')
);
// Nothing may be reported as touched, because nothing is being done.
check('and touches no part', shrinkDiff.touchedPartIds.length, 0);

// Growing is refused for the same reason — previously it produced misleading per-seam refusals
// ("no part contains MT 9:1") that described a division problem rather than an extent change.
const grown = planSeriesParts({
	passages: [
		{
			testament: 'NT',
			book: 'MT',
			bookName: 'Matthew',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 12,
			toVerse: 50
		}
	],
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
const growDiff = diffSeams({ parts: mtParts, plannedParts: grown.parts });
check('a grow refuses too', growDiff.refusals.length, 1);
check('with the same extent reason', growDiff.joins.length + growDiff.splits.length, 0);

// The guard must NOT fire on a legitimate re-division, where the extent is identical and only the
// seams move. A guard that refused everything would be just as useless as one that refused nothing.
const redivided = planSeriesParts({
	passages: [
		{
			testament: 'NT',
			book: 'MT',
			bookName: 'Matthew',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 8,
			toVerse: MT_VERSES[8]
		}
	],
	chaptersPerPart: 2,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
const redivideDiff = diffSeams({ parts: mtParts, plannedParts: redivided.parts });
check('re-dividing the SAME text is allowed', redivideDiff.refusals.length, 0);
assert('and produces real work', redivideDiff.joins.length > 0);

console.log('\n── degenerate inputs ──');

check('an empty series has no seams', getCurrentSeams([]).length, 0);
check('and no desired seams', getDesiredSeams([]).length, 0);
const empty = diffSeams({ parts: [], plannedParts: [] });
check('so the diff is empty', empty.splits.length + empty.joins.length, 0);
check('a one-part series has no seams', getCurrentSeams([ro('a', 0, 1, 2)]).length, 0);

console.log('\n── a division request is read ONE way, by both edit endpoints ──');

// `analyze-edit` previews a re-division and `reserialize` applies it. Each used to keep its own
// test — `Number(chaptersPerPart) >= 1` — and pass only the chapters fields on, so balance by length
// was dropped at both. They now share `readDivisionRequest()`, pinned here.
check('no chaptersPerPart means no division', readDivisionRequest({ passages: [] }), null);
check('neither does a body with none at all', readDivisionRequest(undefined), null);
check('a zero is not a request', readDivisionRequest({ chaptersPerPart: 0 }), null);
check(
	'a chapters request reads as before, balance off',
	readDivisionRequest({ chaptersPerPart: 2, chaptersPerPassage: [1, 2] }),
	{ chaptersPerPart: 2, chaptersPerPassage: [1, 2], balanceByLength: false, targetParts: 0, balancePerPassage: [] }
);
check(
	'a balanced request keeps its target and per-passage targets',
	readDivisionRequest({
		chaptersPerPart: 1,
		chaptersPerPassage: [1, 1],
		balanceByLength: true,
		targetParts: 3,
		balancePerPassage: [2, 1]
	}),
	{ chaptersPerPart: 1, chaptersPerPassage: [1, 1], balanceByLength: true, targetParts: 3, balancePerPassage: [2, 1] }
);
// A stale target left over from an earlier choice must not leak into a chapters request.
check(
	'targets are zeroed unless balancing',
	readDivisionRequest({ chaptersPerPart: 2, balanceByLength: false, targetParts: 3, balancePerPassage: [2] }),
	{ chaptersPerPart: 2, chaptersPerPassage: [], balanceByLength: false, targetParts: 0, balancePerPassage: [] }
);
// Only a real boolean switches balance on. The form and review page send booleans; a string is
// not a request to balance.
check('the string "true" does not turn balance on', readDivisionRequest({ chaptersPerPart: 1, balanceByLength: 'true' }).balanceByLength, false);

console.log('\n── re-dividing an existing series BY LENGTH applies the balanced shape ──');

// Romans 1–6 at two chapters per part (romans3, above). Re-divided by length into two parts, the
// plan the endpoints build from the request must differ from a chapters plan and diff cleanly.
const balancedRequest = readDivisionRequest({
	chaptersPerPart: 2,
	balanceByLength: true,
	targetParts: 2
});
const balancedPlan = planSeriesParts({
	passages: recomposePassages(romans3),
	...balancedRequest,
	translationId: 'esv',
	baseTitle: ''
});
check('balancing Romans 1–6 into two gives two parts', balancedPlan.parts.length, 2);
const balancedDiff = diffSeams({ parts: romans3, plannedParts: balancedPlan.parts });
check('the diff has no refusals', balancedDiff.refusals.length, 0);
// Three parts become two: the division really changes, so the save has work to do. Before the fix
// the balance fields never reached the planner and this re-planned the unchanged 2-chapter shape.
assert('and it changes the series rather than reproducing it', balancedDiff.joins.length + balancedDiff.splits.length > 0);
assert('run shape still preserved', balancedDiff.runShapePreserved);

// The SAME request with balance stripped — what the endpoints used to plan — is the no-op.
const chaptersOnly = planSeriesParts({
	passages: recomposePassages(romans3),
	chaptersPerPart: 2,
	translationId: 'esv',
	baseTitle: ''
});
const chaptersDiff = diffSeams({ parts: romans3, plannedParts: chaptersOnly.parts });
check(
	'whereas dropping balance re-plans the shape it already has',
	chaptersDiff.joins.length + chaptersDiff.splits.length,
	0
);

console.log('\n── per-passage balance re-divides a multi-passage series within its passages ──');

// Philippians (4 ch) + Colossians (4 ch), each one part today. Balance Philippians into 2 and leave
// Colossians whole (target 1): exactly one split, inside Philippians, and never across the book seam.
const twoBooks = [book('p', 0, 'PH', 'Philippians', 4, 23), book('c', 1, 'CO', 'Colossians', 4, 18)];
const perPassage = planSeriesParts({
	passages: recomposePassages(twoBooks),
	...readDivisionRequest({
		chaptersPerPart: 1,
		chaptersPerPassage: [1, 1],
		balanceByLength: true,
		balancePerPassage: [2, 1]
	}),
	translationId: 'esv',
	baseTitle: ''
});
check('Philippians into 2 plus Colossians whole gives three parts', perPassage.parts.length, 3);
// A target of 1 means the passage WHOLE. It used to fall through to chapters-per-part and emit one
// part per chapter — a row reading "1 part" producing four.
check('Colossians stays one part', perPassage.parts.filter((p) => p.passages[0].book === 'CO').length, 1);
assert('no part spans two books', perPassage.parts.every((p) => p.passages.length === 1));
const perPassageDiff = diffSeams({ parts: twoBooks, plannedParts: perPassage.parts });
check('one split', perPassageDiff.splits.length, 1);
check('inside Philippians', perPassageDiff.splits[0]?.partId, 'p');
check('no joins across the book boundary', perPassageDiff.joins.length, 0);
check('and Colossians untouched', perPassageDiff.unchangedPartIds, ['c']);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
