/**
 * Multi-Select Composable
 * 
 * Manages multi-selection state and logic for the Studies Panel.
 * Supports single-click selection, Shift+Click range selection,
 * and Cmd/Ctrl+Click additive selection.
 * 
 * @param {Function} updateToolbarCallback - Callback to update toolbar with selection
 * @returns {Object} Multi-select state and functions
 */

import { setSelectedItem, clearSelectedItem } from '$lib/stores/toolbar.js';

export function useMultiSelect(updateToolbarCallback) {
	let selectedItems = $state([]);
	let lastSelectedIndex = $state(null);
	let lastClickTime = $state(0);
	const DOUBLE_CLICK_THRESHOLD = 300; // ms

	/**
	 * `type:id` → selection position ('first' | 'middle' | 'last' | 'isolated'), recomputed ONCE
	 * per selection change.
	 *
	 * ⚠️ PERFORMANCE. Every Finder row asks `isItemSelected` and `getSelectionPosition` while
	 * rendering, so both run (rows × selection) times per change. They used to scan
	 * `selectedItems` linearly and `getSelectionPosition` re-sorted a copy of it per row — with
	 * 600 rows and a 200-item shift-selection that is ~120k comparisons plus 600 sorts on one
	 * click. Both are now Map lookups against this one derived pass.
	 */
	const positionByKey = $derived.by(() => {
		const map = new Map();
		const sorted = [...selectedItems].sort((a, b) => a.index - b.index);
		for (let i = 0; i < sorted.length; i++) {
			const item = sorted[i];
			const prev = sorted[i - 1];
			const next = sorted[i + 1];
			const hasPrev = prev !== undefined && prev.index === item.index - 1;
			const hasNext = next !== undefined && next.index === item.index + 1;
			map.set(
				`${item.type}:${item.id}`,
				!hasPrev && !hasNext ? 'isolated' : !hasPrev ? 'first' : !hasNext ? 'last' : 'middle'
			);
		}
		return map;
	});

	/**
	 * Check if an item is selected
	 */
	function isItemSelected(type, id) {
		return positionByKey.has(`${type}:${id}`);
	}

	/**
	 * Clear all selections
	 */
	function clearSelection() {
		selectedItems = [];
		lastSelectedIndex = null;
		clearSelectedItem();
	}

	/**
	 * Update toolbar with current selection
	 */
	function updateToolbarSelection() {
		if (selectedItems.length === 0) {
			clearSelectedItem();
		} else {
			setSelectedItem({
				items: selectedItems,
				count: selectedItems.length,
				hasGroups: selectedItems.some(i => i.type === 'group'),
				hasStudies: selectedItems.some(i => i.type === 'study'),
				// A series is neither a group nor a study (SERIES_PLAN §4), so without its own flag
				// every consumer downstream had to re-derive it from `items` or, worse, treat a
				// series selection as "not a selection at all".
				hasSeries: selectedItems.some(i => i.type === 'series')
			});
		}
		
		// Call additional callback if provided
		if (updateToolbarCallback) {
			updateToolbarCallback();
		}
	}

	/**
	 * Handle item click with modifier keys
	 */
	function handleItemClick(event, type, id, data, flattenedList) {
		event.preventDefault();
		event.stopPropagation();
		
		const clickedItem = flattenedList.find(item => item.type === type && item.id === id);
		
		if (!clickedItem) return;
		
		// Check for modifier keys
		const isShift = event.shiftKey;
		const isCmd = event.metaKey || event.ctrlKey;
		
		if (isShift && lastSelectedIndex !== null) {
			// Shift+Click: Range selection (multi-select)
			const startIndex = Math.min(lastSelectedIndex, clickedItem.index);
			const endIndex = Math.max(lastSelectedIndex, clickedItem.index);
			
			// Select all items in range
			const rangeItems = flattenedList.filter(
				item => item.index >= startIndex && item.index <= endIndex
			);
			
			// Add range to selection (avoiding duplicates). A local Set rather than
			// `isItemSelected`: that reads `positionByKey`, which each push invalidates, so asking
			// it inside this loop would rebuild the whole map once per row in the range. One
			// assignment at the end also means one reactive update instead of one per row.
			const already = new Set(selectedItems.map((i) => `${i.type}:${i.id}`));
			const additions = [];
			for (const item of rangeItems) {
				if (!already.has(`${item.type}:${item.id}`)) {
					additions.push({
						type: item.type,
						id: item.id,
						data: item.data,
						index: item.index
					});
				}
			}
			if (additions.length > 0) selectedItems = [...selectedItems, ...additions];
			
		} else if (isCmd) {
			// Cmd/Ctrl+Click: Toggle individual item
			const existingIndex = selectedItems.findIndex(
				item => item.type === type && item.id === id
			);
			
			if (existingIndex >= 0) {
				// Remove from selection
				// If removing a group, also remove its studies
				if (type === 'group') {
					const groupData = selectedItems[existingIndex].data;
					selectedItems = selectedItems.filter(item => {
						// Keep items that are not this group and not studies in this group
						if (item.type === 'group' && item.id === id) return false;
						if (item.type === 'study' && groupData.studies.some(s => s.id === item.id)) return false;
						return true;
					});
				} else {
					// Use filter instead of splice to ensure Svelte 5 reactivity
					selectedItems = selectedItems.filter((item, index) => index !== existingIndex);
				}
			} else {
				// Add to selection
				selectedItems.push({
					type,
					id,
					data,
					index: clickedItem.index
				});
			}
			
			lastSelectedIndex = clickedItem.index;
			
		} else {
			// Regular click: Single selection
			selectedItems = [{
				type,
				id,
				data,
				index: clickedItem.index
			}];
			
			lastSelectedIndex = clickedItem.index;
		}
		
		updateToolbarSelection();
	}

	/**
	 * Handle study double-click for navigation
	 */
	function handleStudyDoubleClick(study) {
		const currentTime = Date.now();
		const timeSinceLastClick = currentTime - lastClickTime;
		
		// Check if this is a double-click on already selected study
		const isDoubleClick = timeSinceLastClick < DOUBLE_CLICK_THRESHOLD && 
		                      selectedItems.length === 1 &&
		                      isItemSelected('study', study.id);
		
		lastClickTime = currentTime;
		
		return isDoubleClick;
	}

	/**
	 * Filter selected items to only include studies (used for drag operations)
	 */
	function getSelectedStudies() {
		return selectedItems.filter(item => item.type === 'study');
	}

	/**
	 * Remove groups from selection (called when drag starts)
	 */
	function removeGroupsFromSelection() {
		selectedItems = selectedItems.filter(item => item.type === 'study');
		updateToolbarSelection();
	}

	/**
	 * Get the position of an item within a continuous selection run
	 * @param {string} type - Item type ('study' or 'group')
	 * @param {string} id - Item ID
	 * @returns {'first' | 'middle' | 'last' | 'isolated' | null}
	 */
	function getSelectionPosition(type, id) {
		// Precomputed in `positionByKey`: consecutive runs in the flattened list are joined
		// visually, so the position depends on the neighbours' indexes, not on this item alone.
		return positionByKey.get(`${type}:${id}`) ?? null;
	}

	/**
	 * Move selected items to a target group
	 * @param {string|null} targetGroupId - ID of target group, or null for ungrouped
	 * @param {Function} invalidateCallback - Callback to reload data after move
	 * @returns {Promise<{success: boolean, error?: string}>}
	 */
	async function moveSelectionToGroup(targetGroupId, invalidateCallback) {
		if (selectedItems.length === 0) {
			return { success: false, error: 'No items selected' };
		}

		try {
			// Separate studies and groups
			const studyItems = selectedItems.filter(item => item.type === 'study');
			const groupItems = selectedItems.filter(item => item.type === 'group');
			const seriesItems = selectedItems.filter(item => item.type === 'series');

			// Move studies
			if (studyItems.length > 0) {
				await Promise.all(
					studyItems.map(item =>
						fetch(`/api/studies/${item.id}`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ groupId: targetGroupId })
						})
					)
				);
			}

			// Move groups
			if (groupItems.length > 0) {
				await Promise.all(
					groupItems.map(item =>
						fetch(`/api/groups/${item.id}`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ parentGroupId: targetGroupId })
						})
					)
				);
			}

			// Move series.
			//
			// ⚠️ This branch was MISSING, and its absence was silent: a selected series was filtered
			// into neither list above, so the move reported success while leaving the series exactly
			// where it was. `study_series.groupId` exists and a series occupies one Finder slot the
			// way a study does (§4), so it moves the same way — via its own endpoint, because a
			// series is a separate table and `/api/groups` would not find it.
			if (seriesItems.length > 0) {
				await Promise.all(
					seriesItems.map(item =>
						fetch(`/api/series/${item.id}`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ groupId: targetGroupId })
						})
					)
				);
			}

			// Reload data
			if (invalidateCallback) {
				await invalidateCallback();
			}

			// Clear selection after successful move
			clearSelection();

			return { success: true };
		} catch (error) {
			console.error('Error moving items:', error);
			return { success: false, error: error.message || 'Failed to move items' };
		}
	}

	return {
		// State
		get selectedItems() { return selectedItems; },
		set selectedItems(value) { selectedItems = value; },
		get lastSelectedIndex() { return lastSelectedIndex; },
		set lastSelectedIndex(value) { lastSelectedIndex = value; },
		
		// Functions
		isItemSelected,
		clearSelection,
		updateToolbarSelection,
		handleItemClick,
		handleStudyDoubleClick,
		getSelectedStudies,
		removeGroupsFromSelection,
		getSelectionPosition,
		moveSelectionToGroup
	};
}
