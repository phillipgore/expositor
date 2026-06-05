<script>
	/**
	 * MenuStructure Component
	 * 
	 * Document structure management menu for organizing content.
	 * Structural tiers are ordered largest container first (Column ⊃ Section ⊃
	 * Segment) to match the app's nesting hierarchy and the View menu's ordering.
	 * Each tier pairs a split action with its inverse join action:
	 * - Column  — Split Column / Join Column
	 * - Section — Split Section / Join Section
	 * - Segment — Split Segment / Join Segment
	 * - Text    — Move Text Up / Move Text Down (relocates content between segments)
	 * - Connect — creates a connection between two selected structural elements
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="section" underLabel="Structure" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
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
		iconId="column-split"
		label="Split Column"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split column event via custom event
			window.dispatchEvent(new CustomEvent('insert-column'));
		}}
		isDisabled={!$toolbarState.canInsertColumn || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-join"
		label="Join Column"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.isActiveColumnFirstInPassage}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-split"
		label="Split Section"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split section event via custom event
			window.dispatchEvent(new CustomEvent('insert-section'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-join"
		label="Join Section"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.isActiveSectionFirstInPassage}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-split"
		label="Split Segment"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split segment event via custom event
			window.dispatchEvent(new CustomEvent('insert-segment'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-join"
		label="Join Segment"
		role="menuitem"
		handleClick={closeMenu}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.isActiveSegmentFirstInPassage}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Text Up"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-up'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.isWordInFirstSegment || $toolbarState.isCaretAtSegmentStart}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Text Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-down'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.isWordInLastSegment || $toolbarState.isCaretAtSegmentEnd}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Connect"


		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('insert-connection'));
		}}
		isDisabled={!$toolbarState.canInsertConnection}
	/>

</Menu>
