/**
 * Repair parts left BLANK by Split Part before the "boundary inside a segment" fix.
 *
 * Symptom: a part created by a chapter-line split whose source passage had no segment starting at
 * the boundary (e.g. untouched default structure) received a passage row with NO column, so the
 * analyze page renders only the reference line. See `planStructureSplit()`.
 *
 * Gives every structureless passage in the named series a column → section → segment anchored at
 * its first verse — the same shape `createDefaultPassageStructure()` builds — copying the colour of
 * the section in the PREVIOUS part that covered the preceding text, so the result matches what the
 * fixed split would have produced. Idempotent: passages that already have a column are skipped.
 *
 * Run (dry):   ENV_FILE=.env.production node scripts/repair-blank-split-part.mjs "I Peter"
 * Run (write): ENV_FILE=.env.production node scripts/repair-blank-split-part.mjs "I Peter" --apply
 */
import postgres from 'postgres';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });
const sql = postgres(process.env.DATABASE_URL);
const seriesName = process.argv[2];
const apply = process.argv.includes('--apply');
const pad = (n) => String(n).padStart(3, '0');

try {
	const series = await sql`SELECT id FROM study_series WHERE name = ${seriesName}`;
	if (series.length !== 1) throw new Error(`Expected one series named "${seriesName}", found ${series.length}`);
	const seriesId = series[0].id;

	const blanks = await sql`
		SELECT p.id, p.book_id, p.from_chapter, p.from_verse, s.title, s.series_order
		FROM passage p JOIN study s ON s.id = p.study_id
		WHERE s.series_id = ${seriesId}
		  AND NOT EXISTS (SELECT 1 FROM passage_column c WHERE c.passage_id = p.id)
	`;
	console.log(`${blanks.length} structureless passage(s) in "${seriesName}"`);

	for (const b of blanks) {
		const wordId = `${b.book_id}-${pad(b.from_chapter)}-${pad(b.from_verse)}-001`;
		// Colour of the last segment before this text in the preceding part, else the default.
		const [prev] = await sql`
			SELECT seg.color FROM passage_segment seg
			JOIN passage_section sec ON sec.id = seg.passage_section_id
			JOIN passage_column c ON c.id = sec.passage_column_id
			JOIN passage p ON p.id = c.passage_id
			JOIN study s ON s.id = p.study_id
			WHERE s.series_id = ${seriesId} AND s.series_order < ${b.series_order}
			  AND seg.starting_word_id < ${wordId}
			ORDER BY s.series_order DESC, seg.starting_word_id DESC LIMIT 1
		`;
		const color = prev?.color ?? 'blue';
		console.log(`  ${b.title} (${b.id}) → column/section/segment at ${wordId}, colour ${color}`);
		if (!apply) continue;

		await sql.begin(async (tx) => {
			const colId = randomUUID();
			const secId = randomUUID();
			await tx`INSERT INTO passage_column (id, passage_id, starting_word_id, created_at, updated_at)
				VALUES (${colId}, ${b.id}, ${wordId}, now(), now())`;
			await tx`INSERT INTO passage_section (id, passage_column_id, starting_word_id, created_at, updated_at)
				VALUES (${secId}, ${colId}, ${wordId}, now(), now())`;
			await tx`INSERT INTO passage_segment (id, passage_section_id, starting_word_id, color, created_at, updated_at)
				VALUES (${randomUUID()}, ${secId}, ${wordId}, ${color}, now(), now())`;
		});
	}
	console.log(apply ? 'Applied.' : 'Dry run — pass --apply to write.');
} finally {
	await sql.end();
}
