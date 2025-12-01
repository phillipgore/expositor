<script>
	/**
	 * MenuHeadings Component
	 * 
	 * Headings insertion menu for adding heading elements to document content.
	 * Provides operations for inserting segment titles, headings, and subheadings.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuHeadings" iconId="headings" label="Headings" />
	 * <MenuHeadings menuId="MenuHeadings" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuHeadings') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Insert segment title
	 * - Insert segment heading
	 * - Insert segment subheading
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuHeadings' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Headings insertion menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-title"
		label="Insert Segment Title"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-heading"
		label="Insert Segment Heading"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-subheading"
		label="Insert Segment Subheading"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.canUseHeadingItems}
	/>
</Menu>
