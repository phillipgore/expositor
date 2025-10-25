import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

/**
 * Check if setting a parent would create a circular reference
 */
async function wouldCreateCircle(groupId, newParentId, userId) {
	if (!newParentId) return false;
	
	let currentId = newParentId;
	while (currentId) {
		if (currentId === groupId) {
			return true; // Would create a circle!
		}
		
		const parent = await db
			.select({ parentGroupId: studyGroup.parentGroupId })
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, currentId),
				eq(studyGroup.userId, userId)
			))
			.limit(1);
		
		currentId = parent[0]?.parentGroupId || null;
	}
	
	return false;
}

/**
 * Get the depth of a group in the hierarchy
 */
async function getGroupDepth(groupId, userId) {
	let depth = 0;
	let currentId = groupId;
	
	while (currentId) {
		depth++;
		
		const parent = await db
			.select({ parentGroupId: studyGroup.parentGroupId })
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, currentId),
				eq(studyGroup.userId, userId)
			))
			.limit(1);
		
		currentId = parent[0]?.parentGroupId || null;
	}
	
	return depth;
}

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

		// Handle parentGroupId update with validation
		if (body.parentGroupId !== undefined) {
			// Allow explicitly setting to null (ungrouping)
			if (body.parentGroupId === null) {
				updateData.parentGroupId = null;
			} else {
				// Verify parent group exists and belongs to user
				const parentGroup = await db
					.select()
					.from(studyGroup)
					.where(and(
						eq(studyGroup.id, body.parentGroupId),
						eq(studyGroup.userId, session.user.id)
					))
					.limit(1);

				if (parentGroup.length === 0) {
					return json({ error: 'Parent group not found' }, { status: 404 });
				}

				// Check for circular nesting
				const wouldCircle = await wouldCreateCircle(id, body.parentGroupId, session.user.id);
				if (wouldCircle) {
					return json({ 
						error: 'Cannot nest a group within itself or its descendants' 
					}, { status: 400 });
				}

				// Check depth limit and warn
				const newDepth = await getGroupDepth(body.parentGroupId, session.user.id);
				if (newDepth >= 5) {
					// Still allow it but client should have warned
					console.warn(`Group ${id} nested at depth ${newDepth + 1}`);
				}

				updateData.parentGroupId = body.parentGroupId;
			}
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
