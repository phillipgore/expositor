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
	 * Check if an item is selected
	 */
	function isItemSelected(type, id) {
		return selectedItems.some(item => item.type === type && item.id === id);
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
				hasStudies: selectedItems.some(i => i.type === 'study')
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
			
			// Add range to selection (avoiding duplicates)
			for (const item of rangeItems) {
				if (!isItemSelected(item.type, item.id)) {
					selectedItems.push({
						type: item.type,
						id: item.id,
						data: item.data,
						index: item.index
					});
				}
			}
			
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
		if (selectedItems.length === 0) return null;
		
		// Find the item in selected items
		const item = selectedItems.find(i => i.type === type && i.id === id);
		if (!item) return null;
		
		// Sort selected items by index
		const sortedItems = [...selectedItems].sort((a, b) => a.index - b.index);
		const itemIndex = sortedItems.findIndex(i => i.id === id && i.type === type);
		
		// Check if adjacent items are consecutive in the flattened list
		const prevItem = sortedItems[itemIndex - 1];
		const nextItem = sortedItems[itemIndex + 1];
		
		const hasConsecutivePrev = prevItem && prevItem.index === item.index - 1;
		const hasConsecutiveNext = nextItem && nextItem.index === item.index + 1;
		
		// Determine position
		if (!hasConsecutivePrev && !hasConsecutiveNext) return 'isolated';
		if (!hasConsecutivePrev && hasConsecutiveNext) return 'first';
		if (hasConsecutivePrev && !hasConsecutiveNext) return 'last';
		return 'middle';
	}

	return {
		// State
		get selectedItems() { return selectedItems; },
		set selectedItems(value) { selectedItems = value; },
		
		// Functions
		isItemSelected,
		clearSelection,
		updateToolbarSelection,
		handleItemClick,
		handleStudyDoubleClick,
		getSelectedStudies,
		removeGroupsFromSelection,
		getSelectionPosition
	};
}
