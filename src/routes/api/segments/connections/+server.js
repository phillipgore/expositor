import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { segmentConnection, passageSegment, passage, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create a new segment connection
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { studyId, fromSegmentId, toSegmentId } = await request.json();

		// Validate inputs
		if (!studyId || !fromSegmentId || !toSegmentId) {
			return json({ error: 'Missing required fields: studyId, fromSegmentId, toSegmentId' }, { status: 400 });
		}

		if (fromSegmentId === toSegmentId) {
			return json({ error: 'Cannot connect a segment to itself' }, { status: 400 });
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

		// Check for duplicate connection (either direction)
		const existing = await db
			.select()
			.from(segmentConnection)
			.where(
				and(
					eq(segmentConnection.studyId, studyId),
					or(
						and(
							eq(segmentConnection.fromSegmentId, fromSegmentId),
							eq(segmentConnection.toSegmentId, toSegmentId)
						),
						and(
							eq(segmentConnection.fromSegmentId, toSegmentId),
							eq(segmentConnection.toSegmentId, fromSegmentId)
						)
					)
				)
			)
			.limit(1);

		if (existing.length > 0) {
			return json({ error: 'A connection between these segments already exists' }, { status: 409 });
		}

		// Create the connection
		const newConnection = {
			id: uuidv4(),
			studyId,
			fromSegmentId,
			toSegmentId,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		await db.insert(segmentConnection).values(newConnection);

		return json({ success: true, connection: newConnection }, { status: 201 });
	} catch (error) {
		console.error('Create segment connection error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
