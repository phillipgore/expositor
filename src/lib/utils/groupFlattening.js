/**
 * Group Flattening Utilities
 * 
 * Provides functions to flatten hierarchical group structures into
 * linear lists for various display and navigation purposes.
 */

import { wouldCreateCircularNesting } from './groupHierarchy.js';

/**
 * Flatten groups for menu display with circular nesting checks
 * 
 * @param {Array} groupList - The list of groups to flatten
 * @param {Array} selectedItems - Currently selected items (for nesting validation)
 * @param {Array} allGroups - Complete list of all groups
 * @param {number} depth - Current nesting depth (used internally)
 * @returns {Array} Flattened array of groups with depth and disabled flags
 */
export function flattenGroupsForMenu(groupList, selectedItems = [], allGroups = null, depth = 0) {
	const result = [];
	const groupsToCheck = allGroups || groupList;
	
	for (const group of groupList) {
		result.push({
			id: group.id,
			name: group.name,
			depth,
			disabled: selectedItems.length > 0 
				? wouldCreateCircularNesting(group.id, selectedItems, groupsToCheck)
				: false
		});
		
		if (group.subgroups && group.subgroups.length > 0) {
			result.push(...flattenGroupsForMenu(group.subgroups, selectedItems, groupsToCheck, depth + 1));
		}
	}
	
	return result;
}

/**
 * Check if a group or any of its descendants match a search query
 * 
 * @param {Object} group - The group to check
 * @param {string} query - The search query (case-insensitive)
 * @returns {boolean} True if group or any descendant matches
 */
export function groupMatchesSearch(group, query) {
	if (!query) return true;
	
	const lowerQuery = query.toLowerCase();
	
	// Check if this group matches
	if (group.name.toLowerCase().includes(lowerQuery)) {
		return true;
	}
	
	// Check if any subgroups match
	if (group.subgroups && group.subgroups.length > 0) {
		return group.subgroups.some(sub => groupMatchesSearch(sub, query));
	}
	
	return false;
}

/**
 * Flatten groups for display with search filtering
 * 
 * @param {Array} groupList - The list of groups to flatten
 * @param {string} searchQuery - Optional search query to filter groups
 * @param {Array} selectedItems - Currently selected items (for nesting validation)
 * @param {Array} allGroups - Complete list of all groups
 * @param {number} depth - Current nesting depth (used internally)
 * @returns {Array} Flattened array with search matches and disabled flags
 */
export function flattenGroupsForDisplay(groupList, searchQuery = '', selectedItems = [], allGroups = null, depth = 0) {
	const result = [];
	const query = searchQuery.trim();
	const groupsToCheck = allGroups || groupList;
	
	for (const group of groupList) {
		// Check if this group or any descendant matches the search
		if (groupMatchesSearch(group, query)) {
			result.push({
				id: group.id,
				name: group.name,
				depth,
				disabled: selectedItems.length > 0
					? wouldCreateCircularNesting(group.id, selectedItems, groupsToCheck)
					: false,
				matches: !query || group.name.toLowerCase().includes(query.toLowerCase())
			});
			
			if (group.subgroups && group.subgroups.length > 0) {
				result.push(...flattenGroupsForDisplay(
					group.subgroups, 
					query, 
					selectedItems, 
					groupsToCheck, 
					depth + 1
				));
			}
		}
	}
	
	return result;
}

/**
 * Flatten a single group and its contents for display order
 * (Used by StudiesPanel for creating navigable item lists)
 * 
 * @param {Object} group - The group to flatten
 * @param {Array} items - Array to accumulate flattened items
 * @param {number} index - Current index in flattened list
 * @returns {number} The next available index
 */
export function flattenGroupRecursive(group, items, index) {
	// Add the group itself
	items.push({
		type: 'group',
		id: group.id,
		data: group,
		index: index++,
		depth: group.depth || 0
	});
	
	if (!group.isCollapsed) {
		// Add subgroups recursively
		if (group.subgroups && group.subgroups.length > 0) {
			for (const subgroup of group.subgroups) {
				index = flattenGroupRecursive(subgroup, items, index);
			}
		}
		
		// Add series filed in this group, before its loose studies
		if (group.series && group.series.length > 0) {
			for (const series of group.series) {
				index = flattenSeriesRecursive(series, items, index, (group.depth || 0) + 1);
			}
		}

		// Add studies
		if (group.studies && group.studies.length > 0) {
			for (const study of group.studies) {
				items.push({
					type: 'study',
					id: study.id,
					data: study,
					index: index++,
					depth: (group.depth || 0) + 1
				});
			}
		}
	}
	
	return index;
}

/**
 * Flatten a series and, when expanded, its parts.
 *
 * The series row is emitted with type 'series' rather than being folded into 'study'.
 * Keyboard navigation and multi-select key off this type, and mislabelling the row would
 * make arrowing onto a series behave as if a study were selected — the Delete action would
 * then target a study that isn't there. Parts keep type 'study' because that is exactly
 * what they are; only their container is new.
 *
 * @param {Object} series - The series to flatten
 * @param {Array} items - Array to accumulate flattened items
 * @param {number} index - Current index in flattened list
 * @param {number} depth - Display depth of the series row
 * @returns {number} The next available index
 */
export function flattenSeriesRecursive(series, items, index, depth = 0) {
	items.push({
		type: 'series',
		id: series.id,
		data: series,
		index: index++,
		depth
	});

	// Collapsed parts are not on screen, so they must not be reachable by arrow keys.
	if (!series.isCollapsed && series.parts && series.parts.length > 0) {
		for (const part of series.parts) {
			items.push({
				type: 'study',
				id: part.id,
				data: part,
				index: index++,
				depth: depth + 1
			});
		}
	}

	return index;
}

/**
 * Get a completely flattened list of all groups and studies in display order
 * (Used for keyboard navigation and selection management)
 * 
 * @param {Array} sortedGroupsAndStudies - Combined array of groups and studies
 * @returns {Array} Flattened list with all items in display order
 */
export function getFlattenedItemsList(sortedGroupsAndStudies) {
	const items = [];
	let index = 0;
	
	sortedGroupsAndStudies.forEach(item => {
		if (item.type === 'group') {
			index = flattenGroupRecursive(item.data, items, index);
		} else if (item.type === 'series') {
			index = flattenSeriesRecursive(item.data, items, index, 0);
		} else {
			items.push({
				type: 'study',
				id: item.data.id,
				data: item.data,
				index: index++,
				depth: 0
			});
		}
	});
	
	return items;
}
