<script>
	/**
	 * MenuLiterary Component
	 * 
	 * Literary device markup menu for analyzing biblical text.
	 * Provides tools for identifying and marking various literary devices
	 * such as chiasmus, parallelism, repetition, and intensification.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuLiterary" iconId="literary-chiasm" label="Literary" />
	 * <MenuLiterary menuId="MenuLiterary" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuLiterary') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Mark chiasmus structures
	 * - Identify parallel passages
	 * - Highlight repetition patterns
	 * - Note intensification devices
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuLiterary' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Literary devices menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Connect"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseLiteraryItems}
	/>
	
	<DividerHorizontal />
	
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-chiasm"
		label="Chiasm"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseLiteraryItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-paralell"
		label="Parallelism"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseLiteraryItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-repeat"
		label="Repetition"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseLiteraryItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-intensify"
		label="Intensification"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseLiteraryItems}
	/>
</Menu>
