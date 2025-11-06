import { db } from '$lib/server/db/index.js';
import { studyGroup } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Expand a group and all its ancestor groups by setting isCollapsed to false
 * @param {string} groupId - The ID of the group to start from
 * @param {string} userId - The user ID for verification
 * @returns {Promise<void>}
 */
export async function expandGroupAncestors(groupId, userId) {
	if (!groupId) return;
	
	let currentGroupId = groupId;
	
	while (currentGroupId) {
		// Get current group
		const groups = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, currentGroupId),
				eq(studyGroup.userId, userId)
			))
			.limit(1);
		
		if (groups.length === 0) break;
		
		const group = groups[0];
		
		// Expand if collapsed
		if (group.isCollapsed) {
			await db
				.update(studyGroup)
				.set({ 
					isCollapsed: false, 
					updatedAt: new Date() 
				})
				.where(eq(studyGroup.id, currentGroupId));
		}
		
		// Move to parent
		currentGroupId = group.parentGroupId;
	}
}
