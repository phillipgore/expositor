import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0030_add_selectors_visible.sql...');

	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0030_add_selectors_visible.sql'),
		'utf-8'
	);

	await sql.unsafe(migrationSQL);

	console.log('✅ Migration completed successfully!');
	console.log('Added selectors_visible column to user table.');
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
