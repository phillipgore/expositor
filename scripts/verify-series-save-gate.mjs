/**
 * Verify the New Study server action's passage-limit gate is series-aware.
 *
 * ## Why this file exists
 *
 * A user asked for a Matthew series and was refused at save with:
 *
 *   "This passage spans 1071 verses. The ESV API accepts at most 500 verses per request, and
 *    one passage is one request. Add it as several smaller passages, or choose a translation
 *    that can load this range as one passage."
 *
 * That advice was unfollowable: they HAD divided it, by asking for a series. §5 creates-then-
 * parts, so the passages reaching the server action are still the undivided whole-book range,
 * and `validatePassagesLimits()` was being asked about that range unconditionally.
 *
 * The identical defect had already been found and fixed on the CLIENT
 * (`submissionBlockedByPassages` in StudyForm.svelte, and `verify-chapter-verse-bounds.mjs`
 * which pins the reasoning behind it). The server was missed. That is COMPLIANCE §1.9 — a
 * check belongs at every chokepoint, not the one that came to mind first — and it survived
 * because no automated gate covered the server path. This file is that gate.
 *
 * ## What it pins
 *
 *   1. A whole-book series at 1 chapter per part passes: every part is servable.
 *   2. The SAME range as one study still fails: the fix must not weaken the one-study rule.
 *   3. A "series" that collapses to fewer than 2 parts still fails, because no conversion
 *      happens and an unservable single study would otherwise be created. Without this,
 *      `createAsSeries=true` is a trivial bypass of the passage limit.
 *
 * ⚠️ This mirrors the server action's decision rather than importing it: the action is a
 * SvelteKit `actions.default` needing a request, a session and a database. What is checked
 * here is the DECISION — which helper answers, on which unit — using the same helpers the
 * action calls. The assertions at the end read the action's source, so a rewrite that stops
 * asking the per-part question fails here rather than silently reintroducing the bug.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-save-gate.mjs
 */

import { readFileSync } from 'node:fs';
import { planSeriesParts } from '../src/lib/utils/seriesPlanning.js';
import {
	checkSinglePassageSupport,
	validatePassagesLimits
} from '../src/lib/utils/translationLimits.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

/** The gate the server action applies, expressed once. */
function gate({ passages, translationId, createAsSeries, chaptersPerPart = 1 }) {
	const plan = createAsSeries
		? planSeriesParts({ passages, chaptersPerPart, translationId, baseTitle: 'T' })
		: null;

	const willBeSeries = (plan?.parts?.length ?? 0) >= 2;

	if (willBeSeries) {
		const unservable = plan.parts
			.map((part) => checkSinglePassageSupport(part.passages[0], translationId))
			.find((r) => !r.canBeSinglePassage);
		return { blocked: Boolean(unservable), unit: 'part' };
	}

	const limitCheck = validatePassagesLimits(passages, translationId);
	return { blocked: !limitCheck.valid, unit: 'study' };
}

// Matthew 1:1–28:20 — 1071 verses, the range from the report.
const matthew = [
	{ testament: 'NT', book: 'MT', fromChapter: 1, fromVerse: 1, toChapter: 28, toVerse: 20 }
];

console.log('\n── the reported case: a whole-book series is no longer refused ──');
const asSeries = gate({
	passages: matthew,
	translationId: 'esv',
	createAsSeries: true,
	chaptersPerPart: 1
});
check('the parts are what get judged', asSeries.unit, 'part');
assert('so a Matthew series saves', !asSeries.blocked);

const plan = planSeriesParts({
	passages: matthew,
	chaptersPerPart: 1,
	translationId: 'esv',
	baseTitle: 'Matthew'
});
check('28 parts, one per chapter', plan.parts.length, 28);
assert(
	'every part is servable',
	plan.parts.every((p) => checkSinglePassageSupport(p.passages[0], 'esv').canBeSinglePassage)
);

console.log('\n── but the one-study rule is untouched ──');
const asStudy = gate({ passages: matthew, translationId: 'esv', createAsSeries: false });
check('the whole range is what gets judged', asStudy.unit, 'study');
assert('so the same range as ONE study is still refused', asStudy.blocked);

console.log('\n── and the bypass is closed ──');
// The bypass that matters: claim a series on an oversized range, but choose a setting that
// yields fewer than 2 parts. No conversion happens, so the study stays whole and the
// one-study check must still catch it.
const collapsedOversized = gate({
	passages: matthew,
	translationId: 'esv',
	createAsSeries: true,
	chaptersPerPart: 28
});
check('an oversized range claiming a series is judged as a study', collapsedOversized.unit, 'study');
assert('and is still refused', collapsedOversized.blocked);

console.log('\n── a genuinely unservable part would still block ──');
// The rule was rescoped, not removed. `checkSinglePassageSupport` is what the per-part branch
// calls, and it still refuses an over-ceiling range — so a stepper setting producing such a
// part is caught.
assert(
	'a 1071-verse range is not servable as one passage',
	!checkSinglePassageSupport(matthew[0], 'esv').canBeSinglePassage
);

console.log('\n── the server action actually applies this ──');
const source = readFileSync('src/routes/(app)/new-study/+page.server.js', 'utf8');
assert('it plans the parts', source.includes('planSeriesParts('));
assert('it asks the per-part question', source.includes('checkSinglePassageSupport('));
assert('it still has the one-study fallback', source.includes('validatePassagesLimits('));
assert('the fallback is gated on a real series', source.includes('willBeSeries'));
assert('and the <2-parts guard is present', /parts\?\.length \?\? 0\) >= 2/.test(source));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
