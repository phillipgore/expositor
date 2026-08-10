import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeJoin, joinColumn } from '$lib/server/db/passageJoin.js';
import { routeJoin } from '$lib/server/db/joinRouting.js';
import { auth } from '$lib/server/auth.js';

/**
 * Join a column into the column immediately preceding it.
 *
 * Body: { passageId, columnId, decision?, dryRun? }
 *   - dryRun: true → returns { needsDecision, summary, crossesBoundary } without mutating.
 *   - decision: 'merge' (default) | 'delete'.
 *
 * The preceding column may live in a **different passage** — an earlier passage of the same study, or
 * the previous part of a series (SERIES_PLAN §8). `routeJoin` dispatches: within-passage joins run the
 * original code untouched, cross-boundary ones go to `crossPartJoin.js`, which also moves the verses.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, columnId, decision = 'merge', dryRun = false } = await request.json();
		if (!columnId) {
			return json({ error: 'Missing required field: columnId' }, { status: 400 });
		}

		const { status, body } = await routeJoin({
			db,
			userId: session.user.id,
			passageId,
			itemId: columnId,
			granularity: 'column',
			decision,
			dryRun,
			analyzeWithinPassage: analyzeJoin,
			joinWithinPassage: joinColumn
		});

		return json(body, { status });
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
