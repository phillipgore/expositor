import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0048_add_passage_word_bounds.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0048_add_passage_word_bounds.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	const cols = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'passage' AND column_name IN ('from_word', 'to_word')
	`;
	if (cols.length !== 2) throw new Error(`Expected 2 new columns, found ${cols.length}`);

	console.log('✅ Migration completed successfully!');
	console.log('Added from_word and to_word to passage.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
