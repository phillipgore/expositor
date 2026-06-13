import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeJoin, joinColumn } from '$lib/server/db/passageJoin.js';
import { auth } from '$lib/server/auth.js';

/**
 * Join a column into the column immediately preceding it.
 *
 * Body: { passageId, columnId, decision?, dryRun? }
 *   - dryRun: true → returns { needsDecision, summary } without mutating.
 *   - decision: 'merge' (default) | 'delete'.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { columnId, decision = 'merge', dryRun = false } = await request.json();
		if (!columnId) {
			return json({ error: 'Missing required field: columnId' }, { status: 400 });
		}

		if (dryRun) {
			const result = await analyzeJoin(db, session.user.id, 'column', columnId);
			return json({ success: true, ...result }, { status: 200 });
		}

		await joinColumn(db, session.user.id, columnId, decision);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Join column error:', error);
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (error.message.includes('Cannot join') || error.message.includes('not found')) {
			return json({ error: error.message }, { status: 400 });
		}
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
