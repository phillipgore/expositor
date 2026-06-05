import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0028_add_section_top_offset.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0028_add_section_top_offset.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	console.log('✅ Migration completed successfully!');
	console.log('Added top_offset column to passage_section table.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
