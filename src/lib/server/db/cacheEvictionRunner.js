/**
 * # Enforcing the local-storage cap (COMPLIANCE.md §5 item 1)
 *
 * `$lib/utils/cacheEviction.js` decides *what* must go; this reads the rows, applies the plan, and
 * clears `passage.cachedText`. Split for the same reason every other decision layer here is split: the
 * rule is then verifiable against real `bible.json` data without a database or a provider key.
 *
 * ## Scoped per user AND per translation, which is not obvious
 *
 * `study.translation` is per-study (schema.ts), so one user's cache can hold ESV and NET text at once.
 * The clause is Crossway's and governs ESV verses; NET declares no storage cap. Pooling them would be
 * wrong in **both** directions: it would evict NET text to satisfy a term its publisher never set, and
 * it would let NET rows consume the ESV allowance so ESV text was evicted while under its own cap. So
 * rows are grouped by translation and each group is planned separately.
 *
 * Per **user** because a shared pool would mean one user's studies evicting another's. A global cap
 * would be stricter, but it would make the cache behave unpredictably for reasons no user could see;
 * per-user closes the breach while the effect stays explicable.
 *
 * ⚠️ **This does NOT change what a user may study.** The clause governs storage, not display, so an
 * evicted passage is re-fetched on demand exactly as a new one is. Eviction costs a provider request,
 * never a user's work — COMPLIANCE.md §5 makes this point explicitly, and it is the reason eviction is
 * an acceptable remedy at all.
 *
 * ## Fire-and-forget, and what that obliges
 *
 * Callers do not await this, so — exactly as `seriesPrefetchRunner.js` documents — it may never throw
 * into the caller, and it must not write anything a live read depends on. Clearing `cachedText` is safe
 * on both counts: NULL is the column's documented "not yet cached" state, which every read path already
 * handles by fetching live.
 *
 * @module cacheEvictionRunner
 */

import { db } from './index.js';
import { passage, study } from './schema.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { planCacheEviction, summariseCacheUsage } from '$lib/utils/cacheEviction.js';

/**
 * Every warm cached row belonging to a user, with its study's translation.
 *
 * ⚠️ Deliberately does NOT select `cachedText`. The column holds the whole processed HTML of a passage,
 * so selecting it for every row would pull megabytes into memory to answer a question the planner asks
 * as a boolean — the same reasoning the study layout's `hasCachedText` projection records. The NULL
 * filter runs in the database, so a user with a cold cache costs one indexed query and nothing else.
 *
 * @param {string} userId
 * @returns {Promise<Array<Object>>}
 */
async function loadWarmRows(userId) {
	return await db
		.select({
			id: passage.id,
			testament: passage.testament,
			bookId: passage.bookId,
			fromChapter: passage.fromChapter,
			fromVerse: passage.fromVerse,
			toChapter: passage.toChapter,
			toVerse: passage.toVerse,
			textCachedAt: passage.textCachedAt,
			translation: study.translation,
			hasCachedText: sql`true`
		})
		.from(passage)
		.innerJoin(study, eq(passage.studyId, study.id))
		.where(sql`${study.userId} = ${userId} AND ${passage.cachedText} IS NOT NULL`);
}

/**
 * Group rows by the translation their study uses. See the module note on why this matters.
 *
 * @param {Array<Object>} rows
 * @returns {Map<string, Array<Object>>}
 */
function groupByTranslation(rows) {
	/** @type {Map<string, Array<Object>>} */
	const groups = new Map();
	for (const row of rows) {
		const key = row.translation || 'esv';
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key)?.push(row);
	}
	return groups;
}

/**
 * Bring a user's cached Scripture within the storage cap.
 *
 * @param {string} userId
 * @returns {Promise<{ evicted: number, byTranslation: Record<string, { evicted: number, keptVerses: number }> }>}
 *   Reported for logging and tests; never throws.
 */
export async function enforceCacheLimit(userId) {
	/** @type {Record<string, { evicted: number, keptVerses: number }>} */
	const byTranslation = {};
	let evicted = 0;

	try {
		if (!userId) return { evicted: 0, byTranslation };

		const rows = await loadWarmRows(userId);
		if (rows.length === 0) return { evicted: 0, byTranslation };

		for (const [translationId, group] of groupByTranslation(rows)) {
			const plan = planCacheEviction(group, translationId);
			byTranslation[translationId] = { evicted: plan.evictIds.length, keptVerses: plan.keptVerses };
			if (plan.evictIds.length === 0) continue;

			// One statement per translation group rather than one per row: eviction is a bulk correction, and
			// N round-trips against a remote database would make the compliance fix the slowest thing on the
			// request that triggered it.
			//
			// `textCachedAt` is cleared alongside the text. Leaving a timestamp on a NULL cache would claim
			// the row was cached at a moment when it holds nothing, and `planCacheEviction()` sorts on that
			// field — so a stale date would bias a future plan toward re-evicting rows that are now cold.
			await db
				.update(passage)
				.set({ cachedText: null, textCachedAt: null })
				.where(inArray(passage.id, plan.evictIds));

			evicted += plan.evictIds.length;
		}

		if (evicted > 0) {
			// Logged, because silently dropping a user's cached text should be discoverable when someone asks
			// why a page re-fetched. Counts only — never the text itself.
			console.log(
				`Cache eviction: cleared ${evicted} passage(s) for user ${userId}`,
				byTranslation
			);
		}

		return { evicted, byTranslation };
	} catch (error) {
		// Swallowed by design — see the module note. A failure leaves the cache as it was: still over the
		// cap, which is the pre-existing state, rather than breaking the page that triggered it.
		console.error('Cache eviction failed:', error);
		return { evicted, byTranslation };
	}
}

/**
 * Report a user's current cache usage without changing anything.
 *
 * Exists for the probe and for a possible back-office view. "How much is stored right now" is the
 * question this whole item is about, and answering it through the same dedup rules the enforcer uses
 * means the report cannot disagree with the enforcement.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ translation: string, summary: ReturnType<typeof summariseCacheUsage> }>>}
 */
export async function reportCacheUsage(userId) {
	const rows = await loadWarmRows(userId);
	return [...groupByTranslation(rows).entries()].map(([translation, group]) => ({
		translation,
		summary: summariseCacheUsage(group, translation)
	}));
}
