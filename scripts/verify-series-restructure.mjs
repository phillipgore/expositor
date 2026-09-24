/**
 * Verify Split Part / Join Parts planning (SERIES_PLAN §8, phase 2).
 *
 * These functions decide what the confirm dialog promises AND what the endpoint executes, so a
 * disagreement between them is a silent lie to the user. Everything here runs against real
 * `bible.json` data — the Psalms fixture in verify-export-limits.mjs had to be measured rather
 * than assumed, and the same rule applies to every chapter length below.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-restructure.mjs
 */

import {
	getSplitPoints,
	planPartSplit,
	planPartJoin,
	renumberForInsert,
	renumberForRemoval
} from '../src/lib/utils/seriesRestructure.js';
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

/** A part with one passage. Book ids are the codes bible.json uses ('RO'), never 'Romans'. */
const part = (id, order, ranges) => ({
	id,
	seriesOrder: order,
	title: `Part ${order + 1}`,
	passages: ranges.map((r, i) => ({ ...r, displayOrder: i }))
});

const ro = (fromChapter, fromVerse, toChapter, toVerse) => ({
	testament: 'NT',
	book: 'RO',
	bookName: 'Romans',
	fromChapter,
	fromVerse,
	toChapter,
	toVerse
});

// Guard the guard: if these ids stop resolving, every assertion below goes vacuous.
assert('fixture resolves: Romans 3 has verses', getVerseCount('NT', 'RO', 3) === 31);

// --- Where a part may be split ---------------------------------------------------------------

const romans1to4 = part('p1', 0, [ro(1, 1, 4, 25)]);
check('a multi-chapter part splits at chapters', getSplitPoints(romans1to4).kind, 'chapter');
check('and offers every interior chapter line', getSplitPoints(romans1to4).chapters.length, 3);
assert(
	'the last chapter is not offered — it would leave an empty half',
	!getSplitPoints(romans1to4).chapters.includes(4)
);

const oneChapter = part('p2', 0, [ro(3, 1, 3, 31)]);
check('a single-chapter part cannot be split', getSplitPoints(oneChapter).kind, 'none');
assert('and says why', (getSplitPoints(oneChapter).reason ?? '').includes('single chapter'));

const prison = part('p3', 0, [
	{
		testament: 'NT',
		book: 'EP',
		bookName: 'Ephesians',
		fromChapter: 1,
		fromVerse: 1,
		toChapter: 6,
		toVerse: 24
	},
	{
		// 'PH' is bible.json's id for Philippians. Harmless here — `getSplitPoints()` counts
		// passages and never looks a book up — but corrected so the fixture cannot mislead the
		// next reader, and so copying it does not reintroduce the lookup failure fixed below.
		testament: 'NT',
		book: 'PH',
		bookName: 'Philippians',
		fromChapter: 1,
		fromVerse: 1,
		toChapter: 4,
		toVerse: 23
	}
]);
check('a multi-passage part splits at seams instead', getSplitPoints(prison).kind, 'passage');
check('one seam between two passages', getSplitPoints(prison).seams.length, 1);

// --- Splitting is verse-conservative -----------------------------------------------------------
//
// The halves must meet exactly: no verse duplicated, none dropped. Romans 2 ends at verse 29, and
// that figure comes from bible.json rather than from memory — a wrong chapter end would silently
// truncate the user's text.

const split = planPartSplit({ part: romans1to4, afterChapter: 2, translationId: 'esv' });
check('the split succeeds', split.ok, true);
check(
	'first half ends at the real end of chapter 2',
	split.first[0].toVerse,
	getVerseCount('NT', 'RO', 2)
);
check('first half ends in chapter 2', split.first[0].toChapter, 2);
check('second half starts at 3:1', split.second[0].fromChapter, 3);
check('with no gap and no overlap', split.second[0].fromVerse, 1);
check('and keeps the original end', split.second[0].toChapter, 4);

const badSplit = planPartSplit({ part: romans1to4, afterChapter: 9, translationId: 'esv' });
check('splitting outside the part fails', badSplit.ok, false);
assert('with a reason', (badSplit.error ?? '').includes('not inside'));

// --- Joining is governed by the SHARED adjacency predicate --------------------------------------

const parts = [part('a', 0, [ro(1, 1, 3, 31)]), part('b', 1, [ro(4, 1, 8, 39)])];

const join = planPartJoin({ parts, partId: 'b', direction: 'previous', translationId: 'esv' });
check('adjacent parts join', join.ok, true);
check('the earlier part keeps its identity', join.keep.id, 'a');
check('and the later one is absorbed', join.absorb.id, 'b');
check('the seam coalesces into ONE range, not two abutting ones', join.passages.length, 1);
check('spanning the whole', join.passages[0].fromChapter, 1);
check('from end to end', join.passages[0].toChapter, 8);

// A gap must not be joined: doing so would silently claim the user studies text they excluded.
const gapped = [part('a', 0, [ro(1, 1, 3, 31)]), part('b', 1, [ro(5, 1, 8, 39)])];
const gapJoin = planPartJoin({
	parts: gapped,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv'
});
check('a gap cannot be joined', gapJoin.ok, false);
assert('and the reason names the gap', (gapJoin.error ?? '').includes('gap'));

// Different books, the Prison Epistles case §8 says will be reported as broken unless explained.
const books = [
	part('a', 0, [
		{
			testament: 'NT',
			book: 'EP',
			bookName: 'Ephesians',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 6,
			toVerse: 24
		}
	]),
	part('b', 1, [
		{
			// ⚠️ 'PH', not 'PP'. bible.json's `_id` for Philippians is PH; this fixture said PP and
			// nothing noticed, because until non-contiguous joins existed the different-books case
			// was refused BEFORE any verse arithmetic ran, so the bad code was never looked up.
			// Joining as separate passages does reach `assessRanges()`, which turned the silent
			// typo into "Book not found: PP in NT" on stderr — the fixture was measuring nothing.
			testament: 'NT',
			book: 'PH',
			bookName: 'Philippians',
			fromChapter: 1,
			fromVerse: 1,
			toChapter: 4,
			toVerse: 23
		}
	])
];
const bookJoin = planPartJoin({
	parts: books,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv'
});
check('different books cannot be joined', bookJoin.ok, false);
assert(
	'and the reason names BOTH books readably',
	(bookJoin.error ?? '').includes('Ephesians') && (bookJoin.error ?? '').includes('Philippians')
);
// 'PH' is the book id now the fixture is correct; testing the old 'PP' typo would have asserted
// against a string that can no longer occur, which is an assertion that cannot fail.
assert('never leaking an internal id', !/\bEP\b|\bPH\b/.test(bookJoin.error ?? ''));

// Overlap: declined deliberately, and the reason must say verses would repeat rather than
// claiming the parts are "not adjacent" — they are, twice over.
const overlapping = [part('a', 0, [ro(1, 1, 3, 31)]), part('b', 1, [ro(3, 1, 5, 21)])];
const overlapJoin = planPartJoin({
	parts: overlapping,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv'
});
check('overlapping parts cannot be joined', overlapJoin.ok, false);
assert('and the reason names the repetition', (overlapJoin.error ?? '').includes('repeat'));

// --- Joining across a gap, as SEPARATE passages (allowNonContiguous) -----------------------------
//
// The refusals above are about coalescing two ranges into one, which a gap makes dishonest. Carrying
// both ranges in one part is a different operation, and §5 already treats a gapped study
// (Romans 1–3 + Romans 8) as a first-class shape. These pin that the flag changes ONLY that.

const gapSeparate = planPartJoin({
	parts: gapped,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv',
	allowNonContiguous: true
});
check('a gap CAN be joined when ranges are kept separate', gapSeparate.ok, true);
check('both ranges survive as two passages', gapSeparate.passages.length, 2);
check('and the plan says it did not coalesce', gapSeparate.coalesced, false);
check('naming the seam it crossed', gapSeparate.seamKind, 'gap');

// The gap is WARNED about, not refused — the dialog shows this in amber beside a live Join button.
// It must be first, because it describes the operation where the compliance notices describe the
// result, and it must carry the same sentence the refusal would have used.
const gapWarning = gapSeparate.warnings[0];
check('a non-contiguous join warns', gapWarning?.reason, 'non-contiguous-join');
check('at warning severity, not notice', gapWarning?.severity, 'warning');
check(
	'carrying the refusal’s own diagnosis, then the outcome',
	gapWarning?.message,
	'These parts aren’t adjacent in Scripture. They will be joined as separate passages.'
);
// ⚠️ The diagnosis must be the SAME clause the refusal uses. Asserted by substring against the
// real refusal rather than a copy of it, so rewording one without the other fails here.
assert(
	'and the refusal opens with that identical clause',
	(gapJoin.error ?? '').startsWith('These parts aren’t adjacent in Scripture')
);
// The whole point: the excluded chapters must NOT be swept in.
check('the first range still ends where it did', gapSeparate.passages[0].toChapter, 3);
check('and the second still starts where it did', gapSeparate.passages[1].fromChapter, 5);
check('the earlier part still keeps its identity', gapSeparate.keep.id, 'a');

const bookSeparate = planPartJoin({
	parts: books,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv',
	allowNonContiguous: true
});
check('different books can be joined as separate passages', bookSeparate.ok, true);
check('both books survive as two passages', bookSeparate.passages.length, 2);
check('and it did not coalesce across the book change', bookSeparate.coalesced, false);
check('naming the seam', bookSeparate.seamKind, 'different-books');
assert(
	'the book-change warning names BOTH books readably',
	(bookSeparate.warnings[0]?.message ?? '').includes('Ephesians') &&
		(bookSeparate.warnings[0]?.message ?? '').includes('Philippians')
);
assert(
	'never leaking an internal id into the warning',
	!/\bEP\b|\bPH\b/.test(bookSeparate.warnings[0]?.message ?? '')
);

// ⚠️ The flag must NOT reach overlap. Keeping the ranges separate does not cure duplication:
// Rom 1–3 plus Rom 3–5 repeats chapter 3 whether stored as one range or two (Q40, settled).
const overlapSeparate = planPartJoin({
	parts: overlapping,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv',
	allowNonContiguous: true
});
check('overlap is STILL refused under the flag', overlapSeparate.ok, false);
assert(
	'and still names the repetition, not a gap',
	(overlapSeparate.error ?? '').includes('repeat')
);

// A contiguous seam is unaffected by the flag: it must still coalesce into one range, or the
// ordinary join would silently start producing two-passage parts.
const contiguousUnderFlag = planPartJoin({
	parts,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv',
	allowNonContiguous: true
});
check('a contiguous seam still coalesces under the flag', contiguousUnderFlag.passages.length, 1);
check('and reports that it coalesced', contiguousUnderFlag.coalesced, true);
// The ordinary join must stay silent, or the amber block would appear on every join and stop
// meaning anything.
check(
	'and raises NO non-contiguous warning',
	contiguousUnderFlag.warnings.some((w) => w.reason === 'non-contiguous-join'),
	false
);

// The default is load-bearing: `reserialize` calls this as an ASSERTION that diffSeams() only
// proposes in-run joins, and a flipped default would silence that check.
check(
	'the flag defaults to OFF — a gap refuses when it is not passed',
	planPartJoin({ parts: gapped, partId: 'b', direction: 'previous', translationId: 'esv' }).ok,
	false
);

// Ends of the sequence have nothing to join to.
check(
	'the first part has no previous',
	planPartJoin({ parts, partId: 'a', direction: 'previous', translationId: 'esv' }).ok,
	false
);
check(
	'the last part has no next',
	planPartJoin({ parts, partId: 'b', direction: 'next', translationId: 'esv' }).ok,
	false
);

// Direction must be symmetric: joining b←previous and a→next describe the SAME merge, so they
// must produce the same result. Asymmetry here would mean the outcome depends on which part the
// user happened to right-click.
const fromNext = planPartJoin({ parts, partId: 'a', direction: 'next', translationId: 'esv' });
check('joining forwards works too', fromNext.ok, true);
check('and keeps the same part', fromNext.keep.id, join.keep.id);
check('and produces the same range', fromNext.passages[0].toChapter, join.passages[0].toChapter);

// Q28: discarding a title is warned about, not done silently.
assert('the absorbed title is reported as discarded', join.discards.includes('Part 2'));

// --- Compliance is reported, never enforced (§5, COMPLIANCE §1.6) -------------------------------
//
// Joining all of Romans is a complete book: ESV's distribution clause forbids it unqualified, so
// the user must be told — and still allowed to proceed, because compliance is the owner's
// obligation and refusing would remove the choice §5 exists to protect.

const wholeRomans = [part('a', 0, [ro(1, 1, 8, 39)]), part('b', 1, [ro(9, 1, 16, 27)])];
const wholeJoin = planPartJoin({
	parts: wholeRomans,
	partId: 'b',
	direction: 'previous',
	translationId: 'esv'
});
check('a join producing a complete book still succeeds', wholeJoin.ok, true);
assert(
	'but warns that it covers the complete book',
	wholeJoin.warnings.some((w) => w.reason === 'complete-book')
);
assert(
	'naming the book readably, never the id',
	wholeJoin.warnings.some((w) => w.message.includes('Romans')) &&
		!wholeJoin.warnings.some((w) => /\bRO\b/.test(w.message))
);

// NET has no such restriction, so the same merge must NOT manufacture a licence warning.
const netJoin = planPartJoin({
	parts: wholeRomans,
	partId: 'b',
	direction: 'previous',
	translationId: 'net'
});
check('the same join is fine for NET', netJoin.ok, true);
// ⚠️ This assertion previously ended `&& false`, which made it vacuously true: it would have
// passed whatever NET did, including the exact misattribution it claims to guard. Caught by
// re-reading rather than by the run, because a vacuous assertion reports success by construction.
// The decisions log's "limit message attribution" row is the bug it exists to prevent —
// `validatePassageLimits` once blamed the provider for our own cap.
assert(
	'NET is not given a complete-book warning it does not have',
	!netJoin.warnings.some((w) => w.reason === 'complete-book')
);

// --- seriesOrder is shifted, never re-derived (§4) ----------------------------------------------
//
// The decisions log is explicit that re-normalising from canonical order would clobber a
// deliberate arrangement. These assertions pin the shift, and pin that untouched parts stay
// untouched.

const four = [part('a', 0, []), part('b', 1, []), part('c', 2, []), part('d', 3, [])];

const inserted = renumberForInsert(four, 1);
check('the new part takes the next slot', inserted.inserted, 2);
check('only the tail moves', inserted.updates.length, 2);
assert(
	'parts before the split point are left alone',
	!inserted.updates.some((u) => u.id === 'a' || u.id === 'b')
);
check(
	'and the tail shifts by exactly one',
	inserted.updates.find((u) => u.id === 'c').seriesOrder,
	3
);

const removed = renumberForRemoval(four, 1);
check('removal closes the gap for the tail only', removed.length, 2);
check('c moves down to 1', removed.find((u) => u.id === 'c').seriesOrder, 1);
assert('and a is untouched', !removed.some((u) => u.id === 'a'));

// Round trip: insert then remove at the same point must restore the original numbering, or
// repeated split/join would drift the sequence.
const afterInsert = four.map((p) => {
	const u = inserted.updates.find((x) => x.id === p.id);
	return u ? { ...p, seriesOrder: u.seriesOrder } : p;
});
const afterRemove = renumberForRemoval(
	[...afterInsert, { id: 'new', seriesOrder: 2, passages: [] }],
	2
);
check(
	'split-then-join restores c to its original slot',
	afterRemove.find((u) => u.id === 'c').seriesOrder,
	2
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
