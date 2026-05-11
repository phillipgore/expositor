import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { segmentConnection, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

const VALID_TYPES = ['segment', 'section', 'column'];

/**
 * Reroute one end of a connection (drag-and-drop).
 *
 * Each end (from / to) is updated independently.
 * Only the fields for the updated end change — the other end is preserved exactly.
 * This allows cross-type connections: e.g. fromType='segment', toType='section'.
 *
 * Body (update the FROM end):
 *   { fromType: 'section', fromSectionId: '<id>' }
 *
 * Body (update the TO end):
 *   { toType: 'column', toColumnId: '<id>' }
 *
 * Both ends can be updated simultaneously if needed:
 *   { fromType: 'segment', fromSegmentId: '<id>', toType: 'column', toColumnId: '<id>' }
 *
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;
		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		const body = await request.json();

		// Check what the caller wants to update
		const updatingFrom = 'fromType' in body || 'fromSegmentId' in body || 'fromSectionId' in body || 'fromColumnId' in body;
		const updatingTo   = 'toType'   in body || 'toSegmentId'   in body || 'toSectionId'   in body || 'toColumnId'   in body;

		if (!updatingFrom && !updatingTo) {
			return json({ error: 'Must provide at least one from* or to* field to update' }, { status: 400 });
		}

		// Validate types if provided
		if (body.fromType && !VALID_TYPES.includes(body.fromType)) {
			return json({ error: 'Invalid fromType' }, { status: 400 });
		}
		if (body.toType && !VALID_TYPES.includes(body.toType)) {
			return json({ error: 'Invalid toType' }, { status: 400 });
		}

		// Fetch the existing connection
		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		// Verify ownership
		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to update this connection' }, { status: 403 });
		}

		// ── Build the update object ────────────────────────────────────────────
		// Strategy: start from the current connection values, then apply only
		// the fields the caller provided.  Each end is handled independently.
		const updates = { updatedAt: new Date() };

		if (updatingFrom) {
			const newFromType = body.fromType ?? connection.fromType;

			if (!VALID_TYPES.includes(newFromType)) {
				return json({ error: 'Invalid fromType' }, { status: 400 });
			}

			updates.fromType = newFromType;

			// Set the correct ID for the new from type; clear the others
			updates.fromSegmentId = newFromType === 'segment'
				? (body.fromSegmentId ?? (connection.fromType === 'segment' ? connection.fromSegmentId : null))
				: null;
			updates.fromSectionId = newFromType === 'section'
				? (body.fromSectionId ?? (connection.fromType === 'section' ? connection.fromSectionId : null))
				: null;
			updates.fromColumnId  = newFromType === 'column'
				? (body.fromColumnId  ?? (connection.fromType === 'column'  ? connection.fromColumnId  : null))
				: null;
		}

		if (updatingTo) {
			const newToType = body.toType ?? connection.toType;

			if (!VALID_TYPES.includes(newToType)) {
				return json({ error: 'Invalid toType' }, { status: 400 });
			}

			updates.toType = newToType;

			// Set the correct ID for the new to type; clear the others
			updates.toSegmentId = newToType === 'segment'
				? (body.toSegmentId ?? (connection.toType === 'segment' ? connection.toSegmentId : null))
				: null;
			updates.toSectionId = newToType === 'section'
				? (body.toSectionId ?? (connection.toType === 'section' ? connection.toSectionId : null))
				: null;
			updates.toColumnId  = newToType === 'column'
				? (body.toColumnId  ?? (connection.toType === 'column'  ? connection.toColumnId  : null))
				: null;
		}

		const [updated] = await db
			.update(segmentConnection)
			.set(updates)
			.where(eq(segmentConnection.id, connectionId))
			.returning();

		return json(updated, { status: 200 });
	} catch (error) {
		console.error('Patch connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Delete a connection.
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;
		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to delete this connection' }, { status: 403 });
		}

		await db.delete(segmentConnection).where(eq(segmentConnection.id, connectionId));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Delete connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
