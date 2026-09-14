/**
 * Prove Move Selected Up / Down against a REAL database (SERIES_PLAN §8).
 *
 * ## What this has to catch that a pure verifier cannot
 *
 * `verify-item-transfer.mjs` proves the destination arithmetic. It cannot prove that the WRITE leaves
 * the database in a state the renderer can draw, and that is where the real risk sits:
 *
 *   - a section re-parented into another column while its `topOffset` still aligns it against the
 *     column it left;
 *   - a cross-part move whose passage ranges did not follow the structure, so one part renders text
 *     the other owns;
 *   - a connection left owned by a study containing NEITHER endpoint, which §8 records as the silent
 *     wrong-answer bug: `countTouchingConnections()` filters on `studyId`, so the connection simply
 *     stops being counted and `analyzeJoin()` confidently reports that none are affected;
 *   - a container left childless, which paints as a blank full-width column
 *     (`probe-empty-containers.mjs` records the symptom).
 *
 * ⚠️ **WRITE probe, not a verifier.** Deliberately not in `npm run verify`. It builds a throwaway
 * series under a recognisable id prefix and removes it in a `finally`, including after a failure.
 *
 * Run: node --import tsx --import ./scripts/alias-loader.mjs scripts/probe-item-transfer.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-xfer-';
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

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${series}, 'Probe transfer', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partA}, 'A', 'esv', ${owner.id}, ${series}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partB}, 'B', 'esv', ${owner.id}, ${series}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passA}, ${partA}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passB}, ${partB}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, now())`;

	// Part A, column 1: sections s1 {1:1} and s2 {1:16}. s2 is LAST, so it may move right.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colA1')}, ${passA}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secA1')}, ${id('colA1')}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA1')}, ${id('secA1')}, ${w(1, 1)}, 'A1', now(), now())`;
	// ⚠️ topOffset set deliberately: it aligns s2 against column 1's neighbours, and must not survive
	// a move into column 2, where it would align against nothing.
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, top_offset, created_at, updated_at) VALUES (${id('secA2')}, ${id('colA1')}, ${w(1, 16)}, 'green', 42, now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA2')}, ${id('secA2')}, ${w(1, 16)}, 'A2', now(), now())`;

	// Part A, column 2: section s3 {2:1}, holding the LAST segment of part A.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colA2')}, ${passA}, ${w(2, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secA3')}, ${id('colA2')}, ${w(2, 1)}, 'red', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA3')}, ${id('secA3')}, ${w(2, 1)}, 'A3', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segA4')}, ${id('secA3')}, ${w(2, 20)}, 'A4', now(), now())`;

	// Part B — the receiver.
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colB1')}, ${passB}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secB1')}, ${id('colB1')}, ${w(3, 1)}, 'aqua', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('segB1')}, ${id('secB1')}, ${w(3, 1)}, 'B1', now(), now())`;

	// A connection anchored to the segment that will cross into part B. Owned by part A today.
	await sql`INSERT INTO segment_connection (id, study_id, series_id, from_type, to_type, from_segment_id, to_segment_id, created_at, updated_at) VALUES (${id('conn')}, ${partA}, ${series}, 'segment', 'segment', ${id('segA4')}, ${id('segA1')}, now(), now())`;

	const { analyzeItemTransfer, transferItem } = await import(
		'../src/lib/server/db/itemTransferDb.js'
	);
	const { db } = await import('../src/lib/server/db/index.js');

	// ── 1. A middle item is refused, and the refusal is not a fallback ────────
	console.log('\n── a MIDDLE section cannot move, even with a part beyond it ──');
	const middle = await analyzeItemTransfer(db, owner.id, passA, id('secA1'), 'section', 'down');
	check('secA1 (first of two in its column) is refused downwards', middle.ok, false);
	assert('and the reason names reading order', /reading order/.test(middle.reason ?? ''));

	// ── 2. Within-passage: a section moves to the adjacent column ─────────────
	console.log('\n── a section moves into the ADJACENT COLUMN, not the next part ──');
	const plan = await analyzeItemTransfer(db, owner.id, passA, id('secA2'), 'section', 'down');
	check('the plan stays inside its passage', plan.crossesPassage, false);
	check('  targeting column 2', plan.targetColumnId, id('colA2'));
	check('  and moving no verses', plan.versesMoved, 0);

	const rangesBefore = await sql`SELECT id, from_chapter, from_verse, to_chapter, to_verse FROM passage WHERE id IN (${passA}, ${passB}) ORDER BY id`;

	const moved = await transferItem(db, owner.id, passA, id('secA2'), 'section', 'down');
	check('the move reports no passage crossing', moved.crossesPassage, false);

	const [secA2] = await sql`SELECT passage_column_id, top_offset, starting_word_id FROM passage_section WHERE id = ${id('secA2')}`;
	check('the section now sits in column 2', secA2.passage_column_id, id('colA2'));
	check('its anchor is UNCHANGED — order is derived, not stored', secA2.starting_word_id, w(1, 16));
	check('and its stale topOffset was cleared', secA2.top_offset, null);

	// The load-bearing claim of a non-crossing move: no verses moved, so no range may have changed.
	const rangesAfter = await sql`SELECT id, from_chapter, from_verse, to_chapter, to_verse FROM passage WHERE id IN (${passA}, ${passB}) ORDER BY id`;
	check('no passage range changed', JSON.stringify(rangesAfter), JSON.stringify(rangesBefore));

	// ⚠️ The section moved into a column whose anchor (2:1) is LATER than its own (1:16), so the
	// receiving column must re-anchor backwards or it will claim verses it no longer starts.
	const [colA2] = await sql`SELECT starting_word_id FROM passage_column WHERE id = ${id('colA2')}`;
	check('the receiving column re-anchored to its new first segment', colA2.starting_word_id, w(1, 16));

	// ── 3. Cross-part: the verses must follow the structure ───────────────────
	console.log('\n── a segment at the part edge moves into the NEXT PART ──');
	const crossPlan = await analyzeItemTransfer(db, owner.id, passA, id('segA4'), 'segment', 'down');
	check('the plan crosses a passage', crossPlan.crossesPassage, true);
	check('  and crosses a part', crossPlan.crossesPart, true);
	check('  into part B', crossPlan.toStudyId, partB);
	assert('  and moving a positive number of verses', crossPlan.versesMoved > 0);

	const crossed = await transferItem(db, owner.id, passA, id('segA4'), 'segment', 'down');
	check('the move reports crossing a part', crossed.crossesPart, true);

	const [segA4] = await sql`
		SELECT p.id AS passage_id, p.study_id, s.starting_word_id
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id = ${id('segA4')}
	`;
	check('the segment now lives in part B', segA4.passage_id, passB);
	check('  owned by study B', segA4.study_id, partB);
	check('  with its anchor still intact', segA4.starting_word_id, w(2, 20));

	// The whole point of moving the boundary: part B must now START at the arriving segment, or it
	// renders text part A still owns.
	const [rangeA] = await sql`SELECT to_chapter, to_verse FROM passage WHERE id = ${passA}`;
	const [rangeB] = await sql`SELECT from_chapter, from_verse FROM passage WHERE id = ${passB}`;
	check('part B now begins at the arriving segment', `${rangeB.from_chapter}:${rangeB.from_verse}`, '2:20');
	check('part A now ends just before it', `${rangeA.to_chapter}:${rangeA.to_verse}`, '2:19');

	// §8's silent wrong-answer bug: a connection owned by a study holding NEITHER endpoint.
	console.log('\n── the connection follows its endpoint into the receiving study ──');
	const [conn] = await sql`SELECT study_id, series_id FROM segment_connection WHERE id = ${id('conn')}`;
	check('the connection was re-owned to part B', conn.study_id, partB);
	check('  and keeps its series', conn.series_id, series);

	// Both endpoints are still alive — a transfer destroys nothing. This is the cross-part connection
	// case (§8 Q23 strategy (c)) arriving as a side effect.
	const [endpoints] = await sql`SELECT from_segment_id, to_segment_id FROM segment_connection WHERE id = ${id('conn')}`;
	assert('both endpoints survive the move', Boolean(endpoints.from_segment_id && endpoints.to_segment_id));

	console.log('\n── no container was stranded (the blank-column symptom) ──');
	const emptyColumns = await sql`
		SELECT col.id FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND NOT EXISTS (
			SELECT 1 FROM passage_segment s
			JOIN passage_section sec ON s.passage_section_id = sec.id
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check('no column holds no text', emptyColumns.map((r) => r.id).join(',') || 'none', 'none');

	const childlessSections = await sql`
		SELECT sec.id FROM passage_section sec
		LEFT JOIN passage_segment s ON s.passage_section_id = sec.id
		WHERE sec.id LIKE ${PREFIX + '%'} AND s.id IS NULL
	`;
	check('no section holds no segments', childlessSections.map((r) => r.id).join(',') || 'none', 'none');

	// ── 4. Emptying a part is Join Parts, and is refused under this name ──────
	console.log('\n── a move that would empty a part is refused ──');
	const lastOne = await analyzeItemTransfer(db, owner.id, passB, id('colB1'), 'column', 'up');
	check('moving part B’s only column up is refused', lastOne.ok, false);
	assert('and it points at Join Parts', /Join Parts/.test(lastOne.reason ?? ''));

	// ── 5. Reading order, asserted over the WHOLE series at every tier ────────
	//
	// ⚠️ This is the invariant the feature exists to protect, and it is stronger than the per-passage
	// column check it replaces. Reading order across a part boundary is TOTAL — every item of part A
	// precedes every item of part B — so flattening the entire series in sequence order must yield
	// anchors that never go backwards, at all three tiers at once.
	//
	// The old check compared columns only, and only within one passage. It would have passed while a
	// section sat in the wrong column of the right passage, or while a part seam had been crossed in
	// the wrong direction — both of which this catches.
	console.log('\n── reading order holds across the whole series, at every tier ──');

	const ordered = await sql`
		SELECT s.starting_word_id AS seg, sec.starting_word_id AS sec_anchor,
		       col.starting_word_id AS col_anchor, st.series_order, p.display_order
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		JOIN study st ON p.study_id = st.id
		WHERE s.id LIKE ${PREFIX + '%'}
		ORDER BY st.series_order, p.display_order, col.starting_word_id,
		         sec.starting_word_id, s.starting_word_id
	`;

	// Walking in READING order (part, then passage, then column, section, segment), every segment
	// anchor must be >= the one before it. Word ids are zero-padded, so string comparison is canonical
	// comparison here — and both passages are in the same book by construction, which is what makes
	// that safe (`compareWordIds` ignores the book segment).
	let regression = 'none';
	for (let i = 1; i < ordered.length; i += 1) {
		if (ordered[i].seg < ordered[i - 1].seg) regression = `${ordered[i - 1].seg} → ${ordered[i].seg}`;
	}
	check('segment anchors never go backwards in reading order', regression, 'none');

	// The container anchors must agree with their contents: a section's anchor is its first segment's,
	// a column's is its first section's. `reanchorPassages` guarantees this, and a transfer is exactly
	// the gesture that can break it.
	const mismatched = await sql`
		SELECT sec.id FROM passage_section sec
		WHERE sec.id LIKE ${PREFIX + '%'}
		  AND sec.starting_word_id <> (
			SELECT MIN(s.starting_word_id) FROM passage_segment s
			WHERE s.passage_section_id = sec.id
		  )
	`;
	check('every section is anchored to its own first segment', mismatched.map((r) => r.id).join(',') || 'none', 'none');

	const badColumns = await sql`
		SELECT col.id FROM passage_column col
		WHERE col.id LIKE ${PREFIX + '%'}
		  AND col.starting_word_id <> (
			SELECT MIN(sec.starting_word_id) FROM passage_section sec
			WHERE sec.passage_column_id = col.id
		  )
	`;
	check('every column is anchored to its own first section', badColumns.map((r) => r.id).join(',') || 'none', 'none');

	// And no two columns of one passage may claim overlapping extents (the original check, kept).
	const cols = await sql`
		SELECT col.id, col.passage_id, col.starting_word_id
		FROM passage_column col WHERE col.id LIKE ${PREFIX + '%'}
		ORDER BY col.passage_id, col.starting_word_id
	`;
	let overlapping = 'none';
	for (let i = 1; i < cols.length; i += 1) {
		if (cols[i].passage_id !== cols[i - 1].passage_id) continue;
		if (cols[i].starting_word_id <= cols[i - 1].starting_word_id) overlapping = cols[i].id;
	}
	check('every column starts after its predecessor', overlapping, 'none');
} finally {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
	await sql.end();
	console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
