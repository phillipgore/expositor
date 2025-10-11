<script>
	/**
	 * MenuSettings Component
	 * 
	 * Application settings and account management menu.
	 * Provides access to account settings, toolbar customization,
	 * help documentation, and sign out functionality.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuSettings" iconId="gear" label="Settings" />
	 * <MenuSettings menuId="MenuSettings" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuSettings') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Account management access
	 * - Toolbar customization options
	 * - Help documentation
	 * - Sign out functionality
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuSettings' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} alignment="end" ariaLabel="Settings menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="account"
		label="Account"
		role="menuitem"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="toolbar"
		label="Toolbar"
		role="menuitem"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="help"
		label="Help"
		role="menuitem"
		handleClick={closeMenu}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="power"
		label="Sign Out"
		role="menuitem"
		handleClick={closeMenu}
	/>
</Menu>
