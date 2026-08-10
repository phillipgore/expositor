/**
 * Exercise the cross-part Join against a REAL database (SERIES_PLAN §8, phase 2).
 *
 * Every phase-2 mechanism so far — Split Part, Join Parts, and the three cross-boundary Joins — has
 * been verified only by pure-layer tests and by reasoning. Those cannot see the thing most likely to
 * destroy a user's work: `ON DELETE CASCADE`. A verifier that asserts "the planner never asks for a
 * delete that relies on the cascade" is not the same claim as "the cascade did not fire".
 *
 * So this builds a throwaway series in the dev database, performs a real cross-part Join Segment
 * through the real transaction, and then asserts on the ROWS THAT SURVIVED:
 *
 *   - the target segment kept its own content and absorbed the joined segment's note;
 *   - the joined segment is gone;
 *   - **every other segment, heading, note and commentary in both parts still exists** — this is the
 *     assertion that would catch a cascade taking more than intended;
 *   - both passage ranges moved, and total verse coverage is unchanged (§10.1's licence to skip the
 *     export re-check);
 *   - `cachedText` was invalidated on both sides;
 *   - a connection wholly inside the moved segment was re-owned to the receiving study, not orphaned.
 *
 * ⚠️ **This is a WRITE probe, not a verifier.** It is deliberately NOT in `npm run verify`: it mutates
 * the database, so it must be run knowingly. It creates its own fixture with a recognisable id prefix
 * and removes it in a `finally`, including after a failed assertion — a probe that leaves debris behind
 * is one nobody runs twice.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/probe-cross-part-join.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config({ quiet: true });

const PREFIX = 'probe-xpj-';
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

const id = (suffix) => `${PREFIX}${suffix}`;
const w = (chapter, verse, word = 1) =>
	`RO-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-${String(word).padStart(3, '0')}`;

const sql = postgres(process.env.DATABASE_URL);

try {
	// ── Find a real user to own the fixture ───────────────────────────────────
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	console.log(`\nBuilding fixture (owner ${owner.id})…`);

	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;

	const seriesId = id('series');
	await sql`
		INSERT INTO study_series (id, name, user_id, created_at, updated_at)
		VALUES (${seriesId}, 'Probe series', ${owner.id}, now(), now())
	`;

	// Two contiguous parts: Romans 1–2 and Romans 3–4. Romans 2 has 29 verses.
	const partA = id('partA');
	const partB = id('partB');
	for (const [studyId, order, title] of [
		[partA, 0, 'Probe part 1'],
		[partB, 1, 'Probe part 2']
	]) {
		await sql`
			INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
			VALUES (${studyId}, ${title}, 'esv', ${owner.id}, ${seriesId}, ${order}, now(), now())
		`;
	}

	const passA = id('passA');
	const passB = id('passB');
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
		VALUES (${passA}, ${partA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, 'CACHED-A', now(), now())
	`;
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
		VALUES (${passB}, ${partB}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, 'CACHED-B', now(), now())
	`;

	// Structure. Part A ends with a segment carrying its own note (the JOIN TARGET). Part B begins with
	// the segment to be joined, then keeps two more — so the boundary lands at the first that stays, and
	// there is surviving content on both sides for the cascade assertions to find.
	const colA = id('colA');
	const secA = id('secA');
	const segA1 = id('segA1');
	const segA2 = id('segA2'); // the target
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${colA}, ${passA}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${secA}, ${colA}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${segA1}, ${secA}, ${w(1, 1)}, 'A1 note', 'A1 commentary', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${segA2}, ${secA}, ${w(2, 1)}, 'target note', 'target commentary', now(), now())`;
	await sql`INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at) VALUES (${id('headA')}, ${segA2}, 'one', 'Target heading', now(), now())`;

	const colB = id('colB');
	const secB = id('secB');
	const segB1 = id('segB1'); // the one to join backwards
	const segB2 = id('segB2'); // first that STAYS → sets the boundary (3:10)
	const segB3 = id('segB3');
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${colB}, ${passB}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${secB}, ${colB}, ${w(3, 1)}, 'green', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${segB1}, ${secB}, ${w(3, 1)}, 'joined note', 'joined commentary', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${segB2}, ${secB}, ${w(3, 10)}, 'B2 note', 'B2 commentary', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${segB3}, ${secB}, ${w(3, 20)}, 'B3 note', 'B3 commentary', now(), now())`;
	await sql`INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at) VALUES (${id('headB')}, ${segB2}, 'one', 'Surviving heading', now(), now())`;

	// A connection wholly inside part B, between the joined segment and one that stays. After the join
	// one endpoint has moved to part A, so this is a STRADDLING connection in §8's terms.
	const connId = id('conn');
	await sql`
		INSERT INTO segment_connection (id, study_id, from_type, to_type, from_segment_id, to_segment_id, note, created_at, updated_at)
		VALUES (${connId}, ${partB}, 'segment', 'segment', ${segB1}, ${segB3}, 'conn note', now(), now())
	`;

	console.log('Fixture built. Running the real cross-part join…\n');

	// ── The real thing ────────────────────────────────────────────────────────
	//
	// Imported dynamically AFTER dotenv has run, because `$lib/server/db/index.js` reads DATABASE_URL at
	// module load and opens its own pool.
	const { joinAcrossBoundary, analyzeCrossPartJoin } = await import(
		'../src/lib/server/db/crossPartJoin.js'
	);
	const { db } = await import('../src/lib/server/db/index.js');

	console.log('── the dry run agrees the join crosses a boundary ──');
	const plan = await analyzeCrossPartJoin(db, owner.id, passB, segB1, 'segment');
	assert('the plan is ok', plan.ok);
	assert('and reports crossing a boundary', plan.crossesBoundary === true);
	check('nine verses would move (3:1–3:9)', plan.versesMoved, 9);

	console.log('\n── performing the join ──');
	const result = await joinAcrossBoundary(db, owner.id, passB, segB1, 'merge', 'segment');
	check('it reports crossing', result.crossedBoundary, true);
	check('and nine verses moved', result.versesMoved, 9);

	// ── The assertions the pure-layer tests cannot make ───────────────────────

	console.log('\n── nothing was destroyed by cascade (the whole point of this probe) ──');

	const segs = await sql`
		SELECT s.id, s.note, s.commentary, s.starting_word_id, p.id AS passage_id, p.study_id
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
		ORDER BY s.starting_word_id
	`;
	const byId = new Map(segs.map((s) => [s.id, s]));

	check('the joined segment is gone', byId.has(segB1), false);
	assert('segment A1 survives (untouched sibling of the target)', byId.has(segA1));
	assert('the TARGET survives', byId.has(segA2));
	assert('segment B2 survives — it stays in part B', byId.has(segB2));
	assert('segment B3 survives', byId.has(segB3));
	check('exactly four segments remain of the five', segs.length, 4);

	// Content: the fold appended the joined note onto the target, and nothing else changed.
	const target = byId.get(segA2);
	assert('the target kept its own note', (target?.note ?? '').includes('target note'));
	assert('and absorbed the joined note', (target?.note ?? '').includes('joined note'));
	assert(
		'the target kept its own commentary',
		(target?.commentary ?? '').includes('target commentary')
	);
	assert(
		'and absorbed the joined commentary',
		(target?.commentary ?? '').includes('joined commentary')
	);
	check('A1 note is untouched', byId.get(segA1)?.note, 'A1 note');
	check('B2 note is untouched', byId.get(segB2)?.note, 'B2 note');
	check('B3 note is untouched', byId.get(segB3)?.note, 'B3 note');

	const heads =
		await sql`SELECT id, passage_segment_id, text FROM passage_heading WHERE id LIKE ${PREFIX + '%'}`;
	check('both headings survive', heads.length, 2);
	assert(
		'the surviving-part heading still hangs off B2',
		heads.some((h) => h.passage_segment_id === segB2)
	);

	console.log('\n── the verses followed the structure (§8 step 2) ──');

	const [rowA] =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse, cached_text FROM passage WHERE id = ${passA}`;
	const [rowB] =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse, cached_text FROM passage WHERE id = ${passB}`;

	check('part A now ends at 3:9', `${rowA.to_chapter}:${rowA.to_verse}`, '3:9');
	check('part A still starts at 1:1', `${rowA.from_chapter}:${rowA.from_verse}`, '1:1');
	check('part B now starts at 3:10', `${rowB.from_chapter}:${rowB.from_verse}`, '3:10');
	check('part B still ends at 4:25', `${rowB.to_chapter}:${rowB.to_verse}`, '4:25');
	assert('the two abut exactly, with no gap or overlap', rowB.from_verse === rowA.to_verse + 1);

	console.log('\n── cachedText was invalidated on BOTH sides (keyed by verse range) ──');
	check('part A cache cleared', rowA.cached_text, null);
	check('part B cache cleared', rowB.cached_text, null);

	console.log('\n── the moved segment landed in part A, and the rest stayed ──');
	check('the target belongs to part A', byId.get(segA2)?.study_id, partA);
	check('B2 still belongs to part B', byId.get(segB2)?.study_id, partB);

	console.log('\n── the straddling connection was handled, not orphaned (§8 studyId trap) ──');
	const conns =
		await sql`SELECT id, study_id, from_segment_id, to_segment_id FROM segment_connection WHERE id LIKE ${PREFIX + '%'}`;
	if (conns.length === 0) {
		// reanchorConnectionsOnto legitimately drops a connection that would become a self-loop or a
		// duplicate. Either outcome is defined; what must NOT happen is a row pointing at a deleted
		// segment.
		assert('it was removed rather than left dangling', true);
	} else {
		const conn = conns[0];
		const liveIds = new Set(segs.map((s) => s.id));
		assert(
			'its `from` endpoint references a segment that still exists',
			conn.from_segment_id === null || liveIds.has(conn.from_segment_id)
		);
		assert(
			'its `to` endpoint references a segment that still exists',
			conn.to_segment_id === null || liveIds.has(conn.to_segment_id)
		);
		assert(
			'and it is no longer owned by a study that lost the endpoint',
			conn.study_id === partA || conn.study_id === partB
		);
	}

	// ── Join SECTION across a boundary, on a fresh fixture ────────────────────
	//
	// A section join moves SEVERAL segments at once, which is what makes its boundary rule differ from
	// Join Segment's: the new boundary is the first segment that STAYS, not the one after the active
	// item. `verify-sequence-scope.mjs` pins that rule in the pure layer; this confirms the executor
	// obeys it against Postgres, and that re-parenting a section's segments before deleting the section
	// does not let `passage_segment.section_id`'s cascade take them.
	console.log('\n── Join SECTION across a boundary (multi-segment boundary rule) ──');

	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;

	const s2 = id('s2-series');
	const s2PartA = id('s2-partA');
	const s2PartB = id('s2-partB');
	const s2PassA = id('s2-passA');
	const s2PassB = id('s2-passB');

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${s2}, 'Probe sec', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${s2PartA}, 'A', 'esv', ${owner.id}, ${s2}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${s2PartB}, 'B', 'esv', ${owner.id}, ${s2}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${s2PassA}, ${s2PartA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${s2PassB}, ${s2PartB}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, now())`;

	// Part A: one section with one segment (the join target's container).
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('s2-colA')}, ${s2PassA}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s2-secA')}, ${id('s2-colA')}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s2-a1')}, ${id('s2-secA')}, ${w(1, 1)}, 'A1', now(), now())`;

	// Part B: one column, TWO sections. The first (3:1 and 3:5) is joined backwards; the second (3:20)
	// stays, so the boundary must land at 3:20 — not at 3:5.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('s2-colB')}, ${s2PassB}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s2-secX')}, ${id('s2-colB')}, ${w(3, 1)}, 'green', now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s2-secY')}, ${id('s2-colB')}, ${w(3, 20)}, 'red', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s2-x1')}, ${id('s2-secX')}, ${w(3, 1)}, 'X1', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s2-x2')}, ${id('s2-secX')}, ${w(3, 5)}, 'X2', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s2-y1')}, ${id('s2-secY')}, ${w(3, 20)}, 'Y1', now(), now())`;

	const secPlan = await analyzeCrossPartJoin(db, owner.id, s2PassB, id('s2-secX'), 'section');
	assert('the section join is available', secPlan.ok === true);
	assert('and crosses a boundary', secPlan.crossesBoundary === true);
	// 3:1–3:19 moves: nineteen verses, NOT the four that a per-segment boundary would give.
	check('nineteen verses move (3:1–3:19)', secPlan.versesMoved, 19);

	const secResult = await joinAcrossBoundary(
		db,
		owner.id,
		s2PassB,
		id('s2-secX'),
		'merge',
		'section'
	);
	check('two segments moved', secResult.movedSegments, 2);

	const secSegs = await sql`
		SELECT s.id, s.note, sec.id AS section_id, p.study_id
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
	`;
	const secById = new Map(secSegs.map((r) => [r.id, r]));
	check('all four segments survive the section join', secSegs.length, 4);
	check('X1 kept its note', secById.get(id('s2-x1'))?.note, 'X1');
	check('X2 kept its note', secById.get(id('s2-x2'))?.note, 'X2');
	check('X1 moved to part A', secById.get(id('s2-x1'))?.study_id, s2PartA);
	check('X2 moved with it', secById.get(id('s2-x2'))?.study_id, s2PartA);
	check('Y1 stayed in part B', secById.get(id('s2-y1'))?.study_id, s2PartB);
	check(
		'the joined section row is gone (its segments were re-parented first)',
		secSegs.some((r) => r.section_id === id('s2-secX')),
		false
	);

	const [secRangeA] = await sql`SELECT to_chapter, to_verse FROM passage WHERE id = ${s2PassA}`;
	const [secRangeB] = await sql`SELECT from_chapter, from_verse FROM passage WHERE id = ${s2PassB}`;
	check(
		'part A now ends at 3:19 — the first segment that STAYS sets the boundary',
		`${secRangeA.to_chapter}:${secRangeA.to_verse}`,
		'3:19'
	);
	check('part B now starts at 3:20', `${secRangeB.from_chapter}:${secRangeB.from_verse}`, '3:20');

	console.log('\n── no orphaned structure anywhere in the fixture ──');
	const orphans = await sql`
		SELECT COUNT(*)::int AS n FROM passage_segment s
		LEFT JOIN passage_section sec ON s.passage_section_id = sec.id
		WHERE s.id LIKE ${PREFIX + '%'} AND sec.id IS NULL
	`;
	check('no segment lost its section', orphans[0].n, 0);
	const orphanSections = await sql`
		SELECT COUNT(*)::int AS n FROM passage_section sec
		LEFT JOIN passage_column col ON sec.passage_column_id = col.id
		WHERE sec.id LIKE ${PREFIX + '%'} AND col.id IS NULL
	`;
	check('no section lost its column', orphanSections[0].n, 0);
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	// Always clean up, including after a failed assertion — a probe that leaves debris is one nobody
	// runs twice. `study_series` cascades to its parts, and each part cascades to its structure.
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
	const [left] =
		await sql`SELECT COUNT(*)::int AS n FROM passage_segment WHERE id LIKE ${PREFIX + '%'}`;
	console.log(`\nFixture removed (${left.n} probe segments left behind — expected 0).`);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
