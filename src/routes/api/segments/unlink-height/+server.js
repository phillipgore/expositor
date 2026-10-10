import { db } from '$lib/server/db/index.js';
import { passageSegment } from '$lib/server/db/schema';
import { unlinkSelected } from '$lib/server/db/linkGroups.js';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/**
 * PATCH /api/segments/unlink-height
 *
 * Unlink the heights of the SELECTED segments only. Unselected members of their
 * groups stay linked to each other; a group left with one member is dissolved.
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

		await unlinkSelected(db, passageSegment, 'heightGroupId', ids);
		return json({ success: true });
	} catch (error) {
		console.error('Error unlinking segment heights:', error);
		return json({ error: 'Failed to unlink segment heights' }, { status: 500 });
	}
}
