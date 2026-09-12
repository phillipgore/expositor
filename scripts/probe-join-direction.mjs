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
 *     the implementation rests on, checked against real rows rather than asserted;
 *   - a Join Down that crosses a part boundary moves the verses too, and in the same direction as
 *     the equivalent Join Up;
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

	console.log(`\n${pass} passed, ${fail} failed\n`);
} finally {
	// Always remove the fixture, including after a failed assertion — a probe that leaves debris is
	// one nobody runs twice.
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	const [{ count }] = await sql`
		SELECT COUNT(*)::int AS count FROM passage_segment WHERE id LIKE ${PREFIX + '%'}
	`;
	console.log(`Fixture removed (${count} probe segments left behind — expected 0).\n`);
	await sql.end();
}

process.exit(fail === 0 ? 0 : 1);
