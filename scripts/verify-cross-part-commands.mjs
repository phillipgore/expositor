/**
 * Verify the cross-part seam predicates (SERIES_PLAN §8, §11 option 1).
 *
 * ## The regression this exists to pin
 *
 * `+layout.server.js` emits `boundaryBefore: index > 0 ? getBoundaryDisabledReason(...) : null`, so
 * `null` means BOTH "this seam is contiguous" and "there is no previous part". `MenuStructure.svelte`
 * read it only as the first, which enabled Join Up and Move Text Up on **part 1's first item** — and,
 * mirrored, both Down commands on the **last part's final item**. The click then cost a server round
 * trip to produce a refusal in an `alert()`.
 *
 * That is the same class of defect `setJoinNeighbours` was written to remove one level down, so it is
 * asserted here rather than left to a reviewer to spot again.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-cross-part-commands.mjs
 */

import {
	canJoinUpAcross,
	canJoinDownAcross,
	canMoveTextUpAcross,
	canMoveTextDownAcross,
	hasPreviousPart,
	hasNextPart
} from '../src/lib/utils/crossPartCommands.js';

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

/**
 * One part of a series, as the study layout publishes it.
 *
 * `boundaryBefore` / `boundaryAfter` follow the layout's own convention: null for a contiguous seam AND
 * for an absent one, which is precisely the ambiguity under test.
 */
function context({
	position,
	total,
	boundaryBefore = null,
	boundaryAfter = null,
	passageCount = 1,
	activePassageIndex = 0,
	isDocument = false
}) {
	return {
		seriesContext: { position, total, boundaryBefore, boundaryAfter },
		passageCount,
		activePassageIndex,
		isDocument
	};
}

const INELIGIBLE = "Ephesians and Philippians aren't adjacent in Scripture.";

console.log('\n── REGRESSION: the FIRST part has nothing above it ──');
// Part 1 of 3, contiguous series. `boundaryBefore` is null because no previous part exists — NOT
// because a seam is contiguous. Both Up commands must be dead.
const firstPart = context({ position: 1, total: 3 });
check('Join Up cannot cross above part 1', canJoinUpAcross(firstPart), false);
check('Move Text Up cannot cross above part 1', canMoveTextUpAcross(firstPart), false);
// ...while the trailing edge of the same part is genuinely open.
check('but Join Down still reaches part 2', canJoinDownAcross(firstPart), true);
check('and Move Text Down does too', canMoveTextDownAcross(firstPart), true);

console.log('\n── REGRESSION: the LAST part has nothing below it ──');
const lastPart = context({ position: 3, total: 3 });
check('Join Down cannot cross below the last part', canJoinDownAcross(lastPart), false);
check('Move Text Down cannot either', canMoveTextDownAcross(lastPart), false);
check('but Join Up still reaches part 2', canJoinUpAcross(lastPart), true);
check('and Move Text Up does too', canMoveTextUpAcross(lastPart), true);

console.log('\n── a MIDDLE part with contiguous seams is open in both directions ──');
const middle = context({ position: 2, total: 3 });
check('Join Up', canJoinUpAcross(middle), true);
check('Join Down', canJoinDownAcross(middle), true);
check('Move Text Up', canMoveTextUpAcross(middle), true);
check('Move Text Down', canMoveTextDownAcross(middle), true);

console.log('\n── an INELIGIBLE seam is refused even though a neighbour exists ──');
// Prison Epistles: part 2 of 4, but Ephesians → Philippians is not canonically contiguous. A neighbour
// existing is necessary and NOT sufficient — both clauses are required.
const ineligible = context({
	position: 2,
	total: 4,
	boundaryBefore: INELIGIBLE,
	boundaryAfter: INELIGIBLE
});
check('Join Up refused', canJoinUpAcross(ineligible), false);
check('Join Down refused', canJoinDownAcross(ineligible), false);
check('Move Text Up refused', canMoveTextUpAcross(ineligible), false);
check('Move Text Down refused', canMoveTextDownAcross(ineligible), false);

console.log('\n── the two edges are read INDEPENDENTLY, never from one seam ──');
// Contiguous before, ineligible after. Reusing the leading-edge rule for a Down command — the trap the
// module header names — would report `true` here.
const mixed = context({ position: 2, total: 4, boundaryBefore: null, boundaryAfter: INELIGIBLE });
check('Join Up follows boundaryBefore', canJoinUpAcross(mixed), true);
check('Join Down follows boundaryAfter', canJoinDownAcross(mixed), false);
check('Move Text Up follows boundaryBefore', canMoveTextUpAcross(mixed), true);
check('Move Text Down follows boundaryAfter', canMoveTextDownAcross(mixed), false);

console.log('\n── an INTERNAL passage seam is always eligible, whatever the part edges say ──');
// A multi-passage part (§5, part-per-passage). Passage 1 of 2 inside the FIRST part: the seam above the
// selection is internal to the study, so it is joinable even though the part has no predecessor.
const internal = context({
	position: 1,
	total: 3,
	boundaryBefore: INELIGIBLE,
	passageCount: 2,
	activePassageIndex: 1
});
check('Join Up crosses an internal seam', canJoinUpAcross(internal), true);
check('Move Text Up crosses an internal seam', canMoveTextUpAcross(internal), true);

const internalDown = context({
	position: 3,
	total: 3,
	boundaryAfter: INELIGIBLE,
	passageCount: 2,
	activePassageIndex: 0
});
check('Join Down crosses an internal seam', canJoinDownAcross(internalDown), true);
check('Move Text Down crosses an internal seam', canMoveTextDownAcross(internalDown), true);

console.log('\n── fails CLOSED on anything it cannot resolve ──');
// A standalone study has no series context at all: no part edge exists to cross.
const standalone = {
	seriesContext: null,
	passageCount: 1,
	activePassageIndex: 0,
	isDocument: false
};
check('no series context ⇒ Join Up dead', canJoinUpAcross(standalone), false);
check('no series context ⇒ Join Down dead', canJoinDownAcross(standalone), false);

// An unresolved selection (content still streaming) must not be read as passage 0.
const unresolved = context({ position: 2, total: 3, activePassageIndex: null });
check('unresolved passage index ⇒ Join Up dead', canJoinUpAcross(unresolved), false);
check('unresolved passage index ⇒ Join Down dead', canJoinDownAcross(unresolved), false);

// A malformed context must not read as permissive — that is how the original defect behaved.
const malformed = {
	seriesContext: { boundaryBefore: null, boundaryAfter: null },
	passageCount: 1,
	activePassageIndex: 0,
	isDocument: false
};
check('missing position/total ⇒ Join Up dead', canJoinUpAcross(malformed), false);
check('missing position/total ⇒ Join Down dead', canJoinDownAcross(malformed), false);

console.log('\n── the Document view is read-only, so nothing crosses there ──');
const documentView = context({ position: 2, total: 3, isDocument: true });
check('Join Up', canJoinUpAcross(documentView), false);
check('Join Down', canJoinDownAcross(documentView), false);
check('Move Text Up', canMoveTextUpAcross(documentView), false);
check('Move Text Down', canMoveTextDownAcross(documentView), false);

console.log('\n── the neighbour-existence helpers answer on their own ──');
check('part 1 of 3 has no previous', hasPreviousPart({ position: 1, total: 3 }), false);
check('part 2 of 3 has a previous', hasPreviousPart({ position: 2, total: 3 }), true);
check('part 3 of 3 has no next', hasNextPart({ position: 3, total: 3 }), false);
check('part 2 of 3 has a next', hasNextPart({ position: 2, total: 3 }), true);
check('a one-part series has neither', hasPreviousPart({ position: 1, total: 1 }), false);
check('...in both directions', hasNextPart({ position: 1, total: 1 }), false);
check('null context has no previous', hasPreviousPart(null), false);
check('null context has no next', hasNextPart(null), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
