import { db } from '$lib/server/db/index.js';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shared Link / Unlink handlers for layout "link groups" — the column-spacing,
 * column-width and section-spacing counterparts of segment-height linking
 * (see /api/segments/link-height and /unlink-height).
 *
 * Link   — assigns ONE new group id to every id in the body (needs >= 2). Stored
 *          values are not touched; the client equalizes the group right after.
 * Unlink — resolves the groups the selected ids belong to and clears the group on
 *          ALL members of those groups (no half-linked groups are left behind).
 *          Each item keeps its current value.
 *
 * @param {any} table - Drizzle table (passageColumn / passageSection)
 * @param {string} groupKey - Property name of the group column on that table
 * @param {string} label - Human label for errors (e.g. 'column spacing')
 */
export function createLinkHandlers(table, groupKey, label) {
	/** @type {import('@sveltejs/kit').RequestHandler} */
	async function link({ request }) {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		try {
			const { ids } = await request.json();
			if (!Array.isArray(ids) || ids.length < 2 || !ids.every((id) => typeof id === 'string')) {
				return json({ error: `Invalid ids (need at least two items to link ${label})` }, { status: 400 });
			}
			const groupId = uuidv4();
			await db
				.update(table)
				.set({ [groupKey]: groupId, updatedAt: new Date() })
				.where(inArray(table.id, ids));
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
			if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
				return json({ error: 'Invalid ids' }, { status: 400 });
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
			if (!offsets || typeof offsets !== 'object' || Array.isArray(offsets)) {
				return json({ error: 'Invalid offsets' }, { status: 400 });
			}
			const entries = Object.entries(offsets);
			if (entries.length === 0) return json({ error: 'Invalid offsets' }, { status: 400 });
			for (const [, value] of entries) {
				if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
					return json({ error: `Invalid ${valueKey}` }, { status: 400 });
				}
			}

			// Group ids by identical value so each distinct value is one UPDATE.
			/** @type {Map<number|null, string[]>} */
			const byValue = new Map();
			for (const [id, value] of entries) {
				const rounded = value === null ? null : Math.round(value);
				const key = rounded === null || rounded <= 0 ? null : rounded;
				const list = byValue.get(key) ?? [];
				list.push(id);
				byValue.set(key, list);
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
