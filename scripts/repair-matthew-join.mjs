/**
 * One-off: restore the Matthew 11+12 column join that a cross-part Join Down tore apart.
 *
 * ## What went wrong, in order
 *
 * 1. A cross-part **Join Down** re-parented a section out of its column without removing what it left
 *    behind, stranding empty containers (fixed in `reanchor.js`) — and, in this study, also leaving a
 *    NON-empty section under the wrong column: the 12:1 half of a deliberate 11+12 join ended up
 *    parented to the Matthew 10 column.
 *
 * 2. That misplacement was invisible because the section's anchor was *also* stale, so the tree still
 *    sorted plausibly. `reanchorContainers()` then made the anchor honest — correctly — which exposed
 *    the misplacement as a column whose word range OVERLAPS the next column's.
 *
 * 3. The renderer derives a segment's end from the next anchor in tree order, so the 12:1 segment was
 *    handed an end word (11:1) that lies BEHIND its start. `extractSegmentText` scanned forward, never
 *    matched, and ran to the end of the passage — re-emitting Matthew 12–18 a second time. With
 *    `data-word-id` duplicated in the DOM, every
 *    `document.querySelector('.selectable-word[data-word-id=…]')` in the selection code resolved to the
 *    wrong copy, and **word selection stopped working**.
 *
 * ## What this does
 *
 * Re-parents that one section onto the Matthew 11 column, which restores the 11+12 join as two sections
 * of a single column — the arrangement the user authored. The mid-verse anchor (`MT-012-001-002`, word
 * TWO) is the evidence it was a deliberate join point and not a default column boundary, so the join is
 * reconstructed rather than replaced with a fresh column.
 *
 * ⚠️ **Deliberately NOT folded into `repair-empty-containers.mjs`.** One occurrence is not a general
 * rule, and a sweep that re-parents sections on a guess could rearrange authored structure across every
 * study. This names the exact rows it touches and refuses if the database does not match.
 *
 * Idempotent: re-running after success finds the section already parented correctly and does nothing.
 *
 * Run: node --import tsx --import ./scripts/alias-loader.mjs scripts/repair-matthew-join.mjs
 * Confirm: node --import ./scripts/alias-loader.mjs scripts/diagnose-empty-containers.mjs
 */

import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const { db, client } = await import('../src/lib/server/db/index.js');
const { passageColumn, passageSection } = await import('../src/lib/server/db/schema.js');
const { reanchorContainers } = await import('../src/lib/server/db/reanchor.js');
const { eq } = await import('drizzle-orm');

// The rows this repair is about, named explicitly so a mismatched database is refused rather than
// silently "repaired" into some other shape.
const SECTION_ID = 'cb23ccf6';
const FROM_COLUMN = 'ff137487'; // Matthew 10 — where the join wrongly left it
const TO_COLUMN = 'ed928460'; // Matthew 11 — where it belongs

try {
	const sections = await db.select().from(passageSection);
	const columns = await db.select().from(passageColumn);

	const section = sections.find((s) => s.id.startsWith(SECTION_ID));
	const target = columns.find((c) => c.id.startsWith(TO_COLUMN));

	if (!section) throw new Error(`Section ${SECTION_ID}… not found — database does not match.`);
	if (!target) throw new Error(`Column ${TO_COLUMN}… not found — database does not match.`);

	if (section.passageColumnId === target.id) {
		console.log('✅ Already repaired — the section is parented to the Matthew 11 column.');
	} else if (!section.passageColumnId.startsWith(FROM_COLUMN)) {
		throw new Error(
			`Section ${SECTION_ID}… is parented to ${section.passageColumnId}, not the expected ` +
				`${FROM_COLUMN}…. Refusing to move it: the database is not in the state this repair describes.`
		);
	} else {
		await db.transaction(async (tx) => {
			await tx
				.update(passageSection)
				.set({ passageColumnId: target.id, updatedAt: new Date() })
				.where(eq(passageSection.id, section.id));

			// Settle anchors on the passage now that the section has moved.
			await reanchorContainers(tx, target.passageId);
		});

		console.log(`✓ Moved section ${section.id}`);
		console.log(`    from column ${FROM_COLUMN}… (Matthew 10)`);
		console.log(`      to column ${target.id} (Matthew 11)`);
		console.log('\n✅ The 11+12 join is restored as two sections of one column.');
	}
} catch (error) {
	console.error('❌ Repair failed:', error.message);
	process.exitCode = 1;
} finally {
	await client.end();
}
