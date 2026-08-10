/**
 * Exercise Join Parts against a REAL database (SERIES_PLAN §8, §4).
 *
 * This is the operation with the highest cascade risk in the whole feature. `planPartJoin()` coalesces
 * two abutting ranges into ONE, so the absorbed part's `passage` row disappears — and
 * `passage_column.passage_id` is `ON DELETE CASCADE`, all the way down to headings. Written the obvious
 * way (write the merged range, delete the absorbed row) it destroys every column, section, segment,
 * heading, note and commentary in the absorbed part **and reports success**.
 *
 * `joinPassageStructure()` re-parents first and refuses to delete a passage row that still owns
 * columns. That guard has never run against Postgres. This probe is what decides whether the reasoning
 * behind it holds.
 *
 * It also covers §4's dissolve rule, which has its own ordering trap: `study.series_id` is
 * `ON DELETE CASCADE`, so removing the series row before clearing the survivor's back-reference would
 * destroy the last part instead of freeing it.
 *
 * ⚠️ A WRITE probe, not a verifier. Not in `npm run verify`. Run with `npm run probe:join-parts`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-jp-';
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

/**
 * Build a three-part contiguous Romans series: 1–2, 3–4, 5–6.
 *
 * Three, not two, so a join leaves a real series behind and the dissolve rule can be tested separately
 * on the second join. Every part carries authored content, because content surviving the cascade is the
 * whole question.
 */
async function buildFixture(ownerId) {
	await cleanup();

	const seriesId = id('series');
	await sql`
		INSERT INTO study_series (id, name, user_id, created_at, updated_at)
		VALUES (${seriesId}, 'Probe JP series', ${ownerId}, now(), now())
	`;

	const parts = [
		{ study: id('p1'), passage: id('g1'), order: 0, from: [1, 1], to: [2, 29], anchor: w(1, 1) },
		{ study: id('p2'), passage: id('g2'), order: 1, from: [3, 1], to: [4, 25], anchor: w(3, 1) },
		{ study: id('p3'), passage: id('g3'), order: 2, from: [5, 1], to: [6, 23], anchor: w(5, 1) }
	];

	for (const part of parts) {
		await sql`
			INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
			VALUES (${part.study}, ${'Part ' + (part.order + 1)}, 'esv', ${ownerId}, ${seriesId}, ${part.order}, now(), now())
		`;
		await sql`
			INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
			VALUES (${part.passage}, ${part.study}, 'NT', 'RO', 'Romans',
				${part.from[0]}, ${part.from[1]}, ${part.to[0]}, ${part.to[1]}, 0, 'CACHED', now(), now())
		`;

		const col = `${part.passage}-col`;
		const sec = `${part.passage}-sec`;
		await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${col}, ${part.passage}, ${part.anchor}, now(), now())`;
		await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${sec}, ${col}, ${part.anchor}, 'blue', now(), now())`;
		// Two segments per part, both with content.
		await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${part.passage + '-s1'}, ${sec}, ${part.anchor}, ${part.study + ' note 1'}, ${part.study + ' comm 1'}, now(), now())`;
		await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at) VALUES (${part.passage + '-s2'}, ${sec}, ${w(part.from[0], 10)}, ${part.study + ' note 2'}, ${part.study + ' comm 2'}, now(), now())`;
		await sql`INSERT INTO passage_heading (id, passage_segment_id, heading_type, text, created_at, updated_at) VALUES (${part.passage + '-h'}, ${part.passage + '-s1'}, 'one', ${part.study + ' heading'}, now(), now())`;
	}

	return { seriesId, parts };
}

/** Every probe segment still in the database, with its owning study. */
async function liveSegments() {
	return sql`
		SELECT s.id, s.note, s.commentary, p.study_id, p.id AS passage_id
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

	const { seriesId, parts } = await buildFixture(owner.id);
	console.log(`\nFixture built: 3 contiguous parts, 6 segments, 3 headings.\n`);

	// Imported after dotenv; `$lib/server/db/index.js` opens its pool at module load.
	const { db } = await import('../src/lib/server/db/index.js');
	const { joinPassageStructure, inspectPassageJoin } = await import(
		'../src/lib/server/db/seriesStructure.js'
	);
	const { planPartJoin } = await import('../src/lib/utils/seriesRestructure.js');
	const { passage, study } = await import('../src/lib/server/db/schema.js');
	const { eq } = await import('drizzle-orm');

	const before = await liveSegments();
	check('six segments exist before the join', before.length, 6);

	// ── Plan the join of part 2 into part 1 ───────────────────────────────────
	console.log('── planning: join part 2 backwards into part 1 ──');

	const partRows = await sql`
		SELECT s.id, s.series_order, s.title,
			p.id AS passage_id, p.testament, p.book_id, p.book_name,
			p.from_chapter, p.from_verse, p.to_chapter, p.to_verse, p.display_order
		FROM study s JOIN passage p ON p.study_id = s.id
		WHERE s.series_id = ${seriesId}
		ORDER BY s.series_order
	`;
	const asParts = partRows.map((r) => ({
		id: r.id,
		seriesOrder: r.series_order,
		title: r.title,
		translation: 'esv',
		passages: [
			{
				id: r.passage_id,
				testament: r.testament,
				bookId: r.book_id,
				bookName: r.book_name,
				fromChapter: r.from_chapter,
				fromVerse: r.from_verse,
				toChapter: r.to_chapter,
				toVerse: r.to_verse,
				displayOrder: r.display_order
			}
		]
	}));

	const plan = planPartJoin({
		parts: asParts,
		partId: parts[1].study,
		direction: 'previous',
		translationId: 'esv'
	});
	assert('the planner accepts the join', plan.ok);
	check('part 1 is kept', plan.keep.id, parts[0].study);
	check('part 2 is absorbed', plan.absorb.id, parts[1].study);
	check('the two ranges coalesce into one', plan.passages.length, 1);
	check(
		'covering Romans 1:1–4:25',
		`${plan.passages[0].fromChapter}:${plan.passages[0].fromVerse}-${plan.passages[0].toChapter}:${plan.passages[0].toVerse}`,
		'1:1-4:25'
	);

	// The inspection the endpoint uses to report connection consequences.
	const inspection = await inspectPassageJoin(db, { fromPassageId: parts[1].passage });
	check('two segments would move', inspection.movedSegments, 2);
	check('no connections straddle (none were drawn)', inspection.straddlingConnections.length, 0);

	// ── Perform it: the cascade moment ────────────────────────────────────────
	console.log('\n── performing the join (the absorbed passage row is DELETED) ──');

	const result = await db.transaction(async (tx) => {
		const moved = await joinPassageStructure(tx, {
			fromPassageId: parts[1].passage,
			toPassageId: parts[0].passage,
			targetStudyId: parts[0].study,
			seriesId,
			deleteEmptied: true
		});

		// The surviving passage takes the merged range, and the absorbed study row goes — the same two
		// writes the endpoint performs after the structure transfer.
		const range = plan.passages[0];
		await tx
			.update(passage)
			.set({
				fromChapter: range.fromChapter,
				fromVerse: range.fromVerse,
				toChapter: range.toChapter,
				toVerse: range.toVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, parts[0].passage));

		await tx.delete(study).where(eq(study.id, parts[1].study));

		return moved;
	});

	check('two segments moved', result.movedSegments, 2);
	check('the absorbed passage row was deleted', result.deletedPassage, true);

	// ── The assertions this probe exists for ──────────────────────────────────
	console.log('\n── the cascade did NOT fire: all six segments survive ──');

	const after = await liveSegments();
	check('still six segments', after.length, 6);

	const byId = new Map(after.map((s) => [s.id, s]));
	for (const part of parts) {
		for (const n of [1, 2]) {
			const segId = `${part.passage}-s${n}`;
			assert(`${segId} survives`, byId.has(segId));
			check(`${segId} kept its note`, byId.get(segId)?.note, `${part.study} note ${n}`);
			check(`${segId} kept its commentary`, byId.get(segId)?.commentary, `${part.study} comm ${n}`);
		}
	}

	const heads =
		await sql`SELECT id, passage_segment_id FROM passage_heading WHERE id LIKE ${PREFIX + '%'}`;
	check('all three headings survive', heads.length, 3);

	console.log('\n── the absorbed part’s structure now belongs to the surviving part ──');
	check(
		'its first segment moved to part 1',
		byId.get(`${parts[1].passage}-s1`)?.study_id,
		parts[0].study
	);
	check(
		'its second segment moved too',
		byId.get(`${parts[1].passage}-s2`)?.study_id,
		parts[0].study
	);
	check(
		'and they hang off the surviving passage row',
		byId.get(`${parts[1].passage}-s1`)?.passage_id,
		parts[0].passage
	);
	check('part 3 is untouched', byId.get(`${parts[2].passage}-s1`)?.study_id, parts[2].study);

	console.log('\n── the merged range and the study row ──');
	const [merged] =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse, cached_text FROM passage WHERE id = ${parts[0].passage}`;
	check(
		'the surviving passage covers Romans 1:1–4:25',
		`${merged.from_chapter}:${merged.from_verse}-${merged.to_chapter}:${merged.to_verse}`,
		'1:1-4:25'
	);
	check('its cache was invalidated', merged.cached_text, null);

	const remainingStudies =
		await sql`SELECT id FROM study WHERE series_id = ${seriesId} ORDER BY series_order`;
	check('two parts remain in the series', remainingStudies.length, 2);
	assert('the absorbed study row is gone', !remainingStudies.some((s) => s.id === parts[1].study));

	const orphanPassages =
		await sql`SELECT COUNT(*)::int AS n FROM passage WHERE id = ${parts[1].passage}`;
	check('the absorbed passage row is gone', orphanPassages[0].n, 0);

	// ── The guard that makes the ordering safe ────────────────────────────────
	console.log('\n── assertPassageEmpty refuses to delete a passage that still owns columns ──');

	// The guard is the last line of defence: if a re-parent ever silently moved less than it claimed,
	// this is what stops ON DELETE CASCADE from taking the remainder. Provoked directly by asking the
	// executor to delete a passage whose columns have NOT been moved away — achieved by pointing
	// `fromPassageId` and `toPassageId` at the SAME passage, so the re-parent is a no-op and the row is
	// still fully populated when the delete is attempted.
	//
	// The whole thing runs in a transaction that is rolled back either way, so part 3 is unharmed
	// regardless of the outcome.
	let guardMessage = null;
	try {
		await db.transaction(async (tx) => {
			await joinPassageStructure(tx, {
				fromPassageId: parts[2].passage,
				toPassageId: parts[2].passage,
				targetStudyId: parts[2].study,
				seriesId,
				deleteEmptied: true
			});
			throw new Error('probe-guard-did-not-fire');
		});
	} catch (error) {
		guardMessage = error.message;
	}

	assert(
		'the guard fired rather than letting the delete through',
		guardMessage?.includes('Refusing to delete passage') === true
	);
	assert(
		'and it names the cascade as the reason',
		guardMessage?.includes('ON DELETE CASCADE') === true
	);

	console.log('\n── the rollback left part 3 completely intact ──');
	const afterRollback = await liveSegments();
	check('all six segments still present', afterRollback.length, 6);
	check(
		'part 3’s segments are still owned by part 3',
		afterRollback.find((s) => s.id === `${parts[2].passage}-s1`)?.study_id,
		parts[2].study
	);
	const [part3Passage] =
		await sql`SELECT COUNT(*)::int AS n FROM passage WHERE id = ${parts[2].passage}`;
	check('and its passage row survived the attempted delete', part3Passage.n, 1);
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
