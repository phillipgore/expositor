import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { segmentConnection, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { resolveStructureOwners } from '$lib/server/db/structureOwners.js';

/**
 * Get the relevant ID field for a given type and end.
 * @param {object} body @param {'from'|'to'} end @param {string} type
 * @returns {string|null}
 */
function getIdForType(body, end, type) {
	if (type === 'segment') return end === 'from' ? body.fromSegmentId : body.toSegmentId;
	if (type === 'section') return end === 'from' ? body.fromSectionId : body.toSectionId;
	if (type === 'column')  return end === 'from' ? body.fromColumnId  : body.toColumnId;
	return null;
}

/**
 * Create a new connection.
 * Supports same-type AND cross-type connections (e.g. segment ↔ section).
 *
 * Body:
 * {
 *   studyId:        string,
 *   fromType:       'segment' | 'section' | 'column'   (default: 'segment')
 *   toType:         'segment' | 'section' | 'column'   (default: 'segment')
 *   fromSegmentId?: string,  fromSectionId?: string,  fromColumnId?: string,
 *   toSegmentId?:   string,  toSectionId?:   string,  toColumnId?:   string,
 *   seriesId?:      string   — allow ends in different parts of this series
 * }
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const {
			studyId,
			fromSegmentId, toSegmentId,
			fromSectionId, toSectionId,
			fromColumnId,  toColumnId
		} = body;

		const fromType = body.fromType || 'segment';
		const toType   = body.toType   || 'segment';

		// Validate types
		const VALID_TYPES = ['segment', 'section', 'column'];
		if (!VALID_TYPES.includes(fromType) || !VALID_TYPES.includes(toType)) {
			return json({ error: 'Invalid fromType or toType. Must be segment, section, or column.' }, { status: 400 });
		}

		// Resolve the actual IDs for each end
		const fromId = getIdForType(body, 'from', fromType);
		const toId   = getIdForType(body, 'to',   toType);

		if (!studyId || !fromId || !toId) {
			return json({ error: 'Missing required fields: studyId, and IDs matching fromType/toType' }, { status: 400 });
		}

		if (fromType === toType && fromId === toId) {
			return json({ error: 'Cannot connect an element to itself' }, { status: 400 });
		}

		// Verify the study belongs to the current user
		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Study not found or not authorized' }, { status: 403 });
		}

		// ── Cross-part connections (CROSS_PART_PLAN step 2) ──
		// With `seriesId`, the two ends may live in different parts of that series. Both ends must
		// resolve to a part of the series (and `studyId` must be one of those parts), so a connection
		// can never point into another user's study or outside the series. The row is owned by the
		// part holding the FROM end and carries `series_id`, which is how every part of the series
		// loads it (and draws it as an edge stub where only one end is present).
		let ownerStudyId = studyId;
		let rowSeriesId = null;
		if (body.seriesId) {
			const seriesId = String(body.seriesId);
			if (studyResult[0].seriesId !== seriesId) {
				return json({ error: 'Study is not part of that series' }, { status: 400 });
			}
			const owners = await resolveStructureOwners(db, [fromId, toId]);
			const fromPart = owners[fromId];
			const toPart = owners[toId];
			if (!fromPart || !toPart) {
				return json({ error: 'Connection endpoint not found' }, { status: 400 });
			}
			const parts = await db
				.select({ id: study.id })
				.from(study)
				.where(and(eq(study.seriesId, seriesId), eq(study.userId, session.user.id), inArray(study.id, [fromPart, toPart])));
			const partIds = new Set(parts.map((p) => p.id));
			if (!partIds.has(fromPart) || !partIds.has(toPart)) {
				return json({ error: 'Both ends must be in parts of this series' }, { status: 403 });
			}
			ownerStudyId = fromPart;
			// Only a link that really crosses parts needs the series scope.
			rowSeriesId = fromPart !== toPart ? seriesId : null;
		}

		// Build the new connection record
		const newConnection = {
			id: uuidv4(),
			studyId: ownerStudyId,
			seriesId: rowSeriesId,
			fromType,
			toType,
			fromSegmentId: fromType === 'segment' ? fromId : null,
			toSegmentId:   toType   === 'segment' ? toId   : null,
			fromSectionId: fromType === 'section' ? fromId : null,
			toSectionId:   toType   === 'section' ? toId   : null,
			fromColumnId:  fromType === 'column'  ? fromId : null,
			toColumnId:    toType   === 'column'  ? toId   : null,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		await db.insert(segmentConnection).values(newConnection);

		return json({ success: true, connection: newConnection }, { status: 201 });
	} catch (error) {
		console.error('Create connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
