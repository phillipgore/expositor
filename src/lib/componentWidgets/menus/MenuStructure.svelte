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
	 * <MenuButton menuId="MenuStructure" iconId="pin" label="Structure" />
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
	import { toolbarState, setToolbarState } from '$lib/stores/toolbar.js';

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
		label="Insert Segment"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert segment event via custom event
			window.dispatchEvent(new CustomEvent('insert-segment'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="join"
		label="Join Segment"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-disconnect"
		label="Insert Section"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert section event via custom event
			window.dispatchEvent(new CustomEvent('insert-section'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-connect"
		label="Join Section"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-insert"
		label="Insert Column"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert column event via custom event
			window.dispatchEvent(new CustomEvent('insert-column'));
		}}
		isDisabled={!$toolbarState.canInsertColumn || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-remove"
		label="Join Column"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Text Up"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Text Down"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Insert Connection"
		role="menuitem"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect-remove"
		label="Remove Connection"
		role="menuitem"
		handleClick={closeMenu}
	/>
</Menu>
