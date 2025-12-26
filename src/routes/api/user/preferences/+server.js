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
		const body = await request.json();
		const { studiesPanelWidth, studiesPanelOpen, commentaryPanelWidth, commentaryPanelOpen } = body;
		
		// Build update object with only provided fields
		const updates = {};
		
		// Validate and add studiesPanelWidth if provided
		if (studiesPanelWidth !== undefined) {
			if (typeof studiesPanelWidth !== 'number' || studiesPanelWidth < 300 || studiesPanelWidth > 600) {
				return json({ error: 'Invalid panel width' }, { status: 400 });
			}
			updates.studiesPanelWidth = studiesPanelWidth;
		}
		
		// Validate and add studiesPanelOpen if provided
		if (studiesPanelOpen !== undefined) {
			if (typeof studiesPanelOpen !== 'boolean') {
				return json({ error: 'Invalid panel open state' }, { status: 400 });
			}
			updates.studiesPanelOpen = studiesPanelOpen;
		}
		
		// Validate and add commentaryPanelWidth if provided
		if (commentaryPanelWidth !== undefined) {
			if (typeof commentaryPanelWidth !== 'number' || commentaryPanelWidth < 300 || commentaryPanelWidth > 600) {
				return json({ error: 'Invalid commentary panel width' }, { status: 400 });
			}
			updates.commentaryPanelWidth = commentaryPanelWidth;
		}
		
		// Validate and add commentaryPanelOpen if provided
		if (commentaryPanelOpen !== undefined) {
			if (typeof commentaryPanelOpen !== 'boolean') {
				return json({ error: 'Invalid commentary panel open state' }, { status: 400 });
			}
			updates.commentaryPanelOpen = commentaryPanelOpen;
		}
		
		// Only update if there are changes
		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid preferences provided' }, { status: 400 });
		}

		// Update user preferences
		await db.update(user)
			.set(updates)
			.where(eq(user.id, session.user.id));

		return json({ success: true });
	} catch (error) {
		console.error('Error updating user preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
}
