/**
 * Clear cached passage text so it is re-fetched (and re-processed) on next load.
 *
 * Needed after any change to text processing (src/lib/utils/scriptureText.js, wrapWords,
 * normalizeESVFormatting): `passage.cachedText` holds the processed HTML, so old output persists
 * until the cache is cleared. Clearing is always safe — the loader fetches live and backfills.
 *
 * ⚠️ Re-processed text can shift position-derived word ids in changed verses, so markup stored
 * against those ids (passage_column / section / segment) may land on a neighbouring word.
 *
 * Usage:
 *   node scripts/clear-passage-text-cache.js                 # dry run: NET + ESV Psalms
 *   node scripts/clear-passage-text-cache.js --apply
 *   DOTENV_CONFIG_PATH=.env.production node scripts/clear-passage-text-cache.js --apply
 */
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env', quiet: true });

const apply = process.argv.includes('--apply');

async function main() {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is not set');
	const host = new URL(process.env.DATABASE_URL).hostname;
	const sql = postgres(process.env.DATABASE_URL);

	try {
		// Affected by the 2026-10-09 text fixes: every NET passage (poetry line tags, paragraphs,
		// acrostic headings) and ESV Psalms (titles, Psalm 119 stanza names).
		const rows = await sql`
			SELECT p.id, s.title, s.translation, p.book_name, p.from_chapter, p.from_verse,
			       p.to_chapter, p.to_verse
			FROM passage p JOIN study s ON s.id = p.study_id
			WHERE p.cached_text IS NOT NULL
			  AND (s.translation = 'net' OR (s.translation = 'esv' AND p.book_name ILIKE 'psalm%'))
			ORDER BY s.title`;

		console.log(`${apply ? 'Clearing' : '[dry run] Would clear'} ${rows.length} cached passage(s) on ${host}:`);
		for (const r of rows) {
			console.log(
				`  - ${r.title} — ${r.book_name} ${r.from_chapter}:${r.from_verse}-${r.to_chapter}:${r.to_verse} [${r.translation.toUpperCase()}]`
			);
		}

		if (apply && rows.length) {
			const ids = rows.map((r) => r.id);
			const res = await sql`
				UPDATE passage SET cached_text = NULL, text_cached_at = NULL WHERE id IN ${sql(ids)}`;
			console.log(`Cleared ${res.count}.`);
		} else if (!apply) {
			console.log('Re-run with --apply to clear.');
		}
	} finally {
		await sql.end();
	}
}

main().catch((err) => {
	console.error('❌ Error:', err);
	process.exit(1);
});
