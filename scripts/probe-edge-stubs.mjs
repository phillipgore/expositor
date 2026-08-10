/**
 * Exercise cross-part connection PRESERVATION against a REAL database (§8 strategy (c), phase 3).
 *
 * Phase 2 shipped strategy (b): a connection whose endpoints ended up in different parts was deleted,
 * with the count shown before the user confirmed. Phase 3 is (c) — keep it, scoped to the series, and
 * render an edge stub on each side.
 *
 * The regression this guards is the whole point of the phase: a user who splits Romans at chapter 8
 * used to lose exactly the cross-chapter links that motivated making it a series. So the probe asserts
 * on the row after a real split:
 *
 *   - the connection still EXISTS (phase 2 would have deleted it);
 *   - it carries `seriesId`, which is what lets the far part find it;
 *   - its `studyId` is unchanged, per Q42 — ownership is not churned on every boundary move;
 *   - both endpoints still reference live structure rows, in two different parts;
 *   - and the widened layout query returns it from BOTH parts, which is what makes a stub drawable
 *     on each side rather than only where the row happens to be owned.
 *
 * ⚠️ A WRITE probe. Not in `npm run verify`. Run with `npm run probe:stubs`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-es-';
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

const id = (s) => `${PREFIX}${s}`;
const w = (c, v) => `RO-${String(c).padStart(3, '0')}-${String(v).padStart(3, '0')}-001`;

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	await cleanup();

	// One part covering Romans 1–5, with a connection drawn ACROSS what will become the split point:
	// from a segment at 1:1 to a segment at 4:1. Splitting after chapter 2 puts those in different parts.
	const seriesId = id('series');
	const partId = id('part1');
	const fillerId = id('part2');
	const passId = id('pass1');

	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe ES', ${owner.id}, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${partId}, 'Romans 1-5', 'esv', ${owner.id}, ${seriesId}, 0, now(), now())`;
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${fillerId}, 'Romans 6', 'esv', ${owner.id}, ${seriesId}, 1, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${passId}, ${partId}, 'NT', 'RO', 'Romans', 1, 1, 5, 21, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('pass2')}, ${fillerId}, 'NT', 'RO', 'Romans', 6, 1, 6, 23, 0, now())`;

	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('col')}, ${passId}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('sec')}, ${id('col')}, ${w(1, 1)}, 'blue', now(), now())`;
	for (const [segId, ch] of [
		[id('s1'), 1],
		[id('s2'), 2],
		[id('s4'), 4]
	]) {
		await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${segId}, ${id('sec')}, ${w(ch, 1)}, ${'note ' + ch}, now(), now())`;
	}

	// The connection that will straddle the split: 1:1 ←→ 4:1.
	await sql`
		INSERT INTO segment_connection (id, study_id, from_type, to_type, from_segment_id, to_segment_id, note, created_at, updated_at)
		VALUES (${id('conn')}, ${partId}, 'segment', 'segment', ${id('s1')}, ${id('s4')}, 'cross-chapter link', now(), now())
	`;

	console.log('\nFixture: Romans 1–5 in one part, a connection from 1:1 to 4:1.\n');

	const { db } = await import('../src/lib/server/db/index.js');
	const { splitPassageStructure, preserveCrossPartConnections, inspectPassageSplit } = await import(
		'../src/lib/server/db/seriesStructure.js'
	);
	const { resolveStructureOwners } = await import('../src/lib/server/db/structureOwners.js');
	const { classifyConnections, stubLabel } = await import('../src/lib/utils/connectionStubs.js');
	const { passage } = await import('../src/lib/server/db/schema.js');
	const { eq } = await import('drizzle-orm');

	console.log('── the split is known in advance to cross the connection ──');
	const boundary = w(3, 1);
	const preview = await inspectPassageSplit(db, { passageId: passId, boundaryWordId: boundary });
	check('one connection straddles the split point', preview.straddlingConnections.length, 1);

	// ── Perform the split, preserving rather than deleting ────────────────────
	console.log('\n── performing the split (phase 3: preserve, not delete) ──');
	const newPartId = id('newpart');
	const newPassId = id('newpass');

	const moved = await db.transaction(async (tx) => {
		await sql`UPDATE study SET series_order = 2 WHERE id = ${fillerId}`;
		await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${newPartId}, 'Romans 3-5', 'esv', ${owner.id}, ${seriesId}, 1, now(), now())`;
		await tx
			.update(passage)
			.set({ toChapter: 2, toVerse: 29, cachedText: null })
			.where(eq(passage.id, passId));
		await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${newPassId}, ${newPartId}, 'NT', 'RO', 'Romans', 3, 1, 5, 21, 0, now())`;

		const result = await splitPassageStructure(tx, {
			passageId: passId,
			newPassageId: newPassId,
			boundaryWordId: boundary,
			newStudyId: newPartId,
			seriesId
		});

		// The phase-3 behaviour under test.
		await preserveCrossPartConnections(tx, result.straddlingConnections, seriesId);
		return result;
	});

	check('one connection was reported as straddling', moved.straddlingConnections.length, 1);

	// ── The assertions phase 3 exists for ─────────────────────────────────────
	console.log('\n── the connection SURVIVES (phase 2 would have deleted it) ──');

	const [conn] = await sql`SELECT * FROM segment_connection WHERE id = ${id('conn')}`;
	assert('the row still exists', Boolean(conn));
	check('its note is intact', conn?.note, 'cross-chapter link');
	check('it is stamped with the series', conn?.series_id, seriesId);
	check('and its studyId is UNCHANGED (Q42: ownership is not churned)', conn?.study_id, partId);

	console.log('\n── its endpoints are live, and in two different parts ──');
	const owners = await resolveStructureOwners(db, [conn.from_segment_id, conn.to_segment_id]);
	check('the `from` end is in the original part', owners[conn.from_segment_id], partId);
	check('the `to` end moved to the new part', owners[conn.to_segment_id], newPartId);
	assert(
		'so the two ends are genuinely in different parts',
		owners[conn.from_segment_id] !== owners[conn.to_segment_id]
	);

	console.log('\n── the widened query finds it from BOTH parts ──');
	// This is what makes a stub drawable on each side. Under the old studyId-only query the NEW part
	// would see nothing at all, and the link would be invisible there — the silent loss §8 predicts.
	const seenFromNew = await sql`
		SELECT id FROM segment_connection WHERE study_id = ${newPartId} OR series_id = ${seriesId}
	`;
	assert(
		'the new part sees it via seriesId',
		seenFromNew.some((c) => c.id === id('conn'))
	);

	const oldQueryFromNew =
		await sql`SELECT id FROM segment_connection WHERE study_id = ${newPartId}`;
	check('whereas the old studyId-only query finds nothing there', oldQueryFromNew.length, 0);

	console.log('\n── it classifies as a STUB on each side, never as a local arc ──');

	const idsOf = async (pid) =>
		new Set(
			(
				await sql`
					SELECT s.id FROM passage_segment s
					JOIN passage_section sec ON s.passage_section_id = sec.id
					JOIN passage_column col ON sec.passage_column_id = col.id
					WHERE col.passage_id = ${pid}
				`
			).map((r) => r.id)
		);

	const row = conn2row(conn);
	const onOriginal = classifyConnections([row], await idsOf(passId));
	check('a stub on the original part', onOriginal.stubs.length, 1);
	check('anchored at its `from` end', onOriginal.stubs[0].presentEnd, 'from');
	check('and not drawn as a complete arc', onOriginal.local.length, 0);

	const onNew = classifyConnections([row], await idsOf(newPassId));
	check('a stub on the new part too', onNew.stubs.length, 1);
	check('anchored at its `to` end there', onNew.stubs[0].presentEnd, 'to');

	console.log('\n── and the label names the part the other end is in ──');
	const orderedParts = (
		await sql`SELECT id, title FROM study WHERE series_id = ${seriesId} ORDER BY series_order`
	).map((r) => ({ id: r.id, title: r.title }));
	check(
		'from the original part, it points at the new one',
		stubLabel({ orderedParts, partId: owners[conn.to_segment_id] }),
		'Continues in Part 2: Romans 3-5'
	);
	check(
		'and from the new part, back at the original',
		stubLabel({ orderedParts, partId: owners[conn.from_segment_id] }),
		'Continues in Part 1: Romans 1-5'
	);
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	await cleanup();
	const [left] = await sql`SELECT COUNT(*)::int AS n FROM study WHERE id LIKE ${PREFIX + '%'}`;
	console.log(`\nFixture removed (${left.n} studies left — expected 0).`);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

/** postgres.js returns snake_case columns; the pure classifier reads the camelCase row shape. */
function conn2row(row) {
	return {
		id: row.id,
		fromType: row.from_type,
		toType: row.to_type,
		fromSegmentId: row.from_segment_id,
		toSegmentId: row.to_segment_id,
		fromSectionId: row.from_section_id,
		toSectionId: row.to_section_id,
		fromColumnId: row.from_column_id,
		toColumnId: row.to_column_id,
		studyId: row.study_id
	};
}
