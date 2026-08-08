/**
 * Verify `validateExportLimits()` — the distribution (copyright quotation) check.
 *
 * This function shipped with no caller and had therefore never been executed. It is now called
 * from MenuExport, the one chokepoint all four artifact paths cross (COMPLIANCE.md §1.9).
 * Running it once against real data surfaced two defects that inspection had missed, and both
 * are pinned here:

 *
 *   1. `totalVerses` was summed from countVersesInRange() per passage, so overlapping passages
 *      were counted twice — Romans 1-8 plus Romans 8-16 reported 472 verses reproduced from a
 *      433-verse book. An impossible figure, in the one number a user would check against the
 *      licence. The per-book verse Sets were already correct; only the total ignored them.
 *
 *   2. Warnings named the internal book id: "the complete book of RO". The display path already
 *      resolves the readable title and carries a comment that a warning naming "JN" is worse
 *      than no warning; the export path never applied it.
 *
 * Also pinned: whole Philemon DOES warn on export. That looks wrong next to the display check,
 * which exempts it, but the two clauses differ — `shortBookChapterThreshold` is stated in the
 * display permission and has no counterpart in the distribution one, whose `allowCompleteBook:
 * false` is unqualified. Adding the exemption here would be inventing a licence term. Asserted
 * explicitly so nobody "tidies" the asymmetry away.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-export-limits.mjs
 *
 * Note the loader, not the hooks file: alias-hooks.mjs exports `resolve` for `register()`, so
 * passing it to --import directly loads a module that hooks nothing and the $lib imports fail.
 */

import {
	validateExportLimits,
	validateStudyDisplayLimits,
	getDistributionLimits
} from '../src/lib/utils/translationLimits.js';

import { getBookVerseTotal } from '../src/lib/utils/bibleData.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	const ok = actual === expected;
	if (ok) {
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

/**
 * Book ids are the codes bible.json actually uses ('RO', not 'Romans'), and the testament is
 * required. A friendly name silently yields bookTotal <= 0, which this function treats as
 * "unknown book" and skips — so a test written with 'Romans' would report compliant=true for a
 * whole-book export and pass for entirely the wrong reason. That is exactly how the first draft
 * of this file was wrong.
 */
const p = (testament, book, fromChapter, fromVerse, toChapter, toVerse) => ({
	testament,
	book,
	fromChapter,
	fromVerse,
	toChapter,
	toVerse
});

// Guard the guard: if these ids ever stop resolving, every assertion below becomes vacuous.
assert('fixture ids resolve: RO has verses', getBookVerseTotal('NT', 'RO') === 433);
assert('fixture ids resolve: PN has verses', getBookVerseTotal('NT', 'PN') === 25);
assert('a bad id resolves to 0 (so it would be skipped)', getBookVerseTotal('NT', 'Romans') === 0);

// --- Defect 1: overlap must not double-count -------------------------------------------------

const overlapping = validateExportLimits(
	[p('NT', 'RO', 1, 1, 8, 39), p('NT', 'RO', 8, 1, 16, 27)],
	'esv'
);
check('overlapping halves of Romans total 433, not 472', overlapping.totalVerses, 433);
assert(
	'reproduced total never exceeds the book itself',
	overlapping.totalVerses <= getBookVerseTotal('NT', 'RO')
);

const adjacent = validateExportLimits(
	[p('NT', 'RO', 1, 1, 8, 39), p('NT', 'RO', 9, 1, 16, 27)],
	'esv'
);
check('adjacent halves agree with the overlapping pair', adjacent.totalVerses, 433);

// --- Defect 2: user-facing copy names the book readably --------------------------------------

const wholeRomans = validateExportLimits([p('NT', 'RO', 1, 1, 16, 27)], 'esv');
assert(
	'complete-book warning says "Romans"',
	wholeRomans.warnings.some((w) => w.includes('complete book of Romans'))
);
assert(
	'no warning leaks the internal id "RO"',
	!wholeRomans.warnings.some((w) => /\bRO\b/.test(w))
);

// --- Aggregation across passages -------------------------------------------------------------

assert(
	'a book assembled from many passages is still caught as complete',
	validateExportLimits(
		Array.from({ length: 21 }, (_, i) => p('NT', 'JN', i + 1, 1, i + 1, 999)),
		'esv'
	).warnings.some((w) => w.includes('complete book of John'))
);

// --- Deliberate asymmetry with the display check ---------------------------------------------

const wholePhilemon = validateExportLimits([p('NT', 'PN', 1, 1, 1, 25)], 'esv');
assert(
	'whole Philemon DOES warn on export: the short-book carve-out is a display term only',
	wholePhilemon.warnings.some((w) => w.includes('complete book of Philemon'))
);

// --- Compliant case and posture --------------------------------------------------------------

const partial = validateExportLimits([p('NT', 'RO', 1, 1, 3, 31)], 'esv');
check('a partial book is compliant', partial.compliant, true);
check('and reports its real size', partial.totalVerses, 92);
check('warn-only posture: never blocks', wholeRomans.blocked, false);

// A translation with no distribution limits configured must not invent any.
const net = validateExportLimits([p('NT', 'RO', 1, 1, 16, 27)], 'net');
check('NET has no distribution limits, so a whole book is compliant', net.compliant, true);

// --- The distribution ceiling is 500, not the print figure of 1000 ---------------------------
//
// The ESV API terms: "You may distribute up to 500 verses..." Our text comes from the API, so
// 500 binds; 1000 is the print copyright-page permission and was carried here in error until
// 2026-08-08. It survived because `validateExportLimits()` had no caller and the value was
// therefore judged to have "no observable effect" — an argument that expired the moment the
// check was wired into MenuExport, since the warning copy QUOTES the ceiling at the user.
// See COMPLIANCE.md §1.9.
//
// Pinned as data, not just as behaviour: the failure mode was a plausible number sitting in
// JSON, so the assertion has to be about the number.
check(
	'ESV distribution ceiling is the API figure, not the print one',
	getDistributionLimits('esv').maxVerses,
	500
);

// And it must actually bind. This needs a range over 500 verses that is still under half its
// book, so the total-verse rule is the ONLY one that can fire — otherwise the assertion would
// pass on the complete-book warning and say nothing about the ceiling. Psalms 1-36 is 511
// verses against a 2,461-verse book, so half (1,230) is far away.
//
// Matthew was the first choice and does not work: no chapter boundary in Matthew lands between
// 500 verses and half the book. The range was assumed rather than measured, and the assertion
// duly failed — the same "plausible number, unverified" mistake COMPLIANCE.md §0 is about,
// committed while writing a test for it. Both figures below are measured from bible.json.
const overCeiling = validateExportLimits([p('OT', 'PS', 1, 1, 36, 999)], 'esv');
check('Psalms 1-36 is 511 verses', overCeiling.totalVerses, 511);
assert('which is over the 500-verse ceiling', overCeiling.totalVerses > 500);
assert(
	'and under half of Psalms, so only the ceiling can be what fires',
	overCeiling.totalVerses < getBookVerseTotal('OT', 'PS') / 2
);

assert(
	'the ceiling warning fires and quotes 500',
	overCeiling.warnings.some((w) => w.includes('500-verse'))
);
assert(
	'and never quotes the withdrawn print figure',
	!overCeiling.warnings.some((w) => w.includes('1000'))
);

// --- Degenerate input ------------------------------------------------------------------------

check('no passages is compliant', validateExportLimits([], 'esv').compliant, true);
check('null passages does not throw', validateExportLimits(null, 'esv').totalVerses, 0);
check(
	'a passage with no book is skipped, not bucketed as undefined',
	validateExportLimits([{ fromChapter: 1, fromVerse: 1, toChapter: 2, toVerse: 2 }], 'esv')
		.totalVerses,
	0
);

// --- The DB row shape must be measured, not silently skipped ---------------------------------
//
// A passage row from the database carries `bookId`; a passage built in memory by StudyForm
// carries `book`. Both validators read only `book`, so a DB row matched nothing, every verse
// was skipped, and a whole-Romans study returned compliant with zero warnings — a compliance
// check that passes precisely because it failed to understand its input. `seriesPlanning`
// already normalised `book ?? bookId` for the parts it builds but handed RAW rows to the
// series-wide display check, so that check was inert against production data.
//
// These are the highest-value assertions in this file: the previous behaviour was not a wrong
// number, it was a silent all-clear.

const dbRow = {
	testament: 'NT',
	bookId: 'RO',
	bookName: 'Romans',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 16,
	toVerse: 27
};

const dbExport = validateExportLimits([dbRow], 'esv');
check('a DB row (bookId) is measured on export, not skipped', dbExport.totalVerses, 433);
check('and is therefore NOT reported compliant', dbExport.compliant, false);
assert(
	'its warning still names the book readably',
	dbExport.warnings.some((w) => w.includes('complete book of Romans'))
);

const dbDisplay = validateStudyDisplayLimits([dbRow], 'esv');
check('a DB row is measured by the display check too', dbDisplay.totalVerses, 433);
check('and is not silently compliant', dbDisplay.compliant, false);

// Both shapes must agree, or the check depends on which layer happened to build the passage.
check(
	'both field names produce the same verse total (export)',
	validateExportLimits([p('NT', 'RO', 1, 1, 16, 27)], 'esv').totalVerses,
	dbExport.totalVerses
);
check(
	'both field names produce the same verse total (display)',
	validateStudyDisplayLimits([p('NT', 'RO', 1, 1, 16, 27)], 'esv').totalVerses,
	dbDisplay.totalVerses
);

// A mixed study — one row from the DB, one from the form — must aggregate as ONE book rather
// than two half-books, or the complete-book rule is defeated by provenance alone.
const mixed = validateExportLimits(
	[
		{ testament: 'NT', bookId: 'RO', fromChapter: 1, fromVerse: 1, toChapter: 8, toVerse: 39 },
		p('NT', 'RO', 9, 1, 16, 27)
	],
	'esv'
);
check('mixed shapes aggregate into one book', mixed.totalVerses, 433);
assert(
	'and are caught as a complete book',
	mixed.warnings.some((w) => w.includes('complete book of Romans'))
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
