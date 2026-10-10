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
	console.log('Running migration 0058_add_layout_link_groups.sql...');
	const migrationSQL = readFileSync(
		join(__dirname, '../drizzle/0058_add_layout_link_groups.sql'),
		'utf-8'
	);
	await sql.unsafe(migrationSQL);

	const present = await sql`
		SELECT table_name, column_name FROM information_schema.columns
		WHERE (table_name = 'passage_column' AND column_name IN ('spacing_group_id', 'width_group_id'))
		   OR (table_name = 'passage_section' AND column_name = 'spacing_group_id')`;
	if (present.length !== 3) {
		throw new Error('Link-group columns are missing after migration');
	}

	console.log('✓ Migration 0058 complete — layout link-group columns present');
} catch (error) {
	console.error('Migration 0058 failed:', error);
	process.exitCode = 1;
} finally {
	await sql.end();
}
