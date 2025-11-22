import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Bulk delete studies and groups with smart preservation of unselected items
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { selectedGroupIds = [], selectedStudyIds = [] } = await request.json();

		if (selectedGroupIds.length === 0 && selectedStudyIds.length === 0) {
			return json({ error: 'No items selected' }, { status: 400 });
		}

		const userId = session.user.id;

		// Step 1: Fetch ALL groups and studies for this user to understand hierarchy
		const allGroups = await db
			.select()
			.from(studyGroup)
			.where(eq(studyGroup.userId, userId));

		const allStudies = await db
			.select()
			.from(study)
			.where(eq(study.userId, userId));

		// Step 2: Build a map of group hierarchies
		const groupMap = new Map(allGroups.map(g => [g.id, g]));
		const studyMap = new Map(allStudies.map(s => [s.id, s]));

		// Step 3: Find all descendants of selected groups (recursively)
		const findAllDescendants = (groupId) => {
			const descendants = { groups: new Set(), studies: new Set() };
			
			// Find direct child groups
			const childGroups = allGroups.filter(g => g.parentGroupId === groupId);
			for (const childGroup of childGroups) {
				descendants.groups.add(childGroup.id);
				// Recursively get descendants of this child
				const childDescendants = findAllDescendants(childGroup.id);
				childDescendants.groups.forEach(id => descendants.groups.add(id));
				childDescendants.studies.forEach(id => descendants.studies.add(id));
			}
			
			// Find direct child studies
			const childStudies = allStudies.filter(s => s.groupId === groupId);
			for (const childStudy of childStudies) {
				descendants.studies.add(childStudy.id);
			}
			
			return descendants;
		};

		// Step 4: For each selected group, identify unselected descendants
		const itemsToPreserve = { groups: [], studies: [] };
		const selectedGroupSet = new Set(selectedGroupIds);
		const selectedStudySet = new Set(selectedStudyIds);

		for (const groupId of selectedGroupIds) {
			const descendants = findAllDescendants(groupId);
			
			// Unselected groups need preservation
			for (const descGroupId of descendants.groups) {
				if (!selectedGroupSet.has(descGroupId)) {
					itemsToPreserve.groups.push(descGroupId);
				}
			}
			
			// Unselected studies need preservation
			for (const descStudyId of descendants.studies) {
				if (!selectedStudySet.has(descStudyId)) {
					itemsToPreserve.studies.push(descStudyId);
				}
			}
		}

		// Step 5: Find safe parent for each preserved item
		const findSafeParent = (currentParentId) => {
			if (!currentParentId) return null; // Already top-level
			
			// If parent is not being deleted, it's safe
			if (!selectedGroupSet.has(currentParentId)) {
				return currentParentId;
			}
			
			// Parent is being deleted, check grandparent
			const parentGroup = groupMap.get(currentParentId);
			if (!parentGroup) return null;
			
			return findSafeParent(parentGroup.parentGroupId);
		};

		// Step 6: Move preserved items to safe parents
		const updates = [];

		// Move preserved groups
		for (const groupId of itemsToPreserve.groups) {
			const group = groupMap.get(groupId);
			if (!group) continue;
			
			const safeParentId = findSafeParent(group.parentGroupId);
			
			// Only update if parent is changing
			if (safeParentId !== group.parentGroupId) {
				updates.push(
					db.update(studyGroup)
						.set({ 
							parentGroupId: safeParentId,
							updatedAt: new Date()
						})
						.where(eq(studyGroup.id, groupId))
				);
			}
		}

		// Move preserved studies
		for (const studyId of itemsToPreserve.studies) {
			const studyItem = studyMap.get(studyId);
			if (!studyItem) continue;
			
			const safeParentId = studyItem.groupId ? findSafeParent(studyItem.groupId) : null;
			
			// Only update if group is changing
			if (safeParentId !== studyItem.groupId) {
				updates.push(
					db.update(study)
						.set({ 
							groupId: safeParentId,
							updatedAt: new Date()
						})
						.where(eq(study.id, studyId))
				);
			}
		}

		// Execute all preservation updates
		if (updates.length > 0) {
			await Promise.all(updates);
		}

		// Step 7: Delete selected studies (must delete before groups due to foreign keys)
		if (selectedStudyIds.length > 0) {
			await db
				.delete(study)
				.where(and(
					inArray(study.id, selectedStudyIds),
					eq(study.userId, userId)
				));
		}

		// Step 8: Delete selected groups (cascade will handle any remaining descendants)
		if (selectedGroupIds.length > 0) {
			await db
				.delete(studyGroup)
				.where(and(
					inArray(studyGroup.id, selectedGroupIds),
					eq(studyGroup.userId, userId)
				));
		}

		return json({ 
			success: true,
			deleted: {
				groups: selectedGroupIds.length,
				studies: selectedStudyIds.length
			},
			preserved: {
				groups: itemsToPreserve.groups.length,
				studies: itemsToPreserve.studies.length
			}
		});

	} catch (error) {
		console.error('Bulk delete error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
