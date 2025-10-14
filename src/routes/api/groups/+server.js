import { json } from '@sveltejs/kit';
import { v4 as uuidv4 } from 'uuid';
import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, desc } from 'drizzle-orm';

/**
 * Create a new group
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { name } = await request.json();

		if (!name || !name.trim()) {
			return json({ error: 'Group name is required' }, { status: 400 });
		}

		// Get the highest display order for this user's groups
		const existingGroups = await db
			.select({ displayOrder: studyGroup.displayOrder })
			.from(studyGroup)
			.where(eq(studyGroup.userId, session.user.id))
			.orderBy(desc(studyGroup.displayOrder))
			.limit(1);

		const nextDisplayOrder = existingGroups.length > 0 
			? existingGroups[0].displayOrder + 1 
			: 0;

		// Create the new group
		const newGroup = {
			id: uuidv4(),
			name: name.trim(),
			userId: session.user.id,
			displayOrder: nextDisplayOrder,
			isCollapsed: false,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		await db.insert(studyGroup).values(newGroup);

		return json({ success: true, group: newGroup }, { status: 201 });
	} catch (error) {
		console.error('Create group error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
