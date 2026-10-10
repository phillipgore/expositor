<script>
	/**
	 * MenuLayout Component
	 *
	 * Visual layout tuning for the active selection. Unlike MenuStructure (which
	 * changes the document's structure via split/join/move) and MenuConnect (which
	 * creates connections and places their quick notes), these items only adjust
	 * spacing and sizing and are gated behind view modes — they are disabled in
	 * Overview, Compare, and Focus modes.
	 *
	 * Items are ordered largest container first (Column ⊃ Section ⊃ Segment) to
	 * match the app's nesting hierarchy and the Structure/View menus' ordering:
	 * - Column Spacing  — Set Column Spacing / Reset Column Spacing
	 * - Column Width    — Set Column Width / Reset Column Width
	 * - Section Spacing — Set Section Spacing / Reset Section Spacing
	 * - Segment Height  — Set / Reset Segment Height, Link / Unlink (resize linked segments together)
	 * - Segment Position — Set Segment Position / Reset Segment Position (pull right)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuLayout" iconId="drafting-compass" underLabel="Layout" />
	 * <MenuLayout menuId="MenuLayout" />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuLayout') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view this menu serves.
	 *   Column Spacing / Column Width tune the interactive Analyze canvas's per-column
	 *   layout, which the read-only Document view (paginated onto fixed Letter sheets)
	 *   has no mechanic for — so those items are DISABLED (not hidden) on the Document
	 *   view, keeping the menu's shape stable across mode switches.
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuLayout', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');


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
		label="Set Column Spacing…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-spacing'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Column Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-column-spacing'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		label="Set Column Width…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-width'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Column Width"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-column-width'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		label="Set Section Spacing…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-section-spacing'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Section Spacing"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-section-spacing'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSection || $toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		label="Set Segment Height…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-segment-height'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('restore-segment-height'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}

	/>

	<!-- Link / Unlink segment heights: linked segments are kept at the height of the
	     tallest member and resize together. Link needs 2+ selected segments that aren't
	     already all in one group; Unlink needs the selection to include a linked segment. -->
	<IconButton
		classes="menu-light justify-content-left"
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
		label="Unlink Segment Height"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('unlink-segment-height'));
		}}
		isDisabled={!$toolbarState.canUnlinkSegmentHeight || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<DividerHorizontal />

	<!-- Segment position: pull the selected segments to the right within their column
	     (capped 36px short of the right edge of the segment above). -->
	<IconButton
		classes="menu-light justify-content-left"
		label="Set Segment Position…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-segment-position'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Segment Position"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-segment-position'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSegment || $toolbarState.overviewMode || $toolbarState.focusMode}
	/>
</Menu>
