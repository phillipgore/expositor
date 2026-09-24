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

/**
 * Every probe passage whose LEADING column or section is not anchored on its own first segment.
 *
 * ⚠️ This is the invariant whose absence produced a user-visible bug. Nothing RENDERS wrongly when a
 * container anchor drifts — extent is implicit — so the segment-vs-range check above stayed green
 * while `insertSegment()` began refusing with "Cannot insert segment at the beginning of a section"
 * on text the user had just moved.
 */
async function containersOffTheirFirstSegment() {
	const rows = await sql`
		SELECT p.id AS passage_id,
		       col.id AS column_id,
		       col.starting_word_id AS column_anchor,
		       (SELECT MIN(sec2.starting_word_id)
		          FROM passage_section sec2
		         WHERE sec2.passage_column_id = col.id) AS section_anchor,
		       (SELECT MIN(s2.starting_word_id)
		          FROM passage_segment s2
		          JOIN passage_section sec3 ON s2.passage_section_id = sec3.id
		          JOIN passage_column col3 ON sec3.passage_column_id = col3.id
		         WHERE col3.passage_id = p.id) AS first_segment_anchor
		  FROM passage p
		  JOIN passage_column col ON col.passage_id = p.id
		 WHERE p.id LIKE ${PREFIX + '%'}
	`;

	// Only the LEADING column of each passage is under test; later columns legitimately begin wherever
	// the user placed them.
	const byPassage = new Map();
	for (const row of rows) {
		const current = byPassage.get(row.passage_id);
		if (!current || row.column_anchor < current.column_anchor) {
			byPassage.set(row.passage_id, row);
		}
	}

	const drifted = [...byPassage.values()].filter(
		(r) =>
			r.column_anchor !== r.first_segment_anchor || r.section_anchor !== r.first_segment_anchor
	);

	return { drifted, checked: byPassage.size };
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	const { db } = await import('../src/lib/server/db/index.js');
	const { analyzeCrossPartMove, moveTextAcrossBoundary } = await import(
		'../src/lib/server/db/crossPartMove.js'
	);
	// The real insert path, driven end to end: this is the function that was refusing.
	const { insertSegment } = await import('../src/lib/server/db/utils.js');

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

	// ── §10.1: display re-validation on BOTH parts ────────────────────────────
	//
	// The Joins have carried this since they landed; Move Text shipped without it, which was a gap
	// rather than a decision — §10.1 and the §13 table both require re-validation on any boundary move,
	// and the plan's worked example ("tipped past 216 by a few Move Text Up gestures") is a Move Text.
	//
	// ⚠️ The RECEIVER is the part that grew, which depends on the direction. Asserting it per direction
	// is what would catch the receiver/donor pair being swapped — a mistake that reads plausibly either
	// way and can only ever fail open, since re-checking the part that shrank always passes.
	console.log('\n── §10.1 display re-validation rides along with the move ──');
	await buildFixture(owner.id);

	const upDisplay = await analyzeCrossPartMove(db, owner.id, passB, id('gB-s3-1'), w(3, 5), 'up');
	assert('Move Up reports a display verdict', Boolean(upDisplay.display));
	assert('with a receiver list', Array.isArray(upDisplay.display.receiver));
	assert('and a donor list', Array.isArray(upDisplay.display.donor));
	// The fixture is ESV, whose display enforcement flipped to 'block' on 2026-09-24. The posture
	// assertion moved with it; the one below is the one that matters and is unchanged, because a
	// COMPLIANT move must still proceed under 'block' — blocking on enforcement alone would turn a
	// licence ceiling into a ban on the feature.
	check('ESV now enforces display by blocking', upDisplay.display.enforcement, 'block');
	check('but a compliant move is still NOT blocked', upDisplay.display.blocked, false);
	check('and it reports how many verses move', upDisplay.versesMoved > 0, true);

	// ⚠️ No `summary` prose, and no `needsDecision`. Both existed to drive a confirm dialog that has
	// been removed: a move relocates a boundary rather than destroying anything, so it is reversed by
	// moving the text back, and a "cannot be undone" modal was both an interruption and a falsehood.
	assert('no confirm-dialog prose is produced', upDisplay.summary === undefined);

	const downDisplay = await analyzeCrossPartMove(
		db,
		owner.id,
		passA,
		id('gA-s2-1'),
		w(2, 15),
		'down'
	);
	assert('Move Down reports one too', Boolean(downDisplay.display));
	check('also unblocked under warn', downDisplay.display.blocked, false);
	check('and reports its own verse count', downDisplay.versesMoved > 0, true);

	// A within-passage move must NOT pay for any of this: it never reaches the analysis.
	const localMove = await analyzeCrossPartMove(db, owner.id, passA, id('gA-s2-1'), w(1, 10), 'up');
	check('a passage-local move does not cross a boundary', localMove.crossesBoundary, false);
	assert('and carries no display verdict', localMove.display === undefined);

	// ── REGRESSION: insert a segment on text that was just moved ──────────────
	//
	// The bug users actually hit. A cross-part move rewrote ONE segment anchor and left the column and
	// section above it pointing at the old word, so `insertSegment()`'s guard —
	//
	//     if (section.startingWordId === insertionWordId) throw 'Cannot insert segment at the …'
	//
	// — matched a word that was the section's anchor but NOT its first segment's, and refused every
	// insert into the moved text. Structural assertions alone never caught it because nothing rendered
	// wrongly, so this drives the real endpoint function end to end.
	console.log('\n── REGRESSION: structure can still be inserted after a move ──');
	await buildFixture(owner.id);

	// ⚠️ Move DOWN specifically, and then insert at the RECEIVER's original anchor.
	//
	// This is the exact collision. Part B began at 3:1, so its column and section are anchored there.
	// Moving text down retreats B's first SEGMENT to 2:15 while the containers stay at 3:1 — a word
	// that is now in the middle of that segment. Inserting there then hits
	// `section.startingWordId === insertionWordId` and is refused, even though 3:1 is an ordinary
	// interior word of the segment and a perfectly legal split point.
	//
	// A Move Up with an arbitrary caret does NOT reproduce it: the drifted anchor ends up in the other
	// part, so nothing the user can click collides with it. Picking the wrong direction here would
	// leave the probe green against the broken code, which is exactly what the old assertions did.
	await moveTextAcrossBoundary(db, owner.id, passA, id('gA-s2-1'), w(2, 15), 'down');

	const afterMove = await containersOffTheirFirstSegment();
	check('no container drifted off its first segment', afterMove.drifted.length, 0);
	assert('and the check actually looked at both parts', afterMove.checked === 2);

	const [movedSection] = await sql`
		SELECT sec.id
		  FROM passage_section sec
		  JOIN passage_column col ON sec.passage_column_id = col.id
		 WHERE col.passage_id = ${passB}
		 ORDER BY sec.starting_word_id
		 LIMIT 1
	`;

	let insertError = null;
	try {
		await insertSegment(db, owner.id, passB, movedSection.id, w(3, 1));
	} catch (error) {
		insertError = error.message;
	}
	check('inserting a segment into the moved text succeeds', insertError, null);

	const [inserted] = await sql`
		SELECT COUNT(*)::int AS n FROM passage_segment
		 WHERE passage_section_id = ${movedSection.id} AND starting_word_id = ${w(3, 1)}
	`;
	check('and the new segment exists', inserted.n, 1);

	// The guard must still REFUSE a genuine duplicate — the fix restores the container invariant, it
	// does not loosen the rule that two segments cannot share an anchor.
	let duplicateError = null;
	try {
		await insertSegment(db, owner.id, passB, movedSection.id, w(3, 1));
	} catch (error) {
		duplicateError = error.message;
	}
	assert('but a duplicate anchor is still refused', /beginning of an existing segment/.test(duplicateError ?? ''));

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
