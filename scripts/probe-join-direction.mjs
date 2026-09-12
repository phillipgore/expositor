/**
 * Exercise Join Down against a REAL database, through the real `routeJoin`.
 *
 * ## Why this exists on top of `verify-join-direction.mjs`
 *
 * That verifier proves the RESOLUTION — that Join Down on X picks X's successor. It opens no
 * database, so it cannot prove the thing that actually matters to a user's work: that the resolved
 * join then writes the right rows, and that `ON DELETE CASCADE` did not take anything else with it.
 * "The planner chose the right item" and "the right item is what disappeared" are different claims,
 * and only one of them is about data loss.
 *
 * The properties pinned here, which the pure layer cannot reach:
 *
 *   - Join Down on X deletes X's SUCCESSOR, and X itself survives — the opposite of Join Up, and the
 *     reason the analyze page keeps the selection for one and clears it for the other;
 *   - the successor's note is folded ONTO X (merge), so content moves backwards, not forwards;
 *   - Join Down on X and Join Up on X's successor leave byte-identical structure — the equivalence
 *     the implementation rests on, checked against real rows rather than asserted. ⚠️ **Scoped to
 *     WITHIN one passage.** That equivalence is the rewrite's own premise, so asserting it across a
 *     part boundary could only ever pass; it is also false there, which is the defect below;
 *   - a Join Down that crosses a part boundary moves the SELECTED item FORWARD into the next part —
 *     the later part grows and the earlier shrinks, the opposite of a Join Up;
 *   - nothing else in either part is destroyed.
 *
 * ⚠️ **WRITE probe, not a verifier.** Deliberately NOT in `npm run verify`: it mutates the database
 * and must be run knowingly. It builds its own fixture under a recognisable id prefix and removes it
 * in a `finally`, including after a failed assertion.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/probe-join-direction.mjs
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-jdir-';
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

/**
 * Build a fresh single-study fixture: one passage, one column, one section, three segments.
 *
 * Rebuilt from scratch before each scenario so the two directions are compared from an IDENTICAL
 * starting state. Reusing a mutated fixture would make the second run's result depend on the first,
 * which is exactly what the equivalence check must not assume.
 */
async function buildSimpleFixture(ownerId) {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;

	const studyId = id('study');
	const passId = id('pass');
	await sql`
		INSERT INTO study (id, title, translation, user_id, created_at, updated_at)
		VALUES (${studyId}, 'Probe direction', 'esv', ${ownerId}, now(), now())
	`;
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, cached_text, text_cached_at, created_at)
		VALUES (${passId}, ${studyId}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, 'CACHED', now(), now())
	`;

	const colId = id('col');
	const secId = id('sec');
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${colId}, ${passId}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${secId}, ${colId}, ${w(1, 1)}, 'blue', now(), now())`;

	// Three segments, each with its own note so a fold can be traced to its source.
	for (const [segId, verse, note] of [
		[id('seg1'), 1, 'one note'],
		[id('seg2'), 10, 'two note'],
		[id('seg3'), 20, 'three note']
	]) {
		await sql`
			INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, commentary, created_at, updated_at)
			VALUES (${segId}, ${secId}, ${w(1, verse)}, ${note}, ${note + ' commentary'}, now(), now())
		`;
	}

	return { studyId, passId };
}

/** Every probe segment, in word order, as plain comparable objects. */
async function readSegments() {
	const rows = await sql`
		SELECT id, note, commentary, starting_word_id
		FROM passage_segment
		WHERE id LIKE ${PREFIX + '%'}
		ORDER BY starting_word_id
	`;
	return rows.map((r) => ({
		id: r.id,
		note: r.note,
		commentary: r.commentary,
		startingWordId: r.starting_word_id
	}));
}

/**
 * Two contiguous parts of one series: Romans 1–2 and Romans 3–4.
 *
 * Part A ends with the segment a user would select for "Join Selected Down"; part B begins with the
 * segment that gesture consumes. This is the shape the reported defect occurred in.
 */
async function buildSeriesFixture(ownerId) {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;

	const seriesId = id('series');
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, 'Probe dir series', ${ownerId}, now(), now())`;

	for (const [studyId, order, title] of [
		[id('partA'), 0, 'Part A'],
		[id('partB'), 1, 'Part B']
	]) {
		await sql`
			INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at)
			VALUES (${studyId}, ${title}, 'esv', ${ownerId}, ${seriesId}, ${order}, now(), now())
		`;
	}

	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('passA')}, ${id('partA')}, 'NT', 'RO', 'Romans', 1, 1, 2, 29, 0, now())`;
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${id('passB')}, ${id('partB')}, 'NT', 'RO', 'Romans', 3, 1, 4, 25, 0, now())`;

	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colA')}, ${id('passA')}, ${w(1, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secA')}, ${id('colA')}, ${w(1, 1)}, 'blue', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('a1')}, ${id('secA')}, ${w(1, 1)}, 'A1', now(), now())`;
	// The SELECTED segment: last in part A.
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('a2')}, ${id('secA')}, ${w(2, 1)}, 'A2', now(), now())`;

	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id('colB')}, ${id('passB')}, ${w(3, 1)}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, color, created_at, updated_at) VALUES (${id('secB')}, ${id('colB')}, ${w(3, 1)}, 'green', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('b1')}, ${id('secB')}, ${w(3, 1)}, 'B1', now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id('b2')}, ${id('secB')}, ${w(3, 10)}, 'B2', now(), now())`;
}

/** Which study each probe segment currently belongs to, with its part's verse range. */
async function readPlacement() {
	const rows = await sql`
		SELECT s.id, s.note, s.starting_word_id, p.study_id,
		       p.from_chapter, p.from_verse, p.to_chapter, p.to_verse
		  FROM passage_segment s
		  JOIN passage_section sec ON s.passage_section_id = sec.id
		  JOIN passage_column col ON sec.passage_column_id = col.id
		  JOIN passage p ON col.passage_id = p.id
		 WHERE s.id LIKE ${PREFIX + '%'}
		 ORDER BY s.starting_word_id
	`;
	return rows.map((r) => ({
		id: r.id,
		note: r.note,
		studyId: r.study_id,
		range: `${r.from_chapter}:${r.from_verse}-${r.to_chapter}:${r.to_verse}`
	}));
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	console.log(`\nBuilding fixture (owner ${owner.id})…`);

	// Imported dynamically AFTER dotenv has run, because `$lib/server/db/index.js` reads DATABASE_URL
	// at module load and opens its own pool.
	const { routeJoin } = await import('../src/lib/server/db/joinRouting.js');
	const { analyzeJoin, joinSegment } = await import('../src/lib/server/db/passageJoin.js');
	const { db } = await import('../src/lib/server/db/index.js');

	/** Run a real join through the real endpoint plumbing. */
	const runJoin = (passageId, segmentId, direction) =>
		routeJoin({
			db,
			userId: owner.id,
			passageId,
			itemId: segmentId,
			granularity: 'segment',
			decision: 'merge',
			dryRun: false,
			direction,
			analyzeWithinPassage: analyzeJoin,
			joinWithinPassage: joinSegment
		});

	// ── Scenario 1: Join Down consumes the SUCCESSOR, not the selection ──────
	//
	// The single most important behavioural difference from Join Up, and the one a user would notice
	// as data loss if it were backwards.
	console.log('\n── Join DOWN on segment 1 consumes segment 2, and segment 1 survives ──');

	let fixture = await buildSimpleFixture(owner.id);
	let res = await runJoin(fixture.passId, id('seg1'), 'next');
	check('the join succeeded', res.status, 200);

	let segs = await readSegments();
	let ids = segs.map((s) => s.id.replace(PREFIX, ''));

	check('two segments remain', segs.length, 2);
	assert('the SELECTED segment survived', ids.includes('seg1'));
	assert('its SUCCESSOR was consumed', !ids.includes('seg2'));
	assert('the untouched third segment is intact', ids.includes('seg3'));
	// Merge folds the consumed item's note onto the survivor, so content travels BACKWARDS. If this
	// were reversed the surviving segment would be the one that lost its note.
	assert('the survivor kept its own note', segs[0].note.includes('one note'));
	assert("and absorbed the consumed segment's note", segs[0].note.includes('two note'));
	// Order matters: the earlier note must come first, or the merged note reads out of sequence.
	assert(
		'in word order — the survivor’s note first',
		segs[0].note.indexOf('one note') < segs[0].note.indexOf('two note')
	);
	check('the survivor keeps its own anchor', segs[0].startingWordId, w(1, 1));

	// ── Scenario 2: down(X) and up(successor(X)) are the SAME write ──────────
	//
	// Verified against real rows. The pure verifier proves the two resolve to the same item; this
	// proves the resulting database states are indistinguishable.
	console.log('\n── Join DOWN on 1 leaves exactly what Join UP on 2 leaves ──');

	const afterDown = segs;

	fixture = await buildSimpleFixture(owner.id);
	res = await runJoin(fixture.passId, id('seg2'), 'previous');
	check('the equivalent Join Up succeeded', res.status, 200);

	const afterUp = await readSegments();

	check('the same number of segments survive', afterUp.length, afterDown.length);
	check(
		'the same rows survive, with the same notes, anchors and commentary',
		JSON.stringify(afterUp),
		JSON.stringify(afterDown)
	);

	// ── Scenario 3: the last item has no successor, and says so ──────────────
	//
	// §11: the refusal must be permanent in its wording — never "yet".
	console.log('\n── Join DOWN on the LAST segment is refused, permanently ──');

	fixture = await buildSimpleFixture(owner.id);
	res = await runJoin(fixture.passId, id('seg3'), 'next');
	check('it is refused with 400', res.status, 400);
	assert('and gives a reason', typeof res.body.error === 'string' && res.body.error.length > 0);
	assert('that speaks of nothing FOLLOWING', /follow/i.test(res.body.error));
	assert('and does not promise a later fix', !/\byet\b/i.test(res.body.error));

	// Nothing was written by the refused call — a refusal that half-applied would be the worst of
	// both outcomes, and Q41 requires refusing BEFORE writing.
	const afterRefusal = await readSegments();
	check('all three segments are untouched', afterRefusal.length, 3);

	// ── Scenario 4: REGRESSION — Join Down ACROSS a part boundary ─────────────
	//
	// The reported defect. `joinRouting.js` rewrote every Join Down into "the equivalent Join Up on the
	// successor". Within one passage that identity is exact. At a part boundary it is FALSE, because
	// which part the result lives in is the whole point of the gesture — and the rewrite always grew
	// the EARLIER part, pulling the next part's content backwards.
	//
	// The user's rule, which this pins:
	//   Join Selected Up   — the selected item in Part B ends up in Part A.
	//   Join Selected Down — the selected item in Part A ends up in Part B.
	//
	// ⚠️ Note what is NOT asserted here: the within-passage equivalence above. Across a seam it is the
	// rewrite's own premise restated, so it could only ever pass — which is exactly why the defect
	// shipped with a green probe.
	console.log('\n── Join DOWN across a PART boundary moves the selection FORWARD ──');

	await buildSeriesFixture(owner.id);

	const before = await readPlacement();
	check('part A holds two segments to begin with', before.filter((s) => s.studyId === id('partA')).length, 2);
	check('and part A covers Romans 1:1-2:29', before[0].range, '1:1-2:29');

	res = await runJoin(id('passA'), id('a2'), 'next');
	check('the cross-part Join Down succeeded', res.status, 200);
	check('and it reports crossing a boundary', res.body.crossedBoundary, true);
	check('in the DOWN direction', res.body.direction, 'down');

	const after = await readPlacement();
	const a2 = after.find((s) => s.id === id('a2'));

	// The heart of it: the SELECTED segment survives, and it now lives in part B.
	assert('the selected segment still exists', Boolean(a2));
	check('and it has moved into PART B', a2?.studyId, id('partB'));
	check('absorbing the consumed segment’s note', a2?.note, 'A2\nB1');

	// The consumed item is the TARGET — part B's old first segment.
	assert('part B’s first segment was consumed', !after.some((s) => s.id === id('b1')));

	// The boundary moved EARLIER: part A shrank, part B grew. The defect did the opposite.
	const partA = after.filter((s) => s.studyId === id('partA'));
	const partB = after.filter((s) => s.studyId === id('partB'));
	check('part A now holds only its first segment', partA.length, 1);
	check('and has shrunk to Romans 1:1-1:32', partA[0].range, '1:1-1:32');
	check('part B now holds two segments', partB.length, 2);
	check('and has grown to Romans 2:1-4:25', partB[0].range, '2:1-4:25');

	// Nothing was destroyed on either side beyond the one consumed target.
	check('three segments survive in total', after.length, 3);

	console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
	// Always remove the fixture, including after a failed assertion — a probe that leaves debris is
	// one nobody runs twice.
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
	const [{ count }] = await sql`
		SELECT COUNT(*)::int AS count FROM passage_segment WHERE id LIKE ${PREFIX + '%'}
	`;
	console.log(`Fixture removed (${count} probe segments left behind — expected 0).\n`);
	await sql.end();
}

process.exit(fail === 0 ? 0 : 1);
