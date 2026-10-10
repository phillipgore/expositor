import { db } from '$lib/server/db/index.js';
import { passageSegment, passageSection, study } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';
import { resolveStructureOwners } from '$lib/server/db/structureOwners.js';

/** Upper bound on segments per request. */
const MAX_IDS = 1000;
/** Upper bound on the offset (CSS px) — far beyond any real layout, well inside int4. */
const MAX_OFFSET = 10000;

/**
 * PATCH /api/segments/batch-position
 *
 * Set the horizontal position (how far, in CSS px, a segment is pulled to the right
 * within its column) on one or more segments at once. Used by the segment position
 * drag handle and the "Set / Reset Segment Position" Layout menu items.
 *
 * Body: { ids: string[], offset: number | null }
 *   - offset = null (or 0) clears the override (segments return flush with the column)
 *   - offset > 0 pulls the segments right by that many px
 *
 * The upper limit (36px short of the right edge of the segment above) depends on the
 * rendered layout, so it is enforced by the client when rendering.
 *
 * A segment that is the ONLY segment in its column (counted across all of the column's
 * sections) can't be positioned: a non-zero offset for one is rejected with 400.
 * Clearing (null / 0) is always allowed, so Reset still works on any stored value.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { ids, offset } = body;

		// Validate ids: must be a non-empty array of strings.
		if (
			!Array.isArray(ids) ||
			ids.length === 0 ||
			ids.length > MAX_IDS ||
			!ids.every((id) => typeof id === 'string')
		) {
			return json({ error: 'Invalid ids' }, { status: 400 });
		}

		// Validate offset: must be null (flush) or a finite number in [0, MAX_OFFSET].
		if (offset !== null) {
			if (typeof offset !== 'number' || !Number.isFinite(offset) || offset < 0 || offset > MAX_OFFSET) {
				return json({ error: 'Invalid offset' }, { status: 400 });
			}
		}

		const rounded = offset === null ? null : Math.round(offset);

		// Every segment must belong to a study owned by the current user.
		const owners = await resolveStructureOwners(db, ids);
		const studyIds = [...new Set(Object.values(owners))];
		if (Object.keys(owners).length !== new Set(ids).size || studyIds.length === 0) {
			return json({ error: 'Segment not found or not authorized' }, { status: 403 });
		}
		const owned = await db
			.select({ id: study.id })
			.from(study)
			.where(and(inArray(study.id, studyIds), eq(study.userId, session.user.id)));
		if (owned.length !== studyIds.length) {
			return json({ error: 'Segment not found or not authorized' }, { status: 403 });
		}

		// Reject positioning a segment that is alone in its column.
		if (rounded !== null && rounded !== 0) {
			const lone = await findLoneSegmentIds(ids);
			if (lone.length > 0) {
				return json(
					{ error: 'Segment is the only one in its column and cannot be positioned', ids: lone },
					{ status: 400 }
				);
			}
		}

		await db
			.update(passageSegment)
			.set({ leftOffset: rounded === 0 ? null : rounded, updatedAt: new Date() })
			.where(inArray(passageSegment.id, ids));

		return json({ success: true });
	} catch (error) {
		console.error('Error batch-updating segment positions:', error);
		return json({ error: 'Failed to update segment positions' }, { status: 500 });
	}
}

/**
 * Of the given segment ids, return those that are the only segment in their column.
 * Two queries: the segments' columns, then every segment in those columns.
 * @param {string[]} ids
 * @returns {Promise<string[]>}
 */
async function findLoneSegmentIds(ids) {
	const targets = await db
		.select({ id: passageSegment.id, columnId: passageSection.passageColumnId })
		.from(passageSegment)
		.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
		.where(inArray(passageSegment.id, ids));
	const columnIds = [...new Set(targets.map((t) => t.columnId))];
	if (columnIds.length === 0) return [];

	const members = await db
		.select({ columnId: passageSection.passageColumnId })
		.from(passageSegment)
		.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
		.where(inArray(passageSection.passageColumnId, columnIds));
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const m of members) counts.set(m.columnId, (counts.get(m.columnId) ?? 0) + 1);

	return targets.filter((t) => (counts.get(t.columnId) ?? 0) < 2).map((t) => t.id);
}
