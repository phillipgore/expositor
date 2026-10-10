/**
 * # Resolving structure ids to the part that owns them (SERIES_PLAN §8 (c), phase 3)
 *
 * An edge stub knows only the id of its absent endpoint. Labelling it — "continues in Part 4" — needs
 * the reverse lookup: which study does that column, section or segment belong to?
 *
 * Three queries, one per structure level, regardless of how many ids are asked about. The alternative
 * (a query per id) would put a round trip in a render path that already streams.
 *
 * ⚠️ **All three levels, not just segments.** `segment_connection` carries six endpoint FKs across
 * three independently-typed levels (§8's Q42 note). Resolving only segment ids would leave a
 * cross-COLUMN connection unlabelled and therefore unstubbed — silently reverting to phase 2's
 * behaviour for exactly the case §3's "genuine overlap" paragraph calls out.
 *
 * @module structureOwners
 */

import { passage, passageColumn, passageSection, passageSegment, study } from './schema.js';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Map each given structure id to the `study.id` that owns it.
 *
 * Ids that resolve to nothing are simply absent from the result — a caller must treat a missing entry
 * as "unknown", never as an error, because a stale connection row can name a segment that has since
 * been deleted.
 *
 * @param {Object} dbx
 * @param {string[]} ids - Mixed column / section / segment ids
 * @returns {Promise<Record<string, string>>} structure id → study id
 */
export async function resolveStructureOwners(dbx, ids) {
	/** @type {Record<string, string>} */
	const owners = {};
	if (!ids || ids.length === 0) return owners;

	// Segments: segment → section → column → passage → study.
	const segments = await dbx
		.select({ id: passageSegment.id, studyId: passage.studyId })
		.from(passageSegment)
		.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.where(inArray(passageSegment.id, ids));
	for (const row of segments) owners[row.id] = row.studyId;

	// Sections: section → column → passage → study.
	const sections = await dbx
		.select({ id: passageSection.id, studyId: passage.studyId })
		.from(passageSection)
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.where(inArray(passageSection.id, ids));
	for (const row of sections) owners[row.id] = row.studyId;

	// Columns: column → passage → study.
	const columns = await dbx
		.select({ id: passageColumn.id, studyId: passage.studyId })
		.from(passageColumn)
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.where(inArray(passageColumn.id, ids));
	for (const row of columns) owners[row.id] = row.studyId;

	return owners;
}

/**
 * Authorize a write: every given structure id must exist and belong to a study owned
 * by `userId`. Returns the distinct owning study ids on success, or null when any id
 * is unknown or owned by someone else (callers should respond 403).
 *
 * @param {Object} dbx
 * @param {string} userId
 * @param {string[]} ids - Mixed column / section / segment ids
 * @returns {Promise<string[]|null>}
 */
export async function authorizeStructureIds(dbx, userId, ids) {
	if (!ids || ids.length === 0) return null;
	const owners = await resolveStructureOwners(dbx, ids);
	if (Object.keys(owners).length !== new Set(ids).size) return null;
	const studyIds = [...new Set(Object.values(owners))];
	if (studyIds.length === 0) return null;
	const owned = await dbx
		.select({ id: study.id })
		.from(study)
		.where(and(inArray(study.id, studyIds), eq(study.userId, userId)));
	return owned.length === studyIds.length ? studyIds : null;
}
