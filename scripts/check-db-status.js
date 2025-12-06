import postgres from 'postgres';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkDatabaseStatus() {
	let sql = null;
	try {
		console.log('Checking database status...\n');
		
		if (!process.env.DATABASE_URL) {
			throw new Error('DATABASE_URL environment variable is not set');
		}
		
		sql = postgres(process.env.DATABASE_URL);
		
		// Count passages
		const passageCount = await sql`SELECT COUNT(*) as count FROM passage`;
		console.log(`📊 Total passages: ${passageCount[0].count}`);
		
		// Get sample passage data
		const samplePassages = await sql`SELECT id, book_id, book_name, from_chapter, from_verse FROM passage LIMIT 5`;
		console.log('\n📖 Sample passages:');
		samplePassages.forEach(p => {
			console.log(`  - book_id: "${p.book_id}", book_name: "${p.book_name}", chapter: ${p.from_chapter}, verse: ${p.from_verse}`);
		});
		
		// Count columns
		const columnCount = await sql`SELECT COUNT(*) as count FROM passage_column`;
		console.log(`\n📐 Total passage_columns: ${columnCount[0].count}`);
		
		// Count splits
		const splitCount = await sql`SELECT COUNT(*) as count FROM passage_split`;
		console.log(`🎨 Total passage_splits: ${splitCount[0].count}`);
		
		// Count segments
		const segmentCount = await sql`SELECT COUNT(*) as count FROM passage_segment`;
		console.log(`📄 Total passage_segments: ${segmentCount[0].count}`);
		
		// Check if any passages are missing columns
		const missingColumns = await sql`
			SELECT COUNT(*) as count 
			FROM passage p 
			WHERE NOT EXISTS (SELECT 1 FROM passage_column pc WHERE pc.passage_id = p.id)
		`;
		console.log(`\n⚠️  Passages missing columns: ${missingColumns[0].count}`);
		
		await sql.end();
		process.exit(0);
	} catch (error) {
		console.error('❌ Error:', error);
		if (sql) await sql.end();
		process.exit(1);
	}
}

checkDatabaseStatus();
