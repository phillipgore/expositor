/**
 * Exercise run reordering against a REAL database (SERIES_PLAN §4, phase 3).
 *
 * The pure planner is covered by `verify-series-reorder.mjs`. What needs a database is the property
 * that makes reordering safe: `seriesOrder` must end up a DENSE, GAPLESS 0..n-1 sequence, because §4
 * makes `seriesOrder` the ordering authority and navigation reads it directly. A gap or a duplicate
 * would make "Part 3 of 5" a lie, or make prev/next skip a part.
 *
 * ⚠️ A WRITE probe. Not in `npm run verify`. Run with `npm run probe:reorder`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-ro-';
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
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

	// A Prison Epistles-shaped series: Ephesians as TWO contiguous parts (one run of two), then
	// Philippians, then Colossians. Three runs, so it is reorderable, and the first run is multi-part —
	// the case that would break if runs were moved as individual parts.
	const seriesId = id('series');
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe reorder', ${owner.id}, now(), now())`;

	const fixture = [
		[id('eph1'), 0, 'EP', 'Ephesians', 1, 3, 21],
		[id('eph2'), 1, 'EP', 'Ephesians', 4, 6, 24],
		[id('php'), 2, 'PH', 'Philippians', 1, 4, 23],
		[id('col'), 3, 'CO', 'Colossians', 1, 4, 18]
	];
	for (const [sid, order, book, name, fc, tc, tv] of fixture) {
		await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${sid}, ${name + ' ' + fc}, 'esv', ${owner.id}, ${seriesId}, ${order}, now(), now())`;
		await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${sid + '-g'}, ${sid}, 'NT', ${book}, ${name}, ${fc}, 1, ${tc}, ${tv}, 0, now())`;
	}

	console.log('\nFixture: Eph(2 parts) → Php → Col. Three runs, first one multi-part.\n');

	const { db } = await import('../src/lib/server/db/index.js');
	const { describeRuns, planRunReorder } = await import('../src/lib/utils/seriesReorder.js');
	const { study, passage } = await import('../src/lib/server/db/schema.js');
	const { eq, and, asc, inArray } = await import('drizzle-orm');

	const loadParts = async () => {
		const parts = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, owner.id)))
			.orderBy(asc(study.seriesOrder));
		const rows = await db
			.select()
			.from(passage)
			.where(
				inArray(
					passage.studyId,
					parts.map((p) => p.id)
				)
			);
		return parts.map((p) => ({ ...p, passages: rows.filter((r) => r.studyId === p.id) }));
	};

	const orderOf = async () => {
		const rows =
			await sql`SELECT id, series_order FROM study WHERE series_id = ${seriesId} ORDER BY series_order ASC`;
		return rows.map((r) => r.id.replace(PREFIX, ''));
	};

	const applyPlan = async (plan) => {
		await db.transaction(async (tx) => {
			for (const a of plan.updates) {
				await tx
					.update(study)
					.set({ seriesOrder: a.seriesOrder, updatedAt: new Date() })
					.where(eq(study.id, a.id));
			}
		});
	};

	console.log('── the fixture has three runs, and Ephesians is one run of two parts ──');
	let parts = await loadParts();
	let described = describeRuns(parts);
	check('three runs', described.runs.length, 3);
	check('the first covers two parts', described.runs[0].partCount, 2);
	assert('so the series is reorderable', described.reorderable);

	console.log('\n── moving Colossians to the front moves it as a whole run ──');
	let plan = planRunReorder({ parts, fromIndex: 2, toIndex: 0 });
	assert('planned', plan.ok);
	await applyPlan(plan);
	check('Colossians is first, Ephesians stays intact behind it', await orderOf(), [
		'col',
		'eph1',
		'eph2',
		'php'
	]);

	console.log('\n── seriesOrder stays dense and gapless, which navigation depends on ──');
	const orders =
		await sql`SELECT series_order FROM study WHERE series_id = ${seriesId} ORDER BY series_order ASC`;
	check(
		'exactly 0,1,2,3',
		orders.map((r) => r.series_order),
		[0, 1, 2, 3]
	);
	const [distinct] =
		await sql`SELECT COUNT(DISTINCT series_order)::int AS n FROM study WHERE series_id = ${seriesId}`;
	check('with no duplicates', distinct.n, 4);

	console.log('\n── the two-part Ephesians run is never split by a move ──');
	parts = await loadParts();
	described = describeRuns(parts);
	assert(
		'Ephesians is still a single run of two parts',
		Boolean(described.runs.find((run) => run.partCount === 2))
	);
	// Adjacent orders are what "rigid within a run" means in the stored data: had a move interleaved
	// anything, these two would no longer be neighbours and the run would have silently dissolved.
	const ephOrders =
		await sql`SELECT series_order FROM study WHERE id IN (${id('eph1')}, ${id('eph2')}) ORDER BY series_order ASC`;
	check('and its parts remain adjacent', ephOrders[1].series_order - ephOrders[0].series_order, 1);

	console.log('\n── moving the multi-part run itself carries both parts together ──');
	plan = planRunReorder({ parts, fromIndex: 1, toIndex: 2 });
	assert('planned', plan.ok);
	await applyPlan(plan);
	check('both Ephesians parts moved as a block', await orderOf(), ['col', 'php', 'eph1', 'eph2']);

	const finalOrders =
		await sql`SELECT series_order FROM study WHERE series_id = ${seriesId} ORDER BY series_order ASC`;
	check(
		'still dense',
		finalOrders.map((r) => r.series_order),
		[0, 1, 2, 3]
	);

	console.log('\n── a contiguous series offers nothing to reorder (§11) ──');
	// Both Ephesians parts alone: one run, so the menu must disable the command rather than open a
	// dialog containing a single immovable row.
	const contiguous = (await loadParts()).filter((p) => p.id.startsWith(id('eph')));
	check('one run', describeRuns(contiguous).runs.length, 1);
	assert('not reorderable', !describeRuns(contiguous).reorderable);
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
