import { db } from '$lib/server/db/index.js';
import { passageHeading } from '$lib/server/db/schema';
import { updateHeadingCommentary, convertHeadingType } from '$lib/server/db/utils.js';
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
 * PATCH a heading's commentary, or convert it to another level.
 *
 * Body: `{ commentary }` updates the commentary; `{ headingType: 'one'|'two'|'three' }`
 * converts the heading in place (id, text and commentary preserved). Converting into a
 * level the segment already holds is refused with 409.
 * @type {import('./$types').RequestHandler}
 */
export async function PATCH({ request, params }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { commentary, headingType } = body;
		const headingId = params.id;

		// Heading-level conversion
		if (headingType !== undefined) {
			if (!['one', 'two', 'three'].includes(headingType)) {
				return json({ error: 'Invalid headingType. Must be one, two, or three' }, { status: 400 });
			}
			const result = await convertHeadingType(db, session.user.id, headingId, headingType);
			return json({ success: true, headingId: result.id, headingType: result.headingType });
		}

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
		if (error.message?.includes('already has a heading')) {
			return json({ error: error.message }, { status: 409 });
		}
		return json({ error: 'Failed to update heading' }, { status: 500 });
	}
}
