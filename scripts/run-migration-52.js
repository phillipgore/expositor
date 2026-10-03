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
	console.log('Running migration 0052_add_connection_anchor_placement.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0052_add_connection_anchor_placement.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	const cols = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'segment_connection' AND column_name IN ('from_anchor_edge', 'from_anchor_pos', 'to_anchor_edge', 'to_anchor_pos')
	`;
	if (cols.length !== 4) throw new Error(`Expected 4 new columns, found ${cols.length}`);

	console.log('✅ Migration completed successfully!');
	console.log('Added from/to anchor edge + pos to segment_connection.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
