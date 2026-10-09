import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL, { onnotice: () => {} });

try {
	console.log('Running migration 0057_add_segment_left_offset.sql...');
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0057_add_segment_left_offset.sql'),
		'utf-8'
	);
	await sql.unsafe(migrationSQL);

	const present = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'passage_segment' AND column_name = 'left_offset'`;
	if (present.length !== 1) {
		throw new Error('passage_segment.left_offset is missing after migration');
	}

	console.log('✓ Migration 0057 complete — passage_segment.left_offset present');
} catch (error) {
	console.error('Migration 0057 failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
