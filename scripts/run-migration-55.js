import dotenv from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ENV_FILE=.env.production targets production; default is the local `.env`.
dotenv.config({ path: process.env.ENV_FILE ?? '.env', quiet: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.DATABASE_URL);

try {
	console.log('Running migration 0055_add_password_reset_setting.sql...');
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0055_add_password_reset_setting.sql'),
		'utf-8'
	);
	await sql.unsafe(migrationSQL);

	const present = await sql`
		SELECT column_name FROM information_schema.columns
		WHERE table_name = 'app_settings' AND column_name = 'password_reset_enabled'`;
	if (present.length === 0) {
		throw new Error('Column app_settings.password_reset_enabled missing after migration');
	}

	console.log('✓ Migration 0055 complete — app_settings.password_reset_enabled present');
} catch (error) {
	console.error('Migration 0055 failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
