<script>
	/**
	 * MenuOutline Component
	 * 
	 * Outline menu for adding heading and note elements to segments.
	 * Provides operations for inserting segment headings at different levels and notes.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuOutline" iconId="outline" label="Outline" />
	 * <MenuOutline menuId="MenuOutline" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuOutline') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Insert heading one
	 * - Insert heading two
	 * - Insert heading three
	 * - Insert note (auto-shows notes if hidden)
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
    import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState, setToolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuOutline' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Outline menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one"
		label="Insert Heading One"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading one event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-one-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingOne}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two"
		label="Insert Heading Two"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading two event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-two-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingTwo}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three"
		label="Insert Heading Three"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading three event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-three-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingThree}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Insert Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show notes if they're hidden
			if (!$toolbarState.notesVisible) {
				setToolbarState('notesVisible', true);
			}
			// Trigger insert note event via custom event
			window.dispatchEvent(new CustomEvent('insert-note-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasNote}
	/>
</Menu>
