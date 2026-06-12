<script>
	/**
	 * MenuOutline Component
	 * 
	 * Outline menu for adding heading and note annotations to the active segment.
	 * Items add a new element to the current selection; removal is handled elsewhere
	 * (the Delete toolbar action while editing a heading or note).
	 * 
	 * Items:
	 * - Heading One / Two / Three — add a heading at the given level to the active segment
	 * - Quick Note — add a note. Context-aware: adds a connection note when a connection
	 *   is selected, otherwise a passage (segment) note. Auto-reveals the relevant notes
	 *   if they are currently hidden.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuOutline" iconId="outline" underLabel="Markup" />
	 * <MenuOutline menuId="MenuOutline" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuOutline') - Unique identifier for the menu
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
    import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState, showPassageNotes, showConnectionNotes } from '$lib/stores/toolbar.js';


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
		label="Heading One"
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
		label="Heading Two"
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
		label="Heading Three"
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
		label="Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			if ($toolbarState.hasActiveConnection) {
				// Auto-show connection notes if hidden, so the new note is visible.
				// Recomputes the master notesVisible toggle and persists the preference.
				showConnectionNotes();
				// Trigger insert connection note event
				window.dispatchEvent(new CustomEvent('connection-insert-note'));
			} else {
				// Auto-show passage notes if hidden, so the new note is visible.
				// Recomputes the master notesVisible toggle and persists the preference.
				showPassageNotes();
				// Trigger insert segment note event via custom event
				window.dispatchEvent(new CustomEvent('insert-note-from-menu'));
			}

		}}
		isDisabled={
			!(
				($toolbarState.hasActiveSegment && !$toolbarState.hasActiveColumn && !$toolbarState.hasActiveSection && !$toolbarState.activeSegmentHasNote)
				||
				($toolbarState.hasActiveConnection && !$toolbarState.activeConnectionHasNote)
			)
		}
	/>

</Menu>
