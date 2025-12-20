import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { insertSplit } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth.js';

/**
 * Insert a new split at the specified word ID
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, columnId, splitId, segmentId, insertionWordId } = await request.json();

		// Validate inputs
		if (!passageId || !columnId || !splitId || !segmentId || !insertionWordId) {
			return json({ error: 'Missing required fields: passageId, columnId, splitId, segmentId, and insertionWordId' }, { status: 400 });
		}

		// Perform the split insertion
		await insertSplit(db, session.user.id, passageId, columnId, splitId, segmentId, insertionWordId);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Insert split error:', error);
		
		// Return specific error messages for known validation errors
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		if (error.message.includes('Cannot insert split')) {
			return json({ error: error.message }, { status: 400 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
