/**
 * Verify extent classification when a serialized study's passage list is edited
 * (SERIES_PLAN §5, §8).
 *
 * ## The defect these checks pin
 *
 * Range editing was originally fed straight to `diffSeams()`, which answers a DIFFERENT question:
 * "where are the boundaries?" It has no vocabulary for "these verses are gone", so it answered the
 * only question it knows. Shrinking Matthew 1–8 to Matthew 1–5 produced `join p5 ← [p6,p7,p8]` —
 * and a join is verse-conservative, so chapters 6–8 would have STAYED in the study while the
 * operation reported success. Shrinking from the front proposed `join p1 ← [p2,p3,p4]`, which keeps
 * the dropped chapters and discards part 1's title as well.
 *
 * Neither raised a refusal. These checks exist so that silence cannot return.
 *
 * ## What matters most here
 *
 * `deletedParts` is the destructive output: every part named there loses its structure, notes and
 * commentary, and Q35 leaves no undo. So the assertions are as much about parts that must NOT be
 * deleted (the one-verse overlap) as about those that must.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-extent.mjs
 */

import {
	classifyExtent,
	formatExtentReference,
	projectExtent
} from '../src/lib/utils/seriesExtent.js';

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

/** Real Matthew verse counts, so positions are judged against the data the app uses. */
const MT = {
	1: 25,
	2: 23,
	3: 17,
	4: 25,
	5: 48,
	6: 34,
	7: 29,
	8: 34,
	9: 38,
	10: 42,
	11: 30,
	12: 50
};

/** A part covering exactly one chapter of Matthew. */
const part = (n) => ({
	id: `p${n}`,
	seriesOrder: n - 1,
	title: `Matthew ${n}`,
	passages: [
		{
			testament: 'NT',
			bookId: 'MT',
			bookName: 'Matthew',
			fromChapter: n,
			fromVerse: 1,
			toChapter: n,
			toVerse: MT[n]
		}
	]
});

/** The edited passage list, as the form would produce it. */
const want = (fromChapter, fromVerse, toChapter, toVerse) => [
	{ testament: 'NT', book: 'MT', bookName: 'Matthew', fromChapter, fromVerse, toChapter, toVerse }
];

const ids = (list) => list.map((p) => p.id ?? p.part.id);

const eight = [1, 2, 3, 4, 5, 6, 7, 8].map(part);

console.log('\n── an unchanged extent touches nothing ──');

const noop = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 8, MT[8]) });
assert('reported unchanged', noop.unchanged);
check('every part kept', ids(noop.keptParts).length, 8);
check('nothing narrowed', noop.narrowedParts.length, 0);
check('nothing deleted', noop.deletedParts.length, 0);
check('nothing added', noop.addedRanges.length, 0);

console.log('\n── shrinking from the BACK deletes parts; it does not join them ──');

// The original defect: this produced `join p5 ← [p6,p7,p8]`, which would have KEPT chapters 6–8.
const back = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 5, MT[5]) });
assert('not unchanged', !back.unchanged);
check('chapters 1–5 survive untouched', ids(back.keptParts), ['p1', 'p2', 'p3', 'p4', 'p5']);
check('chapters 6–8 are DELETED', ids(back.deletedParts), ['p6', 'p7', 'p8']);
check('nothing is narrowed', back.narrowedParts.length, 0);
check('and nothing is added', back.addedRanges.length, 0);
check('the deleted part names what it covered', back.deletedParts[0].reference, 'Matthew 6:1-34');

console.log('\n── shrinking from the FRONT deletes the leading parts ──');

// The worse variant: this produced `join p1 ← [p2,p3,p4]`, keeping the dropped chapters AND
// discarding part 1's title.
const front = classifyExtent({ parts: eight, desiredPassages: want(4, 1, 8, MT[8]) });
check('chapters 1–3 are DELETED', ids(front.deletedParts), ['p1', 'p2', 'p3']);
check('chapters 4–8 survive untouched', ids(front.keptParts), ['p4', 'p5', 'p6', 'p7', 'p8']);
check('nothing is narrowed', front.narrowedParts.length, 0);

console.log('\n── a mid-chapter trim NARROWS the boundary part ──');

// Matthew 5 keeps verses 1–20; 21–48 leave. The part survives and must be narrowed, never deleted —
// deleting it would destroy structure anchored in verses the user is keeping.
const mid = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 5, 20) });
check('part 5 is narrowed', ids(mid.narrowedParts), ['p5']);
check('to its surviving verses', mid.narrowedParts[0].reference, 'Matthew 5:1-20');
check('parts 1–4 are untouched', ids(mid.keptParts), ['p1', 'p2', 'p3', 'p4']);
check('parts 6–8 are deleted', ids(mid.deletedParts), ['p6', 'p7', 'p8']);
assert(
	'and the narrowing carries an old→new pair for analyzeEdit',
	mid.narrowedParts[0].changes.length === 1 &&
		mid.narrowedParts[0].changes[0].old.toVerse === 48 &&
		mid.narrowedParts[0].changes[0].next.toVerse === 20
);

console.log('\n── a ONE-VERSE overlap narrows; it must never delete ──');

// ⚠️ The costly off-by-one. If `intersect()` treated a single shared verse as no overlap, part 5
// would be classified for DELETION — destroying every column, note and comment in it, over a
// boundary the user moved by one verse.
const sliver = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 5, 1) });
check('part 5 survives, narrowed', ids(sliver.narrowedParts), ['p5']);
check('to exactly one verse', sliver.narrowedParts[0].reference, 'Matthew 5:1');
assert('and is NOT among the deleted', !ids(sliver.deletedParts).includes('p5'));

console.log('\n── growing the study reports ADDED text, not a division ──');

// ⚠️ Reporting the addition is NOT enough — it must be ATTACHED to a part, because the executor
// acts on per-part range CHANGES. Left merely "reported", growing Matthew 1–8 to 1–12 changed
// nothing and returned success: the added chapters were silently dropped.
const grow = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 12, MT[12]) });
check('nothing is deleted', grow.deletedParts.length, 0);
check('the LAST part absorbs the new chapters', ids(grow.narrowedParts), ['p8']);
check(
	'extending its range to the new end',
	formatExtentReference(grow.narrowedParts[0].changes[0].next),
	'Matthew 8:1-12:50'
);
// Nothing left dangling: an unattached range is text no write would ever perform.
check('and no range is left unattached', grow.addedRanges.length, 0);
check('the other seven parts are untouched', ids(grow.keptParts).length, 7);

// Verse-level, not chapter-level: a chapter-granular subtraction would miss this entirely.
const inChapter = classifyExtent({
	parts: [
		{
			id: 'x',
			seriesOrder: 0,
			title: 'Matthew 5:1-20',
			passages: [
				{
					testament: 'NT',
					bookId: 'MT',
					bookName: 'Matthew',
					fromChapter: 5,
					fromVerse: 1,
					toChapter: 5,
					toVerse: 20
				}
			]
		}
	],
	desiredPassages: want(5, 1, 5, 48)
});
check('extending inside one chapter is detected', ids(inChapter.narrowedParts), ['x']);
check(
	'and widens the part to the new verse',
	formatExtentReference(inChapter.narrowedParts[0].changes[0].next),
	'Matthew 5:1-48'
);
check('with nothing unattached', inChapter.addedRanges.length, 0);

// Growing at BOTH ends: the leading range attaches to the first part, the trailing one to the last.
// Each part must take the extension it ABUTS — attaching both to one part would make that part
// cover verses the user never associated with it.
const bothEnds = classifyExtent({
	parts: [part(4), part(5)],
	desiredPassages: want(2, 1, 7, MT[7])
});
check('both parts take an extension', ids(bothEnds.narrowedParts).sort(), ['p4', 'p5']);
const grown4 = bothEnds.narrowedParts.find((n) => n.part.id === 'p4');
const grown5 = bothEnds.narrowedParts.find((n) => n.part.id === 'p5');
check(
	'the first grows backwards',
	formatExtentReference(grown4.changes[0].next),
	'Matthew 2:1-4:25'
);
check('the last grows forwards', formatExtentReference(grown5.changes[0].next), 'Matthew 5:1-7:29');
check('and nothing is left unattached', bothEnds.addedRanges.length, 0);

console.log('\n── §4: shrinking to a single part dissolves the series ──');

const oneLeft = classifyExtent({ parts: eight, desiredPassages: want(3, 1, 3, MT[3]) });
check('one part survives', ids(oneLeft.keptParts), ['p3']);
check('seven are deleted', oneLeft.deletedParts.length, 7);
assert('and the series dissolves', oneLeft.dissolves);
// Reported, never applied here — the endpoint writes, and the review must say so first.
assert('a full series does not dissolve', !noop.dissolves);

console.log('\n── a multi-range part survives through its remaining range ──');

const multi = classifyExtent({
	parts: [
		{
			id: 'm',
			seriesOrder: 0,
			title: 'Two passages',
			passages: [
				{
					testament: 'NT',
					bookId: 'MT',
					bookName: 'Matthew',
					fromChapter: 1,
					fromVerse: 1,
					toChapter: 1,
					toVerse: 25,
					displayOrder: 0
				},
				{
					testament: 'NT',
					bookId: 'MT',
					bookName: 'Matthew',
					fromChapter: 7,
					fromVerse: 1,
					toChapter: 7,
					toVerse: 29,
					displayOrder: 1
				}
			]
		}
	],
	desiredPassages: want(1, 1, 1, 25)
});
check('the part is not deleted', multi.deletedParts.length, 0);
check('it is narrowed', ids(multi.narrowedParts), ['m']);
check('and the departed range is named', multi.narrowedParts[0].removedRanges.length, 1);

console.log('\n── projection: the parts as they WILL BE, so division can be planned ──');

// The whole point of projecting: `diffSeams()` refuses a division question across a changed extent,
// so the extent change is applied in memory FIRST and the division is planned against the result.
// The guard is satisfied, never bypassed.
const shrinkExtent = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 6, MT[6]) });
const shrunkParts = projectExtent(eight, shrinkExtent);
check('deleted parts are gone from the projection', ids(shrunkParts), [
	'p1',
	'p2',
	'p3',
	'p4',
	'p5',
	'p6'
]);
check('and the survivors keep their ranges', shrunkParts[5].passages[0].toChapter, 6);

// A narrowed part must project its NEW bounds, not its old ones — planning a division against stale
// ranges would put a seam where the text no longer reaches.
const trimExtent = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 5, 20) });
const trimmedParts = projectExtent(eight, trimExtent);
check('a narrowed part projects its new end', trimmedParts.at(-1).passages[0].toVerse, 20);
check('and its new chapter', trimmedParts.at(-1).passages[0].toChapter, 5);

// A grown part projects its widened range, so the division sees the text that is arriving.
const growExtent = classifyExtent({ parts: eight, desiredPassages: want(1, 1, 12, MT[12]) });
const grownParts = projectExtent(eight, growExtent);
check('a grown part projects its new end', grownParts.at(-1).passages[0].toChapter, 12);

// An untouched part must come through byte-identical: the projection is a description of the edit,
// and inventing a change here would make the preview disagree with the executor.
assert('untouched parts pass through unchanged', grownParts[0] === eight[0]);

check('projecting an empty extent is a no-op', projectExtent(eight, noop).length, 8);
check('projecting nothing yields nothing', projectExtent([], noop).length, 0);

console.log('\n── degenerate inputs ──');

const empty = classifyExtent({ parts: [], desiredPassages: [] });
assert('no parts and no extent is unchanged', empty.unchanged);
check('with nothing to delete', empty.deletedParts.length, 0);
assert('and does not claim to dissolve', !empty.dissolves);

// An empty desired list means every part leaves. Reported as deletions rather than crashing, so the
// review can state it plainly instead of the form failing at save time.
const wiped = classifyExtent({ parts: eight, desiredPassages: [] });
check('emptying the passage list deletes every part', wiped.deletedParts.length, 8);
check('leaving nothing kept', wiped.keptParts.length, 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
