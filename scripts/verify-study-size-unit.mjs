/**
 * Verify that the rendering-performance assessment measures the unit it names.
 *
 * `assessStudySize()` thresholds are per-PAGE: they count DOM spans laid out by one
 * Analyze view. So the number handed to them must be a number that some page will
 * actually render. Under a series it wasn't — the form summed the SOURCE passages,
 * which no page displays once they've been cut into parts.
 *
 * The user-visible symptom, and the two cases pinned below: a whole-Psalms series at
 * 5 chapters per part announced "This study contains 2,461 verses", and a whole-Matthew
 * series announced 1,071. Both pages top out at a few hundred. Worse, the advice
 * attached to the number — "consider whether a smaller range would suit" — is precisely
 * what the user had already done by choosing a series, so the alert was unactionable as
 * well as false.
 *
 * This is the third instance of one recurring bug in this codebase: a sentence gated on
 * a count that measures a different unit from the one the sentence names. The first two
 * were the "Some parts have more verses…" alert and the series-wide display aggregate.
 *
 * ⚠️ The NET case at the bottom is the reason the form measures the largest part rather
 * than simply going quiet under `createAsSeries`. Read it before simplifying this away.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-study-size-unit.mjs
 */

import { planSeriesParts } from '../src/lib/utils/seriesPlanning.js';
import {
	assessStudySize,
	VERSE_COUNT_NOTICE,
	VERSE_COUNT_WARNING
} from '../src/lib/config/studyLimits.js';

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

/** What the form now feeds the assessment when `createAsSeries` is on. */
function largestPart(plan) {
	return plan.parts.reduce((max, part) => Math.max(max, part.verseCount ?? 0), 0);
}

const PSALMS = {
	testament: 'OT',
	book: 'PS',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 150,
	toVerse: 6
};
const MATT = {
	testament: 'NT',
	book: 'MT',
	fromChapter: 1,
	fromVerse: 1,
	toChapter: 28,
	toVerse: 20
};

console.log('\n── the two studies from the bug report ──');

const psalms = planSeriesParts({
	passages: [PSALMS],
	chaptersPerPart: 5,
	translationId: 'esv',
	baseTitle: 'Psalms'
});
check('Psalms at 5 ch/part gives 30 parts', psalms.parts.length, 30);
check('the source range really is 2,461 verses', psalms.totalVerses, 2461);
// The old code passed `totalVerses` here and got a 'warning'. Nothing renders that number.
check('which alone would have warned', assessStudySize(psalms.totalVerses).level, 'warning');
assert('but no part is near the notice threshold', largestPart(psalms) < VERSE_COUNT_NOTICE);
check('so the series is silent', assessStudySize(largestPart(psalms), { unit: 'part' }).level, 'ok');

const matt = planSeriesParts({
	passages: [MATT],
	chaptersPerPart: 5,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
check('Matthew at 5 ch/part gives 6 parts', matt.parts.length, 6);
check('the source range really is 1,071 verses', matt.totalVerses, 1071);
check('which alone would have noticed', assessStudySize(matt.totalVerses).level, 'notice');
assert('but the largest part is well under', largestPart(matt) < VERSE_COUNT_NOTICE);
check('so the series is silent', assessStudySize(largestPart(matt), { unit: 'part' }).level, 'ok');

console.log('\n── one study is unchanged: the sum IS the page there ──');

// The fix must not make the assessment useless where it was right all along. Undivided,
// the whole range does render on one page, so the same totals must still speak.
check('undivided Matthew still notices', assessStudySize(1071).level, 'notice');
check('undivided Psalms still warns', assessStudySize(2461).level, 'warning');
assert(
	'and still says "study", not "part"',
	assessStudySize(2461).message.startsWith('This study contains')
);

console.log('\n── the copy names the unit it measured ──');

// Why this is a copy variant rather than one unit-neutral sentence: the remedy differs.
// Telling a user who has already divided their range to "consider a smaller range" is the
// advice that made the original alert feel inapplicable.
const partCopy = assessStudySize(VERSE_COUNT_WARNING, { unit: 'part' });
assert('a part-scoped warning talks about parts', partCopy.message.includes('largest part'));
assert('and names the control that fixes it', partCopy.message.includes('chapters per part'));
assert('never calling the series a study', !partCopy.message.includes('This study'));
assert(
	'and never offering the remedy the user already took',
	!partCopy.message.includes('smaller range')
);

console.log('\n── ⚠️ NET is why this is not just suppressed under a series ──');

// ESV pins `maxVerses: 500` with `chunking: false`, so `checkSinglePassageSupport()` blocks
// any part over 500 and Save is disabled before a part can ever reach VERSE_COUNT_NOTICE
// (600). On ESV alone, suppressing the alert under `createAsSeries` would have been
// indistinguishable from this fix.
//
// NET sets `chunking: true`, so its 500 is a chunk size and nothing caps a part at all. A
// two-part NET Psalms is creatable, slow, and — under a blanket suppression — completely
// silent. That is the case this assertion keeps audible.
const netPsalms = planSeriesParts({
	passages: [PSALMS],
	chaptersPerPart: 75,
	translationId: 'net',
	baseTitle: 'Psalms'
});
check('75 chapters per part is a legal 2-part series', netPsalms.parts.length, 2);
assert('with a genuinely huge part', largestPart(netPsalms) >= VERSE_COUNT_WARNING);
check(
	'which still warns, measured per part',
	assessStudySize(largestPart(netPsalms), { unit: 'part' }).level,
	'warning'
);

console.log('\n── the two kinds of part warning are told apart ──');

// `assessPlan()` emits retrieval failures and display violations into ONE array. The form
// printed a single hardcoded sentence about DISPLAY over both, so a retrieval failure was
// reported as a page-limit breach — a different clause on a different axis (COMPLIANCE §1.7).
//
// These two fixtures are the discriminating pair: each must produce exactly one kind and
// none of the other. Asserting only "Matthew warns" would pass with the kinds still merged.
const isRetrieval = (w) => Boolean(w.reason);

// Matthew at 13 ch/part: part 2 is 532 verses, over ESV's 500-verse REQUEST cap. It is also
// only about half of Matthew, so it is NOT a display violation — the old copy's claim.
const matt13 = planSeriesParts({
	passages: [MATT],
	chaptersPerPart: 13,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
check('13 ch/part gives 3 parts', matt13.parts.length, 3);
check('part 2 is the 532-verse one', matt13.parts[1].verseCount, 532);
check('exactly one warning', matt13.warnings.length, 1);
check('and it is a retrieval failure', matt13.warnings.filter(isRetrieval).length, 1);
check('not a display one', matt13.warnings.filter((w) => !isRetrieval(w)).length, 0);
check('tagged with the reason the form reads', matt13.warnings[0].reason, 'exceeds-request');

// Galatians at 5 ch/part: 131 verses fetches fine, but exceeds the half-book display cap of
// 74. The inverse case, and the one the yellow copy was always right about.
const GAL = { testament: 'NT', book: 'GA', fromChapter: 1, fromVerse: 1, toChapter: 6, toVerse: 18 };
const gal5 = planSeriesParts({
	passages: [GAL],
	chaptersPerPart: 5,
	translationId: 'esv',
	baseTitle: 'Galatians'
});
check('Galatians warns once', gal5.warnings.length, 1);
check('as a display violation', gal5.warnings.filter((w) => !isRetrieval(w)).length, 1);
check('with no retrieval failure', gal5.warnings.filter(isRetrieval).length, 0);
assert('so it is not blocked, only advised', gal5.warnings[0].message.includes('half of Galatians'));

// The partition must account for every warning, or a future third kind would silently adopt
// whichever sentence it fell into.
for (const [label, plan] of [
	['Matthew@13', matt13],
	['Galatians@5', gal5]
]) {
	check(
		`${label}: every warning lands in exactly one bucket`,
		plan.warnings.filter(isRetrieval).length + plan.warnings.filter((w) => !isRetrieval(w)).length,
		plan.warnings.length
	);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
