import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

/**
 * Update a group
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
		const body = await request.json();

		// Verify the group belongs to the user
		const existingGroup = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, id),
				eq(studyGroup.userId, session.user.id)
			))
			.limit(1);

		if (existingGroup.length === 0) {
			return json({ error: 'Group not found' }, { status: 404 });
		}

		// Build update object based on provided fields
		const updateData = {
			updatedAt: new Date()
		};

		if (body.name !== undefined && body.name.trim()) {
			updateData.name = body.name.trim();
		}

		if (body.isCollapsed !== undefined) {
			updateData.isCollapsed = body.isCollapsed;
		}

		if (body.displayOrder !== undefined) {
			updateData.displayOrder = body.displayOrder;
		}

		// Update the group
		await db
			.update(studyGroup)
			.set(updateData)
			.where(and(
				eq(studyGroup.id, id),
				eq(studyGroup.userId, session.user.id)
			));

		return json({ success: true });
	} catch (error) {
		console.error('Update group error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Delete a group
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;

		// Verify the group belongs to the user
		const existingGroup = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, id),
				eq(studyGroup.userId, session.user.id)
			))
			.limit(1);

		if (existingGroup.length === 0) {
			return json({ error: 'Group not found' }, { status: 404 });
		}

		// Delete the group (studies will be set to null due to SET NULL on delete)
		await db
			.delete(studyGroup)
			.where(and(
				eq(studyGroup.id, id),
				eq(studyGroup.userId, session.user.id)
			));

		return json({ success: true });
	} catch (error) {
		console.error('Delete group error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
