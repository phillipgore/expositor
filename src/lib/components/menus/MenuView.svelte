<script>
	/**
	 * MenuView Component
	 * 
	 * View management menu for controlling document display options.
	 * Provides toggles for Notes, Verses, Wide layout, and Overview modes.
	 * This menu appears on narrow screens (≤99.0rem) as a consolidated
	 * alternative to individual toolbar buttons.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuView" iconId="outline" label="View" />
	 * <MenuView menuId="MenuView" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuView') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Toggle Notes display
	 * - Toggle Verses display
	 * - Toggle Wide layout
	 * - Toggle Overview mode
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuView' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="View options menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Notes"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canToggleNotes}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="reference"
		label="Verses"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canToggleVerses}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="wide"
		label="Wide"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canToggleWide}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline"
		label="Overview"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canToggleOverview}
	/>
</Menu>
