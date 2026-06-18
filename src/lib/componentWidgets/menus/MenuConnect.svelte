<script>
	/**
	 * MenuConnect Component
	 *
	 * Everything that operates on a connection lives here:
	 * - Connect — create a connection between two selected structural elements
	 *   (moved out of MenuStructure so that menu stays focused on split/join/move).
	 * - Connection Quick Note — add a note to the selected connection (auto-reveals
	 *   connection notes if hidden). Text/segment notes live in the Markup menu.
	 * - Quick-note placement — once a connection has a quick note, fine-tune where
	 *   that note card sits relative to its anchor dot. These items only apply to a
	 *   single selected connection that actually has a note (see noteSideDisabled).
	 *
	 * The note-placement groups are:
	 * - Side   — Above / Below / Right / Left (which edge of the dot the card hangs off)
	 * - Slide  — how far the dot rides ALONG the connection line (noteAnchorT)
	 * - Position — how far the card slides ALONG its anchored edge (noteOffset)
	 * - Offset — the gap the card floats OFF the line, perpendicular to it (noteLead)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuConnect" iconId="connect" underLabel="Connect" />
	 * <MenuConnect menuId="MenuConnect" />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuConnect') - Unique identifier for the menu
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState, showConnectionNotes } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuConnect' } = $props();

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	/**
	 * Re-attach the selected connection's quick note to a chosen side of its
	 * anchor dot. The card always extends AWAY from the chosen edge, so picking
	 * 'top' hangs the card below the dot, 'left' puts it to the right, etc.
	 * ConnectionsOverlay listens for this event (handleSetNoteSide).
	 * @param {'top'|'right'|'bottom'|'left'} side
	 */
	function setNoteSide(side) {
		closeMenu();
		window.dispatchEvent(new CustomEvent('connection-note-set-side', { detail: { side } }));
	}

	// The note placement items (Side / Slide / Position / Offset) apply to EVERY
	// selected connection that has a note — so they enable whenever one or more of
	// the selected connections carries a note. A single chosen value is applied to
	// all of them (each clamped to its own limits where relevant).
	let noteSideDisabled = $derived(
		!($toolbarState.hasActiveConnection && $toolbarState.activeConnectionNoteCount > 0)
	);

	// "Connection Quick Note" stays SINGLE-selection: a note can only be added to one
	// connection at a time. It is enabled only when EXACTLY ONE connection is selected
	// AND that connection does not already have a note — so it is disabled under
	// multi-select, or when the single selected line already carries a note.
	let quickNoteDisabled = $derived(
		!(
			$toolbarState.hasActiveConnection &&
			$toolbarState.activeConnectionIds.length === 1 &&
			!$toolbarState.activeConnectionHasNote
		)
	);
</script>


<Menu {menuId} ariaLabel="Connect menu">
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

	<!-- Connection Quick Note: add a note to the selected connection. Auto-shows
	     connection notes if hidden, so the new note is visible. Text/segment notes
	     are added from the Markup menu's "Text Quick Note" item. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Connection Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show connection notes if hidden, so the new note is visible.
			// Recomputes the master notesVisible toggle and persists the preference.
			showConnectionNotes();
			window.dispatchEvent(new CustomEvent('connection-insert-note'));
		}}
		isDisabled={quickNoteDisabled}
	/>


	<DividerHorizontal />

	<!-- Connection quick-note placement: pick which side of the anchor dot the
	     note card attaches to. The card extends away from the chosen edge, so the
	     label describes where the card lands relative to the dot. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-above"
		label="Quick Note Above"
		role="menuitem"
		handleClick={() => setNoteSide('bottom')}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-below"
		label="Quick Note Below"
		role="menuitem"
		handleClick={() => setNoteSide('top')}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-right"
		label="Quick Note Right"
		role="menuitem"
		handleClick={() => setNoteSide('left')}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-left"
		label="Quick Note Left"
		role="menuitem"
		handleClick={() => setNoteSide('right')}
		isDisabled={noteSideDisabled}
	/>

	<DividerHorizontal />

	<!-- Quick note SLIDE: how far the anchor dot rides ALONG the connection line
	     (noteAnchorT, surfaced as 0–100%). Set opens a numeric modal; Reset reverts
	     to the default (centred on the line). -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-slide"
		label="Set Quick Note Slide"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-connection-note-slide'));
		}}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-slide-reset"
		label="Reset Quick Note Slide"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-connection-note-slide'));
		}}
		isDisabled={noteSideDisabled}
	/>

	<DividerHorizontal />

	<!-- Quick note POSITION: how far the card slides ALONG its anchored edge,
	     relative to the anchor dot (noteOffset). Set opens a numeric modal; Reset
	     reverts to the default (centred on the dot). -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-positon"
		label="Set Quick Note Position"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-connection-note-position'));
		}}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-positon-reset"
		label="Reset Quick Note Position"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-connection-note-position'));
		}}
		isDisabled={noteSideDisabled}
	/>

	<DividerHorizontal />

	<!-- Quick note OFFSET: the gap the card floats OFF the connection line,
	     perpendicular to it (noteLead). Set opens a numeric modal; Reset reverts
	     to the default (flush against the line). -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-offset"
		label="Set Quick Note Offset"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-connection-note-offset'));
		}}
		isDisabled={noteSideDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-offset-reset"
		label="Reset Quick Note Offset"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-connection-note-offset'));
		}}
		isDisabled={noteSideDisabled}
	/>
</Menu>
