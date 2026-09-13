/**
 * One-off sweep: prune childless containers and correct drifted anchors in EVERY existing passage.
 *
 * ## Why a backfill is needed at all
 *
 * `reanchorContainers()` now prunes and re-anchors as part of every cross-part Join and Move Text, so
 * no NEW debris can be created. But studies edited before that fix still carry it, and the symptom is
 * permanent until something rewrites those rows: a column with no sections renders as a blank
 * full-width gap between real columns, and splitting or joining around it does not clear it.
 *
 * ## ⚠️ It calls the REAL `reanchorContainers()`, not a copy of it
 *
 * A backfill that reimplements the rule is a second definition of the invariant, free to disagree with
 * the first — and the disagreement would surface as "the repair script says the study is clean but the
 * app still shows a gap". Importing the shipped function means the sweep and the live commands cannot
 * drift apart, and that running this is exactly equivalent to having had the fix all along.
 *
 * Every passage is repaired in ITS OWN transaction. One malformed passage therefore cannot roll back
 * the repair of the others, and the script is safe to re-run after a failure — the operation is
 * idempotent, so a passage already clean costs reads and no writes.
 *
 * Run: node --import tsx --import ./scripts/alias-loader.mjs scripts/repair-empty-containers.mjs
 * Confirm with: node --import ./scripts/alias-loader.mjs scripts/diagnose-empty-containers.mjs
 */

import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Imported dynamically AFTER dotenv has run, because `$lib/server/db/index.js` reads DATABASE_URL at
// module load and opens its pool there.
const { db, client } = await import('../src/lib/server/db/index.js');
const { passage } = await import('../src/lib/server/db/schema.js');
const { reanchorContainers } = await import('../src/lib/server/db/reanchor.js');

let repaired = 0;
let failed = 0;
const totals = {
	columnsReanchored: 0,
	sectionsReanchored: 0,
	columnsDeleted: 0,
	sectionsDeleted: 0
};

try {
	const passages = await db.select({ id: passage.id }).from(passage);
	console.log(`Sweeping ${passages.length} passage(s) across all studies…\n`);

	for (const row of passages) {
		try {
			const result = await db.transaction((tx) => reanchorContainers(tx, row.id));

			const touched =
				result.columnsReanchored +
				result.sectionsReanchored +
				result.columnsDeleted +
				result.sectionsDeleted;

			if (touched > 0) {
				repaired += 1;
				for (const key of Object.keys(totals)) totals[key] += result[key];
				console.log(
					`  ✓ ${row.id}  ` +
						`columns −${result.columnsDeleted}/↻${result.columnsReanchored}  ` +
						`sections −${result.sectionsDeleted}/↻${result.sectionsReanchored}`
				);
			}
		} catch (error) {
			failed += 1;
			console.error(`  ✗ ${row.id}: ${error.message}`);
		}
	}

	console.log('\n─── Sweep complete ───');
	console.log(
		`Passages repaired: ${repaired}  (unchanged: ${passages.length - repaired - failed})`
	);
	console.log(`Empty columns deleted:  ${totals.columnsDeleted}`);
	console.log(`Empty sections deleted: ${totals.sectionsDeleted}`);
	console.log(`Columns re-anchored:    ${totals.columnsReanchored}`);
	console.log(`Sections re-anchored:   ${totals.sectionsReanchored}`);

	if (failed > 0) {
		console.error(
			`\n⚠️  ${failed} passage(s) failed and were left untouched. Re-run after fixing.`
		);
		process.exitCode = 1;
	}
} catch (error) {
	console.error('❌ Sweep failed:', error);
	process.exitCode = 1;
} finally {
	await client.end();
}
