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

		const {
			passageId,
			columnId,
			decision = 'merge',
			dryRun = false,
			// 'previous' = Join Up (fold this item into what precedes it); 'next' = Join Down (absorb what
			// follows). `routeJoin` rewrites 'next' into the equivalent backwards join, so this endpoint
			// stays a thin pass-through rather than gaining a second code path.
			direction = 'previous'
		} = await request.json();
		if (!columnId) {
			return json({ error: 'Missing required field: columnId' }, { status: 400 });
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

		const { status, body } = await routeJoin({
			db,
			userId: session.user.id,
			passageId,
			itemId: columnId,
			granularity: 'column',
			decision,
			dryRun,
			direction,
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
