import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { moveSegmentTextUp, moveSegmentTextDown } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth.js';

/**
 * Move text within a segment either up into the preceding segment or down into the next segment.
 * 
 * Move Text Up: Updates the active segment's startingWordId to the caret position.
 *   Words before the caret automatically fall to the preceding segment.
 * 
 * Move Text Down: Updates the next segment's startingWordId to the caret position.
 *   Words at/after the caret move into the next segment.
 * 
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, segmentId, insertionWordId, direction } = await request.json();

		// Validate inputs
		if (!passageId || !segmentId || !insertionWordId || !direction) {
			return json(
				{ error: 'Missing required fields: passageId, segmentId, insertionWordId, and direction' },
				{ status: 400 }
			);
		}

		if (direction !== 'up' && direction !== 'down') {
			return json({ error: 'direction must be "up" or "down"' }, { status: 400 });
		}

		if (direction === 'up') {
			await moveSegmentTextUp(db, session.user.id, passageId, segmentId, insertionWordId);
		} else {
			await moveSegmentTextDown(db, session.user.id, passageId, segmentId, insertionWordId);
		}

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Move segment text error:', error);

		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (
			error.message.includes('Cannot move text') ||
			error.message.includes('Segment not found') ||
			error.message.includes('no next segment')
		) {
			return json({ error: error.message }, { status: 400 });
		}

		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
