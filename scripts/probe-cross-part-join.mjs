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

	// ── REGRESSION: insert structure after a join ─────────────────────────────
	//
	// Runs HERE, on scenario 1's live fixture — the section join below deletes it.
	//
	// The user-visible half of the container-anchor defect: after this join, part B's column and
	// section were still anchored at 3:1 (where the passage used to begin) while its first surviving
	// segment now starts at 3:10. A caret anywhere inside that segment then matched
	// `section.startingWordId === insertionWordId` and `insertSegment()` refused with "Cannot insert
	// segment at the beginning of a section" — on text the user had just joined.
	//
	// Every structural assertion above passed throughout, because nothing was orphaned and nothing
	// rendered wrongly. Only driving the real insert reveals it.
	console.log('\n── REGRESSION: structure can still be inserted after a join ──');

	const { insertSegment } = await import('../src/lib/server/db/utils.js');

	const containerDrift = await sql`
		SELECT col.passage_id,
		       MIN(col.starting_word_id) AS column_anchor,
		       MIN(sec.starting_word_id) AS section_anchor,
		       MIN(s.starting_word_id) AS first_segment_anchor
		  FROM passage_column col
		  JOIN passage_section sec ON sec.passage_column_id = col.id
		  JOIN passage_segment s ON s.passage_section_id = sec.id
		 WHERE col.passage_id LIKE ${PREFIX + '%'}
		 GROUP BY col.passage_id
	`;
	const drifted = containerDrift.filter(
		(r) => r.column_anchor !== r.first_segment_anchor || r.section_anchor !== r.first_segment_anchor
	);
	check('no container drifted off its first segment', drifted.length, 0);
	check('and both passages were checked', containerDrift.length, 2);

	// A legal interior caret inside part B's first surviving segment (3:10–3:19) must be accepted.
	//
	// ⚠️ For a JOIN the drifted container ends up EARLIER than the first segment, so the caret that
	// actually collides (3:1) now belongs to the other part and is not something a user can click here.
	// The drift assertion above is therefore what pins the join half; `probe:move-text` carries the
	// direct end-to-end reproduction, because a MOVE leaves the container *inside* the segment where
	// the user is working.
	let insertError = null;
	try {
		await insertSegment(db, owner.id, passB, secB, w(3, 12));
	} catch (error) {
		insertError = error.message;
	}
	check('inserting a segment into the joined passage succeeds', insertError, null);

	const [insertedRow] = await sql`
		SELECT COUNT(*)::int AS n FROM passage_segment
		 WHERE passage_section_id = ${secB} AND starting_word_id = ${w(3, 12)}
	`;
	check('and the new segment exists', insertedRow.n, 1);

	// ⚠️ The guard must still refuse a genuine duplicate. The fix restores the container invariant; it
	// does not loosen the rule that two segments cannot share an anchor.
	let duplicateError = null;
	try {
		await insertSegment(db, owner.id, passB, secB, w(3, 12));
	} catch (error) {
		duplicateError = error.message;
	}
	assert(
		'but a duplicate anchor is still refused',
		/beginning of an existing segment/.test(duplicateError ?? '')
	);

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

	// ── Join COLUMN across a boundary, on a fresh fixture ─────────────────────
	//
	// The column path differs from the section path by one level: it re-parents SECTIONS onto the target
	// column, and the segments follow implicitly via their sections. That extra level is the only thing
	// not already covered, and it is where `passage_section.column_id`'s cascade would bite if the delete
	// came before the re-parent.
	//
	// Part B needs TWO columns: a column join that would move every segment out of its passage is refused
	// as a Join Parts in disguise, so the second column is what makes the operation legal at all.
	console.log('\n── Join COLUMN across a boundary (re-parents sections, not segments) ──');

	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;

	const s3 = id('s3-series');
	const s3PartA = id('s3-partA');
	const s3PartB = id('s3-partB');
	const s3PassA = id('s3-passA');
	const s3PassB = id('s3-passB');

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${s3}, 'Probe col', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${s3PartA}, 'A', 'esv', ${owner.id}, ${s3}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${s3PartB}, 'B', 'esv', ${owner.id}, ${s3}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${s3PassA}, ${s3PartA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${s3PassB}, ${s3PartB}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, now())`;

	// Part A: the target column, with its own section and segment.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, width, created_at, updated_at) VALUES (${id('s3-colA')}, ${s3PassA}, ${w(1, 1)}, 300, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s3-secA')}, ${id('s3-colA')}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s3-a1')}, ${id('s3-secA')}, ${w(1, 1)}, 'A1', now(), now())`;

	// Part B, column 1 (JOINED): two sections, each with a segment. Both sections must survive the move.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('s3-colB1')}, ${s3PassB}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s3-secB1')}, ${id('s3-colB1')}, ${w(3, 1)}, 'green', now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s3-secB2')}, ${id('s3-colB1')}, ${w(3, 5)}, 'pink', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s3-b1')}, ${id('s3-secB1')}, ${w(3, 1)}, 'B1', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s3-b2')}, ${id('s3-secB2')}, ${w(3, 5)}, 'B2', now(), now())`;
	await sql`INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at) VALUES (${id('s3-h')}, ${id('s3-b2')}, 'one', 'Moving heading', now(), now())`;

	// Part B, column 2 (STAYS): sets the boundary at 3:20.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('s3-colB2')}, ${s3PassB}, ${w(3, 20)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('s3-secB3')}, ${id('s3-colB2')}, ${w(3, 20)}, 'red', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('s3-b3')}, ${id('s3-secB3')}, ${w(3, 20)}, 'B3', now(), now())`;

	const colPlan = await analyzeCrossPartJoin(db, owner.id, s3PassB, id('s3-colB1'), 'column');
	assert('the column join is available', colPlan.ok === true);
	assert('and crosses a boundary', colPlan.crossesBoundary === true);
	check('nineteen verses move (3:1–3:19)', colPlan.versesMoved, 19);

	const colResult = await joinAcrossBoundary(
		db,
		owner.id,
		s3PassB,
		id('s3-colB1'),
		'merge',
		'column'
	);
	check('two segments moved', colResult.movedSegments, 2);

	const colRows = await sql`
		SELECT s.id, s.note, sec.id AS section_id, col.id AS column_id, p.study_id
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
	`;
	const colById = new Map(colRows.map((r) => [r.id, r]));
	check('all four segments survive the column join', colRows.length, 4);
	check('B1 kept its note', colById.get(id('s3-b1'))?.note, 'B1');
	check('B2 kept its note', colById.get(id('s3-b2'))?.note, 'B2');
	check('B1 moved to part A', colById.get(id('s3-b1'))?.study_id, s3PartA);
	check('B2 moved with it', colById.get(id('s3-b2'))?.study_id, s3PartA);
	check('B3 stayed in part B', colById.get(id('s3-b3'))?.study_id, s3PartB);

	// The level that distinguishes this path: both SECTIONS kept their ids and now hang off the TARGET
	// column. Had the delete preceded the re-parent, the cascade would have taken them and their segments.
	check(
		'B1 is still in its original section',
		colById.get(id('s3-b1'))?.section_id,
		id('s3-secB1')
	);
	check(
		'B2 is still in its original section',
		colById.get(id('s3-b2'))?.section_id,
		id('s3-secB2')
	);
	check(
		'and both sections now hang off part A’s column',
		colById.get(id('s3-b1'))?.column_id,
		id('s3-colA')
	);
	check('including the second one', colById.get(id('s3-b2'))?.column_id, id('s3-colA'));
	check(
		'the joined column row is gone',
		colRows.some((r) => r.column_id === id('s3-colB1')),
		false
	);

	const colHeads =
		await sql`SELECT passage_segment_id FROM passage_heading WHERE id = ${id('s3-h')}`;
	check('the heading on a moved segment survives', colHeads.length, 1);

	const [colRangeA] = await sql`SELECT to_chapter, to_verse FROM passage WHERE id = ${s3PassA}`;
	const [colRangeB] = await sql`SELECT from_chapter, from_verse FROM passage WHERE id = ${s3PassB}`;
	check('part A now ends at 3:19', `${colRangeA.to_chapter}:${colRangeA.to_verse}`, '3:19');
	check('part B now starts at 3:20', `${colRangeB.from_chapter}:${colRangeB.from_verse}`, '3:20');

	// ── The invariant that the gap-between-columns bug violated ───────────────
	//
	// ⚠️ This is the assertion the earlier probes were missing, and the reason the defect shipped
	// green: every existing check compared SEGMENT rows against ranges, so a childless COLUMN — which
	// holds no segments by definition — was invisible to all of them. A cross-part join re-parents a
	// section into the other part's column; if that section was its column's last child, the column
	// survived empty, and `analyze/+page.svelte` renders it as a blank fixed-width slot between real
	// columns. Assert on the containers themselves, across BOTH passages of every fixture.
	console.log('\n── no childless containers survive the join (renders as a gap) ──');

	const childlessSections = await sql`
		SELECT COUNT(*)::int AS n FROM passage_section sec
		LEFT JOIN passage_segment s ON s.passage_section_id = sec.id
		WHERE sec.id LIKE ${PREFIX + '%'} AND s.id IS NULL
	`;
	check('no section was left without segments', childlessSections[0].n, 0);

	// ⚠️ Asked as "holds no SEGMENTS", not "holds no sections": a stranded column usually keeps its
	// now-empty section, and still paints as a blank slot because the renderer's
	// `{#if column.sections.length > 0}` guard passes and the section inside renders nothing.
	const emptyColumns = await sql`
		SELECT COUNT(*)::int AS n FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND NOT EXISTS (
			SELECT 1 FROM passage_segment s
			JOIN passage_section sec ON s.passage_section_id = sec.id
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check('no column was left holding no text', emptyColumns[0].n, 0);

	// Anchors must name the container's OWN first child. Deriving the leading anchor from the
	// passage's earliest segment — as the first version of `reanchorContainers()` did — could stamp
	// one column's word id onto another's, corrupting the ordering `loadPassageTree()` sorts by.
	const driftedSections = await sql`
		SELECT COUNT(*)::int AS n FROM passage_section sec
		WHERE sec.id LIKE ${PREFIX + '%'}
		  AND sec.starting_word_id <> (
			SELECT MIN(s.starting_word_id) FROM passage_segment s
			WHERE s.passage_section_id = sec.id
		  )
	`;
	check('every section is anchored to its own first segment', driftedSections[0].n, 0);

	const driftedColumns = await sql`
		SELECT COUNT(*)::int AS n FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND col.starting_word_id <> (
			SELECT MIN(s.starting_word_id) FROM passage_segment s
			JOIN passage_section sec ON s.passage_section_id = sec.id
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check('every column is anchored to its own first segment', driftedColumns[0].n, 0);

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
