import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { updateSegmentHeading } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth.js';

/**
 * Update a segment's heading
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { segmentId, headingType, headingText } = await request.json();

		// Validate inputs
		if (!segmentId || !headingType) {
			return json({ error: 'Missing required fields: segmentId and headingType' }, { status: 400 });
		}

		// Validate headingType
		if (!['one', 'two', 'three'].includes(headingType)) {
			return json({ error: 'Invalid headingType. Must be one, two, or three' }, { status: 400 });
		}

		// Perform the heading update
		await updateSegmentHeading(db, session.user.id, segmentId, headingType, headingText);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update segment heading error:', error);
		
		// Return specific error messages for known validation errors
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		if (error.message.includes('Segment not found') || error.message.includes('not authorized')) {
			return json({ error: error.message }, { status: 400 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
