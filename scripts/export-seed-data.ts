import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { studyGroup, study, passage } from '../src/lib/server/db/schema';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
config();

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('❌ DATABASE_URL environment variable is not set');
	process.exit(1);
}

console.log('🔄 Connecting to database...');

// Create postgres client
const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema: { studyGroup, study, passage } });

/**
 * Escapes a string value for SQL
 */
function escapeSQLString(value: any): string {
	if (value === null || value === undefined) {
		return 'NULL';
	}
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}
	if (typeof value === 'number') {
		return value.toString();
	}
	if (value instanceof Date) {
		return `'${value.toISOString()}'`;
	}
	// Escape single quotes by doubling them
	return `'${value.toString().replace(/'/g, "''")}'`;
}

/**
 * Generates INSERT statement for a table
 */
function generateInsertStatement(tableName: string, records: any[]): string {
	if (records.length === 0) {
		return `-- No data to insert for ${tableName}\n`;
	}

	const columns = Object.keys(records[0]);
	const columnList = columns.join(', ');
	
	let sql = `-- Insert data for ${tableName}\n`;
	sql += `INSERT INTO ${tableName} (${columnList}) VALUES\n`;
	
	const valueRows = records.map((record, index) => {
		const values = columns.map(col => escapeSQLString(record[col])).join(', ');
		const isLast = index === records.length - 1;
		return `  (${values})${isLast ? ';' : ','}`;
	});
	
	sql += valueRows.join('\n');
	
	return sql + '\n';
}

async function exportSeedData() {
	try {
		console.log('📊 Querying database for current data...\n');

		// Query all data from the three tables
		const studyGroups = await db.select().from(studyGroup);
		const studies = await db.select().from(study);
		const passages = await db.select().from(passage);

		console.log(`Found:`);
		console.log(`  - ${studyGroups.length} study groups`);
		console.log(`  - ${studies.length} studies`);
		console.log(`  - ${passages.length} passages\n`);

		// Generate SQL file content
		let sqlContent = `-- =====================================================
-- Expositor Seed Data
-- Generated: ${new Date().toISOString()}
-- =====================================================
-- This script will DELETE all existing data from study_group, 
-- study, and passage tables, then INSERT the snapshot data.
-- 
-- To execute this script, run:
--   psql $DATABASE_URL -f scripts/seed-data.sql
-- =====================================================

-- Disable triggers during data load (optional, for safety)
SET session_replication_role = replica;

-- Delete existing data (in correct order to respect foreign keys)
DELETE FROM passage;
DELETE FROM study;
DELETE FROM study_group;

`;

		// Add INSERT statements
		if (studyGroups.length > 0) {
			sqlContent += generateInsertStatement('study_group', studyGroups);
			sqlContent += '\n';
		}

		if (studies.length > 0) {
			sqlContent += generateInsertStatement('study', studies);
			sqlContent += '\n';
		}

		if (passages.length > 0) {
			sqlContent += generateInsertStatement('passage', passages);
			sqlContent += '\n';
		}

		// Re-enable triggers
		sqlContent += `-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- =====================================================
-- Seed data import complete!
-- =====================================================
`;

		// Write to file
		const outputPath = join(__dirname, 'seed-data.sql');
		await writeFile(outputPath, sqlContent, 'utf8');

		console.log(`✅ Seed data exported successfully!`);
		console.log(`📄 File: ${outputPath}\n`);
		console.log(`To restore this data, run:`);
		console.log(`  psql $DATABASE_URL -f scripts/seed-data.sql\n`);

	} catch (error) {
		console.error('❌ Error exporting seed data:', error);
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
}

// Run the export
exportSeedData();
