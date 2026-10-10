import { db } from '$lib/server/db/index.js';
import { inArray, sql } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { authorizeStructureIds } from '$lib/server/db/structureOwners.js';

/** Upper bound on items per request. */
const MAX_IDS = 1000;
/** Upper bound on a stored offset (CSS px) — far beyond any real layout, well inside int4. */
const MAX_OFFSET = 10000;

/**
 * @param {unknown} ids
 * @returns {ids is string[]}
 */
function isIdList(ids) {
	return (
		Array.isArray(ids) &&
		ids.length > 0 &&
		ids.length <= MAX_IDS &&
		ids.every((id) => typeof id === 'string')
	);
}

/**
 * Validate a `{ [id]: number | null }` map and bucket ids by their normalized value
 * (rounded; null / <= 0 → null) so each distinct value is one UPDATE.
 * Returns null when the input is invalid.
 * @param {unknown} values
 * @returns {Map<number|null, string[]>|null}
 */
function groupValues(values) {
	if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
	const entries = Object.entries(values);
	if (entries.length === 0 || entries.length > MAX_IDS) return null;
	/** @type {Map<number|null, string[]>} */
	const byValue = new Map();
	for (const [id, value] of entries) {
		if (
			value !== null &&
			(typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_OFFSET)
		) {
			return null;
		}
		const rounded = value === null ? null : Math.round(value);
		const key = rounded === null || rounded <= 0 ? null : rounded;
		const list = byValue.get(key) ?? [];
		list.push(id);
		byValue.set(key, list);
	}
	return byValue;
}

/**
 * Clear any of the given groups that are left with fewer than two members (e.g. A+B
 * were linked, then B was re-linked with C — A must not stay "linked" to nothing).
 * @param {any} tx
 * @param {any} table
 * @param {string} groupKey
 * @param {string[]} groupIds
 * @param {Date} now
 */
async function clearSingletonGroups(tx, table, groupKey, groupIds, now) {
	if (groupIds.length === 0) return;
	const counts = await tx
		.select({ groupId: table[groupKey], n: sql`count(*)`.mapWith(Number) })
		.from(table)
		.where(inArray(table[groupKey], groupIds))
		.groupBy(table[groupKey]);
	const lonely = counts.filter((c) => c.n < 2).map((c) => c.groupId);
	if (lonely.length === 0) return;
	await tx
		.update(table)
		.set({ [groupKey]: null, updatedAt: now })
		.where(inArray(table[groupKey], lonely));
}

/**
 * Shared Link / Unlink handlers for layout "link groups" — the column-spacing,
 * column-width and section-spacing counterparts of segment-height linking
 * (see /api/segments/link-height and /unlink-height).
 *
 * All handlers verify every id belongs to a study owned by the session user (403).
 *
 * Link   — assigns ONE new group id to every id in the body (needs >= 2, all in one
 *          study). Optional `values: { [id]: number|null }` writes `valueKey` in the
 *          SAME transaction so the group starts equalized atomically. Any previous
 *          group left with a single member is cleared.
 * Unlink — resolves the groups the selected ids belong to and clears the group on
 *          ALL members of those groups (no half-linked groups are left behind).
 *          Each item keeps its current value.
 *
 * @param {any} table - Drizzle table (passageColumn / passageSection)
 * @param {string} groupKey - Property name of the group column on that table
 * @param {string} label - Human label for errors (e.g. 'column spacing')
 * @param {string} [valueKey] - Value column that Link's optional `values` writes (e.g. 'leftOffset', 'width')
 */
export function createLinkHandlers(table, groupKey, label, valueKey) {
	/** @type {import('@sveltejs/kit').RequestHandler} */
	async function link({ request }) {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		try {
			const { ids: rawIds, values } = await request.json();
			if (!isIdList(rawIds)) {
				return json(
					{ error: `Invalid ids (need at least two items to link ${label})` },
					{ status: 400 }
				);
			}
			const ids = [...new Set(rawIds)];
			if (ids.length < 2) {
				return json(
					{ error: `Invalid ids (need at least two items to link ${label})` },
					{ status: 400 }
				);
			}

			// Optional per-item values to equalize the group in the SAME transaction.
			/** @type {Map<number|null, string[]>|null} */
			let byValue = null;
			if (values !== undefined && values !== null) {
				byValue = groupValues(values);
				if (!byValue || !valueKey)
					return json({ error: `Invalid ${valueKey ?? 'values'}` }, { status: 400 });
				const valueIds = [...byValue.values()].flat();
				if (valueIds.some((id) => !ids.includes(id))) {
					return json({ error: 'values must only name linked ids' }, { status: 400 });
				}
			}

			const studyIds = await authorizeStructureIds(db, session.user.id, ids);
			if (!studyIds) return json({ error: 'Not found or not authorized' }, { status: 403 });
			if (studyIds.length !== 1) {
				return json({ error: `Can only link ${label} within one study` }, { status: 400 });
			}

			const groupId = uuidv4();
			const now = new Date();
			await db.transaction(async (tx) => {
				// Groups the selection is leaving; cleaned up below.
				const previous = await tx
					.select({ groupId: table[groupKey] })
					.from(table)
					.where(inArray(table.id, ids));
				const oldGroupIds = [...new Set(previous.map((p) => p.groupId).filter((g) => !!g))];

				await tx
					.update(table)
					.set({ [groupKey]: groupId, updatedAt: now })
					.where(inArray(table.id, ids));

				if (byValue) {
					for (const [value, valueIds] of byValue) {
						await tx
							.update(table)
							.set({ [valueKey]: value, updatedAt: now })
							.where(inArray(table.id, valueIds));
					}
				}

				await clearSingletonGroups(tx, table, groupKey, oldGroupIds, now);
			});
			return json({ success: true, groupId });
		} catch (error) {
			console.error(`Error linking ${label}:`, error);
			return json({ error: `Failed to link ${label}` }, { status: 500 });
		}
	}

	/** @type {import('@sveltejs/kit').RequestHandler} */
	async function unlink({ request }) {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		try {
			const { ids } = await request.json();
			if (!isIdList(ids)) {
				return json({ error: 'Invalid ids' }, { status: 400 });
			}
			if (!(await authorizeStructureIds(db, session.user.id, ids))) {
				return json({ error: 'Not found or not authorized' }, { status: 403 });
			}
			const selected = await db
				.select({ groupId: table[groupKey] })
				.from(table)
				.where(inArray(table.id, ids));
			const groupIds = [...new Set(selected.map((s) => s.groupId).filter((g) => !!g))];
			if (groupIds.length === 0) return json({ success: true });

			await db
				.update(table)
				.set({ [groupKey]: null, updatedAt: new Date() })
				.where(inArray(table[groupKey], groupIds));
			return json({ success: true });
		} catch (error) {
			console.error(`Error unlinking ${label}:`, error);
			return json({ error: `Failed to unlink ${label}` }, { status: 500 });
		}
	}

	return { link, unlink };
}

/**
 * PATCH handler that writes PER-ITEM integer offsets in one request. Used so a
 * linked group drag (or Set across a group) persists atomically.
 *
 * Body: { offsets: Record<string, number | null> } — null/<=0 clears to default.
 *
 * @param {any} table
 * @param {string} valueKey - e.g. 'leftOffset' / 'topOffset'
 * @param {string} label
 * @returns {import('@sveltejs/kit').RequestHandler}
 */
export function createBatchOffsetHandler(table, valueKey, label) {
	return async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		try {
			const { offsets } = await request.json();
			const byValue = groupValues(offsets);
			if (!byValue) return json({ error: `Invalid ${valueKey}` }, { status: 400 });

			const ids = [...byValue.values()].flat();
			if (!(await authorizeStructureIds(db, session.user.id, ids))) {
				return json({ error: 'Not found or not authorized' }, { status: 403 });
			}

			const now = new Date();
			await db.transaction(async (tx) => {
				for (const [value, ids] of byValue) {
					await tx
						.update(table)
						.set({ [valueKey]: value, updatedAt: now })
						.where(inArray(table.id, ids));
				}
			});
			return json({ success: true });
		} catch (error) {
			console.error(`Error batch-updating ${label}:`, error);
			return json({ error: `Failed to update ${label}` }, { status: 500 });
		}
	};
}
