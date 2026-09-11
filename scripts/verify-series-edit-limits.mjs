/**
 * Verify the SERIES-EDIT chokepoints judge retrieval limits on the PARTS, not the source range.
 *
 * ## Why this file exists
 *
 * A user opened an existing 28-part Matthew series, changed nothing but its subtitle, and was
 * refused at Save with:
 *
 *   "This passage spans 1071 verses. The ESV API accepts at most 500 verses per request, and
 *    one passage is one request. Add it as several smaller passages, or choose a translation
 *    that can load this range as one passage."
 *
 * Unfollowable advice, and for a sharper reason than the New Study case: the series they were
 * editing WAS the division being demanded of them. The form showed "4 parts · avg 268 verses
 * each" and an enabled Save at the same moment.
 *
 * The cause is the edit form's own load path. `series/[id]/edit/+page.server.js` calls
 * `recomposePassages(parts)` so the passage list shows the study's extent as editable ranges —
 * Matthew 1:1–28:20 — and `analyze-edit` then asked `validatePassagesLimits()` about that
 * recomposed whole. The client had already been made series-aware
 * (`submissionBlockedByPassages`), and so had the New Study action
 * (`verify-series-save-gate.mjs`); this endpoint was missed. Third occurrence of one defect,
 * which is COMPLIANCE §1.9 exactly: a check belongs at every chokepoint, on the correct unit.
 *
 * Crossway's caps are per REQUEST and per PAGE. A part is its own study, on its own page,
 * fetched by its own request — so the parts are what those clauses govern (COMPLIANCE §1.10).
 *
 * ## What it pins
 *
 *   1. Re-saving a 28-part Matthew series unchanged passes — the reported bug.
 *   2. A division that makes a part exceed ESV's 500-verse request cap is still refused, and
 *      names the part.
 *   3. A part carrying SEVERAL ranges is checked past the first, so an over-limit second range
 *      cannot slip through a check that only looked at `passages[0]`.
 *   4. Neither endpoint asks `validatePassagesLimits()` about the recomposed passages any more,
 *      and both ask the per-part question — read from source, so a rewrite that reintroduces
 *      the wrong unit fails here rather than silently.
 *
 * ⚠️ Mirrors the endpoints' DECISION rather than importing them: both are SvelteKit handlers
 * needing a request, a session and a database. What is checked is which helper answers, on
 * which unit, using the same helpers the endpoints call.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-series-edit-limits.mjs
 */

import { readFileSync } from 'node:fs';
import { planSeriesParts, findUnservablePart } from '../src/lib/utils/seriesPlanning.js';
import { recomposePassages } from '../src/lib/utils/seriesSeams.js';
import { validatePassagesLimits } from '../src/lib/utils/translationLimits.js';

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

/**
 * Drop `//` and block comments so a source assertion reads CODE rather than prose.
 *
 * Crude on purpose — it does not understand strings, so a `//` inside one would be eaten. That is
 * acceptable here because the only question asked of the result is whether a particular call
 * appears, and neither endpoint builds one in a string literal. It exists because the fix's own
 * warning comments name the forbidden call, and a check that a comment can fail is a check that
 * discourages writing the comment.
 */
function stripComments(source) {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The gate both series-edit endpoints now apply, expressed once.
 *
 * `chaptersPerPart` absent means "leave the seams alone", so the existing parts are judged —
 * which is the case the reported bug lived in.
 */
function gate({ projected, translationId, chaptersPerPart = null }) {
	const wanted = Number(chaptersPerPart);
	const planned =
		Number.isFinite(wanted) && wanted >= 1 && projected.length > 0
			? planSeriesParts({
					passages: recomposePassages(projected),
					chaptersPerPart: wanted,
					chaptersPerPassage: [],
					translationId,
					baseTitle: ''
				}).parts
			: null;

	const resulting = planned ?? projected;
	const unservable = findUnservablePart(resulting, translationId);

	return {
		blocked: Boolean(unservable),
		offender: unservable,
		partCount: resulting.length,
		unit: planned ? 'planned-part' : 'existing-part'
	};
}

/** A 28-part Matthew series as the edit form loads it: one chapter per part. */
function matthewParts() {
	return Array.from({ length: 28 }, (_, i) => ({
		id: `p${i + 1}`,
		seriesOrder: i + 1,
		title: `Matthew ${i + 1}`,
		passages: [
			{
				testament: 'NT',
				book: 'MT',
				fromChapter: i + 1,
				fromVerse: 1,
				toChapter: i + 1,
				// `toVerse` past the end of a chapter is clamped by `countVersesInRange`, so a
				// generous bound keeps this fixture from encoding 28 hand-copied verse totals
				// that would silently rot against `bibleData.js`.
				toVerse: 99
			}
		]
	}));
}

console.log('\n── the reported case: re-saving a 28-part Matthew series ──');
const parts = matthewParts();
const unchanged = gate({ projected: parts, translationId: 'esv' });
check('the existing parts are what get judged', unchanged.unit, 'existing-part');
check('all 28 of them', unchanged.partCount, 28);
assert('so an edit that changes only the subtitle saves', !unchanged.blocked);

console.log('\n── and the range it was WRONGLY judged on ──');
// Proof the fixture reproduces the bug's input: the recomposed whole really is over the cap, so
// the old code's refusal was not a fluke of this test's data.
const recomposed = recomposePassages(parts);
check('the parts recompose to one range', recomposed.length, 1);
check('spanning all 28 chapters', recomposed[0].toChapter, 28);
assert('which the OLD whole-range check refuses', !validatePassagesLimits(recomposed, 'esv').valid);
check(
	'with the message from the report',
	validatePassagesLimits(recomposed, 'esv').error.startsWith('This passage spans 1071 verses.'),
	true
);

console.log('\n── a division that makes a part unservable is still refused ──');
// One part for the whole book is 1071 verses, over ESV's 500-verse request cap. The rule was
// rescoped to the part, not removed.
const tooCoarse = gate({ projected: parts, translationId: 'esv', chaptersPerPart: 28 });
check('the planned parts are what get judged', tooCoarse.unit, 'planned-part');
assert('and the over-cap part blocks', tooCoarse.blocked);
assert('naming which part is at fault', Number.isFinite(tooCoarse.offender.seriesOrder));

// 14 chapters per part is two parts of roughly half Matthew each — the interesting middle case,
// where a part is under no obvious threshold yet still over 500 verses.
const half = gate({ projected: parts, translationId: 'esv', chaptersPerPart: 14 });
check('a two-part split plans two parts', half.partCount, 2);
assert('and is refused, because each half exceeds 500 verses', half.blocked);

console.log('\n── a workable division passes ──');
const workable = gate({ projected: parts, translationId: 'esv', chaptersPerPart: 4 });
check('7 parts at 4 chapters each', workable.partCount, 7);
assert('every one servable', !workable.blocked);

console.log('\n── NET chunks, so no division is refused ──');
const net = gate({ projected: parts, translationId: 'net', chaptersPerPart: 28 });
assert('the whole book as one NET part is fine', !net.blocked);

console.log('\n── a part with SEVERAL ranges is checked past the first ──');
// A part loaded from the database can carry several passage rows, and `projectExtent()` can
// leave it that way after narrowing. Checking only `passages[0]` would pass this.
const multiRange = [
	{
		id: 'p1',
		seriesOrder: 1,
		passages: [
			// Servable.
			{ testament: 'NT', book: 'MT', fromChapter: 1, fromVerse: 1, toChapter: 1, toVerse: 25 },
			// Not servable: the whole book, hiding behind an innocent first range.
			{ testament: 'NT', book: 'MT', fromChapter: 1, fromVerse: 1, toChapter: 28, toVerse: 20 }
		]
	}
];
assert('the second range is found', Boolean(findUnservablePart(multiRange, 'esv')));
check('and attributed to part 1', findUnservablePart(multiRange, 'esv').seriesOrder, 1);

console.log('\n── an empty set is not an error ──');
check('no parts, no offender', findUnservablePart([], 'esv'), null);
check('and neither is a malformed input', findUnservablePart(null, 'esv'), null);

console.log('\n── the endpoints actually apply this ──');
for (const path of [
	'src/routes/api/series/[id]/analyze-edit/+server.js',
	'src/routes/api/series/[id]/reserialize/+server.js'
]) {
	console.log(`  ${path}`);
	const source = readFileSync(path, 'utf8');
	// Comments stripped before the negative assertion below. Both endpoints now carry a warning
	// naming `validatePassagesLimits()` as the call that must NOT return — prose that would
	// otherwise fail the very check it exists to explain. Positive assertions read the raw
	// source, since a call cannot hide in a comment.
	const code = stripComments(source);

	assert('    asks the per-part question', source.includes('findUnservablePart('));
	assert('    against the projected parts', source.includes('projectExtent('));
	assert('    plans the requested division', source.includes('planSeriesParts('));
	assert('    and names the offending part', source.includes('cannot be loaded:'));

	// ⚠️ The heart of this file. Asking that helper about the recomposed `desiredPassages` IS
	// the bug; if either endpoint calls it again, the 28-part Matthew series stops saving.
	assert('    does NOT judge the recomposed source range', !code.includes('atePassagesLimits('));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
