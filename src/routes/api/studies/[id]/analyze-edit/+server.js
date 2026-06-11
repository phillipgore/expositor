import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';
import { analyzeEdit } from '$lib/server/db/passageReconcile.js';

/**
 * Pre-commit impact analysis for a study edit.
 *
 * Given the proposed new passage ranges, report what the edit would do to the
 * existing structure (added/removed verses, orphaned segments/sections/columns
 * with content, affected connections) so the client can show a Review modal and
 * collect the user's merge-vs-delete / placement decisions before saving.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const studyId = params.id;

		// Verify ownership.
		const existing = await db
			.select()
			.from(study)
			.where(eq(study.id, studyId))
			.limit(1);
		if (existing.length === 0) {
			return json({ error: 'Study not found' }, { status: 404 });
		}
		if (existing[0].userId !== session.user.id) {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const { passages: newPassages } = await request.json();
		if (!Array.isArray(newPassages)) {
			return json({ error: 'Invalid passages' }, { status: 400 });
		}

		const oldPassages = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, studyId));

		const report = await analyzeEdit(db, studyId, oldPassages, newPassages);

		return json(report, { status: 200 });
	} catch (error) {
		console.error('Analyze edit error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
