import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { updateSegmentNote } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth.js';

/**
 * Update a segment's note
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { segmentId, noteText } = await request.json();

		// Validate inputs
		if (!segmentId) {
			return json({ error: 'Missing required field: segmentId' }, { status: 400 });
		}

		// Validate note length (140 character limit)
		if (noteText && noteText.length > 140) {
			return json({ error: 'Note exceeds 140 character limit' }, { status: 400 });
		}

		// Perform the note update
		await updateSegmentNote(db, session.user.id, segmentId, noteText);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update segment note error:', error);
		
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
