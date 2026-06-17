import { db } from '$lib/server/db/index.js';
import { passageSegment } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/**
 * PATCH /api/segments/unlink-height
 *
 * Unlink the heights of the selected segments. To keep groups consistent, this
 * resolves the `heightGroupId` of every selected segment and clears the group on
 * ALL members of those groups (so you can't leave a half-linked group behind).
 * Each segment keeps its current `height`; only the link is removed.
 *
 * Body: { ids: string[] }
 *
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { ids } = body;

		// Validate ids: must be a non-empty array of strings.
		if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
			return json({ error: 'Invalid ids' }, { status: 400 });
		}

		// Resolve the height groups the selected segments belong to.
		const selected = await db
			.select({ heightGroupId: passageSegment.heightGroupId })
			.from(passageSegment)
			.where(inArray(passageSegment.id, ids));

		const groupIds = [
			...new Set(selected.map((s) => s.heightGroupId).filter((g) => !!g))
		];

		if (groupIds.length === 0) {
			// Nothing linked in the selection — no-op success.
			return json({ success: true });
		}

		// Clear the link on every member of the affected groups.
		await db
			.update(passageSegment)
			.set({ heightGroupId: null, updatedAt: new Date() })
			.where(inArray(passageSegment.heightGroupId, /** @type {string[]} */ (groupIds)));

		return json({ success: true });
	} catch (error) {
		console.error('Error unlinking segment heights:', error);
		return json({ error: 'Failed to unlink segment heights' }, { status: 500 });
	}
}
