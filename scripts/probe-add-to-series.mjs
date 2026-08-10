/**
 * Exercise adding a standalone study to a series against a REAL database (Q17, phase 3).
 *
 * The pure planner is verified by `verify-series-membership.mjs`. What needs a database is the part
 * that changes rows: the study must be MOVED, not copied — its id, notes, commentary and connections
 * must survive, because the whole reason for moving rather than duplicating is that a copy silently
 * forks the user's work.
 *
 * ⚠️ A WRITE probe. Not in `npm run verify`. Run with `npm run probe:add-part`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-add-';
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
const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');
	await cleanup();

	// A two-part Romans series, plus a standalone study that continues it, plus one in another
	// translation to prove the invariant refuses.
	const seriesId = id('series');
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe add', ${owner.id}, now(), now())`;

	for (const [sid, order, fc, tc, tv] of [
		[id('p1'), 0, 1, 2, 29],
		[id('p2'), 1, 3, 4, 25]
	]) {
		await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${sid}, ${'Romans ' + fc}, 'esv', ${owner.id}, ${seriesId}, ${order}, now(), now())`;
		await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${sid + '-g'}, ${sid}, 'NT', 'RO', 'Romans', ${fc}, 1, ${tc}, ${tv}, 0, now())`;
	}

	// The candidate: Romans 5–6, contiguous with part 2, carrying real content.
	const candidate = id('cand');
	await sql`INSERT INTO study (id, title, translation, user_id, created_at, updated_at) VALUES (${candidate}, 'Romans 5-6', 'esv', ${owner.id}, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('cg')}, ${candidate}, 'NT', 'RO', 'Romans', 5, 1, 6, 23, 0, now())`;
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('cc')}, ${id('cg')}, 'RO-005-001-001', now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('cs')}, ${id('cc')}, 'RO-005-001-001', 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${id('cseg')}, ${id('cs')}, 'RO-005-001-001', 'my note', 'my commentary', now(), now())`;

	console.log('\nFixture: 2-part Romans series + a standalone Romans 5–6 study with content.\n');

	const { db } = await import('../src/lib/server/db/index.js');
	const { planAddToSeries } = await import('../src/lib/utils/seriesMembership.js');
	const { study, studySeries, passage } = await import('../src/lib/server/db/schema.js');
	const { eq, and, asc, inArray } = await import('drizzle-orm');

	/** Load the series' parts with their ranges, exactly as the endpoint does. */
	const loadParts = async () => {
		const parts = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, owner.id)))
			.orderBy(asc(study.seriesOrder));
		const rows = await db
			.select()
			.from(passage)
			.where(inArray(passage.studyId, [...parts.map((p) => p.id), candidate]));
		const attach = (row) => ({
			...row,
			passages: rows.filter((r) => r.studyId === row.id)
		});
		return { parts: parts.map(attach), attach };
	};

	console.log('── the plan is accepted, with no warnings for a contiguous continuation ──');
	let { parts, attach } = await loadParts();
	const [cand] = await db.select().from(study).where(eq(study.id, candidate));
	const [seriesRow] = await db.select().from(studySeries).where(eq(studySeries.id, seriesId));

	const plan = planAddToSeries({ study: attach(cand), series: seriesRow, parts });
	assert('accepted', plan.ok);
	check('no warnings — it continues the last part', plan.warnings.length, 0);
	check('and it takes order 2', plan.seriesOrder, 2);

	console.log('\n── performing the add ──');
	await db.transaction(async (tx) => {
		const now = new Date();
		await tx
			.update(study)
			.set({ seriesId, seriesOrder: plan.seriesOrder, groupId: null, updatedAt: now })
			.where(eq(study.id, candidate));
		await tx.update(studySeries).set({ updatedAt: now }).where(eq(studySeries.id, seriesId));
	});

	console.log('\n── the study was MOVED, not copied: its content survives ──');
	const [moved] =
		await sql`SELECT id, series_id, series_order, title FROM study WHERE id = ${candidate}`;
	assert('the row still exists under its ORIGINAL id', Boolean(moved));
	check('it now belongs to the series', moved.series_id, seriesId);
	check('as part 3 (order 2)', moved.series_order, 2);
	check('and keeps its title', moved.title, 'Romans 5-6');

	const [seg] = await sql`SELECT note, commentary FROM passage_segment WHERE id = ${id('cseg')}`;
	check('its note survived', seg?.note, 'my note');
	check('its commentary survived', seg?.commentary, 'my commentary');

	const dupes =
		await sql`SELECT COUNT(*)::int AS n FROM study WHERE title = 'Romans 5-6' AND user_id = ${owner.id}`;
	check('and nothing was duplicated', dupes[0].n, 1);

	const [total] = await sql`SELECT COUNT(*)::int AS n FROM study WHERE series_id = ${seriesId}`;
	check('the series now has three parts', total.n, 3);

	console.log('\n── §4: the translation invariant refuses a NET study ──');
	const netStudy = id('net');
	await sql`INSERT INTO study (id, title, translation, user_id, created_at, updated_at) VALUES (${netStudy}, 'Romans 7 NET', 'net', ${owner.id}, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('ng')}, ${netStudy}, 'NT', 'RO', 'Romans', 7, 1, 7, 25, 0, now())`;

	({ parts } = await loadParts());
	const [netRow] = await db.select().from(study).where(eq(study.id, netStudy));
	const netPassages = await db.select().from(passage).where(eq(passage.studyId, netStudy));
	const netPlan = planAddToSeries({
		study: { ...netRow, passages: netPassages },
		series: seriesRow,
		parts
	});
	assert('refused', !netPlan.ok);
	assert('naming both translations', /ESV/.test(netPlan.error) && /NET/.test(netPlan.error));

	const [untouched] = await sql`SELECT series_id FROM study WHERE id = ${netStudy}`;
	check('and the NET study was not moved', untouched.series_id, null);

	console.log('\n── a non-contiguous addition WARNS and is still allowed (§4/Q7) ──');
	const philippians = id('php');
	await sql`INSERT INTO study (id, title, translation, user_id, created_at, updated_at) VALUES (${philippians}, 'Philippians', 'esv', ${owner.id}, now(), now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('pg')}, ${philippians}, 'NT', 'PHP', 'Philippians', 1, 1, 4, 23, 0, now())`;

	({ parts } = await loadParts());
	const [phpRow] = await db.select().from(study).where(eq(study.id, philippians));
	const phpPassages = await db.select().from(passage).where(eq(passage.studyId, philippians));
	const phpPlan = planAddToSeries({
		study: { ...phpRow, passages: phpPassages },
		series: seriesRow,
		parts
	});
	assert('accepted', phpPlan.ok);
	check('with one warning', phpPlan.warnings.length, 1);
	assert('about the different book', /different book/.test(phpPlan.warnings[0]));
	check('and it appends after the three existing parts', phpPlan.seriesOrder, 3);
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
