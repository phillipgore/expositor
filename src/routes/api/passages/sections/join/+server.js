import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { analyzeJoin, joinSection } from '$lib/server/db/passageJoin.js';
import { auth } from '$lib/server/auth.js';

/**
 * Join a section into the section immediately preceding it.
 *
 * Body: { passageId, sectionId, decision?, dryRun? }
 *   - dryRun: true → returns { needsDecision, summary } without mutating.
 *   - decision: 'merge' (default) | 'delete'.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { sectionId, decision = 'merge', dryRun = false } = await request.json();
		if (!sectionId) {
			return json({ error: 'Missing required field: sectionId' }, { status: 400 });
		}

		if (dryRun) {
			const result = await analyzeJoin(db, session.user.id, 'section', sectionId);
			return json({ success: true, ...result }, { status: 200 });
		}

		await joinSection(db, session.user.id, sectionId, decision);

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Join section error:', error);
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		if (error.message.includes('Cannot join') || error.message.includes('not found')) {
			return json({ error: error.message }, { status: 400 });
		}
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
