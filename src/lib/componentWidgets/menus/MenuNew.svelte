<script>
	/**
	 * # MenuNew Component
	 * 
	 * Menu for creating new items (studies and study groups).
	 * Context-aware: shows option to create study in selected group when applicable.
	 * 
	 * ## Features
	 * - New Study Group option - navigates to /new-study-group
	 * - New Study in [Group] option - shown when single group is selected
	 * - New Study option - always available
	 * - Dark themed menu
	 * 
	 * ## Props
	 * @property {string} menuId - Unique identifier for the menu
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuNew menuId="MenuNew" />
	 * ```
	 * 
	 * @component
	 */

	import { goto } from '$app/navigation';
	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	/** @type {{ menuId: string }} Props */
	let { menuId } = $props();

	// Check if a single group is selected
	let selectedGroup = $derived(
		$toolbarState.selectedItem?.count === 1 && 
		$toolbarState.selectedItem?.items[0]?.type === 'group'
			? $toolbarState.selectedItem.items[0]
			: null
	);

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
		label="New Group in Selected Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewGroup(selectedGroup.id)}
		isDisabled={!selectedGroup}
	/>
</Menu>
