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
	 * <MenuButton menuId="MenuView" iconId="outline-bulleted" label="View" />
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

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState, toggleNotes, toggleVerses, toggleWide, toggleOverview } from '$lib/stores/toolbar.js';

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
		handleClick={() => { toggleNotes(); closeMenu(); }}
		isDisabled={!$toolbarState.canToggleNotes}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="reference"
		label="Verses"
		role="menuitem"
		handleClick={() => { toggleVerses(); closeMenu(); }}
		isDisabled={!$toolbarState.canToggleVerses}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="wide"
		label="Wide"
		role="menuitem"
		handleClick={() => { toggleWide(); closeMenu(); }}
		isDisabled={!$toolbarState.canToggleWide}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-bulleted"
		label="Overview"
		role="menuitem"
		handleClick={() => { toggleOverview(); closeMenu(); }}
		isDisabled={!$toolbarState.canToggleOverview}
	/>
</Menu>
