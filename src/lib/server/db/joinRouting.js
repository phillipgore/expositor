/**
 * # Routing a Join between the within-passage and cross-boundary paths (SERIES_PLAN §8)
 *
 * The three Join endpoints — column, section, segment — differ only in which id field they read and
 * which within-passage function they call. Their *routing* is identical: ask whether the join crosses a
 * passage boundary, and dispatch accordingly.
 *
 * Extracted rather than copied three times because the routing carries two decisions that must not
 * drift apart per granularity:
 *
 * - **The client never decides.** `crossesBoundary` is a fact about stored ranges, so it is computed
 *   server-side. A client that guessed would either get a misleading refusal or silently move a
 *   boundary the user did not intend to move.
 * - **A refused cross-part join reports its OWN reason**, not the passage-scoped one. §11 requires
 *   "these parts aren't adjacent in Scripture" to be distinguishable from "not available yet", and
 *   falling through to `analyzeJoin()` would surface the older, now-misleading message.
 *
 * @module joinRouting
 */

import { analyzeCrossPartJoin, joinAcrossBoundary } from './crossPartJoin.js';

/**
 * Decide and perform a Join, routing across a boundary when necessary.
 *
 * `passageId` is optional so pre-existing callers keep working: without it the cross-part path cannot
 * be reached, which fails closed — the original error rather than a wrong join.
 *
 * @param {Object} params
 * @param {Object} params.db
 * @param {string} params.userId
 * @param {string|null} params.passageId
 * @param {string} params.itemId
 * @param {'segment'|'section'|'column'} params.granularity
 * @param {'merge'|'delete'} params.decision
 * @param {boolean} params.dryRun
 * @param {Function} params.analyzeWithinPassage - `(db, userId, granularity, itemId) => Promise<Object>`
 * @param {Function} params.joinWithinPassage - `(db, userId, itemId, decision) => Promise<void>`
 * @returns {Promise<{ status: number, body: Object }>}
 */
export async function routeJoin({
	db,
	userId,
	passageId,
	itemId,
	granularity,
	decision,
	dryRun,
	analyzeWithinPassage,
	joinWithinPassage
}) {
	const cross = passageId
		? await analyzeCrossPartJoin(db, userId, passageId, itemId, granularity)
		: null;

	if (dryRun) {
		if (cross?.ok && cross.crossesBoundary) {
			return {
				status: 200,
				body: {
					success: true,
					crossesBoundary: true,
					// A cross-part join always confirms: it moves verses between parts, and Q35 leaves the
					// app with no undo. For a section or column there is no foldable content, so the modal
					// would otherwise skip straight to acting.
					needsDecision: true,
					summary: cross.summary,
					hasTarget: true,
					noteWillTruncate: false,
					versesMoved: cross.versesMoved,
					display: cross.display
				}
			};
		}

		if (cross && !cross.ok) {
			return { status: 400, body: { error: cross.reason } };
		}

		const result = await analyzeWithinPassage(db, userId, granularity, itemId);
		return { status: 200, body: { success: true, crossesBoundary: false, ...result } };
	}

	if (cross?.ok && cross.crossesBoundary) {
		const result = await joinAcrossBoundary(db, userId, passageId, itemId, decision, granularity);
		return { status: 200, body: { success: true, ...result } };
	}

	if (cross && !cross.ok) {
		return { status: 400, body: { error: cross.reason } };
	}

	await joinWithinPassage(db, userId, itemId, decision);
	return { status: 200, body: { success: true, crossedBoundary: false } };
}
