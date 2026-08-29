/**
 * # Warming an adjacent part's text cache (SERIES_PLAN §11, phase 2)
 *
 * `$lib/utils/seriesPrefetch.js` decides *which* part to warm; this performs the fetch and writes
 * `passage.cachedText`, so the next part loads from cache instead of from the provider.
 *
 * ## Fire-and-forget, and what that obliges
 *
 * The caller does not await this. That makes two things mandatory rather than optional:
 *
 * - **It can never throw into the caller.** Every failure is caught and logged. A provider outage must
 *   not surface on the page the user is currently reading, which is not the page being warmed.
 * - **It must not write anything a live read depends on.** It only fills `cachedText` where it was
 *   NULL, and `fetchPassagesTextWithCache` already declines to cache an errored or empty result, so a
 *   partial failure leaves the row exactly as it was — cold, and fetched live on demand as before.
 *
 * ## Why it re-checks the cache it was told is cold
 *
 * The decision was made from a snapshot taken during the page load. Between then and now the user may
 * have opened the next part themselves, or a concurrent request may have warmed it. Re-reading before
 * fetching turns a wasted provider request into a cheap indexed query.
 *
 * @module seriesPrefetchRunner
 */

import { db } from './index.js';
import { passage } from './schema.js';
import { eq, inArray, isNull, and } from 'drizzle-orm';
import { fetchPassagesTextWithCache } from '$lib/server/bibleApi.js';
import { enforceCacheLimit } from './cacheEvictionRunner.js';

/**
 * Fetch and cache the text of a prefetch target.
 *
 * @param {{ partId: string, passages: Array<{ id: string }> }} target - From `selectPrefetchTarget()`
 * @param {string} translation
 * @param {string} [userId] - Whose cache to re-check against the storage cap after warming
 *   (COMPLIANCE.md §5 item 1). Optional so pre-existing callers keep working; omitting it skips only the
 *   eviction pass, never the warm.
 * @returns {Promise<{ warmed: number, skipped: boolean }>} Reported for logging and tests; never throws
 */
export async function warmAdjacentPart(target, translation, userId) {
	try {
		const ids = (target?.passages ?? []).map((p) => p.id).filter(Boolean);
		if (ids.length === 0) return { warmed: 0, skipped: true };

		// Re-read, and take only rows still cold. `isNull` does the filtering in the database rather
		// than in memory, so a part warmed since the snapshot costs one query and no provider request.
		const rows = await db
			.select()
			.from(passage)
			.where(and(inArray(passage.id, ids), isNull(passage.cachedText)));

		if (rows.length === 0) return { warmed: 0, skipped: true };

		let warmed = 0;
		await fetchPassagesTextWithCache(rows, translation, {
			onFetched: async (passageRow, result) => {
				// Guarded on `isNull` again: a concurrent write between the read above and this update
				// would otherwise be overwritten by our now-stale fetch. The condition makes the write a
				// no-op in that race rather than a clobber.
				await db
					.update(passage)
					.set({ cachedText: result.text, textCachedAt: new Date() })
					.where(and(eq(passage.id, passageRow.id), isNull(passage.cachedText)));
				warmed += 1;
			}
		});

		// Enforce the local-storage cap after warming (COMPLIANCE.md §5 item 1).
		//
		// `selectPrefetchTarget()` already declines to prefetch under a translation that HAS a cap, so for
		// ESV this is unreachable today and for NET there is nothing to enforce. It is wired anyway,
		// because the alternative is a fill site whose compliance depends on a guard in a different module
		// continuing to exist — and the ONE fill site left unwired is exactly how §5 item 1 arose. If that
		// guard is ever relaxed, this is already correct rather than newly wrong.
		if (warmed > 0 && userId) {
			void enforceCacheLimit(userId);
		}

		return { warmed, skipped: false };
	} catch (error) {
		// Swallowed by design — see the module note. Logged rather than silent, because a prefetch that
		// never succeeds should be discoverable without being disruptive.
		console.error('Adjacent-part prefetch failed:', error);
		return { warmed: 0, skipped: true };
	}
}
