import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0025_add_commentary_tags.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0025_add_commentary_tags.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	console.log('✅ Migration completed successfully!');
	console.log('Created commentary_tag table with indexes.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
