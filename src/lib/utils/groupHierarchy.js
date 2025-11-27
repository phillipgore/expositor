/**
 * Group Hierarchy Utilities
 * 
 * Provides reusable functions for working with hierarchical group structures.
 * Used by MenuActions, MoveToGroupModal, and other components that need to
 * navigate and validate group hierarchies.
 */

/**
 * Find a group by ID in the hierarchical structure
 * 
 * @param {string} groupId - The ID of the group to find
 * @param {Array} groupList - The list of groups to search through
 * @returns {Object|null} The found group or null if not found
 */
export function findGroupById(groupId, groupList) {
	for (const group of groupList) {
		if (group.id === groupId) return group;
		if (group.subgroups && group.subgroups.length > 0) {
			const found = findGroupById(groupId, group.subgroups);
			if (found) return found;
		}
	}
	return null;
}

/**
 * Recursively check if groupId is a descendant of ancestorId
 * 
 * @param {string} groupId - The ID of the group to check
 * @param {string} ancestorId - The ID of the potential ancestor
 * @param {Array} allGroups - The complete list of groups
 * @returns {boolean} True if groupId is a descendant of ancestorId
 */
export function isDescendantOf(groupId, ancestorId, allGroups) {
	const group = findGroupById(groupId, allGroups);
	if (!group) return false;
	
	if (group.parentGroupId === ancestorId) return true;
	if (!group.parentGroupId) return false;
	
	return isDescendantOf(group.parentGroupId, ancestorId, allGroups);
}

/**
 * Check if moving selected groups to target would create circular nesting
 * 
 * @param {string} targetGroupId - The ID of the destination group
 * @param {Array} selectedItems - The items being moved (with type and id)
 * @param {Array} allGroups - The complete list of groups
 * @returns {boolean} True if moving would create circular nesting
 */
export function wouldCreateCircularNesting(targetGroupId, selectedItems, allGroups) {
	const selectedGroups = selectedItems.filter(item => item.type === 'group');
	
	// Can't move a group into itself
	if (selectedGroups.some(g => g.id === targetGroupId)) {
		return true;
	}

	// Check if target is a descendant of any selected group
	for (const selectedGroup of selectedGroups) {
		if (isDescendantOf(targetGroupId, selectedGroup.id, allGroups)) {
			return true;
		}
	}

	return false;
}

/**
 * Get the full ancestry path of a group (from root to group)
 * 
 * @param {string} groupId - The ID of the group
 * @param {Array} allGroups - The complete list of groups
 * @returns {Array} Array of group IDs from root to the specified group
 */
export function getGroupAncestry(groupId, allGroups) {
	const ancestry = [];
	let currentGroup = findGroupById(groupId, allGroups);
	
	while (currentGroup) {
		ancestry.unshift(currentGroup.id);
		if (!currentGroup.parentGroupId) break;
		currentGroup = findGroupById(currentGroup.parentGroupId, allGroups);
	}
	
	return ancestry;
}

/**
 * Get all descendant group IDs of a given group
 * 
 * @param {string} groupId - The ID of the parent group
 * @param {Array} allGroups - The complete list of groups
 * @returns {Array} Array of descendant group IDs
 */
export function getDescendantGroupIds(groupId, allGroups) {
	const group = findGroupById(groupId, allGroups);
	if (!group || !group.subgroups || group.subgroups.length === 0) {
		return [];
	}
	
	const descendants = [];
	
	function collectDescendants(subgroups) {
		for (const subgroup of subgroups) {
			descendants.push(subgroup.id);
			if (subgroup.subgroups && subgroup.subgroups.length > 0) {
				collectDescendants(subgroup.subgroups);
			}
		}
	}
	
	collectDescendants(group.subgroups);
	return descendants;
}
