/**
 * Exercise Move Text Up / Down across a passage boundary (SERIES_PLAN §8, commands 4 and 5).
 *
 * The last two of §8's five commands. Unlike the Joins these move NO structure between passages — the
 * operation is one `startingWordId` rewrite plus the two range updates — so what needs proving against a
 * real database is different:
 *
 *   - the caret's verse boundary lands where the arithmetic says, in BOTH directions;
 *   - total verse coverage is conserved (§10.1's licence to skip the export re-check);
 *   - both `cachedText` values are invalidated, since each is keyed by its verse range;
 *   - no segment is left anchored outside its own passage's range — the failure mode that would make a
 *     part render text it does not own;
 *   - a MID-VERSE caret is refused rather than silently producing an inconsistent state.
 *
 * ⚠️ A WRITE probe, not a verifier. Not in `npm run verify`. Run with `npm run probe:move-text`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-mt-';
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

async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}

/**
 * Two contiguous parts, Romans 1–2 and Romans 3–4, each with two segments.
 *
 * Rebuilt between directions so each test starts from the same known state — a move is not idempotent,
 * and reusing a mutated fixture would make the second result depend on the first.
 */
async function buildFixture(ownerId) {
	await cleanup();
	const seriesId = id('series');
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe MT', ${ownerId}, now(), now())`;

	const shape = [
		{
			study: id('pA'),
			pass: id('gA'),
			order: 0,
			range: [1, 1, 2, 29],
			segs: [
				[1, 1],
				[2, 1]
			]
		},
		{
			study: id('pB'),
			pass: id('gB'),
			order: 1,
			range: [3, 1, 4, 25],
			segs: [
				[3, 1],
				[3, 10]
			]
		}
	];

	for (const part of shape) {
		await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${part.study}, ${part.study}, 'esv', ${ownerId}, ${seriesId}, ${part.order}, now(), now())`;
		await sql`
			INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
			VALUES (${part.pass}, ${part.study}, 'NT', 'RO', 'Romans', ${part.range[0]}, ${part.range[1]}, ${part.range[2]}, ${part.range[3]}, 0, 'CACHED', now(), now())
		`;
		const col = `${part.pass}-col`;
		const sec = `${part.pass}-sec`;
		await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${col}, ${part.pass}, ${w(part.range[0], part.range[1])}, now(), now())`;
		await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${sec}, ${col}, ${w(part.range[0], part.range[1])}, 'blue', now(), now())`;
		for (const [c, v] of part.segs) {
			await sql`
				INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at)
				VALUES (${`${part.pass}-s${c}-${v}`}, ${sec}, ${w(c, v)}, ${`note ${c}:${v}`}, now(), now())
			`;
		}
	}
	return { seriesId, shape };
}

/** Verses covered by a range, summing real chapter lengths. */
async function coverage(passageIds) {
	const rows =
		await sql`SELECT from_chapter, from_verse, to_chapter, to_verse FROM passage WHERE id = ANY(${passageIds})`;
	const { getVerseCount } = await import('../src/lib/utils/bibleData.js');
	let total = 0;
	for (const r of rows) {
		for (let c = r.from_chapter; c <= r.to_chapter; c += 1) {
			const len = getVerseCount('NT', 'RO', c);
			const from = c === r.from_chapter ? r.from_verse : 1;
			const to = c === r.to_chapter ? Math.min(r.to_verse, len) : len;
			total += Math.max(0, to - from + 1);
		}
	}
	return total;
}

/** Every probe segment whose anchor falls OUTSIDE its own passage's range. Must always be empty. */
async function segmentsOutsideTheirRange() {
	const rows = await sql`
		SELECT s.id, s.starting_word_id, p.from_chapter, p.from_verse, p.to_chapter, p.to_verse
		FROM passage_segment s
		JOIN passage_section sec ON s.passage_section_id = sec.id
		JOIN passage_column col ON sec.passage_column_id = col.id
		JOIN passage p ON col.passage_id = p.id
		WHERE s.id LIKE ${PREFIX + '%'}
	`;
	const outside = rows.filter((r) => {
		const [, c, v] = r.starting_word_id.split('-').map(Number);
		const afterStart = c > r.from_chapter || (c === r.from_chapter && v >= r.from_verse);
		const beforeEnd = c < r.to_chapter || (c === r.to_chapter && v <= r.to_verse);
		return !(afterStart && beforeEnd);
	});
	return { outside, total: rows.length };
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	const { db } = await import('../src/lib/server/db/index.js');
	const { analyzeCrossPartMove, moveTextAcrossBoundary } = await import(
		'../src/lib/server/db/crossPartMove.js'
	);

	const passA = id('gA');
	const passB = id('gB');
	const both = [passA, passB];

	// ── MOVE UP ───────────────────────────────────────────────────────────────
	//
	// Part B's first segment is anchored 3:1. A caret at 3:5 means "3:1–3:4 belong before this", so those
	// verses join part A and the segment re-anchors to 3:5.
	console.log('\n── MOVE UP: caret at 3:5 in part B’s first segment ──');
	await buildFixture(owner.id);
	// ⚠️ Measured, not asserted from memory. I first wrote `78` here from a mental sum and it is 117:
	// Romans 1–4 are 32, 29, 31 and 25 verses, so part A (1:1–2:29) is 61 and part B (3:1–4:25) is 56.
	// The point of this value is conservation — that the total is UNCHANGED by a move — so it is computed
	// from bible.json and compared against itself afterwards, which is both correct and immune to my
	// arithmetic. The same lesson the Psalms fixture in verify-export-limits.mjs already records.
	const baseline = await coverage(both);
	check('the fixture covers Romans 1:1–4:25', baseline, 61 + 56);

	const upPlan = await analyzeCrossPartMove(db, owner.id, passB, id('gB-s3-1'), w(3, 5), 'up');
	assert('the move is available', upPlan.ok === true);
	assert('and crosses a boundary', upPlan.crossesBoundary === true);
	check('four verses move (3:1–3:4)', upPlan.versesMoved, 4);

	const upResult = await moveTextAcrossBoundary(db, owner.id, passB, id('gB-s3-1'), w(3, 5), 'up');
	check('it reports crossing', upResult.crossedBoundary, true);

	const [upA] =
		await sql`SELECT to_chapter, to_verse, cached_text FROM passage WHERE id = ${passA}`;
	const [upB] =
		await sql`SELECT from_chapter, from_verse, cached_text FROM passage WHERE id = ${passB}`;
	check('part A now ends at 3:4', `${upA.to_chapter}:${upA.to_verse}`, '3:4');
	check('part B now starts at 3:5', `${upB.from_chapter}:${upB.from_verse}`, '3:5');
	check('both caches invalidated', upA.cached_text === null && upB.cached_text === null, true);
	check('total coverage is conserved', await coverage(both), baseline);

	const [movedSeg] =
		await sql`SELECT starting_word_id FROM passage_segment WHERE id = ${id('gB-s3-1')}`;
	check('part B’s first segment re-anchored to the caret', movedSeg.starting_word_id, w(3, 5));

	const upStray = await segmentsOutsideTheirRange();
	check('no segment is anchored outside its passage range', upStray.outside.length, 0);
	check('all four segments still exist', upStray.total, 4);

	// ── MOVE DOWN ─────────────────────────────────────────────────────────────
	//
	// Rebuilt so this starts from the original state — a move is not idempotent, and reusing the mutated
	// fixture would make this result depend on the previous one.
	//
	// Part A's last segment is anchored 2:1. A caret at 2:15 means "2:15 onward belongs after this", so
	// those verses join part B, whose first segment retreats to 2:15.
	console.log('\n── MOVE DOWN: caret at 2:15 in part A’s last segment ──');
	await buildFixture(owner.id);

	const downPlan = await analyzeCrossPartMove(db, owner.id, passA, id('gA-s2-1'), w(2, 15), 'down');
	assert('the move is available', downPlan.ok === true);
	assert('and crosses a boundary', downPlan.crossesBoundary === true);
	check('fifteen verses move (2:15–2:29)', downPlan.versesMoved, 15);

	await moveTextAcrossBoundary(db, owner.id, passA, id('gA-s2-1'), w(2, 15), 'down');

	const [dnA] =
		await sql`SELECT to_chapter, to_verse, cached_text FROM passage WHERE id = ${passA}`;
	const [dnB] =
		await sql`SELECT from_chapter, from_verse, cached_text FROM passage WHERE id = ${passB}`;
	check('part A now ends at 2:14', `${dnA.to_chapter}:${dnA.to_verse}`, '2:14');
	check('part B now starts at 2:15', `${dnB.from_chapter}:${dnB.from_verse}`, '2:15');
	assert('the two abut exactly', dnB.from_verse === dnA.to_verse + 1);
	check('both caches invalidated', dnA.cached_text === null && dnB.cached_text === null, true);
	check('coverage still conserved', await coverage(both), baseline);

	const [downTarget] =
		await sql`SELECT starting_word_id FROM passage_segment WHERE id = ${id('gB-s3-1')}`;
	check('part B’s first segment retreated to the caret', downTarget.starting_word_id, w(2, 15));

	const downStray = await segmentsOutsideTheirRange();
	check('still no segment outside its passage range', downStray.outside.length, 0);

	// ── The mid-verse refusal ─────────────────────────────────────────────────
	//
	// Segment anchors are word-granular; passage ranges are verse-granular. Across a part boundary that
	// mismatch cannot be represented, so it is refused rather than silently dropping the word offset.
	console.log('\n── a MID-VERSE caret is refused, not silently mishandled ──');
	await buildFixture(owner.id);

	const midPlan = await analyzeCrossPartMove(db, owner.id, passB, id('gB-s3-1'), w(3, 5, 7), 'up');
	assert('it is refused', midPlan.ok === false);
	assert('it still reports that a boundary is involved', midPlan.crossesBoundary === true);
	assert('and explains the verse-start requirement', /start of a verse/.test(midPlan.reason ?? ''));

	let threw = null;
	try {
		await moveTextAcrossBoundary(db, owner.id, passB, id('gB-s3-1'), w(3, 5, 7), 'up');
	} catch (error) {
		threw = error.message;
	}
	assert(
		'the executor refuses it too, not just the analyzer',
		/start of a verse/.test(threw ?? '')
	);

	const [untouchedA] = await sql`SELECT to_chapter, to_verse FROM passage WHERE id = ${passA}`;
	check('and nothing was written', `${untouchedA.to_chapter}:${untouchedA.to_verse}`, '2:29');
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
