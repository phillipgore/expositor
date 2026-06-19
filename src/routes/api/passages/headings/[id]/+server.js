import { db } from '$lib/server/db/index.js';
import { passageHeading } from '$lib/server/db/schema';
import { updateHeadingCommentary } from '$lib/server/db/utils.js';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/**
 * GET a heading row (used by CommentaryPanel to load its commentary).
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ request, params }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const headingId = params.id;

		const headings = await db
			.select()
			.from(passageHeading)
			.where(eq(passageHeading.id, headingId))
			.limit(1);

		if (headings.length === 0) {
			return json({ error: 'Heading not found' }, { status: 404 });
		}

		return json(headings[0]);
	} catch (error) {
		console.error('Error fetching heading:', error);
		return json({ error: 'Failed to fetch heading' }, { status: 500 });
	}
}

/**
 * PATCH a heading's commentary.
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ request, params }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { commentary } = body;
		const headingId = params.id;

		// Validate commentary
		if (commentary !== undefined && typeof commentary !== 'string') {
			return json({ error: 'Invalid commentary' }, { status: 400 });
		}

		await updateHeadingCommentary(db, session.user.id, headingId, commentary);

		return json({ success: true });
	} catch (error) {
		console.error('Error updating heading:', error);
		if (error.message?.includes('not authorized')) {
			return json({ error: error.message }, { status: 403 });
		}
		if (error.message?.includes('not found')) {
			return json({ error: error.message }, { status: 404 });
		}
		return json({ error: 'Failed to update heading' }, { status: 500 });
	}
}
