<script>
	/**
	 * MenuStudies Component
	 * 
	 * Study navigation menu for managing Bible study documents.
	 * Provides quick access to opening existing studies and creating new ones.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStudies" iconId="book" label="Studies" />
	 * <MenuStudies menuId="MenuStudies" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStudies') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Navigate to Open Study page
	 * - Navigate to New Study page
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';

	let { menuId = 'MenuStudies' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Studies menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="book"
		label="Open Study"
		role="menuitem"
		url="/open"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="plus"
		label="New Study"
		role="menuitem"
		url="/new"
		handleClick={closeMenu}
	/>

	<!-- <DividerHorizontal></DividerHorizontal>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="pencil"
		label="Edit Study"
		
	/> -->
</Menu>
