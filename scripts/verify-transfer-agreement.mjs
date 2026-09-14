/**
 * Verify the CLIENT and SERVER agree about Move Selected Up / Down (SERIES_PLAN §8).
 *
 * ## Why this exists
 *
 * The rule runs twice: `itemTransfer.js` resolves it authoritatively over the full sequence, and
 * `transferNeighbours.js` resolves it in the browser over the rendered study so the menu can disable a
 * dead command rather than offering it and refusing after a round trip.
 *
 * Two implementations of one rule drift, and silently — each looks right on its own, and the symptom
 * is a button that is live when it should be dead (the defect that forced the client copy in the first
 * place) or dead when it should be live, which nobody reports because it looks intentional.
 *
 * So this runs both over the SAME fixtures, in both directions, at all three tiers, and asserts they
 * return the same verdict and the same sentence. The sentences are shared constants, so a mismatch
 * here means the LOGIC diverged, which is the thing worth catching.
 *
 * ⚠️ The two take different shapes — the server a `sequence` of passage entries with `tree`, the client
 * `passagesWithText` with `structure.columns` — so the fixture is written once and projected into each.
 * That projection is itself a claim about how the two relate, which is why it lives here in the test
 * rather than in either module.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-transfer-agreement.mjs
 */

import { resolveTransfer } from '../src/lib/utils/itemTransfer.js';
import { resolveTransferNeighbours } from '../src/lib/utils/transferNeighbours.js';

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

const w = (c, v) => `MT-${String(c).padStart(3, '0')}-${String(v).padStart(3, '0')}-001`;
const seg = (id, c, v) => ({ id, startingWordId: w(c, v) });
const sec = (id, c, v, segments) => ({ id, startingWordId: w(c, v), segments });
const col = (id, c, v, sections) => ({ id, startingWordId: w(c, v), sections });

// ── One fixture, two projections ──
//
// Part A: column A1 { s1 [g1 g2 g3], s2 [g4] }, column A2 { s3 [g5] }
// Part B: column B1 { s4 [g6] }
//
// g2 is the mid-section segment from the reported screenshot: it has a segment either side of it
// INSIDE its own section, so it may move in neither direction.
const partA = [
	col('A1', 5, 1, [
		sec('s1', 5, 1, [seg('g1', 5, 1), seg('g2', 5, 3), seg('g3', 5, 5)]),
		sec('s2', 5, 10, [seg('g4', 5, 10)])
	]),
	col('A2', 6, 1, [sec('s3', 6, 1, [seg('g5', 6, 1)])])
];
const partB = [col('B1', 7, 1, [sec('s4', 7, 1, [seg('g6', 7, 1)])])];

// The SERVER sees both parts as one sequence.
const sequence = [
	{ passageId: 'pa', studyId: 'A', tree: partA },
	{ passageId: 'pb', studyId: 'B', tree: partB }
];

// The CLIENT sees only part A, plus a series context describing its two edges.
const passages = [{ structure: { passageId: 'pa', columns: partA } }];
const seriesContext = { position: 1, total: 2, boundaryBefore: null, boundaryAfter: null };

const selectionFor = (tier, id) =>
	tier === 'column'
		? { columnId: id }
		: tier === 'section'
			? { sectionId: id }
			: { segmentId: id };

/**
 * Assert both implementations agree about one item in one direction.
 *
 * `expectOk` is stated explicitly rather than derived from either side — otherwise two implementations
 * that are wrong in the SAME way would agree with each other and pass.
 */
function agree(label, tier, id, direction, expectOk) {
	const server = resolveTransfer({ sequence, granularity: tier, itemId: id, direction });
	const client = resolveTransferNeighbours(passages, selectionFor(tier, id), seriesContext);
	const clientOk = direction === 'up' ? client.canMoveUp : client.canMoveDown;
	const clientReason = direction === 'up' ? client.upReason : client.downReason;

	check(`${label} — server`, server.ok, expectOk);
	check(`${label} — client`, clientOk, expectOk);
	if (!expectOk) {
		check(`${label} — same reason`, clientReason, server.reason);
	}
}


console.log('\n── THE REPORTED DEFECT: a segment mid-section can move in neither direction ──');
// g2 has g1 above and g3 below, inside section s1. Both commands must be dead. This is the case the
// menu got wrong: `hasJoinPredecessor` said "yes, there are other segments in this study" and enabled
// both items.
agree('g2 (mid-section) up', 'segment', 'g2', 'up', false);
agree('g2 (mid-section) down', 'segment', 'g2', 'down', false);

console.log('\n── segments move between SECTIONS, from a section edge ──');
agree('g1 (first of s1) up — nothing precedes it anywhere', 'segment', 'g1', 'up', false);
agree('g3 (last of s1) down into s2', 'segment', 'g3', 'down', true);
agree('g4 (only of s2) up into s1', 'segment', 'g4', 'up', true);
agree('g4 (only of s2) down into s3', 'segment', 'g4', 'down', true);
// g5 is the last segment of part A. Its next section is in part B, across a usable seam.
agree('g5 (last of part A) down into part B', 'segment', 'g5', 'down', true);

console.log('\n── sections move between COLUMNS, from a column edge ──');
agree('s1 (first of A1) down — s2 follows it in A1', 'section', 's1', 'down', false);
agree('s2 (last of A1) down into A2', 'section', 's2', 'down', true);
agree('s1 (first of A1) up — no column before A1 in this part', 'section', 's1', 'up', false);
agree('s3 (only of A2) up into A1', 'section', 's3', 'up', true);
// s3 is in part A's last column, so down crosses into part B's first column.
agree('s3 (last of part A) down into part B', 'section', 's3', 'down', true);

console.log('\n── columns move between PARTS ONLY, from a part edge ──');
// ⚠️ A1 has a column after it INSIDE its part, so it is not at its part's edge.
agree('A1 down — not at the part edge', 'column', 'A1', 'down', false);
agree('A1 up — nothing precedes part A', 'column', 'A1', 'up', false);
agree('A2 (last of part A) down into part B', 'column', 'A2', 'down', true);
agree('A2 up — not at the part’s leading edge', 'column', 'A2', 'up', false);

console.log('\n── an INELIGIBLE seam closes the part-crossing moves ──');
{
	const blocked = {
		position: 1,
		total: 2,
		boundaryBefore: null,
		boundaryAfter: 'Matthew and Mark aren’t adjacent.'
	};
	check(
		'the client refuses a column across a dead seam',
		resolveTransferNeighbours(passages, { columnId: 'A2' }, blocked).canMoveDown,
		false
	);
	check(
		'...and a section too',
		resolveTransferNeighbours(passages, { sectionId: 's3' }, blocked).canMoveDown,
		false
	);
	check(
		'...and a segment too',
		resolveTransferNeighbours(passages, { segmentId: 'g5' }, blocked).canMoveDown,
		false
	);
}

console.log('\n── the client fails CLOSED when it cannot answer ──');
check('no selection', resolveTransferNeighbours(passages, {}, seriesContext).canMoveUp, false);
check('no structure', resolveTransferNeighbours([], { segmentId: 'g1' }, seriesContext).canMoveDown, false);
check('unknown id', resolveTransferNeighbours(passages, { segmentId: 'nope' }, seriesContext).canMoveDown, false);
// A standalone study has no series context, so nothing may leave it — but internal moves still work.
check('standalone: no part to cross into', resolveTransferNeighbours(passages, { columnId: 'A2' }, null).canMoveDown, false);
check('standalone: internal section move still allowed', resolveTransferNeighbours(passages, { sectionId: 's2' }, null).canMoveDown, true);

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
