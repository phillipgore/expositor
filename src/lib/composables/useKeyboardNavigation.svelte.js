/**
 * Keyboard Navigation Composable
 * 
 * Manages keyboard navigation through a list of items (studies and groups).
 * Provides arrow key, Home/End, and PageUp/PageDown navigation.
 */

import { getFlattenedItemsList } from '$lib/utils/groupFlattening.js';

/**
 * Create a keyboard navigation manager
 * 
 * @param {Function} getSortedGroupsAndStudies - Function that returns sorted items
 * @param {Function} onToggleCollapse - Callback to toggle group collapse state
 * @returns {Object} Navigation state and handlers
 */
export function useKeyboardNavigation(getSortedGroupsAndStudies, onToggleCollapse) {
	let focusedItemIndex = $state(-1);

	/**
	 * Focus a specific item by index
	 */
	function focusItem(index, flattenedItems) {
		const item = flattenedItems[index];
		if (!item) return;

		// Find the DOM element and focus it.
		// For groups and series, target the select button specifically, since several elements
		// carry the same data-*-id.
		//
		// ⚠️ The series case was MISSING: a series row matches neither `.group-select-button` nor
		// `[data-study-id]`, so `document.querySelector` returned null and arrowing onto a series
		// focused nothing at all — the keyboard silently skipped a row that is visibly there.
		let selector;
		if (item.type === 'group') {
			selector = `.group-select-button[data-group-id="${item.id}"]`;
		} else if (item.type === 'series') {
			selector = `.series-select-button[data-series-id="${item.id}"]`;
		} else {
			selector = `[data-study-id="${item.id}"]`;
		}
		
		const element = document.querySelector(selector);
		if (element) {
			element.focus();
			// Scroll into view if needed
			element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	/**
	 * Handle Arrow Left - collapse expanded groups
	 */
	function handleArrowLeft(flattenedItems) {
		const currentItem = flattenedItems[focusedItemIndex];
		// Series rows collapse too — they are expandable Finder rows exactly as groups are (§4).
		// `onToggleCollapse` is supplied by StudiesPanel and routes by type.
		if (!currentItem || (currentItem.type !== 'group' && currentItem.type !== 'series')) return;

		const item = currentItem.data;

		// If expanded, collapse it
		if (!item.isCollapsed) {
			onToggleCollapse(item.id, item.isCollapsed, currentItem.type);
		}
	}

	/**
	 * Handle Arrow Right - expand collapsed groups
	 */
	function handleArrowRight(flattenedItems) {
		const currentItem = flattenedItems[focusedItemIndex];
		if (!currentItem || (currentItem.type !== 'group' && currentItem.type !== 'series')) return;

		const item = currentItem.data;

		// If collapsed, expand it
		if (item.isCollapsed) {
			onToggleCollapse(item.id, item.isCollapsed, currentItem.type);
		}
	}

	/**
	 * Handle keyboard navigation through the list
	 */
	function handleListKeyDown(event) {
		const sortedGroupsAndStudies = getSortedGroupsAndStudies();
		const flattenedItems = getFlattenedItemsList(sortedGroupsAndStudies);
		const itemCount = flattenedItems.length;
		
		if (itemCount === 0) return;

		// Initialize focus if not set
		if (focusedItemIndex === -1 && itemCount > 0) {
			focusedItemIndex = 0;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				focusedItemIndex = Math.min(focusedItemIndex + 1, itemCount - 1);
				focusItem(focusedItemIndex, flattenedItems);
				break;

			case 'ArrowUp':
				event.preventDefault();
				focusedItemIndex = Math.max(focusedItemIndex - 1, 0);
				focusItem(focusedItemIndex, flattenedItems);
				break;

			case 'ArrowLeft':
				event.preventDefault();
				handleArrowLeft(flattenedItems);
				break;

			case 'ArrowRight':
				event.preventDefault();
				handleArrowRight(flattenedItems);
				break;

			case 'Home':
				event.preventDefault();
				focusedItemIndex = 0;
				focusItem(focusedItemIndex, flattenedItems);
				break;

			case 'End':
				event.preventDefault();
				focusedItemIndex = itemCount - 1;
				focusItem(focusedItemIndex, flattenedItems);
				break;

			case 'PageDown':
				event.preventDefault();
				// Jump 10 items or to end
				focusedItemIndex = Math.min(focusedItemIndex + 10, itemCount - 1);
				focusItem(focusedItemIndex, flattenedItems);
				break;

			case 'PageUp':
				event.preventDefault();
				// Jump 10 items or to start
				focusedItemIndex = Math.max(focusedItemIndex - 10, 0);
				focusItem(focusedItemIndex, flattenedItems);
				break;
		}
	}

	/**
	 * Update focused index (called from onfocus handlers)
	 */
	function updateFocusedIndex(index) {
		focusedItemIndex = index;
	}

	/**
	 * Get current focused index
	 */
	function getFocusedIndex() {
		return focusedItemIndex;
	}

	return {
		handleListKeyDown,
		updateFocusedIndex,
		getFocusedIndex
	};
}
