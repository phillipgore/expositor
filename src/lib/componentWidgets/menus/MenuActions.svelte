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

	import { goto } from '$app/navigation';
	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import MoveToGroupModal from '../modals/MoveToGroupModal.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';
	import { wouldCreateCircularNesting } from '$lib/utils/groupHierarchy.js';
	import { flattenGroupsForMenu } from '$lib/utils/groupFlattening.js';

	/** @type {{ menuId: string, groups: Array, onMoveToGroup: Function, onEdit: Function, onDelete: Function }} Props */
	let { menuId, groups = [], onMoveToGroup, onEdit, onDelete } = $props();

	let showMoveToModal = $state(false);

	// Check if a single group is selected
	let selectedGroup = $derived(
		$toolbarState.selectedItem?.count === 1 && 
		$toolbarState.selectedItem?.items[0]?.type === 'group'
			? $toolbarState.selectedItem.items[0]
			: null
	);

	// Check if anything is selected
	let hasSelection = $derived(
		$toolbarState.selectedItem?.count > 0 || false
	);

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

	// Note: flattenGroupsForMenu is no longer needed here as the modal handles flattening

	/** Navigate to new study page, optionally with groupId */
	const handleNewStudy = (groupId = null) => {
		// Close the menu first
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Then navigate
		if (groupId) {
			goto(`/new-study?groupId=${groupId}`);
		} else {
			goto('/new-study');
		}
	};

	/** Navigate to new group page, optionally with parentGroupId */
	const handleNewGroup = (parentGroupId = null) => {
		// Close the menu first
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Then navigate
		if (parentGroupId) {
			goto(`/new-study-group?parentGroupId=${parentGroupId}`);
		} else {
			goto('/new-study-group');
		}
	};

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
		iconId="book"
		label="New Study"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewStudy(null)}
	/>

	<IconButton
		iconId="book"
		label="New Study Group in Selected"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewStudy(selectedGroup.id)}
		isDisabled={!selectedGroup}
	/>

	<DividerHorizontal />

	<IconButton
		iconId="folder"
		label="New Study Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewGroup(null)}
	/>

	<IconButton
		iconId="folder"
		label="New Study Group in Selected"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewGroup(selectedGroup.id)}
		isDisabled={!selectedGroup}
	/>
	
	<DividerHorizontal />
	
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
		isDisabled={!hasSelection}
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
		isDisabled={!hasSelection}
	/>
</Menu>

<MoveToGroupModal
	isOpen={showMoveToModal}
	{groups}
	selectedItems={$toolbarState.selectedItem?.items || []}
	onMoveToGroup={handleMoveFromModal}
	onClose={handleModalClose}
/>
