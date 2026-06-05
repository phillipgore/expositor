import { db } from '$lib/server/db/index.js';
import { passageSegment } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, params }) {
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const segmentId = params.id;
		
		// Fetch segment from database
		const segments = await db.select()
			.from(passageSegment)
			.where(eq(passageSegment.id, segmentId))
			.limit(1);

		if (segments.length === 0) {
			return json({ error: 'Segment not found' }, { status: 404 });
		}

		return json(segments[0]);
	} catch (error) {
		console.error('Error fetching segment:', error);
		return json({ error: 'Failed to fetch segment' }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ request, params }) {
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { commentary, height } = body;
		const segmentId = params.id;

		// Validate commentary
		if (commentary !== undefined && typeof commentary !== 'string') {
			return json({ error: 'Invalid commentary' }, { status: 400 });
		}

		// Validate height: must be null (flexible) or a positive integer (pixels)
		if (height !== undefined && height !== null) {
			if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
				return json({ error: 'Invalid height' }, { status: 400 });
			}
		}

		// Build the update set from only the provided fields so callers can
		// patch commentary and height independently.
		/** @type {Record<string, unknown>} */
		const updateData = { updatedAt: new Date() };
		if (commentary !== undefined) updateData.commentary = commentary;
		if (height !== undefined) updateData.height = height === null ? null : Math.round(height);

		await db.update(passageSegment)
			.set(updateData)
			.where(eq(passageSegment.id, segmentId));

		return json({ success: true });
	} catch (error) {
		console.error('Error updating segment:', error);
		return json({ error: 'Failed to update segment' }, { status: 500 });
	}
}

