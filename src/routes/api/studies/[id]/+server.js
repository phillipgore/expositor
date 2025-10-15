import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

/**
 * Update a study (e.g., change its groupId)
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;
		const { groupId } = await request.json();

		// Verify the study belongs to the current user
		const existingStudy = await db
			.select()
			.from(study)
			.where(and(eq(study.id, id), eq(study.userId, session.user.id)))
			.limit(1);

		if (existingStudy.length === 0) {
			return json({ error: 'Study not found' }, { status: 404 });
		}

		// Update the study's groupId (can be null to ungroup)
		await db
			.update(study)
			.set({ 
				groupId: groupId,
				updatedAt: new Date()
			})
			.where(eq(study.id, id));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update study error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
