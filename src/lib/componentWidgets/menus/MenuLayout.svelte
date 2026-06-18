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

	// The note side-pickers only apply to a single selected connection that
	// actually has a note. Other layout items stay gated behind view modes.
	let noteSideDisabled = $derived(
		!(
			$toolbarState.hasActiveConnection &&
			$toolbarState.activeConnectionIds?.length === 1 &&
			$toolbarState.activeConnectionHasNote
		)
	);
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
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
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
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-width"
		label="Set Column Width"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-width'));
		}}
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-width-reset"
		label="Reset Column Width"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-column-width'));
		}}
		isDisabled={!$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
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
		isDisabled={!$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
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
		isDisabled={!$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
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
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}
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
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<DividerHorizontal />

	<!-- Link / Unlink segment heights: linked segments are kept at the height of the
	     tallest member and resize together. Link needs 2+ selected segments that aren't
	     already all in one group; Unlink needs the selection to include a linked segment. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-height-link"
		label="Link Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('link-segment-height'));
		}}
		isDisabled={!$toolbarState.canLinkSegmentHeight || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-height-unlink"
		label="Unlink Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('unlink-segment-height'));
		}}
		isDisabled={!$toolbarState.canUnlinkSegmentHeight || $toolbarState.overviewMode || $toolbarState.focusMode}
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


