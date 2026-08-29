/**
 * Verify per-passage division and compliance-warning de-duplication (SERIES_PLAN §5, trap 15,
 * trap 8).
 *
 * Two changes are pinned here, and they are independent:
 *
 *   1. **A multi-passage study may be divided inside each passage.** It used to produce exactly
 *      one part per passage, so Revelation + Matthew was locked to two parts of 404 and 1071
 *      verses. §5 rule 1 says a series is never imposed; being told the shape must be 2 parts is
 *      an imposition. The division is applied PER PASSAGE, so `planByChapters()` only ever sees a
 *      single contiguous single-book range and the scalar `book` is not generalised (trap 15).
 *
 *   2. **The warnings do not repeat themselves.** Under `passage-per-part`, part N's passages ARE
 *      source passage N, so the series-level aggregate re-emitted every per-part message verbatim
 *      with an "Across the whole series:" prefix. Trap 8 asks the aggregate to surface what the
 *      per-part checks are BLIND to — not to echo what they already said.
 *
 * The interesting case for (2) is that both fixes must hold at once: de-duplication must not
 * silence the aggregate in the case trap 8 actually cares about (fine parting hiding a whole-book
 * total), which is asserted below with John at one chapter per part.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-per-passage-parting.mjs
 */

import { planSeriesParts } from '../src/lib/utils/seriesPlanning.js';
import { checkSeriesExport } from '../src/lib/utils/seriesExport.js';

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

const REV = { testament: 'NT', book: 'RE', fromChapter: 1, fromVerse: 1, toChapter: 22, toVerse: 21 };
const MATT = { testament: 'NT', book: 'MT', fromChapter: 1, fromVerse: 1, toChapter: 28, toVerse: 20 };

console.log('\n── the default is unchanged: one part per passage ──');

const asBefore = planSeriesParts({
	passages: [REV, MATT],
	translationId: 'esv',
	baseTitle: 'NT Study'
});
check('strategy is still passage-per-part', asBefore.strategy, 'passage-per-part');
check('two passages still give two parts', asBefore.parts.length, 2);
// Rule 2 in code form: a caller that says nothing about per-passage division must get exactly
// what it got before the option existed.
check(
	'an explicit all-zero spec is identical',
	planSeriesParts({
		passages: [REV, MATT],
		translationId: 'esv',
		baseTitle: 'NT Study',
		chaptersPerPassage: [0, 0]
	}).parts.length,
	2
);

console.log('\n── and each passage can now be divided on its own ──');

const divided = planSeriesParts({
	passages: [REV, MATT],
	translationId: 'esv',
	baseTitle: 'NT Study',
	chaptersPerPassage: [11, 7]
});
check('Revelation by 11 and Matthew by 7 gives six parts', divided.parts.length, 6);
check('part 1 is Revelation 1–11', divided.parts[0].passages[0].toChapter, 11);
check('part 2 starts at Revelation 12', divided.parts[1].passages[0].fromChapter, 12);
// The seam between passages is the user's, and no part may straddle it.
check('part 3 starts a new book', divided.parts[2].passages[0].book, 'MT');
assert(
	'no part spans two books',
	divided.parts.every((p) => p.passages.length === 1)
);

console.log('\n── seriesOrder is continuous across the whole series ──');

// planByChapters() numbers from 1 on every call, so without renumbering a study divided on both
// sides would emit two parts numbered 1 — and seriesOrder is what the Finder orders by.
assert(
	'orders run 1..N with no repeats or gaps',
	divided.parts.every((p, i) => p.seriesOrder === i + 1)
);

const bothOne = planSeriesParts({
	passages: [REV, MATT],
	translationId: 'esv',
	baseTitle: '',
	chaptersPerPassage: [1, 1]
});
check('one chapter per part across both books gives 50 parts', bothOne.parts.length, 50);
assert(
	'and those orders are continuous too',
	bothOne.parts.every((p, i) => p.seriesOrder === i + 1)
);

console.log('\n── parts are named by book, not by number ──');

// "Part 2" gave the Finder a list distinguishable only by number; with subdivision it is also
// ambiguous, since several parts now come from one passage.
check('an undivided passage is named for its book', asBefore.parts[0].title, 'Revelation 1–22');
check('a divided one names its own chapters', divided.parts[0].title, 'Revelation 1–11');
check('and the second book is not mistitled with the first', divided.parts[2].title, 'Matthew 1–7');
assert(
	'no two parts share a title',
	new Set(bothOne.parts.map((p) => p.title)).size === bothOne.parts.length
);

console.log('\n── verses are conserved by the division ──');

// Dividing changes how the text is grouped, never how much of it there is.
check(
	'six parts cover exactly what two parts covered',
	divided.parts.reduce((s, p) => s + p.verseCount, 0),
	asBefore.parts.reduce((s, p) => s + p.verseCount, 0)
);
check(
	'and 50 parts cover it too',
	bothOne.parts.reduce((s, p) => s + p.verseCount, 0),
	1475
);

console.log('\n── a single-chapter passage has no seam to cut on ──');

const oneChapter = {
	testament: 'NT',
	book: 'JD',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 1,
	toVerse: 25
};
const withShort = planSeriesParts({
	passages: [REV, oneChapter],
	translationId: 'esv',
	baseTitle: '',
	// Asking to divide a one-chapter passage is ignored rather than erroring: the UI does not
	// offer the control, so this can only arrive from a hand-made request.
	chaptersPerPassage: [11, 5]
});
check('Revelation divides, Jude does not', withShort.parts.length, 3);
check('and Jude is intact as the last part', withShort.parts[2].verseCount, 25);

console.log('\n── a passage may be divided in two, not just in half ──');

// The study-wide stepper caps at floor(span / 2), which is how §4's "a series needs 2+ parts" is
// enforced when ONE passage must supply them all. That bound does not transfer to a per-passage
// control: the 2-part minimum belongs to the assembled series, and the other passages contribute
// parts too. Capping each passage at half its span would refuse 2 chapters/part on a 3-chapter
// passage — a division into 2 parts, which is valid and obvious to want.
const threeChapters = {
	testament: 'NT',
	book: 'TI',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 3,
	toVerse: 15
};
const nearWhole = planSeriesParts({
	passages: [threeChapters, MATT],
	translationId: 'esv',
	baseTitle: '',
	chaptersPerPassage: [2, 0]
});
check('Titus at 2 chapters per part divides in two', nearWhole.parts.length, 3);
check('the first part takes chapters 1–2', nearWhole.parts[0].passages[0].toChapter, 2);
check('and the remainder is chapter 3 alone', nearWhole.parts[1].passages[0].fromChapter, 3);
// The source range's own edges survive division (Q12) — the last part must not run past 3:15.
check('the final verse bound is preserved', nearWhole.parts[1].passages[0].toVerse, 15);

console.log('\n── the warnings no longer repeat themselves ──');

// Was six: three duplicates, a restatement, and the two that carried information. Now two —
// one per book — after de-duplication (below) and the removal of the series-wide notice.
check('Revelation + Matthew produces two notices, not six', asBefore.warnings.length, 2);

// REMOVED 2026-08-28, in two steps worth recording because the first was insufficient.
//
// The aggregate first reported a DISPLAY violation ("…the complete book of Matthew on one
// page"), a category error for something that is many pages. Re-scoping it to EXPORT fixed the
// wording but not the defect: it still fired on every whole-book ESV series, could not be
// cleared by any control on the form, and named a boundary the user had not reached.
//
// It is now emitted nowhere. `MenuExport.guardExport()` runs the same aggregate at export and
// BLOCKS (Q32), which is strictly stronger. See COMPLIANCE.md §1.10.
check(
	'nothing is emitted for the series as a whole',
	asBefore.warnings.filter((w) => w.scope === 'series').length,
	0
);

// The precedence rule the New Study form already applies to the non-series case: a part ESV will
// not serve produces both a retrieval and a display message, and they are the same fact twice.
const matthewWarnings = asBefore.warnings.filter((w) => w.seriesOrder === 2);
check('the unservable part warns once, not twice', matthewWarnings.length, 1);
assert(
	'and the surviving message is the one that names a remedy',
	matthewWarnings[0].message.includes('does not serve the complete book')
);

assert(
	'no message is emitted twice under different scopes',
	new Set(
		asBefore.warnings.map((w) =>
			w.message.replace(/^(Part \d+|Across the whole series): /, '')
		)
	).size === asBefore.warnings.length
);

console.log('\n── too FEW parts is the one thing creation still warns about ──');

// The case the creation-time check exists for, and the reason it is not simply deleted along
// with the aggregate. Galatians is 149 verses over 6 chapters, so half the book is 74.
//
// At 5 chapters per part, part 1 holds 131 verses: comfortably under the 500-verse REQUEST cap,
// so it fetches fine and nothing blocks Save — yet well over the half-book DISPLAY cap, so the
// page it renders on is genuinely non-compliant. Two different limits, and only the second one
// sees this. Stepping down to 2 chapters per part clears it, which is why the message names
// that remedy rather than describing the licence.
const GAL = { testament: 'NT', book: 'GA', fromChapter: 1, fromVerse: 1, toChapter: 6, toVerse: 18 };

const galCoarse = planSeriesParts({
	passages: [GAL],
	chaptersPerPart: 5,
	translationId: 'esv',
	baseTitle: 'Galatians'
});
check('5 chapters per part gives 2 parts', galCoarse.parts.length, 2);
check('and one of them warns', galCoarse.warnings.filter((w) => w.scope === 'part').length, 1);
assert(
	'about displaying more than half the book',
	galCoarse.warnings[0].message.includes('half of Galatians')
);

const galFine = planSeriesParts({
	passages: [GAL],
	chaptersPerPart: 2,
	translationId: 'esv',
	baseTitle: 'Galatians'
});
check('2 chapters per part gives 3 parts', galFine.parts.length, 3);
check('and the warning is gone', galFine.warnings.length, 0);

console.log('\n── trap 8 has moved to the export boundary, not disappeared ──');

// John 1–21 at one chapter per part: every part is well under any limit, yet the series covers a
// complete book. Trap 8's worry — that fine parting silences validation — is REAL, and this is
// the case that shows it. What changed is where it is answered: `checkSeriesExport()` at export,
// which blocks, rather than a creation-time notice, which merely mentioned.
//
// The cross-check below is the load-bearing half. Asserting only "creation is silent" would
// pass equally well if the aggregate had been deleted outright, so it also proves the export
// check still catches this exact series.
const john = planSeriesParts({
	passages: [
		{ testament: 'NT', book: 'JN', fromChapter: 1, fromVerse: 1, toChapter: 21, toVerse: 25 }
	],
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'John'
});
check('21 parts', john.parts.length, 21);
check('no part warns on its own', john.warnings.filter((w) => w.scope === 'part').length, 0);
check('and creation is silent about the series', john.warnings.length, 0);

// The other half: the aggregate is still computed, still non-compliant, and still blocks — at
// the boundary where the licence clause it enforces actually applies.
const johnExport = checkSeriesExport(
	john.parts.map((p) => ({ passages: p.passages })),
	'esv'
);
check('export sees the whole book', johnExport.totalVerses, 879);
assert('and refuses it', !johnExport.compliant);
check('blocking, not merely warning (Q32)', johnExport.blocked, true);

// NET has no such licence term, so the same series exports freely. This is what makes the check
// a licence rule rather than a size rule.
const johnNet = checkSeriesExport(
	john.parts.map((p) => ({ passages: p.passages })),
	'net'
);
assert('NET is unaffected', johnNet.compliant);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
