import { db } from '$lib/server/db/index.js';
import { deleteHeadings } from '$lib/server/db/utils.js';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/**
 * DELETE many headings in one transaction (Markup menu → Select All, then Delete).
 *
 * Body: `{ headingIds: string[] }`. All-or-nothing: if any id is missing (404) or not
 * owned by the user (403), nothing is deleted. Each heading's commentary goes with it.
 * @type {import('./$types').RequestHandler}
 */
export async function DELETE({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json().catch(() => ({}));
		const { headingIds } = body;

		if (
			!Array.isArray(headingIds) ||
			headingIds.length === 0 ||
			!headingIds.every((id) => typeof id === 'string' && id.length > 0)
		) {
			return json({ error: 'headingIds must be a non-empty array of ids' }, { status: 400 });
		}

		const result = await deleteHeadings(db, session.user.id, headingIds);
		return json({ success: true, deleted: result.deleted });
	} catch (error) {
		console.error('Error deleting headings:', error);
		if (error.message?.includes('not authorized')) {
			return json({ error: error.message }, { status: 403 });
		}
		if (error.message?.includes('not found')) {
			return json({ error: error.message }, { status: 404 });
		}
		return json({ error: 'Failed to delete headings' }, { status: 500 });
	}
}
