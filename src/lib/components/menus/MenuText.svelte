<script>
	/**
	 * MenuText Component
	 * 
	 * Text manipulation menu for editing document content.
	 * Provides operations for splitting/joining text and moving content up or down.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuText" iconId="text-join" label="Text" />
	 * <MenuText menuId="MenuText" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuText') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Split text into separate elements
	 * - Join text elements together
	 * - Move text up in document order
	 * - Move text down in document order
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuText' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Text manipulation menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-split"
		label="Split Text"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseTextItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-join"
		label="Join Text"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseTextItems}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Up"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseTextItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Down"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseTextItems}
	/>
</Menu>
