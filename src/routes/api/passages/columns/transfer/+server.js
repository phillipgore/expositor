import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeItemTransfer, transferItem } from '$lib/server/db/itemTransferDb.js';
import { auth } from '$lib/server/auth.js';

/**
 * Move Selected Up / Down for a COLUMN (SERIES_PLAN §8).
 *
 * Body: { passageId, columnId, direction: 'up'|'down', dryRun? }
 *
 * ⚠️ A column has no containing column, so this tier is ALWAYS a part move — `itemTransfer.js` finds no
 * nearer container and falls through. It is therefore the only one of the three that cannot succeed in
 * a standalone study, and it is still refused at the passage's inner edges, where the column would land
 * out of reading order.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, columnId, direction = 'up', dryRun = false } = await request.json();

		if (!columnId) {
			return json({ error: 'Missing required field: columnId' }, { status: 400 });
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
				columnId,
				'column',
				direction
			);
			return json(plan, { status: plan.ok ? 200 : 409 });
		}

		const result = await transferItem(db, session.user.id, passageId, columnId, 'column', direction);
		return json(result);
	} catch (error) {
		console.error('Error moving column:', error);
		return json({ error: error.message ?? 'Failed to move column' }, { status: 400 });
	}
};
