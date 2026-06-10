import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0031_add_connection_note_placement.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0031_add_connection_note_placement.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	console.log('✅ Migration completed successfully!');
	console.log('Added note_anchor_side, note_anchor_t, note_offset columns to segment_connection table.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
