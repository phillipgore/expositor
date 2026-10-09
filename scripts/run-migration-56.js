import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

const EXPECTED = {
	passage: [
		'text_source',
		'text_rules_version',
		'text_fetched_at',
		'verse_fingerprints',
		'text_drift',
		'from_word_anchor',
		'to_word_anchor'
	],
	passage_column: ['anchor_context'],
	passage_section: ['anchor_context'],
	passage_segment: ['anchor_context']
};

try {
	console.log('Running migration 0056_add_text_provenance.sql...');
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0056_add_text_provenance.sql'),
		'utf-8'
	);
	await sql.unsafe(migrationSQL);

	for (const [table, columns] of Object.entries(EXPECTED)) {
		const present = await sql`
			SELECT column_name FROM information_schema.columns
			WHERE table_name = ${table} AND column_name IN ${sql(columns)}`;
		if (present.length !== columns.length) {
			throw new Error(
				`${table}: expected ${columns.join(', ')}; found ${present.map((r) => r.column_name).join(', ')}`
			);
		}
	}

	console.log('✓ Migration 0056 complete — text provenance and anchor context columns present');
} catch (error) {
	console.error('Migration 0056 failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
