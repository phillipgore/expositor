/**
 * Verify the boundary disabled-reason strings against SERIES_PLAN §8 / §11 option (1).
 *
 * §11 requires a dead boundary to explain ITSELF: "these parts aren't adjacent in Scripture" for a
 * seam that will never be eligible, and a distinct message for an overlap. The failure this guards
 * against is a single message that flattens the distinction — in particular one promising a fix.
 *
 * ⚠️ It also guards the opposite failure, which is the one that actually shipped: a CONTIGUOUS seam
 * returning "Not available across parts yet." Every caller reads a non-null reason as "disable this
 * command", so once the five cross-part commands were implemented that string went on greying them
 * out at exactly the boundaries where they work. A contiguous seam must return `null`.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-boundary-reasons.mjs
 *
 * Note the loader, not the hooks file: alias-hooks.mjs exports `resolve` for `register()`, so
 * passing it to --import directly loads a module that hooks nothing and the $lib imports fail.

 */

import {
	classifyBoundary,
	getBoundaryDisabledReason
} from '../src/lib/utils/seriesRuns.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	const ok = actual === expected;
	if (ok) {
		pass += 1;
	} else {
		fail += 1;
		console.log(`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
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

/**
 * A part with a single passage range.
 *
 * Book ids are the codes bible.json actually uses ('RO', not 'romans') and the testament is 'NT',
 * because `classifyBoundary` reaches for `getVerseCount(testament, book, chapter)` against the
 * real data. Friendly names here would silently make every chapter length `undefined`, which the
 * predicate treats as a gap — the tests would then pass or fail for a reason having nothing to do
 * with the logic under test.
 */
function part(bookId, bookName, fromChapter, fromVerse, toChapter, toVerse, testament = 'NT') {
	return {
		id: `${bookId}-${fromChapter}.${fromVerse}-${toChapter}.${toVerse}`,
		title: `${bookName} ${fromChapter}:${fromVerse}`,
		passages: [
			{
				testament,
				bookId,
				bookName,

				fromChapter,
				fromVerse,
				toChapter,
				toVerse
			}
		]
	};
}

console.log('── §8 boundary kinds ──');

// Romans 8 ends at v39 (the chapter's last verse); Romans 9 starts at v1 → contiguous.
const rom8 = part('RO', 'Romans', 8, 1, 8, 39);
const rom9 = part('RO', 'Romans', 9, 1, 9, 33);
check('Rom 8 → Rom 9 is contiguous', classifyBoundary(rom8, rom9), 'contiguous');

// Same chapter, next verse.
check(
	'Rom 1:1-16 → Rom 1:17-32 is contiguous',
	classifyBoundary(part('RO', 'Romans', 1, 1, 1, 16), part('RO', 'Romans', 1, 17, 1, 32)),
	'contiguous'
);

// A part ending mid-chapter, with the next starting later — verses are skipped.
check(
	'Rom 1:1-10 → Rom 1:20-32 is a gap',
	classifyBoundary(part('RO', 'Romans', 1, 1, 1, 10), part('RO', 'Romans', 1, 20, 1, 32)),
	'gap'
);

// Prison Epistles: Ephesians → Philippians. §8's never-eligible case.
const eph = part('EP', 'Ephesians', 6, 1, 6, 24);
const phil = part('PH', 'Philippians', 1, 1, 1, 30);
check('Eph → Phil is different-books', classifyBoundary(eph, phil), 'different-books');

// Overlap (Q40 undecided) must be its own state, not folded into gap/contiguous.
check(
	'Rom 1-3 → Rom 3-5 is overlap',
	classifyBoundary(part('RO', 'Romans', 1, 1, 3, 31), part('RO', 'Romans', 3, 1, 5, 21)),
	'overlap'
);

// A part ending short of its chapter's end is NOT contiguous with the next chapter.
check(
	'Rom 8:1-38 → Rom 9:1 is a gap (v39 missing)',
	classifyBoundary(part('RO', 'Romans', 8, 1, 8, 38), rom9),
	'gap'
);

console.log('── §11: a contiguous seam is enabled; ineligible ones explain themselves ──');

const contiguousReason = getBoundaryDisabledReason(rom8, rom9);
const neverReason = getBoundaryDisabledReason(eph, phil);

// ⚠️ This block asserted that a contiguous seam "says yet". It did, and that was correct while the
// five cross-part commands were unimplemented — but the string is read by every caller as "disable
// this command", so once the commands shipped it silently kept them greyed out at exactly the
// boundaries they had just learned to cross. A contiguous seam is now `null`: nothing to explain,
// nothing to disable.
assert('contiguous seam has NO reason — it is enabled', contiguousReason === null);
assert('different-books seam does NOT say "yet"', !/\byet\b/i.test(neverReason));
assert('an ineligible seam still explains itself', contiguousReason !== neverReason);

// No reason string anywhere may promise a fix that has already landed.
assert('no reason promises a later fix', !/\byet\b/i.test(neverReason));

// The never-eligible copy should name the books, so the user can see WHY it will never work.
assert('different-books reason names both books', /ephesians/i.test(neverReason) && /philippians/i.test(neverReason));

// A gap is also permanent (deleting a part creates one), so it must not promise "yet" either.
const gapReason = getBoundaryDisabledReason(part('RO', 'Romans', 1, 1, 1, 10), part('RO', 'Romans', 1, 20, 1, 32));
assert('gap reason does NOT say "yet"', !/\byet\b/i.test(gapReason));

// Overlap is ineligible (Q40, settled) — it must say something, and not claim adjacency is coming.
const overlapReason = getBoundaryDisabledReason(
	part('RO', 'Romans', 1, 1, 3, 31),
	part('RO', 'Romans', 3, 1, 5, 21)
);
assert('overlap reason is non-empty', Boolean(overlapReason) && overlapReason.length > 10);
assert('overlap reason does NOT say "yet"', !/\byet\b/i.test(overlapReason));

// Every reason that EXISTS must be a complete sentence — these render directly in the menu. The
// contiguous case is excluded because it no longer produces one.
for (const [label, reason] of [
	['different-books', neverReason],
	['gap', gapReason],
	['overlap', overlapReason]
]) {
	assert(`${label} reason ends with a period`, reason.trim().endsWith('.'));
	assert(`${label} reason starts capitalised`, /^[A-Z]/.test(reason.trim()));
}

console.log('── asymmetry: the two edges can disagree ──');

// A part contiguous on one side and a different book on the other is exactly the case a single
// shared reason string would get wrong.
const philPart = part('PH', 'Philippians', 1, 1, 1, 30);
const philNext = part('PH', 'Philippians', 2, 1, 2, 30);
const before = getBoundaryDisabledReason(eph, philPart);
const after = getBoundaryDisabledReason(philPart, philNext);
assert('leading edge is the never-eligible reason', !/\byet\b/i.test(before) && Boolean(before));
assert('trailing edge is enabled, with no reason', after === null);
assert('the two edges of one part differ', before !== after);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
