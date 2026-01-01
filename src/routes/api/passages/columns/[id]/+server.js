import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { passageSection } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';

/**
 * Update all sections in a column to a new color
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { color } = await request.json();
		const columnId = params.id;

		// Validate color
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
		console.error('Update column sections color error:', error);
		
		// Return specific error messages for known validation errors
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
