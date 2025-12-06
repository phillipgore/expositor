import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function backfillPassageStructures() {
	let sql = null;
	try {
		console.log('Starting backfill of passage structures...');
		
		// Check if DATABASE_URL is set
		if (!process.env.DATABASE_URL) {
			throw new Error('DATABASE_URL environment variable is not set');
		}
		
		// Create postgres connection
		sql = postgres(process.env.DATABASE_URL);
		
		// Read the SQL file
		const sqlPath = join(__dirname, '../drizzle/0013_backfill_passage_structures.sql');
		const sqlContent = readFileSync(sqlPath, 'utf-8');
		
		// Execute the SQL as a single transaction
		console.log('Executing backfill SQL...');
		const result = await sql.unsafe(sqlContent);
		console.log('SQL executed');
		
		// Check results
		const columnCount = await sql`SELECT COUNT(*) as count FROM passage_column`;
		const splitCount = await sql`SELECT COUNT(*) as count FROM passage_split`;
		const segmentCount = await sql`SELECT COUNT(*) as count FROM passage_segment`;
		
		console.log(`\nCreated:`);
		console.log(`  - ${columnCount[0].count} columns`);
		console.log(`  - ${splitCount[0].count} splits`);
		console.log(`  - ${segmentCount[0].count} segments`);
		
		console.log('✅ Backfill completed successfully!');
		console.log('All existing passages now have default column, split, and segment records.');
		
		await sql.end();
		process.exit(0);
	} catch (error) {
		console.error('❌ Error during backfill:', error);
		if (sql) await sql.end();
		process.exit(1);
	}
}

backfillPassageStructures();
