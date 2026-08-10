/**
 * Exercise Split Part against a REAL database (SERIES_PLAN §8).
 *
 * The last phase-2 operation that writes passage ranges AND moves structure in one transaction, and
 * the only one still unexercised against Postgres. It is already reachable from the UI, so this probe
 * covers shipped code rather than code in progress.
 *
 * The case that matters is the **straddling column**: a single column whose segments span the split
 * point. It cannot be re-parented (that would drag the first part's verses across) and it cannot be
 * left (that would strand the second part's structure), so `splitPassageStructure()` CLONES the
 * container into the new passage and re-parents only the segments past the boundary.
 *
 * That clone is where a database can disagree with reasoning in ways a pure test cannot see:
 *
 *   - the clone spreads the original's fields to preserve `width` / `leftOffset` / `color` /
 *     `topOffset` — a split must not silently restyle the user's document. If the spread ever sent a
 *     key with no matching column, Drizzle would throw; if it dropped the fields, the layout would
 *     quietly reset. Both are asserted.
 *   - the ORIGINAL column keeps its id, so notes, commentary and connections on the near side keep
 *     their identity. Asserted by reading them back.
 *   - the original passage row is UPDATED, never deleted and recreated — deleting it would cascade
 *     away every column it owns.
 *
 * ⚠️ A WRITE probe, not a verifier. Not in `npm run verify`. Run with `npm run probe:split-part`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-sp-';
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
const w = (chapter, verse) =>
	`RO-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-001`;

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}

/** Every probe segment, with its owning column, section, passage and study. */
async function liveTree() {
	return sql`
		SELECT s.id AS segment_id, s.note, s.commentary, s.starting_word_id,
			sec.id AS section_id, sec.color, sec.top_offset,
			col.id AS column_id, col.width, col.left_offset,
			p.id AS passage_id, p.study_id
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
		ORDER BY s.starting_word_id
	`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	await cleanup();

	// ── Fixture: ONE part covering Romans 1–5, with ONE column straddling the split ──
	//
	// A single column holding four segments across chapters 1, 2, 3 and 4. Splitting after chapter 2
	// puts the boundary at 3:1, so the column straddles it: segments at 1:1 and 2:1 stay, those at 3:1
	// and 4:1 move. Presentational fields are all set to non-default values so the clone has something
	// to preserve or lose.
	const seriesId = id('series');
	const partId = id('part1');
	const passId = id('pass1');
	const colId = id('col');
	const secStay = id('sec-stay');
	const secStraddle = id('sec-straddle');

	await sql`
		INSERT INTO study_series (id, name, user_id, created_at, updated_at)
		VALUES (${seriesId}, 'Probe SP series', ${owner.id}, now(), now())
	`;
	// A series needs two parts to exist (§4), so a filler part sits after the one being split. It also
	// gives renumberForInsert something to shift.
	await sql`
		INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
		VALUES (${partId}, 'Romans 1-5', 'esv', ${owner.id}, ${seriesId}, 0, now(), now())
	`;
	const fillerId = id('part2');
	await sql`
		INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
		VALUES (${fillerId}, 'Romans 6', 'esv', ${owner.id}, ${seriesId}, 1, now(), now())
	`;
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
		VALUES (${passId}, ${partId}, 'NT', 'RO', 'Romans', 1, 1, 5, 21, 0, 'CACHED-ORIGINAL', now(), now())
	`;
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at)
		VALUES (${id('pass2')}, ${fillerId}, 'NT', 'RO', 'Romans', 6, 1, 6, 23, 0, now())
	`;

	// The straddling column, with non-default width and leftOffset.
	await sql`
		INSERT INTO passage_column (id, passage_id, starting_word_id, width, left_offset, created_at, updated_at)
		VALUES (${colId}, ${passId}, ${w(1, 1)}, 421, 37, now(), now())
	`;
	// Two sections inside it: one wholly before the boundary, one straddling it. Both carry a colour
	// and a topOffset the clone must preserve.
	await sql`
		INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, top_offset, created_at, updated_at)
		VALUES (${secStay}, ${colId}, ${w(1, 1)}, 'purple', 11, now(), now())
	`;
	await sql`
		INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, top_offset, created_at, updated_at)
		VALUES (${secStraddle}, ${colId}, ${w(2, 1)}, 'orange', 23, now(), now())
	`;

	// Segments: 1:1 (stays), 2:1 (stays), 3:1 (moves), 4:1 (moves). The straddling SECTION owns 2:1,
	// 3:1 and 4:1, so it is the one that must be cloned.
	const segs = [
		[id('s-1-1'), secStay, w(1, 1), 'note 1:1'],
		[id('s-2-1'), secStraddle, w(2, 1), 'note 2:1'],
		[id('s-3-1'), secStraddle, w(3, 1), 'note 3:1'],
		[id('s-4-1'), secStraddle, w(4, 1), 'note 4:1']
	];
	for (const [segId, sectionId, anchor, note] of segs) {
		await sql`
			INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at)
			VALUES (${segId}, ${sectionId}, ${anchor}, ${note}, ${note + ' commentary'}, now(), now())
		`;
	}
	await sql`
		INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
		VALUES (${id('h-stay')}, ${id('s-1-1')}, 'one', 'Staying heading', now(), now())
	`;
	await sql`
		INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at)
		VALUES (${id('h-move')}, ${id('s-3-1')}, 'one', 'Moving heading', now(), now())
	`;

	console.log('\nFixture: Romans 1–5 in one part, one column straddling the 3:1 split.\n');

	const { db } = await import('../src/lib/server/db/index.js');
	const { splitPassageStructure, inspectPassageSplit } = await import(
		'../src/lib/server/db/seriesStructure.js'
	);
	const { planPartSplit } = await import('../src/lib/utils/seriesRestructure.js');
	const { passage } = await import('../src/lib/server/db/schema.js');
	const { eq } = await import('drizzle-orm');

	const before = await liveTree();
	check('four segments before the split', before.length, 4);

	// ── Plan: split after chapter 2, so the boundary is 3:1 ───────────────────
	console.log('── planning the split after chapter 2 ──');

	const plan = planPartSplit({
		part: {
			id: partId,
			passages: [
				{
					id: passId,
					testament: 'NT',
					bookId: 'RO',
					bookName: 'Romans',
					fromChapter: 1,
					fromVerse: 1,
					toChapter: 5,
					toVerse: 21,
					displayOrder: 0
				}
			]
		},
		afterChapter: 2,
		translationId: 'esv'
	});
	assert('the planner accepts it', plan.ok);
	check(
		'the first half is Romans 1:1–2:29',
		`${plan.first[0].fromChapter}:${plan.first[0].fromVerse}-${plan.first[0].toChapter}:${plan.first[0].toVerse}`,
		'1:1-2:29'
	);
	check(
		'the second half is Romans 3:1–5:21',
		`${plan.second[0].fromChapter}:${plan.second[0].fromVerse}-${plan.second[0].toChapter}:${plan.second[0].toVerse}`,
		'3:1-5:21'
	);

	const boundary = w(3, 1);
	const inspection = await inspectPassageSplit(db, { passageId: passId, boundaryWordId: boundary });
	check('two segments would move', inspection.movedSegments, 2);
	check('no connections straddle (none drawn)', inspection.straddlingConnections.length, 0);

	// ── Perform it ────────────────────────────────────────────────────────────
	console.log('\n── performing the split ──');

	const newPartId = id('new-part');
	const newPassId = id('new-pass');

	const moved = await db.transaction(async (tx) => {
		// The endpoint shifts seriesOrder, inserts the new part, narrows the original passage and
		// creates the new one before transferring structure. Reproduced in that order.
		await sql`UPDATE study SET series_order = 2 WHERE id = ${fillerId}`;
		await sql`
			INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
			VALUES (${newPartId}, 'Romans 3:1-5:21', 'esv', ${owner.id}, ${seriesId}, 1, now(), now())
		`;

		// ⚠️ The original passage row is UPDATED, not deleted and recreated. Deleting it would cascade
		// away the column this split is about to divide.
		await tx
			.update(passage)
			.set({
				toChapter: plan.first[0].toChapter,
				toVerse: plan.first[0].toVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, passId));

		await sql`
			INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at)
			VALUES (${newPassId}, ${newPartId}, 'NT', 'RO', 'Romans',
				${plan.second[0].fromChapter}, ${plan.second[0].fromVerse},
				${plan.second[0].toChapter}, ${plan.second[0].toVerse}, 0, now())
		`;

		return splitPassageStructure(tx, {
			passageId: passId,
			newPassageId: newPassId,
			boundaryWordId: boundary,
			newStudyId: newPartId,
			seriesId
		});
	});

	check('no whole column moved (the only column straddles)', moved.movedColumns, 0);
	check('one column was cloned', moved.clonedColumns, 1);
	check('two segments moved', moved.movedSegments, 2);

	// ── The assertions a pure test cannot make ────────────────────────────────
	console.log('\n── nothing was lost: all four segments survive with their content ──');

	const after = await liveTree();
	check('still four segments', after.length, 4);
	const bySeg = new Map(after.map((r) => [r.segment_id, r]));
	for (const [segId, , , note] of segs) {
		assert(`${segId} survives`, bySeg.has(segId));
		check(`${segId} kept its note`, bySeg.get(segId)?.note, note);
		check(`${segId} kept its commentary`, bySeg.get(segId)?.commentary, `${note} commentary`);
	}

	const heads =
		await sql`SELECT id, passage_segment_id FROM passage_heading WHERE id LIKE ${PREFIX + '%'}`;
	check('both headings survive', heads.length, 2);
	assert(
		'the moving heading followed its segment',
		heads.some((h) => h.passage_segment_id === id('s-3-1'))
	);

	console.log('\n── the split landed the right segments in the right parts ──');
	check('1:1 stayed with the original part', bySeg.get(id('s-1-1'))?.study_id, partId);
	check('2:1 stayed too', bySeg.get(id('s-2-1'))?.study_id, partId);
	check('3:1 moved to the new part', bySeg.get(id('s-3-1'))?.study_id, newPartId);
	check('4:1 moved as well', bySeg.get(id('s-4-1'))?.study_id, newPartId);

	console.log('\n── the ORIGINAL column kept its id, so the near side kept its identity ──');
	check('1:1 is still in the original column', bySeg.get(id('s-1-1'))?.column_id, colId);
	check('2:1 is still in the original column', bySeg.get(id('s-2-1'))?.column_id, colId);
	assert(
		'the moved segments are in a NEW column, not the original',
		bySeg.get(id('s-3-1'))?.column_id !== colId
	);
	check(
		'and both moved segments share that one clone',
		bySeg.get(id('s-3-1'))?.column_id,
		bySeg.get(id('s-4-1'))?.column_id
	);

	console.log('\n── the clone preserved presentation (a split must not restyle the document) ──');
	check('the cloned column kept the width', bySeg.get(id('s-3-1'))?.width, 421);
	check('and the leftOffset', bySeg.get(id('s-3-1'))?.left_offset, 37);
	check('the cloned section kept its colour', bySeg.get(id('s-3-1'))?.color, 'orange');
	check('and its topOffset', bySeg.get(id('s-3-1'))?.top_offset, 23);
	check('the original column is unchanged', bySeg.get(id('s-1-1'))?.width, 421);
	check('and the staying section kept its own colour', bySeg.get(id('s-1-1'))?.color, 'purple');

	console.log('\n── the two passage ranges abut, and the cache was invalidated ──');
	const [origRow] =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse, cached_text FROM passage WHERE id = ${passId}`;
	const [newRow] =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse FROM passage WHERE id = ${newPassId}`;
	check(
		'the original now covers 1:1–2:29',
		`${origRow.from_chapter}:${origRow.from_verse}-${origRow.to_chapter}:${origRow.to_verse}`,
		'1:1-2:29'
	);
	check(
		'the new part covers 3:1–5:21',
		`${newRow.from_chapter}:${newRow.from_verse}-${newRow.to_chapter}:${newRow.to_verse}`,
		'3:1-5:21'
	);
	check('the original cache was cleared', origRow.cached_text, null);

	console.log('\n── nothing orphaned, and the straddling section was split not moved ──');
	const orphanSegs = await sql`
		SELECT COUNT(*)::int AS n FROM passage_segment s
		LEFT JOIN passage_section sec ON s.passage_section_id = sec.id
		WHERE s.id LIKE ${PREFIX + '%'} AND sec.id IS NULL
	`;
	check('no segment lost its section', orphanSegs[0].n, 0);
	const orphanSecs = await sql`
		SELECT COUNT(*)::int AS n FROM passage_section sec
		LEFT JOIN passage_column col ON sec.passage_column_id = col.id
		WHERE sec.id LIKE ${PREFIX + '%'} AND col.id IS NULL
	`;
	check('no section lost its column', orphanSecs[0].n, 0);

	// The straddling section must still exist in the ORIGINAL passage holding 2:1, as well as having a
	// clone in the new one. If it had been re-parented instead of cloned, 2:1 would have moved too.
	const straddleStill = await sql`
		SELECT col.passage_id FROM passage_section sec
		JOIN passage_column col ON sec.passage_column_id = col.id
		WHERE sec.id = ${secStraddle}
	`;
	check(
		'the straddling section still belongs to the original passage',
		straddleStill[0]?.passage_id,
		passId
	);
	check('and 2:1 is still inside it', bySeg.get(id('s-2-1'))?.section_id, secStraddle);
	assert(
		'while 3:1 sits in a cloned section, not the original',
		bySeg.get(id('s-3-1'))?.section_id !== secStraddle
	);

	console.log('\n── seriesOrder was shifted, never re-derived (§4) ──');
	const order =
		await sql`SELECT id, series_order FROM study WHERE series_id = ${seriesId} ORDER BY series_order`;
	check('three parts in the series', order.length, 3);
	check('the split part is still first', order[0].id, partId);
	check('the new part is second', order[1].id, newPartId);
	check('and the pre-existing part shifted to third', order[2].id, fillerId);
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	await cleanup();
	const [left] =
		await sql`SELECT COUNT(*)::int AS n FROM passage_segment WHERE id LIKE ${PREFIX + '%'}`;
	console.log(`\nFixture removed (${left.n} probe segments left behind — expected 0).`);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
