import postgres from 'postgres';
import 'dotenv/config';

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
	try {
		console.log('Running commentary panel migration...');
		
		// Add commentary column to passage_segment
		await sql`ALTER TABLE passage_segment ADD COLUMN IF NOT EXISTS note text`;
		console.log('✓ Added note column to passage_segment');
		
		await sql`ALTER TABLE passage_segment ADD COLUMN IF NOT EXISTS commentary text`;
		console.log('✓ Added commentary column to passage_segment');
		
		// Add commentary panel preferences to user table
		await sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS commentary_panel_width integer DEFAULT 300`;
		console.log('✓ Added commentary_panel_width to user table');
		
		await sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS commentary_panel_open boolean DEFAULT false`;
		console.log('✓ Added commentary_panel_open to user table');
		
		console.log('\n✅ Migration completed successfully!');
	} catch (error) {
		console.error('❌ Migration error:', error);
	} finally {
		await sql.end();
	}
}

migrate();
