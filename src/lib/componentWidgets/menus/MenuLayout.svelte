<script>
	/**
	 * MenuLayout Component
	 *
	 * Visual layout tuning for the active selection. Unlike MenuStructure (which
	 * changes the document's structure via split/join/move/connect), these items
	 * only adjust spacing and sizing and are gated behind view modes — they are
	 * disabled in Overview, Compare, and Focus modes.
	 *
	 * Items are ordered largest container first (Column ⊃ Section ⊃ Segment) to
	 * match the app's nesting hierarchy and the Structure/View menus' ordering:
	 * - Column Spacing  — Set Column Spacing / Reset Column Spacing
	 * - Section Spacing — Set Section Spacing / Reset Section Spacing
	 * - Segment Height  — Set Segment Height / Reset Segment Height
	 *

	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuLayout" iconId="drafting-compass" underLabel="Layout" />
	 * <MenuLayout menuId="MenuLayout" />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuLayout') - Unique identifier for the menu
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuLayout' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Layout menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-spacing"
		label="Set Column Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-spacing'));
		}}
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-spacing-reset"
		label="Reset Column Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-column-spacing'));
		}}
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-spacing"
		label="Set Section Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-section-spacing'));
		}}
		isDisabled={!$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-spacing-reset"
		label="Reset Section Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-section-spacing'));
		}}
		isDisabled={!$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-height"
		label="Set Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-segment-height'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-height-reset"
		label="Reset Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('restore-segment-height'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.comparisonsVisible || $toolbarState.focusMode}
	/>
</Menu>

