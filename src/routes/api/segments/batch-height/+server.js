import { db } from '$lib/server/db/index.js';
import { passageSegment } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/**
 * PATCH /api/segments/batch-height
 *
 * Set the same height (in CSS px) on multiple segments at once. Used by the
 * "Set Height" modal to apply a uniform height across a multi-segment selection.
 *
 * Body: { ids: string[], height: number | null }
 *   - height = null clears the override (segments return to flexible height)
 *   - height > 0 sets a fixed min-height in pixels
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

		// Validate ids: must be a non-empty array of strings.
		if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
			return json({ error: 'Invalid ids' }, { status: 400 });
		}

		// Validate height: must be null (flexible) or a positive finite number.
		if (height !== null) {
			if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
				return json({ error: 'Invalid height' }, { status: 400 });
			}
		}

		await db
			.update(passageSegment)
			.set({ height: height === null ? null : Math.round(height), updatedAt: new Date() })
			.where(inArray(passageSegment.id, ids));

		return json({ success: true });
	} catch (error) {
		console.error('Error batch-updating segment heights:', error);
		return json({ error: 'Failed to update segment heights' }, { status: 500 });
	}
}
