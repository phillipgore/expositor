import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { segmentConnection, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

/**
 * Update one end of a segment connection (drag-and-drop reroute)
 * Body: { fromSegmentId?: string, toSegmentId?: string }
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
		const { fromSegmentId, toSegmentId } = body;

		if (!fromSegmentId && !toSegmentId) {
			return json({ error: 'Must provide fromSegmentId or toSegmentId' }, { status: 400 });
		}

		// Find the connection
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

		// Build the update — only update the fields provided
		const updates = {};
		if (fromSegmentId) updates.fromSegmentId = fromSegmentId;
		if (toSegmentId) updates.toSegmentId = toSegmentId;

		const [updated] = await db
			.update(segmentConnection)
			.set(updates)
			.where(eq(segmentConnection.id, connectionId))
			.returning();

		return json(updated, { status: 200 });
	} catch (error) {
		console.error('Patch segment connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Delete a segment connection
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ params, request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const connectionId = params.id;

		if (!connectionId) {
			return json({ error: 'Missing connection ID' }, { status: 400 });
		}

		// Find the connection
		const connectionResult = await db
			.select()
			.from(segmentConnection)
			.where(eq(segmentConnection.id, connectionId))
			.limit(1);

		if (connectionResult.length === 0) {
			return json({ error: 'Connection not found' }, { status: 404 });
		}

		const connection = connectionResult[0];

		// Verify the connection belongs to a study owned by the current user
		const studyResult = await db
			.select()
			.from(study)
			.where(and(eq(study.id, connection.studyId), eq(study.userId, session.user.id)))
			.limit(1);

		if (studyResult.length === 0) {
			return json({ error: 'Not authorized to delete this connection' }, { status: 403 });
		}

		// Delete the connection
		await db.delete(segmentConnection).where(eq(segmentConnection.id, connectionId));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Delete segment connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
