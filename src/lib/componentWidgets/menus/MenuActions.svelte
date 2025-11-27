<script>
	/**
	 * # MenuActions Component
	 * 
	 * Menu for performing actions on selected items in the Studies Panel.
	 * Provides keyboard-accessible alternatives to drag-and-drop operations.
	 * 
	 * ## Features
	 * - Move to... submenu with hierarchical group list
	 * - Remove from Group option (moves to ungrouped)
	 * - Delete option (with confirmation modal)
	 * - Dark themed menu
	 * - Circular nesting prevention for groups
	 * 
	 * ## Props
	 * @property {string} menuId - Unique identifier for the menu
	 * @property {Array} groups - All available groups for move operations
	 * @property {Function} onMoveToGroup - Callback when moving items to a group
	 * @property {Function} onDelete - Callback when delete is clicked
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuActions 
	 *   menuId="MenuActions" 
	 *   groups={allGroups}
	 *   onMoveToGroup={handleMove}
	 *   onDelete={handleDelete}
	 * />
	 * ```
	 * 
	 * @component
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import MoveToGroupModal from './MoveToGroupModal.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	/** @type {{ menuId: string, groups: Array, onMoveToGroup: Function, onEdit: Function, onDelete: Function }} Props */
	let { menuId, groups = [], onMoveToGroup, onEdit, onDelete } = $props();

	let showMoveToModal = $state(false);

	// Check if any selected items are in groups
	let hasGroupedItems = $derived(
		$toolbarState.selectedItem?.items.some(item => {
			if (item.type === 'study') {
				return item.data.groupId !== null;
			}
			if (item.type === 'group') {
				return item.data.parentGroupId !== null;
			}
			return false;
		}) || false
	);

	/**
	 * Check if moving selected groups to target would create circular nesting
	 */
	function wouldCreateCircularNesting(targetGroupId) {
		if (!$toolbarState.selectedItem) return false;

		const selectedGroups = $toolbarState.selectedItem.items.filter(i => i.type === 'group');
		
		// Can't move a group into itself
		if (selectedGroups.some(g => g.id === targetGroupId)) {
			return true;
		}

		// Check if target is a descendant of any selected group
		for (const selectedGroup of selectedGroups) {
			if (isDescendantOf(targetGroupId, selectedGroup.id)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Recursively check if groupId is a descendant of ancestorId
	 */
	function isDescendantOf(groupId, ancestorId) {
		const group = findGroupById(groupId, groups);
		if (!group) return false;
		
		if (group.parentGroupId === ancestorId) return true;
		if (!group.parentGroupId) return false;
		
		return isDescendantOf(group.parentGroupId, ancestorId);
	}

	/**
	 * Find a group by ID in the hierarchical structure
	 */
	function findGroupById(groupId, groupList) {
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
	 * Flatten groups into hierarchical list with depth indicators
	 */
	function flattenGroupsForMenu(groupList, depth = 0) {
		const result = [];
		for (const group of groupList) {
			result.push({
				id: group.id,
				name: group.name,
				depth,
				disabled: wouldCreateCircularNesting(group.id)
			});
			if (group.subgroups && group.subgroups.length > 0) {
				result.push(...flattenGroupsForMenu(group.subgroups, depth + 1));
			}
		}
		return result;
	}

	let flattenedGroups = $derived(flattenGroupsForMenu(groups));

	/**
	 * Handle edit click
	 */
	function handleEditClick() {
		// Close the menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		if (onEdit) {
			onEdit();
		}
	}

	/**
	 * Handle move to group click
	 */
	async function handleMoveToGroup(groupId) {
		// Close both menus
		const mainMenu = document.getElementById(menuId);
		if (mainMenu && mainMenu.matches(':popover-open')) {
			mainMenu.hidePopover();
		}
		
		if (onMoveToGroup) {
			await onMoveToGroup(groupId);
		}
	}

	/**
	 * Handle remove from group click
	 */
	async function handleRemoveFromGroup() {
		// Close the menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		if (onMoveToGroup) {
			await onMoveToGroup(null);
		}
	}

	/**
	 * Handle delete click
	 */
	function handleDeleteClick(event) {
		// Close the menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		if (onDelete) {
			// Pass whether this was triggered via keyboard
			// (Enter/Space on focused button) vs mouse click
			const viaKeyboard = event.detail === 0 || event instanceof KeyboardEvent;
			onDelete(viaKeyboard);
		}
	}

	/**
	 * Open move to modal
	 */
	function handleMoveToClick() {
		// Close the Actions menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Open the modal
		showMoveToModal = true;
	}

	/**
	 * Handle modal close
	 */
	function handleModalClose() {
		showMoveToModal = false;
	}

	/**
	 * Handle move from modal
	 */
	async function handleMoveFromModal(targetGroupId) {
		if (onMoveToGroup) {
			await onMoveToGroup(targetGroupId);
		}
		showMoveToModal = false;
	}
</script>

<Menu {menuId} classes="dark">
	<IconButton
		iconId="pencil"
		label="Edit"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleEditClick}
		isDisabled={!$toolbarState.canEdit}
	/>
	
	<DividerHorizontal />
	
	<IconButton
		iconId="arrow-right-curve"
		label="Move to..."
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleMoveToClick}
	/>
	
	<IconButton
		iconId="arrow-left-curve"
		label="Remove from Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleRemoveFromGroup}
		isDisabled={!hasGroupedItems}
	/>
	
	<DividerHorizontal />
	
	<IconButton
		iconId="trashcan"
		label="Delete"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleDeleteClick}
	/>
</Menu>

<MoveToGroupModal
	isOpen={showMoveToModal}
	{groups}
	selectedItems={$toolbarState.selectedItem?.items || []}
	onMoveToGroup={handleMoveFromModal}
	onClose={handleModalClose}
/>
