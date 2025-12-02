<script>
	/**
	 * MenuStructure Component
	 * 
	 * Document structure management menu for organizing content.
	 * Provides tools for creating sections, columns, and groups,
	 * as well as pinning/unpinning structural elements.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="pin" label="Outline" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Create new sections
	 * - Create new columns
	 * - Create new groups
	 * - Pin/unpin structural elements
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuStructure' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Document structure menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="split"
		label="Split Text"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="join"
		label="Join Text"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one"
		label="Insert Heading One"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two"
		label="Insert Heading Two"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three"
		label="Insert Heading Three"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Text Up"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Text Down"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-disconnect"
		label="Disconnect Segment"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-connect"
		label="Connect Segment"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-insert"
		label="Insert Column"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-remove"
		label="Remove Column"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseStructureItems}
	/>
</Menu>
