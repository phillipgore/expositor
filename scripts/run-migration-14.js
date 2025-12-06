import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0014_fix_word_id_format.sql...');
	
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0014_fix_word_id_format.sql'),
		'utf-8'
	);
	
	// Execute the migration
	await sql.unsafe(migrationSQL);
	
	console.log('✅ Migration completed successfully!');
	console.log('Word IDs have been updated to uppercase with 3-digit padding.');
	
} catch (error) {
	console.error('❌ Migration failed:', error);
	process.exit(1);
} finally {
	await sql.end();
}
