import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { moveSegmentTextUp, moveSegmentTextDown } from '$lib/server/db/utils.js';
import { analyzeCrossPartMove, moveTextAcrossBoundary } from '$lib/server/db/crossPartMove.js';
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

		const { passageId, segmentId, insertionWordId, direction, dryRun } = await request.json();

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

		// ── Routing: within-passage vs across a boundary (SERIES_PLAN §8, commands 4 and 5) ──
		//
		// Decided server-side, never by the client: whether the caret's neighbour lies in another passage
		// is a fact about stored ranges. The passage-local path runs the original functions untouched.
		const cross = await analyzeCrossPartMove(
			db,
			session.user.id,
			passageId,
			segmentId,
			insertionWordId,
			direction
		);

		// ── The dry run: refuse before the gesture, never after it ──
		//
		// ⚠️ This is a PRE-FLIGHT CHECK, not a confirmation step. A cross-part move can be refused for
		// reasons the client cannot evaluate — the caret must sit at the start of a verse, and the seam
		// must be eligible — so asking first turns "why did nothing happen?" into a sentence that
		// explains itself.
		//
		// It deliberately does NOT gate a confirm dialog. An earlier version returned
		// `needsDecision: true` here and the client opened a "cannot be undone" modal, by analogy with
		// the cross-part Join. The analogy is false: a Join deletes an item and nothing restores it,
		// whereas a move only relocates a boundary — the user reverses it by moving the text back. The
		// modal interrupted a reversible, repeatable gesture to assert something untrue, so it is gone.
		//
		// `display` still travels: §10.1 requires both parts re-validated, and the caller may surface a
		// warning the move creates or clears.
		if (dryRun) {
			if (cross.ok && cross.crossesBoundary) {
				return json(
					{
						success: true,
						crossesBoundary: true,
						versesMoved: cross.versesMoved,
						display: cross.display
					},
					{ status: 200 }
				);
			}

			// A refused cross-part move reports its OWN reason here too, so the refusal arrives BEFORE
			// the gesture rather than after it.
			if (!cross.ok && cross.crossesBoundary) {
				return json({ error: cross.reason }, { status: 400 });
			}

			return json({ success: true, crossesBoundary: false }, { status: 200 });
		}

		if (cross.ok && cross.crossesBoundary) {
			const result = await moveTextAcrossBoundary(
				db,
				session.user.id,
				passageId,
				segmentId,
				insertionWordId,
				direction
			);
			return json({ success: true, ...result }, { status: 200 });
		}

		// A refused cross-part move reports its OWN reason — an ineligible seam, or the mid-verse caret
		// restriction. Falling through to the passage-local function would instead raise "no next segment
		// exists", which is false whenever a next part abuts and is the §11 failure of describing a
		// boundary in terms that do not name it.
		if (!cross.ok && cross.crossesBoundary) {
			return json({ error: cross.reason }, { status: 400 });
		}

		if (direction === 'up') {
			await moveSegmentTextUp(db, session.user.id, passageId, segmentId, insertionWordId);
		} else {
			await moveSegmentTextDown(db, session.user.id, passageId, segmentId, insertionWordId);
		}

		return json({ success: true, crossedBoundary: false }, { status: 200 });
	} catch (error) {
		console.error('Move segment text error:', error);

		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// ── Q41: a display-limit refusal is 409, not 400 ─────────────────
		//
		// The request is well-formed and the STATE is the obstacle, which is the same distinction
		// `joinRouting.js` draws. `display` rides along so the client can explain which part would
		// breach rather than repeating a bare sentence. Refused before any write, so nothing is
		// half-applied.
		if (error.blocked) {
			return json({ error: error.message, display: error.display, blocked: true }, { status: 409 });
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
