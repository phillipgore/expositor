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
		const { commentary } = await request.json();
		const segmentId = params.id;
		
		// Validate commentary
		if (commentary !== undefined && typeof commentary !== 'string') {
			return json({ error: 'Invalid commentary' }, { status: 400 });
		}

		// Update segment commentary
		await db.update(passageSegment)
			.set({ 
				commentary,
				updatedAt: new Date()
			})
			.where(eq(passageSegment.id, segmentId));

		return json({ success: true });
	} catch (error) {
		console.error('Error updating segment commentary:', error);
		return json({ error: 'Failed to update commentary' }, { status: 500 });
	}
}
