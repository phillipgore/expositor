import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { insertColumn } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth.js';

/**
 * Insert a new column at the specified word ID
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, columnId, sectionId, segmentId, insertionWordId } = await request.json();

		// Validate inputs
		if (!passageId || !columnId || !sectionId || !segmentId || !insertionWordId) {
			return json({ error: 'Missing required fields: passageId, columnId, sectionId, segmentId, and insertionWordId' }, { status: 400 });
		}

		// Perform the column insertion
		await insertColumn(db, session.user.id, passageId, columnId, sectionId, segmentId, insertionWordId);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Insert column error:', error);
		
		// Return specific error messages for known validation errors
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		if (error.message.includes('Cannot insert column')) {
			return json({ error: error.message }, { status: 400 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
