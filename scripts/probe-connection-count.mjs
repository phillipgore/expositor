/**
 * Prove that the Join confirm modal counts CROSS-PART connections (SERIES_PLAN §14, Q23).
 *
 * ## The defect this pins
 *
 * SERIES_PLAN recorded it in one line: "`countTouchingConnections()` filters on it and so silently
 * under-reports." The deferral said the fix "belongs to the phase shipping boundary moves" — that phase
 * has shipped, so the condition the deferral rested on has expired.
 *
 * The mechanism. `segment_connection.studyId` is `.notNull()` and names ONE study. A boundary move can
 * slide structure into a sibling part, leaving a connection whose two endpoints live in different parts;
 * phase 3 stopped deleting those rows and began stamping them with `seriesId` instead. The row therefore
 * survives holding the OTHER part's `studyId`, and a count filtered on `studyId` misses precisely the
 * links a Join is most likely to disturb.
 *
 * ⚠️ Why this needs a database and not a unit test. The whole failure is a WHERE clause: with a stub
 * there is no clause to get wrong. And the symptom is a count of 0, which is indistinguishable from "no
 * connections" — so nothing short of a real row with a foreign `studyId` and a matching `seriesId`
 * demonstrates either the bug or the fix.
 *
 * Run with `npm run probe:conn-count`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-cc-';
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

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	await sql`DELETE FROM segment_connection WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM "user" WHERE id LIKE ${PREFIX + '%'}`;
}

/** A part with one passage, one column, one section and two segments. */
async function seedPart({ id, userId, seriesId, order, fromCh, toCh }) {
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
	          VALUES (${id}, ${'Part ' + id}, 'esv', ${userId}, ${seriesId}, ${order}, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse,
	                              to_chapter, to_verse, display_order, created_at)
	          VALUES (${id + '-pg'}, ${id}, 'NT', 'RO', 'Romans', ${fromCh}, 1, ${toCh}, 32, 0, now())`;
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at)
	          VALUES (${id + '-col'}, ${id + '-pg'}, ${id + '-w1'}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, created_at, updated_at)
	          VALUES (${id + '-sec'}, ${id + '-col'}, ${id + '-w1'}, now(), now())`;
	// Two segments: joining the SECOND is legal (the first has no predecessor to fold into).
	for (const n of [1, 2]) {
		await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, created_at, updated_at)
		          VALUES (${`${id}-seg${n}`}, ${id + '-sec'}, ${`${id}-w${n}`}, now(), now())`;
	}
	return { segment2: `${id}-seg2` };
}

try {
	await cleanup();

	const userId = `${PREFIX}user`;
	await sql`INSERT INTO "user" (id, name, email, email_verified, first_name, last_name, created_at, updated_at)
	          VALUES (${userId}, 'Probe CC', ${userId + '@probe.invalid'}, false, 'Probe', 'CC', now(), now())`;

	const seriesId = `${PREFIX}series`;
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at)
	          VALUES (${seriesId}, 'Probe CC Series', ${userId}, now(), now())`;

	const partA = `${PREFIX}pA`;
	const partB = `${PREFIX}pB`;
	const a = await seedPart({ id: partA, userId, seriesId, order: 0, fromCh: 1, toCh: 4 });
	const b = await seedPart({ id: partB, userId, seriesId, order: 1, fromCh: 5, toCh: 8 });

	// ── The cross-part connection ─────────────────────────────────────────────
	//
	// This is the exact row a boundary move leaves behind: it touches a segment in part A, but its
	// `study_id` names part B, and `series_id` is stamped so both parts can find it. Before the fix,
	// `countTouchingConnections(partA, ...)` filtered on `study_id = partA` and never saw this row.
	await sql`INSERT INTO segment_connection
	            (id, study_id, series_id, from_segment_id, to_segment_id, from_type, to_type, created_at, updated_at)
	          VALUES (${PREFIX + 'conn'}, ${partB}, ${seriesId}, ${a.segment2}, ${b.segment2},
	                  'segment', 'segment', now(), now())`;

	console.log('\nFixture: connection touching part A, but study_id = part B, series_id stamped.\n');

	// Sanity: the row really is invisible to a study-scoped query. If this ever returns 1, the fixture
	// no longer reproduces the defect and every assertion below would be meaningless.
	const [narrow] = await sql`
		SELECT count(*)::int AS n FROM segment_connection
		WHERE study_id = ${partA} AND (from_segment_id = ${a.segment2} OR to_segment_id = ${a.segment2})`;
	check('a study_id-only query finds 0 — the old behaviour', narrow.n, 0);

	const [wide] = await sql`
		SELECT count(*)::int AS n FROM segment_connection
		WHERE (study_id = ${partA} OR series_id = ${seriesId})
		  AND (from_segment_id = ${a.segment2} OR to_segment_id = ${a.segment2})`;
	check('the widened query finds 1 — what the fix must report', wide.n, 1);

	// ── The real code path ────────────────────────────────────────────────────
	console.log('\n── analyzeJoin() surfaces the cross-part connection ──');
	const { db } = await import('../src/lib/server/db/index.js');
	const { analyzeJoin } = await import('../src/lib/server/db/passageJoin.js');

	const result = await analyzeJoin(db, userId, 'segment', a.segment2);
	// The user-visible consequence: without this, the modal said nothing about connections and the join
	// silently altered a cross-part link.
	check('the summary names connections', result.summary.includes('connection'), true);
	check('and the join requires a decision', result.needsDecision, true);

	// ── A standalone study must be unaffected ─────────────────────────────────
	console.log('\n── a standalone study still counts only its own ──');
	const solo = `${PREFIX}solo`;
	const s = await seedPart({ id: solo, userId, seriesId: null, order: null, fromCh: 9, toCh: 11 });
	const soloResult = await analyzeJoin(db, userId, 'segment', s.segment2);
	// No seriesId, so the widened branch is not taken at all: no connections exist for it, and the
	// series' rows must NOT leak in.
	check('no connections are reported', soloResult.summary.includes('connection'), false);
	check('and no decision is needed', soloResult.needsDecision, false);
} catch (error) {
	fail += 1;
	console.error('\nProbe failed:', error);
} finally {
	await cleanup();
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
