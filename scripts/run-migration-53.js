import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0053_move_color_to_segment.sql...');

	const hasSectionColor = await sql`
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'passage_section' AND column_name = 'color'
	`;
	if (hasSectionColor.length === 0) {
		console.log('passage_section.color already gone — nothing to do.');
		process.exit(0);
	}

	// 1. Back up the data this migration drops (section id → color), and capture the
	//    expected per-segment color so the result can be verified exactly.
	const sections = await sql`SELECT id, passage_column_id, color FROM passage_section`;
	const expected = await sql`
		SELECT seg.id, sec.color FROM passage_segment seg
		JOIN passage_section sec ON sec.id = seg.passage_section_id
	`;
	const backupDir = join(__dirname, '../backups');
	mkdirSync(backupDir, { recursive: true });
	const backupPath = join(backupDir, `pre-0053-section-colors-${Date.now()}.json`);
	writeFileSync(backupPath, JSON.stringify({ sections, segments: expected }, null, '\t'));
	console.log(`Backed up ${sections.length} section colors (${expected.length} segments) → ${backupPath}`);

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0053_move_color_to_segment.sql'),
		'utf-8'
	);

	// 2. Migrate + verify atomically: any mismatch rolls everything back.
	await sql.begin(async (tx) => {
		await tx.unsafe(migrationSQL);

		const actual = await tx`SELECT id, color FROM passage_segment`;
		const byId = new Map(actual.map((r) => [r.id, r.color]));
		const mismatches = expected.filter((e) => byId.get(e.id) !== e.color);
		if (mismatches.length > 0) {
			throw new Error(`${mismatches.length} segment(s) did not inherit their section color`);
		}
		const nulls = actual.filter((r) => r.color == null);
		if (nulls.length > 0) throw new Error(`${nulls.length} segment(s) have NULL color`);

		const stillThere = await tx`
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'passage_section' AND column_name = 'color'
		`;
		if (stillThere.length > 0) throw new Error('passage_section.color was not dropped');
		console.log(`Verified ${actual.length} segments carry their former section color.`);
	});

	console.log('✅ Migration completed successfully!');
	console.log('Moved color from passage_section to passage_segment.');
} catch (error) {
	console.error('❌ Migration failed (rolled back):', error);
	process.exit(1);
} finally {
	await sql.end();
}
