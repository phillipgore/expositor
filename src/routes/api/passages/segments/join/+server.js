import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeJoin, joinSegment } from '$lib/server/db/passageJoin.js';
import { analyzeCrossPartJoin, joinSegmentAcrossBoundary } from '$lib/server/db/crossPartJoin.js';
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

		// ── Routing: within-passage vs across a boundary (SERIES_PLAN §8) ──
		//
		// The existing path is left completely untouched for the common case. Only when the segment is
		// the FIRST in its passage — where `joinSegment()` throws "Cannot join the first segment in a
		// passage", a sentence that is false once a previous passage exists and abuts — is the
		// cross-boundary path used.
		//
		// The decision is made by `analyzeCrossPartJoin`, never by the client: `crossesBoundary` is a
		// fact about stored ranges, and a client that guessed wrong would either get a misleading
		// refusal or silently move a boundary the user did not intend to move.
		//
		// `passageId` is optional so existing callers keep working; without it the cross-part path
		// cannot be reached, which fails closed — the old error rather than a wrong join.
		let cross = null;
		if (passageId) {
			cross = await analyzeCrossPartJoin(db, session.user.id, passageId, segmentId);
		}

		if (dryRun) {
			if (cross?.ok && cross.crossesBoundary) {
				return json(
					{
						success: true,
						crossesBoundary: true,
						// A cross-part join always needs confirmation: it moves verses between parts, and
						// Q35 leaves the app with no undo.
						needsDecision: true,
						summary: cross.summary,
						hasTarget: true,
						noteWillTruncate: false,
						versesMoved: cross.versesMoved,
						display: cross.display
					},
					{ status: 200 }
				);
			}

			// A cross-part join that is REFUSED reports its own reason, which distinguishes a permanently
			// ineligible seam from having no neighbour at all (§11). Without this the client would fall
			// through to analyzeJoin and surface the passage-scoped message instead.
			if (cross && !cross.ok) {
				return json({ error: cross.reason }, { status: 400 });
			}

			const result = await analyzeJoin(db, session.user.id, 'segment', segmentId);
			return json({ success: true, crossesBoundary: false, ...result }, { status: 200 });
		}

		if (cross?.ok && cross.crossesBoundary) {
			const result = await joinSegmentAcrossBoundary(
				db,
				session.user.id,
				passageId,
				segmentId,
				decision
			);
			return json({ success: true, ...result }, { status: 200 });
		}

		if (cross && !cross.ok) {
			return json({ error: cross.reason }, { status: 400 });
		}

		await joinSegment(db, session.user.id, segmentId, decision);

		return json({ success: true, crossedBoundary: false }, { status: 200 });
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
