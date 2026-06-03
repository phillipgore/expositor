import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { passageColumn, passageSection } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';

/**
 * Get a column record (including commentary)
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const columnId = params.id;

		const columns = await db.select()
			.from(passageColumn)
			.where(eq(passageColumn.id, columnId))
			.limit(1);

		if (columns.length === 0) {
			return json({ error: 'Column not found' }, { status: 404 });
		}

		return json(columns[0]);
	} catch (error) {
		console.error('Get column error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Update column color (all sections) and/or commentary
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const columnId = params.id;

		// Handle commentary update
		if ('commentary' in body) {
			const { commentary } = body;

			if (commentary !== undefined && typeof commentary !== 'string' && commentary !== null) {
				return json({ error: 'Invalid commentary' }, { status: 400 });
			}

			await db.update(passageColumn)
				.set({
					commentary: commentary ?? null,
					updatedAt: new Date()
				})
				.where(eq(passageColumn.id, columnId));

			return json({ success: true }, { status: 200 });
		}

		// Handle color update (original behaviour — updates all sections in this column)
		const { color } = body;

		const validColors = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'];
		if (!color || !validColors.includes(color)) {
			return json({ error: 'Invalid color. Must be one of: ' + validColors.join(', ') }, { status: 400 });
		}

		// Update all sections in this column to the new color
		await db.update(passageSection)
			.set({ 
				color,
				updatedAt: new Date()
			})
			.where(eq(passageSection.passageColumnId, columnId));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update column error:', error);
		
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
