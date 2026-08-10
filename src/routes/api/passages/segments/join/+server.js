import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeJoin, joinSegment } from '$lib/server/db/passageJoin.js';
import { routeJoin } from '$lib/server/db/joinRouting.js';
import { auth } from '$lib/server/auth.js';

/**
 * Join a segment into the segment immediately preceding it.
 *
 * Body: { passageId, segmentId, decision?, dryRun? }
 *   - dryRun: true → returns { needsDecision, summary, crossesBoundary } without mutating.
 *   - decision: 'merge' (default) | 'delete'.
 *
 * The preceding segment may live in a **different passage** — an earlier passage of the same study, or
 * the previous part of a series (SERIES_PLAN §8). That case moves verses between passages as well as
 * folding content, so it is routed to `crossPartJoin.js`; the within-passage case runs the original
 * code unchanged.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, segmentId, decision = 'merge', dryRun = false } = await request.json();
		if (!segmentId) {
			return json({ error: 'Missing required field: segmentId' }, { status: 400 });
		}

		// Routing is shared with the section and column endpoints (`joinRouting.js`) so all three
		// dispatch identically: the client never decides whether a join crosses a boundary, and a
		// refused cross-part join reports its own §11 reason rather than the passage-scoped one.
		const { status, body } = await routeJoin({
			db,
			userId: session.user.id,
			passageId,
			itemId: segmentId,
			granularity: 'segment',
			decision,
			dryRun,
			analyzeWithinPassage: analyzeJoin,
			joinWithinPassage: joinSegment
		});

		return json(body, { status });
	} catch (error) {
		console.error('Join segment error:', error);
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (error.message.includes('Cannot join') || error.message.includes('not found')) {
			return json({ error: error.message }, { status: 400 });
		}
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
