/**
 * Database writes for text provenance. Decisions live in `$lib/utils/textProvenance.js` (pure);
 * this module only performs them. See that module for what is recorded and the invariant.
 *
 * ⚠️ Every site that stores fetched passage text must go through `cacheFetchedPassage`, so the
 * cache and its provenance can never be written separately.
 *
 * Provenance writes are best-effort: a failure is logged and never breaks a page load, because the
 * user's text is already fetched and the record can be completed on a later fetch.
 */

import { db } from './index.js';
import { passage, passageColumn, passageSection, passageSegment } from './schema.js';
import { and, eq, isNull } from 'drizzle-orm';
import {
	buildVerseFingerprints,
	planAnchorContexts,
	planBoundAnchors,
	planProvenanceUpdate
} from '$lib/utils/textProvenance.js';
import { getBookAbbreviation } from '$lib/utils/bibleData.js';

/**
 * Store freshly fetched text, plus provenance and (for mid-verse parts) bound anchors.
 *
 * @param {any} passageRow - the passage row as read before the fetch (provides the current baseline)
 * @param {{ text: string, rawByVerse?: Record<string, string>, textSource?: string }} result
 * @param {{ onlyIfUncached?: boolean }} [options] - guard the write on `cachedText IS NULL`
 *   (prefetch race: a concurrent fill must not be clobbered by a stale fetch)
 * @returns {Promise<boolean>} whether a row was written
 */
export async function cacheFetchedPassage(passageRow, result, { onlyIfUncached = false } = {}) {
	/** @type {Record<string, any>} */
	let provenance = {};
	try {
		const fingerprints = buildVerseFingerprints(result.text, result.rawByVerse);
		provenance = planProvenanceUpdate(passageRow, {
			textSource: result.textSource ?? 'unknown',
			fingerprints
		});
		const bookAbbr = getBookAbbreviation(passageRow.bookName);
		// Bound anchors are only safe to record against text that matches the baseline.
		const rowAfter = { ...passageRow, ...provenance };
		Object.assign(provenance, planBoundAnchors(rowAfter, result.text, bookAbbr));
		if (provenance.textDrift) {
			console.warn(
				`Passage ${passageRow.id}: ${provenance.textDrift.verses.length} verse(s) differ from the text its structure was anchored to (recorded in text_drift).`
			);
		}
	} catch (err) {
		console.error('Failed to compute text provenance:', err);
		provenance = {};
	}

	const where = onlyIfUncached
		? and(eq(passage.id, passageRow.id), isNull(passage.cachedText))
		: eq(passage.id, passageRow.id);
	const rows = await db
		.update(passage)
		.set({ cachedText: result.text, textCachedAt: new Date(), ...provenance })
		.where(where)
		.returning({ id: passage.id });
	return rows.length > 0;
}

/**
 * Record the words around each column/section/segment start point that has none, or whose start
 * point moved since it was recorded. Skipped while the passage has unresolved drift.
 *
 * Called by the study loader with the UNCLIPPED text it already holds, so it costs no fetch; rows
 * already up to date are skipped without a write.
 *
 * @param {any} passageRow
 * @param {string} html - unclipped processed passage text
 * @param {{ columns: any[], sections: any[], segments: any[] }} structure - this passage's rows
 * @returns {Promise<number>} rows written
 */
export async function recordAnchorContexts(passageRow, html, { columns, sections, segments }) {
	try {
		// One explicit write per table: drizzle's table types do not unify, so a loop over
		// [table, updates] pairs loses them.
		let written = 0;
		// Conditional on the start point being unchanged since we read it, so a concurrent edit is
		// never stamped with the wrong word.
		for (const { id, anchorContext } of planAnchorContexts(passageRow, html, columns)) {
			await db
				.update(passageColumn)
				.set({ anchorContext })
				.where(
					and(eq(passageColumn.id, id), eq(passageColumn.startingWordId, anchorContext.wordId))
				);
			written += 1;
		}
		for (const { id, anchorContext } of planAnchorContexts(passageRow, html, sections)) {
			await db
				.update(passageSection)
				.set({ anchorContext })
				.where(
					and(eq(passageSection.id, id), eq(passageSection.startingWordId, anchorContext.wordId))
				);
			written += 1;
		}
		for (const { id, anchorContext } of planAnchorContexts(passageRow, html, segments)) {
			await db
				.update(passageSegment)
				.set({ anchorContext })
				.where(
					and(eq(passageSegment.id, id), eq(passageSegment.startingWordId, anchorContext.wordId))
				);
			written += 1;
		}
		return written;
	} catch (err) {
		console.error('Failed to record anchor contexts:', err);
		return 0;
	}
}
