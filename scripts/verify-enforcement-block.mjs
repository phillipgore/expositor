/**
 * Verify Q41: a boundary move under `enforcement: 'block'` refuses BEFORE writing, never mid-gesture.
 *
 * ## Why this needs its own script
 *
 * ESV ships `enforcement: 'block'` for display since 2026-09-24; NET still warns. This path was
 * latent when the script was written — unreachable through the app, exercised by no probe — which is
 * precisely the kind of code that rots: written once, never run, and wrong by the time someone flips
 * the flag. It is now live for ESV, and these assertions inverted when the flag flipped, which is the
 * service they were built to perform.
 *
 * So the decision is pinned here against a synthetic 'block' translation. The plan says a thrown error
 * "is not a design" and recommends a declinable pre-move confirmation; this asserts the shape that
 * implements it — a fact on the analysis object, computed before any write, that the router turns into
 * a clean 409.
 */

import { readFileSync } from 'node:fs';

import { getDisplayLimits } from '../src/lib/utils/translationLimits.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (JSON.stringify(actual) === JSON.stringify(expected)) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

/**
 * The rule `displayWarnings()` applies, isolated so it can be checked without a database.
 *
 * Kept deliberately in step with crossPartJoin.js: a block requires BOTH that the translation enforces
 * blocking AND that this particular move actually produces a warning. Blocking on enforcement alone
 * would refuse every cross-part join under a 'block' translation, including compliant ones.
 */
const isBlocked = (enforcement, receiver, donor) =>
	enforcement === 'block' && (receiver.length > 0 || donor.length > 0);

// ⚠️ These two assertions INVERTED on 2026-09-24, when ESV display enforcement flipped to
// 'block'. They previously read "ESV warns" and "so a breaching move is NOT blocked today", and
// they failed the moment the JSON changed — which is exactly what they were for. The path this
// script covers is no longer latent for ESV; it is live, and the rest of the file now describes
// running code rather than a contingency.
//
// The flip was not a licence-posture decision but a correctness one: Crossway enforces the
// half-book rule server-side by silently truncating, so a study that breaches it renders
// "Error loading …" instead of text. Blocking at creation refuses a study that cannot work.
// Whole-book study remains available through Serialization, where the page rule applies per part.
console.log('\n── ESV blocks; NET still warns, so both postures stay covered ──');
check('ESV blocks', getDisplayLimits('esv').enforcement, 'block');
check('NET warns', getDisplayLimits('net').enforcement, 'warn');
check(
	'so a breaching ESV move IS blocked',
	isBlocked(getDisplayLimits('esv').enforcement, ['over half the book'], []),
	true
);
check(
	'while the same move under NET is not',
	isBlocked(getDisplayLimits('net').enforcement, ['over half the book'], []),
	false
);

console.log('\n── under block, a breach on EITHER side refuses ──');
check('the receiver breaching blocks', isBlocked('block', ['too much'], []), true);
// The donor matters too: §10.1 requires re-validating both parts, because a move can push the part
// that GIVES verses into breach as easily as the one that receives them.
check('the donor breaching also blocks', isBlocked('block', [], ['too much']), true);
check('both breaching blocks', isBlocked('block', ['a'], ['b']), true);

console.log('\n── but a compliant move under block still proceeds ──');
// The assertion that matters most. Blocking on `enforcement` alone would refuse every cross-part join
// for a 'block' translation, turning a licence ceiling into a ban on the feature.
check('no warnings means no block', isBlocked('block', [], []), false);

console.log('\n── the refusal is a returned fact, not a thrown error (Q41) ──');
// A thrown error is what the plan explicitly rules out: it strands a direct-manipulation gesture with
// nothing explained. `blocked` is a boolean on the analysis object, so the endpoint can answer 409 with
// the reason attached and nothing half-written.
check('blocked is a boolean', typeof isBlocked('block', ['x'], []), 'boolean');
check('and it is false rather than undefined when compliant', isBlocked('warn', [], []), false);

console.log('\n── ⚠️ this script reproduces the rule, so check it against the source ──');
// The honest weakness of the above: `isBlocked` is a COPY of the condition in crossPartJoin.js, because
// the real one lives inside a function that needs a database. A copy can drift out of step and keep
// passing, which is the "green because it tests itself" failure this feature has hit before.
//
// So the source text is asserted directly. Crude, but it fails loudly if someone changes the condition
// without changing this file — which is exactly the drift that would otherwise go unnoticed.
const source = readFileSync('src/lib/server/db/crossPartJoin.js', 'utf8');
check(
	'crossPartJoin.js still requires enforcement === block',
	source.includes("enforcement === 'block'"),
	true
);
check(
	'and still requires a warning on one side or the other',
	/receiver\.length > 0 \|\| donor\.length > 0/.test(source),
	true
);
const router = readFileSync('src/lib/server/db/joinRouting.js', 'utf8');
check('the router refuses before joining', router.includes('cross.display?.blocked'), true);
check('with 409, not a throw', /status: 409/.test(router), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
