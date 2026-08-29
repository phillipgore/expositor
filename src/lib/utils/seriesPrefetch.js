/**
 * # Adjacent-part prefetch: deciding what to warm (SERIES_PLAN §11, phase 2)
 *
 * Navigating a series is the one place in the app where the *next* thing a user will open is
 * predictable: from part 7 they overwhelmingly go to part 8, and §7 gives them `⌥→` and a prev/next
 * pair to do it with. `passage.cachedText` already makes a second visit fast; this decides which
 * neighbour's cache to warm so the *first* visit is fast too.
 *
 * Pure, so the choice is verifiable without a database or a network — the same split every other
 * phase-2 layer uses.
 *
 * ## What it deliberately does NOT do
 *
 * - **It does not prefetch a part that is already cached.** Every passage of a candidate must have
 *   empty `cachedText` for it to be worth a request; a partially cached part is skipped rather than
 *   half-fetched, because a partial warm still leaves the page waiting on the missing passage and has
 *   spent a request to achieve nothing.
 * - **It never prefetches more than one part.** The next part is a strong prediction; the one after it
 *   is a guess, and each extra part is real traffic against a provider whose rate limit is shared with
 *   the page the user is actually reading. §11.1's rule applies by analogy: do not spend an unmeasured
 *   cost to fix an unmeasured problem.
 * - **It does not consider contiguity.** Prefetch is about what the user will *open*, not about what
 *   is joinable — `seriesOrder` is what prev/next follows (§7), so a Prison Epistles series prefetches
 *   its next part exactly like a Romans one. This is the one place in the feature where the adjacency
 *   predicate is deliberately NOT consulted, which is worth saying because every other decision here
 *   does consult it.
 *
 * @module seriesPrefetch
 */

import { getCachingLimits } from './translationLimits.js';

/**
 * Which part's text should be warmed after landing on `currentPartId`.
 *
 * Direction follows the user's most likely next move: forwards. §7 gives prev/next equal standing in
 * the UI, but a reader moving through a series moves through it in order, and prefetching both
 * neighbours would double the traffic to serve the less likely case.
 *
 * ⚠️ Returns `null` rather than throwing for every "nothing to do" case — an unknown part, the last
 * part, an already-cached neighbour. A prefetch is an optimisation, so failing to find work is a normal
 * outcome and must not be able to break the page load that triggered it.
 *
 * @param {Object} params
 * @param {Array<Object>} params.parts - Every part of the series, each with `id`, `seriesOrder` and `passages`
 * @param {string} params.currentPartId
 * @param {'next'|'previous'} [params.direction='next']
 * @param {string} [params.translationId] - Consulted so a translation with a local-storage cap is never
 *   prefetched for (COMPLIANCE.md §5 item 1). Omitting it prefetches, which keeps pre-existing callers working.
 * @returns {{ partId: string, passages: Array<Object> }|null}
 */
export function selectPrefetchTarget({ parts, currentPartId, direction = 'next', translationId }) {
	if (!Array.isArray(parts) || parts.length < 2) return null;

	// ⚠️ **Never store text speculatively for a translation with a local-storage cap.**
	//
	// The ESV terms forbid locally storing more than 500 verses or half a book. COMPLIANCE.md §5 item 1
	// called the unbounded `passage.cachedText` "the one genuine violation"; that item is now **closed**
	// by eviction at the cap (`planCacheEviction()` / `enforceCacheLimit()`).
	//
	// ⚠️ This guard is NOT superseded by that fix, and the reason is worth keeping: prefetch writes the
	// text of a part the user has NOT opened, so those verses have no user-facing purpose at all. Storing
	// them and then evicting them spends a provider request to achieve nothing — declining is strictly
	// better than correcting.
	//
	// Caching what someone is reading is service operation with a rationale; caching what they may never
	// read is storage with none. Skipped for ESV; NET declares no caching cap and is unaffected, which is
	// the same read-the-source rule the decisions log's "limit message attribution" row demands.
	if (translationId && getCachingLimits(translationId).maxVerses !== null) return null;

	// `seriesOrder` is the user's arrangement and §4 forbids re-deriving it, so it is sorted by, never
	// recomputed. A series deliberately teaching Romans 8 first prefetches whatever the user put second.
	const ordered = [...parts].sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));
	const index = ordered.findIndex((part) => part.id === currentPartId);
	if (index === -1) return null;

	const neighbour = direction === 'next' ? ordered[index + 1] : ordered[index - 1];
	if (!neighbour) return null;

	const passages = Array.isArray(neighbour.passages) ? neighbour.passages : [];
	if (passages.length === 0) return null;

	// Only worth a request if EVERY passage is cold. See the module note: warming some of a part still
	// leaves the page waiting, so a partial warm spends traffic for no perceptible gain.
	//
	// ⚠️ Both spellings are accepted. A caller holding full rows has `cachedText`; the study layout
	// instead selects `hasCachedText` as a boolean, because `cachedText` is the whole processed HTML of a
	// passage and pulling an entire series' text into memory to answer a yes/no question would cost more
	// than the prefetch saves. Reading only one spelling would make the other silently look "all cold"
	// and re-fetch text that is already cached — the COMPLIANCE §1.8 shape of bug, since it would still
	// appear to work.
	const isCold = (p) => (p.hasCachedText === undefined ? !p.cachedText : !p.hasCachedText);
	const cold = passages.filter(isCold);
	if (cold.length !== passages.length) return null;

	return { partId: neighbour.id, passages: cold };
}
