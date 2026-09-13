import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeItemTransfer, transferItem } from '$lib/server/db/itemTransferDb.js';
import { auth } from '$lib/server/auth.js';

/**
 * Move Selected Up / Down for a SECTION (SERIES_PLAN §8).
 *
 * Body: { passageId, sectionId, direction: 'up'|'down', dryRun? }
 *   - dryRun: true → returns the resolved plan without mutating.
 *
 * The destination is resolved server-side and may be either the adjacent COLUMN in this passage or the
 * adjacent PART of a series — `itemTransfer.js` decides, preferring the nearer container. The client
 * does not choose, so a stale client view cannot send a section to the wrong place.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { passageId, sectionId, direction = 'up', dryRun = false } = await request.json();

		if (!sectionId) {
			return json({ error: 'Missing required field: sectionId' }, { status: 400 });
		}
		// Required for BOTH directions. `sections/join/+server.js` records why: a capability that
		// disappears without complaint is worse than a refusal.
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
				sectionId,
				'section',
				direction
			);
			return json(plan, { status: plan.ok ? 200 : 409 });
		}

		const result = await transferItem(
			db,
			session.user.id,
			passageId,
			sectionId,
			'section',
			direction
		);
		return json(result);
	} catch (error) {
		console.error('Error moving section:', error);
		return json({ error: error.message ?? 'Failed to move section' }, { status: 400 });
	}
};
