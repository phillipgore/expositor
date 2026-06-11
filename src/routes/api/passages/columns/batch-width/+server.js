import { db } from '$lib/server/db/index.js';
import { passageColumn } from '$lib/server/db/schema.js';
import { inArray } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';
import { json } from '@sveltejs/kit';

/**
 * PATCH /api/passages/columns/batch-width
 *
 * Set the same width (in CSS px) on multiple columns at once. Used by the
 * "Set Column Width" modal to apply a uniform width across a multi-column
 * selection (and to reset selected columns back to the default width).
 *
 * Body: { ids: string[], width: number | null }
 *   - width = null clears the override (columns return to the CSS default width)
 *   - width > 0 sets a fixed width in pixels
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
		const { ids, width } = body;

		// Validate ids: must be a non-empty array of strings.
		if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
			return json({ error: 'Invalid ids' }, { status: 400 });
		}

		// Validate width: must be null (default) or a positive finite number.
		if (width !== null) {
			if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
				return json({ error: 'Invalid width' }, { status: 400 });
			}
		}

		await db
			.update(passageColumn)
			.set({ width: width === null ? null : Math.round(width), updatedAt: new Date() })
			.where(inArray(passageColumn.id, ids));

		return json({ success: true });
	} catch (error) {
		console.error('Error batch-updating column widths:', error);
		return json({ error: 'Failed to update column widths' }, { status: 500 });
	}
}
