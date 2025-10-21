import { db } from '$lib/server/db/index.js';
import { user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ request }) {
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { studiesPanelWidth } = await request.json();
		
		// Validate the width value
		if (typeof studiesPanelWidth !== 'number' || studiesPanelWidth < 300 || studiesPanelWidth > 600) {
			return json({ error: 'Invalid panel width' }, { status: 400 });
		}

		// Update user preferences
		await db.update(user)
			.set({ studiesPanelWidth })
			.where(eq(user.id, session.user.id));

		return json({ success: true });
	} catch (error) {
		console.error('Error updating user preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
}
