import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeItemTransfer, transferItem } from '$lib/server/db/itemTransferDb.js';
import { auth } from '$lib/server/auth.js';

/**
 * Move Selected Up / Down for a SEGMENT (SERIES_PLAN §8).
 *
 * Body: { passageId, segmentId, direction: 'up'|'down', dryRun? }
 *
 * A segment's nearest container is the adjacent SECTION, which is usually inside its own column — so
 * this is the tier most often served without touching a series at all.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, segmentId, direction = 'up', dryRun = false } = await request.json();

		if (!segmentId) {
			return json({ error: 'Missing required field: segmentId' }, { status: 400 });
		}
		if (!passageId) {
			return json({ error: 'Missing required field: passageId' }, { status: 400 });
		}
		if (direction !== 'up' && direction !== 'down') {
			return json({ error: "direction must be 'up' or 'down'" }, { status: 400 });
		}

		if (dryRun) {
			const plan = await analyzeItemTransfer(
				db,
				session.user.id,
				passageId,
				segmentId,
				'segment',
				direction
			);
			return json(plan, { status: plan.ok ? 200 : 409 });
		}

		const result = await transferItem(
			db,
			session.user.id,
			passageId,
			segmentId,
			'segment',
			direction
		);
		return json(result);
	} catch (error) {
		console.error('Error moving segment:', error);
		return json({ error: error.message ?? 'Failed to move segment' }, { status: 400 });
	}
};
