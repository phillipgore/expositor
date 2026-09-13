/**
 * Reproduce the "gaps between columns" defect against a REAL database, then prove it stays fixed.
 *
 * ## The gesture that caused it
 *
 * A cross-part **Join Down** re-parents the SELECTED item into the later part's container. At segment
 * granularity `moveSelectedForward()` re-parents the selected segment onto the target's section — and
 * says nothing about the section it just left. When that segment was its section's only child, and that
 * section its column's only child, the donor passage keeps a section with no segments inside a column
 * with no live sections.
 *
 * Nothing then renders wrongly at the data level, which is why every earlier probe stayed green:
 * they all compared SEGMENT rows against passage ranges, and a childless column holds no segments by
 * definition, so it was invisible to all of them. The damage is visual. `analyze/+page.svelte` emits
 * the `.column` div for every row and only then guards `{#if column.sections.length > 0}`, while
 * `.column` carries a fixed `width: 27.8rem` — so the stranded column paints as a blank full-width slot
 * between real columns. Splitting columns afterwards cannot clear it: splitting only ever adds
 * containers.
 *
 * ⚠️ **This fixture is built specifically so the defect can occur.** `probe-cross-part-join.mjs` gives
 * every column more than one section, so no join there can empty one — which is exactly why it never
 * caught this. Here the donor segment is deliberately ALONE in its own section, in its own column.
 *
 * ⚠️ **WRITE probe, not a verifier.** Deliberately not in `npm run verify`. It builds a throwaway
 * series under a recognisable id prefix and removes it in a `finally`, including after a failure.
 *
 * Run: node --import tsx --import ./scripts/alias-loader.mjs scripts/probe-empty-containers.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-empty-';
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
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;

	const series = id('series');
	const partA = id('partA');
	const partB = id('partB');
	const passA = id('passA');
	const passB = id('passB');

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${series}, 'Probe empty', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partA}, 'A', 'esv', ${owner.id}, ${series}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partB}, 'B', 'esv', ${owner.id}, ${series}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passA}, ${partA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passB}, ${partB}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, now())`;

	// Part A, column 1 — STAYS. Without it the join would empty the part and be refused outright.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colA1')}, ${passA}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secA1')}, ${id('colA1')}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA1')}, ${id('secA1')}, ${w(1, 1)}, 'A1', now(), now())`;

	// Part A, column 2 — the LAST column of part A, holding exactly one section holding exactly one
	// segment. That segment is the one joined down, so this whole column is what gets stranded.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colA2')}, ${passA}, ${w(2, 20)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secA2')}, ${id('colA2')}, ${w(2, 20)}, 'green', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA2')}, ${id('secA2')}, ${w(2, 20)}, 'A2', now(), now())`;

	// Part B — the receiver.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colB1')}, ${passB}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secB1')}, ${id('colB1')}, ${w(3, 1)}, 'red', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segB1')}, ${id('secB1')}, ${w(3, 1)}, 'B1', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segB2')}, ${id('secB1')}, ${w(3, 10)}, 'B2', now(), now())`;

	console.log('Fixture built. Joining the last segment of part A DOWN into part B…\n');

	const { joinDownAcrossBoundary } = await import('../src/lib/server/db/crossPartJoin.js');
	const { db } = await import('../src/lib/server/db/index.js');

	const result = await joinDownAcrossBoundary(db, owner.id, passA, id('segA2'), 'merge', 'segment');
	check('the join reports crossing a boundary', result.crossedBoundary, true);
	check('and reports the downward direction', result.direction, 'down');

	// ── The assertions that reproduce the reported symptom ────────────────────
	console.log('\n── the donor part keeps no childless containers (the reported gap) ──');

	const childlessSections = await sql`
		SELECT sec.id FROM passage_section sec
		LEFT JOIN passage_segment s ON s.passage_section_id = sec.id
		WHERE sec.id LIKE ${PREFIX + '%'} AND s.id IS NULL
	`;
	check(
		'no section was left without segments',
		childlessSections.map((r) => r.id).join(',') || 'none',
		'none'
	);

	// ⚠️ Asked as "holds no SEGMENTS", not "holds no sections". A stranded column usually keeps its
	// now-empty section, so a `LEFT JOIN passage_section ... IS NULL` test reports clean while the
	// column still paints as a blank slot — the renderer's `{#if column.sections.length > 0}` guard
	// passes, and the section inside it then renders nothing. Confirmed by reverting the prune: the
	// sections test failed and the naive columns test did not.
	const emptyColumns = await sql`
		SELECT col.id FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND NOT EXISTS (
			SELECT 1 FROM passage_segment s
			JOIN passage_section sec ON s.passage_section_id = sec.id
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check(
		'no column was left holding no text — this is the blank gap',
		emptyColumns.map((r) => r.id).join(',') || 'none',
		'none'
	);

	// The surviving structure must be exactly what the user expects to see, and no more.
	const cols = await sql`
		SELECT col.id, col.passage_id FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'} ORDER BY col.starting_word_id
	`;
	check('part A keeps exactly one column', cols.filter((c) => c.passage_id === passA).length, 1);
	check('part B keeps exactly one column', cols.filter((c) => c.passage_id === passB).length, 1);
	assert('and the stranded column is gone', !cols.some((c) => c.id === id('colA2')));

	console.log('\n── and the join did its actual job ──');
	const segs = await sql`
		SELECT s.id, p.id AS passage_id FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
	`;
	const byId = new Map(segs.map((s) => [s.id, s]));
	assert('the selected segment survives', byId.has(id('segA2')));
	check('and now lives in part B', byId.get(id('segA2'))?.passage_id, passB);
	check('the consumed target segment is gone', byId.has(id('segB1')), false);
	assert('the untouched segment in part A survives', byId.has(id('segA1')));
	assert('the untouched segment in part B survives', byId.has(id('segB2')));

	// ── Ordering: emptiness and honest anchors are NOT sufficient ─────────────
	//
	// ⚠️ A section can hold a segment, be anchored honestly to it, and still sit under the WRONG
	// column. Every other assertion in this file passes in that state, while the page renders the same
	// text twice: the renderer derives a segment's end from the next anchor in tree order, so an
	// overlapping column hands some segment an end word BEHIND its start, and `extractSegmentText`
	// scans forward, never matches, and runs to the end of the passage. `data-word-id` is then
	// duplicated in the DOM and every `querySelector('.selectable-word[data-word-id=…]')` in the
	// selection code resolves to the wrong copy — word selection silently stops working.
	//
	// This is the assertion whose absence let the repair sweep call a study clean that was not.
	console.log('\n── no column’s word range overlaps the next (would duplicate text) ──');

	const overlapping = await sql`
		WITH runs AS (
			SELECT col.id,
			       col.passage_id,
			       MIN(s.starting_word_id) AS first_word,
			       MAX(s.starting_word_id) AS last_word
			FROM passage_column col
			JOIN passage_section sec ON sec.passage_column_id = col.id
			JOIN passage_segment s ON s.passage_section_id = sec.id
			WHERE col.id LIKE ${PREFIX + '%'}
			GROUP BY col.id, col.passage_id
		)
		SELECT COUNT(*)::int AS n
		FROM runs a
		JOIN runs b ON a.passage_id = b.passage_id AND a.id <> b.id
		WHERE a.first_word <= b.last_word AND b.first_word <= a.last_word
	`;
	check('no two columns in a passage overlap', overlapping[0].n, 0);

	console.log('\n── anchors name each container’s OWN first child ──');
	const drifted = await sql`
		SELECT col.id FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND col.starting_word_id <> (
			SELECT MIN(s.starting_word_id) FROM passage_segment s
			JOIN passage_section sec ON s.passage_section_id = sec.id
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check('no column anchor drifted', drifted.length, 0);
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	// Always clean up, including after a failed assertion — a probe that leaves debris behind is one
	// nobody runs twice. `study_series` cascades to its parts, and each part to its structure.
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
