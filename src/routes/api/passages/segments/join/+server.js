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

		const {
			passageId,
			segmentId,
			decision = 'merge',
			dryRun = false,
			// 'previous' = Join Up (fold this item into what precedes it); 'next' = Join Down (absorb what
			// follows). `routeJoin` rewrites 'next' into the equivalent backwards join, so this endpoint
			// stays a thin pass-through rather than gaining a second code path.
			direction = 'previous'
		} = await request.json();
		if (!segmentId) {
			return json({ error: 'Missing required field: segmentId' }, { status: 400 });
		}

		// `passageId` is required for BOTH directions, though `routeJoin` still treats it as optional
		// for older callers. That asymmetry shipped as a live defect: the client briefly sent no
		// passage at all, and Join Down said so loudly while Join Up quietly took the
		// optional-passage branch — running a within-passage join while having silently lost the
		// ability to cross a boundary. A capability that disappears without complaint is worse than
		// a refusal, so both directions now fail here in the same way.
		if (!passageId) {
			return json({ error: 'Missing required field: passageId' }, { status: 400 });
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
			direction,
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
