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
import { resolveScope } from '$lib/utils/sequenceScope.js';
import { loadPassageSequence } from './passageSequence.js';

/**
 * Resolve a Join Down into the equivalent Join Up.
 *
 * ## Why Join Down is not its own operation
 *
 * Structure here is **anchor-based**: a segment owns a `startingWordId` and runs until the next
 * anchor begins. A join is therefore not "move content from A to B" but "remove one anchor", and the
 * item that survives is always the EARLIER of the pair — its anchor is the one left standing.
 *
 * So "join X with what follows it" and "join X's successor into X" are not merely similar, they are
 * the *same write*: delete the successor's anchor. Rather than mirror every piece of arithmetic in
 * `passageJoin.js` and `crossPartJoin.js` for a second direction — including the cross-part boundary
 * rule that `probe-cross-part-join.mjs` pins, where the new boundary is the first segment that STAYS —
 * Join Down resolves the successor here and hands it to the existing, audited backwards path.
 *
 * That also means a Join Down and the Join Up a user could perform by selecting the next item cannot
 * drift apart: there is only one implementation.
 *
 * ⚠️ Resolution is server-side, via `resolveScope`, for the reason the module header already gives:
 * the successor may live in a **different passage or part**, which is precisely the case the user
 * cannot reach by selecting it, and a client-side guess would be the "client decides" failure this
 * module exists to prevent.
 *
 * @returns {Promise<{ ok: true, itemId: string, passageId: string } | { ok: false, reason: string }>}
 */
async function resolveJoinDownTarget({ db, userId, passageId, itemId, granularity }) {
	if (!passageId) {
		// Fail closed: without a sequence the successor cannot be resolved, and guessing at it on a
		// destructive command is worse than refusing.
		return { ok: false, reason: 'Join Down needs to know which passage this item is in.' };
	}

	const loaded = await loadPassageSequence(db, userId, passageId);
	if (!loaded) return { ok: false, reason: 'Passage not found.' };

	const scope = resolveScope({
		sequence: loaded.sequence,
		granularity,
		itemId,
		direction: 'next'
	});

	if (!scope.ok) return { ok: false, reason: scope.reason };

	// The successor becomes the item to join BACKWARDS, and it is re-scoped to its own passage: it may
	// live in a different one, and every downstream site resolves the sequence from the passage id it
	// is handed. Passing the original passage would silently analyse the wrong seam.
	return {
		ok: true,
		itemId: scope.target.id,
		passageId: scope.target.passageId
	};
}

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
 * @param {'previous'|'next'} [params.direction='previous'] - 'previous' joins the item into what precedes it (Join Up); 'next' joins what follows it into the item (Join Down), resolved to the same write
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
	direction = 'previous',
	analyzeWithinPassage,
	joinWithinPassage
}) {
	// Join Down is rewritten to the equivalent Join Up BEFORE anything else looks at the request, so
	// every line below — routing, refusal, boundary arithmetic, the confirm summary — runs on exactly
	// one direction. See `resolveJoinDownTarget` for why the two are the same write.
	if (direction === 'next') {
		const resolved = await resolveJoinDownTarget({ db, userId, passageId, itemId, granularity });
		if (resolved.ok === false) return { status: 400, body: { error: resolved.reason } };
		itemId = resolved.itemId;
		passageId = resolved.passageId;
	}

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
		// ── Q41: refuse BEFORE writing, never mid-gesture ────────────────────
		//
		// `blocked` is computed by the same analysis the dry run showed the user, so a move the dialog
		// presented as permissible cannot be refused here, and one it presented as blocked offers no
		// confirm button to reach this line. Today `enforcement` is 'warn' everywhere, so this never
		// fires — it exists so that flipping the flag produces a clean, explained refusal rather than a
		// half-applied move, which is the failure COMPLIANCE.md §1.6 warns about.
		//
		// 409, not 400: the request is well-formed and the state is the obstacle.
		if (cross.display?.blocked) {
			return {
				status: 409,
				body: {
					error:
						'Moving this boundary would show more of the book than the licence allows in one part.',
					display: cross.display,
					blocked: true
				}
			};
		}

		const result = await joinAcrossBoundary(db, userId, passageId, itemId, decision, granularity);
		return { status: 200, body: { success: true, ...result } };
	}

	if (cross && !cross.ok) {
		return { status: 400, body: { error: cross.reason } };
	}

	await joinWithinPassage(db, userId, itemId, decision);
	return { status: 200, body: { success: true, crossedBoundary: false } };
}
