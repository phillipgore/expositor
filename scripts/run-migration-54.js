import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

const EXPECTED = ['passage_study_id_idx', 'study_user_id_idx', 'study_group_user_id_idx'];

try {
	console.log('Running migration 0054_add_finder_indexes.sql...');
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0054_add_finder_indexes.sql'),
		'utf-8'
	);
	await sql.unsafe(migrationSQL);

	const present = await sql`SELECT indexname FROM pg_indexes WHERE indexname IN ${sql(EXPECTED)}`;
	const names = new Set(present.map((r) => r.indexname));
	const missing = EXPECTED.filter((n) => !names.has(n));
	if (missing.length) throw new Error(`Indexes missing after migration: ${missing.join(', ')}`);

	console.log(`✓ Migration 0054 complete — ${EXPECTED.join(', ')} present`);
} catch (error) {
	console.error('Migration 0054 failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
