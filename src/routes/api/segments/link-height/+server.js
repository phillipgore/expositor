import { db } from '$lib/server/db/index.js';
import { passageSegment } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';

/**
 * PATCH /api/segments/link-height
 *
 * Link the heights of multiple segments. All segments in the body are assigned a
 * shared `heightGroupId` and their `height` is seeded to a uniform value (the
 * tallest member's current height, measured client-side) so they start matched.
 * From then on the client keeps every member at the height of the tallest member.
 *
 * Body: { ids: string[], height?: number | null }
 *   - ids    = the segment IDs to link together (>= 2)
 *   - height = optional uniform seed height in px. When provided (and > 0) it is
 *              applied to every member so they immediately match. Omitted/null
 *              leaves existing per-segment heights untouched.
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
		const { ids, height } = body;

		// Validate ids: must be an array of at least two strings.
		if (!Array.isArray(ids) || ids.length < 2 || !ids.every((id) => typeof id === 'string')) {
			return json({ error: 'Invalid ids (need at least two segments to link)' }, { status: 400 });
		}

		// Validate optional seed height: null/undefined or a positive finite number.
		let seedHeight = null;
		if (height !== null && height !== undefined) {
			if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
				return json({ error: 'Invalid height' }, { status: 400 });
			}
			seedHeight = Math.round(height);
		}

		const heightGroupId = uuidv4();

		/** @type {{ heightGroupId: string, updatedAt: Date, height?: number }} */
		const updates = { heightGroupId, updatedAt: new Date() };
		if (seedHeight !== null) {
			updates.height = seedHeight;
		}

		await db.update(passageSegment).set(updates).where(inArray(passageSegment.id, ids));

		return json({ success: true, heightGroupId });
	} catch (error) {
		console.error('Error linking segment heights:', error);
		return json({ error: 'Failed to link segment heights' }, { status: 500 });
	}
}
