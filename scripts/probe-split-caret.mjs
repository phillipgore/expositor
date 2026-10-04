/**
 * Exercise Split Part AT THE CARET through the real endpoint against the dev database
 * (word-granular parts, stage 2).
 *
 * Imports the actual `POST` handler of `api/series/[id]/split` and replaces only
 * `auth.api.getSession`, so planning, validation, the transaction, structure transfer and the
 * passage writes are all the shipped code.
 *
 *   1. 1 Peter 4:1–5:14 with DEFAULT structure (one segment at 4:1), caret at 4:12 word 5 — the shape
 *      that produced the blank part in production, now split mid-verse.
 *   2. A two-passage part (Philippians 1 | 2), caret inside passage 1 — passage 2 moves whole.
 *   3. Caret at the part's very first word — refused, nothing written.
 *
 * ⚠️ A WRITE probe against dev. Run: npm run probe:split-caret
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const PREFIX = 'probe-sc-';
const id = (s) => `${PREFIX}${s}`;
const sql = postgres(process.env.DATABASE_URL);
let pass = 0;
let fail = 0;
function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
	}
}
async function cleanup() {
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study WHERE series_id LIKE ${PREFIX + '%'}`;
	await sql`DELETE FROM study_series WHERE id LIKE ${PREFIX + '%'}`;
}
async function series(seriesId, name, ownerId) {
	await sql`INSERT INTO study_series (id, name, user_id, created_at, updated_at) VALUES (${seriesId}, ${name}, ${ownerId}, now(), now())`;
}
async function studyRow(studyId, title, seriesId, order, ownerId) {
	await sql`INSERT INTO study (id, title, translation, user_id, series_id, series_order, created_at, updated_at) VALUES (${studyId}, ${title}, 'esv', ${ownerId}, ${seriesId}, ${order}, now(), now())`;
}
async function passageRow(pid, studyId, book, name, fc, fv, tc, tv, order) {
	await sql`INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at) VALUES (${pid}, ${studyId}, 'NT', ${book}, ${name}, ${fc}, ${fv}, ${tc}, ${tv}, ${order}, now())`;
}
/** The default shape new studies get: one column, section and segment at the first word. */
async function defaultStructure(passageId, wordId, tag) {
	await sql`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at) VALUES (${id(tag + '-col')}, ${passageId}, ${wordId}, now(), now())`;
	await sql`INSERT INTO passage_section (id, passage_column_id, starting_word_id, created_at, updated_at) VALUES (${id(tag + '-sec')}, ${id(tag + '-col')}, ${wordId}, now(), now())`;
	await sql`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, note, created_at, updated_at) VALUES (${id(tag + '-seg')}, ${id(tag + '-sec')}, ${wordId}, ${tag + ' note'}, now(), now())`;
}
async function treeOf(studyId) {
	return sql`
		SELECT p.id AS passage_id, p.display_order, p.from_chapter, p.from_verse, p.from_word,
		       p.to_chapter, p.to_verse, p.to_word,
		       (SELECT count(*)::int FROM passage_column c WHERE c.passage_id = p.id) AS cols,
		       (SELECT min(g.starting_word_id) FROM passage_segment g
		          JOIN passage_section x ON x.id = g.passage_section_id
		          JOIN passage_column c ON c.id = x.passage_column_id WHERE c.passage_id = p.id) AS first_seg
		FROM passage p WHERE p.study_id = ${studyId} ORDER BY p.display_order`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	const me = owner.id;
	await cleanup();

	const { auth } = await import('../src/lib/server/auth.js');
	auth.api.getSession = async () => ({ user: { id: me } });
	const { POST } = await import('../src/routes/api/series/[id]/split/+server.js');
	const split = async (seriesId, body) => {
		const res = await POST({
			params: { id: seriesId },
			request: new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) })
		});
		return { status: res.status, body: await res.json() };
	};

	// ── 1. I Peter, default structure, mid-verse caret ──
	const s1 = id('s1');
	await series(s1, 'Probe SC', me);
	await studyRow(id('p3'), '1 Peter 3', s1, 0, me);
	await studyRow(id('p4'), '1 Peter 4-5', s1, 1, me);
	await passageRow(id('pp3'), id('p3'), 'IPE', '1 Peter', 3, 1, 3, 22, 0);
	await passageRow(id('pp4'), id('p4'), 'IPE', '1 Peter', 4, 1, 5, 14, 0);
	await defaultStructure(id('pp3'), 'IPE-003-001-001', 'a');
	await defaultStructure(id('pp4'), 'IPE-004-001-001', 'b');

	console.log('\n── 1. mid-verse caret in a default-structure part ──');
	const dry = await split(s1, { partId: id('p4'), boundaryWordId: 'IPE-004-012-005', dryRun: true });
	check('the dry run is accepted', dry.status, 200);
	check('previewing the original as 4:1-12a', dry.body.firstReference, '1 Peter 4:1-12a');
	check('and the new part as 4:12b-5:14', dry.body.secondReference, '1 Peter 4:12b-5:14');

	const done = await split(s1, { partId: id('p4'), boundaryWordId: 'IPE-004-012-005' });
	check('the split commits', done.status, 200);
	const [orig] = await treeOf(id('p4'));
	const [made] = await treeOf(done.body.newPartId);
	check('original ends at 4:12 word 4', `${orig.to_chapter}:${orig.to_verse}.${orig.to_word}`, '4:12.4');
	check('new starts at 4:12 word 5', `${made.from_chapter}:${made.from_verse}.${made.from_word}`, '4:12.5');
	check('the new part is NOT blank (has a column)', made.cols, 1);
	check('its first segment is at the caret word', made.first_seg, 'IPE-004-012-005');
	check('the original keeps its segment', orig.first_seg, 'IPE-004-001-001');
	const [note] = await sql`SELECT note FROM passage_segment WHERE id = ${id('b-seg')}`;
	check('and its note', note?.note, 'b note');
	const [row] = await sql`SELECT title, series_order FROM study WHERE id = ${done.body.newPartId}`;
	check('the new part is titled by its range', row?.title, '1 Peter 4:12b-5:14');
	check('and sits after the original', row?.series_order, 2);

	// ── 2. two-passage part, caret inside passage 1 ──
	console.log('\n── 2. caret inside the first passage of a two-passage part ──');
	const s2 = id('s2');
	await series(s2, 'Probe SC2', me);
	await studyRow(id('m'), 'Phil', s2, 0, me);
	await studyRow(id('m2'), 'Phil 3', s2, 1, me);
	await passageRow(id('mp1'), id('m'), 'PH', 'Philippians', 1, 1, 1, 30, 0);
	await passageRow(id('mp2'), id('m'), 'PH', 'Philippians', 2, 1, 2, 30, 1);
	await passageRow(id('mp3'), id('m2'), 'PH', 'Philippians', 3, 1, 3, 21, 0);
	await defaultStructure(id('mp1'), 'PH-001-001-001', 'm1');
	await defaultStructure(id('mp2'), 'PH-002-001-001', 'm2');
	await defaultStructure(id('mp3'), 'PH-003-001-001', 'm3');

	const mdone = await split(s2, { partId: id('m'), boundaryWordId: 'PH-001-020-001' });
	check('the split commits', mdone.status, 200);
	const left = await treeOf(id('m'));
	const right = await treeOf(mdone.body.newPartId);
	check('the original keeps one passage', left.length, 1);
	check('ending whole-verse at 1:19', `${left[0].to_chapter}:${left[0].to_verse}:${left[0].to_word}`, '1:19:null');
	check('the new part has two passages', right.length, 2);
	check('the first is 1:20-30', `${right[0].from_chapter}:${right[0].from_verse}-${right[0].to_verse}`, '1:20-30');
	check('the tail has structure', right[0]?.cols, 1);
	check('the second is the moved passage row itself', right[1]?.passage_id, id('mp2'));
	check('at display order 1', right[1]?.display_order, 1);
	check('keeping its own structure', right[1]?.first_seg, 'PH-002-001-001');

	// ── 3. refusal ──
	console.log('\n── 3. caret at the very first word is refused ──');
	const before = await treeOf(id('p3'));
	const refused = await split(s1, { partId: id('p3'), boundaryWordId: 'IPE-003-001-001' });
	check('refused with 400', refused.status, 400);
	check('saying it would leave the part empty', /empty/.test(refused.body.error ?? ''), true);
	check('nothing was written', JSON.stringify(await treeOf(id('p3'))), JSON.stringify(before));
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}\n${error.stack?.split('\n').slice(1, 4).join('\n')}`);
} finally {
	await cleanup();
	const [left] = await sql`SELECT COUNT(*)::int AS n FROM passage_segment WHERE id LIKE ${PREFIX + '%'}`;
	console.log(`\nFixture removed (${left.n} probe segments left — expected 0).`);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}

