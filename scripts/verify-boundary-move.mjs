/**
 * Verify boundary-move range arithmetic (SERIES_PLAN §8 step 2, §10.1).
 *
 * When a structural command moves content across a part boundary, both passage ranges must move with
 * it. Getting this wrong does not throw: the structure lands in the new part while the verses stay in
 * the old one, so a part renders text it no longer owns and the other renders a gap.
 *
 * The property that matters most is **verse conservation**. §10.1 states that a boundary move cannot
 * change the export position *because* total coverage is unchanged, which is what licenses skipping
 * `validateExportLimits()` afterwards. If that ever stopped holding, the export check would be
 * skipped on the basis of a claim that had become false — so it is asserted here, against real
 * `bible.json` chapter lengths, rather than trusted.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-boundary-move.mjs
 */

import { planBoundaryShift, countVerses } from '../src/lib/utils/boundaryMove.js';
import { getVerseCount } from '../src/lib/utils/bibleData.js';

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

const w = (chapter, verse, word = 1) =>
	`RO-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-${String(word).padStart(3, '0')}`;

/** A passage row as Drizzle returns it. */
const ro = (fromChapter, fromVerse, toChapter, toVerse) => ({
	id: `p-${fromChapter}-${toChapter}`,
	testament: 'NT',
	bookId: 'RO',
	bookName: 'Romans',
	fromChapter,
	fromVerse,
	toChapter,
	toVerse
});

// Measured, not assumed — the rule this repo already learned from the Psalms fixture.
const ROM_2 = getVerseCount('NT', 'RO', 2);
const ROM_3 = getVerseCount('NT', 'RO', 3);
console.log(`\n(measured from bible.json: Romans 2 = ${ROM_2} verses, Romans 3 = ${ROM_3})`);

console.log('\n── boundary EARLIER: the later part gains verses ──');

// Rom 1–2 and Rom 3–4. Move the boundary to 2:15, so 2:15–2:29 leaves the EARLIER part... no:
// the boundary is the first word of the LATER part, so setting it to 2:15 hands 2:15–2:29 to the
// later part, growing it and shrinking the earlier one.
const before = ro(1, 1, 2, ROM_2);
const after = ro(3, 1, 4, 25);

// Named for what it does: the boundary moves EARLIER (3:1 → 2:15), so the later part gains 2:15–2:29.
const back = planBoundaryShift({ before, after, newBoundaryWordId: w(2, 15) });
assert('the shift is accepted', back.ok);
check(
	'the earlier part now ends at 2:14',
	`${back.before.toChapter}:${back.before.toVerse}`,
	'2:14'
);
check(
	'the later part now starts at 2:15',
	`${back.after.fromChapter}:${back.after.fromVerse}`,
	'2:15'
);
check('and the two abut exactly', back.before.toVerse + 1, back.after.fromVerse);

console.log('\n── verse conservation (§10.1’s licence to skip the export re-check) ──');

const oldTotal = countVerses(before) + countVerses(after);
const newTotal = countVerses(back.before) + countVerses(back.after);
check('total coverage is unchanged', newTotal, oldTotal);
check('the moved count is reported', back.versesMoved, ROM_2 - 14);
assert('and it is non-zero, so something actually moved', back.versesMoved > 0);

console.log('\n── boundary LATER: the earlier part gains verses ──');

// Same pair, boundary pushed into chapter 3: the earlier part absorbs 3:1–3:9.
const fwd = planBoundaryShift({ before, after, newBoundaryWordId: w(3, 10) });
assert('accepted', fwd.ok);
check('the earlier part now ends at 3:9', `${fwd.before.toChapter}:${fwd.before.toVerse}`, '3:9');
check(
	'the later part now starts at 3:10',
	`${fwd.after.fromChapter}:${fwd.after.fromVerse}`,
	'3:10'
);
check('coverage is still conserved', countVerses(fwd.before) + countVerses(fwd.after), oldTotal);
check('nine verses moved', fwd.versesMoved, 9);

console.log('\n── direction names where the CONTENT went, not where the boundary went ──');

// ⚠️ These two assertions were written backwards first, and the failure was informative rather than
// annoying: I had labelled `direction` by the boundary's movement while naming it for the content's.
// §10.1 needs the content's, because it decides which part is the "receiver" whose display limit must
// be re-checked. Worked through:
//
//   Boundary 3:1 → 2:15 is EARLIER, so the later part now starts sooner and GAINS 2:15–2:29.
//   The later part received, so the content travelled FORWARD.
check('an earlier boundary means content moved forward', back.direction, 'forward');
check(
	'and the later part is the one that grew',
	countVerses(back.after) > countVerses(after),
	true
);

//   Boundary 3:1 → 3:10 is LATER, so the earlier part extends further and GAINS 3:1–3:9.
//   The earlier part received, so the content travelled BACKWARD — §10.1's three Joins and Move Text Up.
check('a later boundary means content moved backward', fwd.direction, 'backward');
check(
	'and the earlier part is the one that grew',
	countVerses(fwd.before) > countVerses(before),
	true
);

console.log('\n── a chapter-rollover boundary uses real chapter lengths ──');

// Boundary exactly at 3:1 means the earlier part ends at the LAST verse of chapter 2 — which requires
// knowing how long chapter 2 is. Assuming chapters are equal length would put the end in the wrong
// place and silently drop or duplicate verses.
const rollover = planBoundaryShift({ before, after, newBoundaryWordId: w(3, 1) });
assert('accepted', rollover.ok);
check(
	'the earlier part ends at the true last verse of chapter 2',
	`${rollover.before.toChapter}:${rollover.before.toVerse}`,
	`2:${ROM_2}`
);
check('nothing moved — this is where the boundary already was', rollover.versesMoved, 0);
check('so the direction is none', rollover.direction, 'none');

console.log('\n── refusals: a boundary move never silently becomes a Join Parts ──');

// Emptying a part is Join Parts, a different command with its own confirmation and its own deletion.
// Performing it under the name of a boundary move would destroy a part the user did not ask to lose.
// Boundary at 1:1 leaves the earlier part with nothing before it. It is refused for the *earlier*
// reason — 1:1 has no preceding verse in Romans at all — so this asserts the refusal, not the copy.
// Written expecting the "Join Parts" wording first; the guard that actually catches it is the one
// that cannot find a previous verse, which fires sooner and is equally correct.
const emptiesEarlier = planBoundaryShift({ before, after, newBoundaryWordId: w(1, 1) });
assert('emptying the earlier part is refused', !emptiesEarlier.ok);
assert('with a reason', Boolean(emptiesEarlier.error));

// A boundary at 1:2 leaves the earlier part exactly one verse, which is legal — and proves the
// refusal above is about running out of book, not about the part getting small.
const oneVerseLeft = planBoundaryShift({ before, after, newBoundaryWordId: w(1, 2) });
assert('leaving the earlier part a single verse is allowed', oneVerseLeft.ok);
check('and it is exactly one verse', countVerses(oneVerseLeft.before), 1);

const emptiesLater = planBoundaryShift({ before, after, newBoundaryWordId: w(4, 25) });
assert('consuming all but the last verse is still allowed', emptiesLater.ok);

// One past the end of the later part empties it entirely.
const pastEnd = planBoundaryShift({ before, after, newBoundaryWordId: w(4, 26) });
assert('emptying the later part is refused', !pastEnd.ok);
assert('and it also points at Join Parts', /Join Parts/.test(pastEnd.error));

console.log('\n── the verse-conservation guard is reachable, and catches invented verses ──');

// ⚠️ Added because mutation testing showed the guard could be deleted with every assertion still
// green: for an ABUTTING pair, conservation holds structurally (both new ranges come from one
// boundary, so they cannot gap or overlap), which made the guard look like dead defensive code.
//
// It is not dead. A pair with a GAP between them — Rom 1–2 then Rom 5–6, chapters 3–4 belonging to
// neither — is exactly the case where moving the boundary silently invents verses: the earlier part
// would be extended to 2:29 and the later pulled back to 3:1, absorbing two chapters nobody asked
// for. §8 says such a seam is not eligible in the first place, so this is defence in depth against a
// caller that skipped the check — and it fires.
const gapped = planBoundaryShift({
	before: ro(1, 1, 2, ROM_2),
	after: ro(5, 1, 6, 23),
	newBoundaryWordId: w(3, 1)
});
assert('a gapped pair is refused', !gapped.ok);
assert('and the refusal names the coverage change', /verses covered/.test(gapped.error));
assert('reporting both totals', /105 → 161/.test(gapped.error));

console.log('\n── refusals: different books have no boundary to move ──');

const philippians = {
	id: 'f1',
	testament: 'NT',
	bookId: 'PHP',
	bookName: 'Philippians',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 1,
	toVerse: 30
};
const crossBook = planBoundaryShift({
	before,
	after: philippians,
	newBoundaryWordId: w(2, 15)
});
assert('refused', !crossBook.ok);
assert('and says why', /different books/.test(crossBook.error));

console.log('\n── refusals: unreadable or impossible boundaries ──');

assert(
	'a malformed word id is refused, not guessed at',
	!planBoundaryShift({ before, after, newBoundaryWordId: 'not-a-word-id' }).ok
);
assert(
	'a missing passage is refused',
	!planBoundaryShift({ before: null, after, newBoundaryWordId: w(2, 15) }).ok
);
// Romans 1:1 is the first verse of the book, so nothing precedes it to end the earlier part on.
const bookStart = planBoundaryShift({
	before: ro(1, 1, 1, 32),
	after: ro(2, 1, 2, ROM_2),
	newBoundaryWordId: 'RO-001-001-001'
});
assert('a boundary at the very first verse of the book is refused', !bookStart.ok);

console.log('\n── the word index is ignored: ranges are verse-granular ──');

// A segment may legitimately begin mid-verse, so a boundary can land on word 7 of a verse. The range
// still moves the WHOLE verse; the structure keeps its exact word anchor. Asserted so that a future
// change to verse-granularity is a deliberate decision rather than an accident.
const midVerse = planBoundaryShift({ before, after, newBoundaryWordId: w(2, 15, 7) });
assert('accepted', midVerse.ok);
check(
	'and lands on the same verse boundary as word 1',
	`${midVerse.after.fromChapter}:${midVerse.after.fromVerse}`,
	'2:15'
);
check('with the same verse count moved', midVerse.versesMoved, back.versesMoved);

console.log('\n── countVerses sums real chapter lengths ──');

check(
	'Romans 1–2 is chapter 1 plus chapter 2',
	countVerses(ro(1, 1, 2, ROM_2)),
	getVerseCount('NT', 'RO', 1) + ROM_2
);
check('a single verse is one', countVerses(ro(3, 5, 3, 5)), 1);
check(
	'an unknown book yields zero rather than a wrong number',
	countVerses({
		testament: 'NT',
		bookId: 'NOPE',
		fromChapter: 1,
		fromVerse: 1,
		toChapter: 1,
		toVerse: 5
	}),
	0
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
