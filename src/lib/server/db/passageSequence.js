/**
 * # Loading the passage sequence a structural command may operate over (SERIES_PLAN §8)
 *
 * `sequenceScope.js` resolves scope over an **ordered sequence of passages**; this loads that
 * sequence from the database. Two cases, one shape:
 *
 * - a **standalone study** contributes its own passages in `displayOrder`;
 * - a **part of a series** contributes every passage of every part, parts ordered by `seriesOrder`
 *   and passages within each part by `displayOrder`.
 *
 * §8 asks for exactly this shape — "whether those passages belong to one study or to adjacent parts,
 * so both cases fall out of one implementation" — which is also why the multi-passage limitation that
 * exists *today* inside a single study is fixed by the same code.
 *
 * ⚠️ **Parts are ordered by `seriesOrder`, never re-derived from canonical order** (§4). A user who
 * deliberately teaches Romans 8 first has an arrangement that must survive; the *eligibility* of each
 * seam is then decided by contiguity, so a deliberately re-ordered series simply has ineligible seams
 * rather than a silently corrected order.
 *
 * @module passageSequence
 */

import { passage, study, passageColumn, passageSection, passageSegment } from './schema.js';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { compareWordIds } from '$lib/utils/wordIds.js';

/**
 * Load the ordered passage sequence containing `passageId`, with each passage's structure tree.
 *
 * Returns `null` when the passage does not exist or is not owned by `userId` — scoped in the query so
 * another user's passage is indistinguishable from a missing one, matching every other endpoint here.
 *
 * @param {Object} dbx
 * @param {string} userId
 * @param {string} passageId
 * @returns {Promise<{ sequence: Array<{ passageId: string, passage: Object, studyId: string, tree: Array }>, index: number, studyId: string, seriesId: string|null }|null>}
 */
export async function loadPassageSequence(dbx, userId, passageId) {
	// Resolve the owning study, and whether it is part of a series, in one hop.
	const [owner] = await dbx
		.select({
			studyId: study.id,
			userId: study.userId,
			seriesId: study.seriesId
		})
		.from(passage)
		.innerJoin(study, eq(passage.studyId, study.id))
		.where(eq(passage.id, passageId))
		.limit(1);

	if (!owner || owner.userId !== userId) return null;

	// Which studies contribute passages: just this one, or every part of the series.
	let studyIds = [owner.studyId];
	/** @type {Map<string, number>} */
	const orderByStudy = new Map([[owner.studyId, 0]]);

	if (owner.seriesId) {
		const parts = await dbx
			.select({ id: study.id, seriesOrder: study.seriesOrder })
			.from(study)
			.where(and(eq(study.seriesId, owner.seriesId), eq(study.userId, userId)))
			.orderBy(asc(study.seriesOrder));

		if (parts.length > 0) {
			studyIds = parts.map((p) => p.id);
			orderByStudy.clear();
			parts.forEach((part, i) => orderByStudy.set(part.id, i));
		}
	}

	const rows = await dbx.select().from(passage).where(inArray(passage.studyId, studyIds));

	// Sequence order: part position first, then displayOrder within the part. NOT canonical order —
	// see the module note. A part with several passages keeps the order its own rows declare.
	const ordered = rows.slice().sort((a, b) => {
		const partDelta = (orderByStudy.get(a.studyId) ?? 0) - (orderByStudy.get(b.studyId) ?? 0);
		if (partDelta !== 0) return partDelta;
		return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
	});

	const trees = await loadTreesFor(
		dbx,
		ordered.map((row) => row.id)
	);

	const sequence = ordered.map((row) => ({
		passageId: row.id,
		passage: row,
		studyId: row.studyId,
		tree: trees.get(row.id) ?? []
	}));

	return {
		sequence,
		index: sequence.findIndex((entry) => entry.passageId === passageId),
		studyId: owner.studyId,
		seriesId: owner.seriesId ?? null
	};
}

/**
 * Load column → section → segment trees for several passages at once.
 *
 * Three queries total regardless of passage count, rather than three per passage. A 16-part Romans
 * series would otherwise issue 48 round trips to answer one Join Segment.
 *
 * @returns {Promise<Map<string, Array>>} passageId → columns[] with sections[] with segments[]
 */
async function loadTreesFor(dbx, passageIds) {
	/** @type {Map<string, Array>} */
	const byPassage = new Map();
	if (!passageIds || passageIds.length === 0) return byPassage;

	const columns = await dbx
		.select()
		.from(passageColumn)
		.where(inArray(passageColumn.passageId, passageIds))
		.orderBy(asc(passageColumn.startingWordId));

	const sections =
		columns.length > 0
			? await dbx
					.select()
					.from(passageSection)
					.where(
						inArray(
							passageSection.passageColumnId,
							columns.map((c) => c.id)
						)
					)
					.orderBy(asc(passageSection.startingWordId))
			: [];

	const segments =
		sections.length > 0
			? await dbx
					.select()
					.from(passageSegment)
					.where(
						inArray(
							passageSegment.passageSectionId,
							sections.map((s) => s.id)
						)
					)
					.orderBy(asc(passageSegment.startingWordId))
			: [];

	for (const id of passageIds) byPassage.set(id, []);

	for (const column of columns) {
		const tree = byPassage.get(column.passageId);
		if (!tree) continue;
		tree.push({
			...column,
			sections: sections
				.filter((s) => s.passageColumnId === column.id)
				.map((section) => ({
					...section,
					segments: segments
						.filter((seg) => seg.passageSectionId === section.id)
						.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
				}))
				.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
		});
	}

	for (const tree of byPassage.values()) {
		tree.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
	}

	return byPassage;
}
