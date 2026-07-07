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
	 * - Text Quick Note — add a passage (segment) note to the active segment. Auto-reveals
	 *   passage notes if they are currently hidden. (Connection notes are added from the
	 *   Connect menu's "Connection Quick Note" item.)
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
	import { toolbarState, showPassageNotes, showDocumentPassageNotes, showHeadings } from '$lib/stores/toolbar.js';



	// `view` tells this menu which study view it is rendered for ('analyze' |
	// 'document'). Text Quick Notes work on BOTH views but each keeps its OWN
	// visibility flag (passageNotesVisible vs documentPassageNotesVisible), so the
	// auto-reveal below must target the active view's helper: showPassageNotes for
	// Analyze, showDocumentPassageNotes for Document.
	let { menuId = 'MenuOutline', view = 'analyze' } = $props();

	// Reveal the active view's passage (text) quick notes so a freshly-inserted note
	// is immediately visible even if that view's notes were toggled off.
	function revealPassageNotesForView() {
		if (view === 'document') {
			showDocumentPassageNotes();
		} else {
			showPassageNotes();
		}
	}


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
			// Auto-show headings if hidden, so the new heading is visible.
			showHeadings();
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
			// Auto-show headings if hidden, so the new heading is visible.
			showHeadings();
			// Trigger insert heading three event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-three-from-menu'));

		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingThree}
	/>

	<DividerHorizontal />

	<!-- Text Quick Note: adds a passage (segment) note to the active segment.
	     Connection notes live in the Connect menu's "Connection Quick Note" item. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Text Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show the active view's passage notes if hidden, so the new note is
			// visible. Recomputes that view's master notes toggle and persists it.
			revealPassageNotesForView();
			// Trigger insert segment note event via custom event
			window.dispatchEvent(new CustomEvent('insert-note-from-menu'));
		}}

		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasNote}
	/>

</Menu>
