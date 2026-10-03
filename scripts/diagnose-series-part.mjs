/**
 * Read-only: dump every part of a series with its passages and structure counts.
 *
 * Run: ENV_FILE=.env.production node scripts/diagnose-series-part.mjs "I Peter"
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });
const sql = postgres(process.env.DATABASE_URL);
const title = process.argv[2];

try {
	const series = await sql`SELECT id, name, user_id, last_part_id FROM study_series WHERE name = ${title}`;
	for (const s of series) {
		console.log('SERIES', s);
		const parts = await sql`SELECT id, title, series_order, translation FROM study WHERE series_id = ${s.id} ORDER BY series_order`;
		for (const p of parts) {
			console.log('  PART', p.series_order, p.title, p.id);
			const passages = await sql`
				SELECT id, book_id, book_name, testament, from_chapter, from_verse, to_chapter, to_verse,
				       display_order, (cached_text IS NOT NULL) AS cached
				FROM passage WHERE study_id = ${p.id} ORDER BY display_order`;
			for (const ps of passages) {
				const cols = await sql`SELECT id, starting_word_id FROM passage_column WHERE passage_id = ${ps.id} ORDER BY starting_word_id`;
				const [{ secs }] = await sql`SELECT count(*)::int AS secs FROM passage_section WHERE passage_column_id IN (SELECT id FROM passage_column WHERE passage_id = ${ps.id})`;
				const [{ segs, minw, maxw }] = await sql`
					SELECT count(*)::int AS segs, min(g.starting_word_id) AS minw, max(g.starting_word_id) AS maxw
					FROM passage_segment g JOIN passage_section x ON x.id = g.passage_section_id
					JOIN passage_column c ON c.id = x.passage_column_id WHERE c.passage_id = ${ps.id}`;
				console.log('    PASSAGE', ps, { columns: cols.length, colAnchors: cols.map((c) => c.starting_word_id), secs, segs, minw, maxw });
			}
		}
	}
} finally {
	await sql.end();
}
