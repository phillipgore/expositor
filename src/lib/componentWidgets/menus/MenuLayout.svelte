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
	 * - Column Width    — Set / Reset Column Width, Link toggle (resize linked columns together)
	 * - Column Spacing  — Set / Reset Column Spacing, Link toggle (change linked columns together)
	 * - Section Spacing — Set / Reset Section Spacing, Link toggle (change linked sections together)
	 * - Segment Height  — Set / Reset Segment Height, Link toggle (resize linked segments together)
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
	import MenuToggleItem from '$lib/componentElements/buttons/MenuToggleItem.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuLayout', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');

	// Hover reason for disabled items when a view mode (not the selection) is the cause.
	let modeReason = $derived(
		$toolbarState.overviewMode
			? 'Not available in Outline View'
			: $toolbarState.focusMode
				? 'Not available in Focus mode'
				: undefined
	);

	/**
	 * Link items are checkboxes (MenuToggleItem, as in the View menu) replacing separate
	 * Link / Unlink items. Like View's toggles they keep the menu open on click.
	 * Each state is derived from the store's canLink* / canUnlink* flags:
	 * - 'off'   — 2+ selected, none linked              → empty box,  click links them
	 * - 'on'    — every selected item is linked         → ticked box, click unlinks the
	 *             SELECTED items only (the rest of each group stays linked)
	 * - 'mixed' — some selected items linked, some not   → dash box,   click JOINS the
	 *             unlinked ones into the existing group(s)
	 * - null    — nothing to do (none / one unlinked)    → disabled
	 * The flags come from linkStateFromGroups() in $lib/utils/linkGroups.js.
	 * @param {boolean} canLink
	 * @param {boolean} canUnlink
	 * @returns {'off'|'on'|'mixed'|null}
	 */
	function toLinkState(canLink, canUnlink) {
		if (canLink && canUnlink) return 'mixed';
		if (canLink) return 'off';
		if (canUnlink) return 'on';
		return null;
	}

	let linkState = $derived({
		columnSpacing: toLinkState($toolbarState.canLinkColumnSpacing, $toolbarState.canUnlinkColumnSpacing),
		columnWidth: toLinkState($toolbarState.canLinkColumnWidth, $toolbarState.canUnlinkColumnWidth),
		sectionSpacing: toLinkState($toolbarState.canLinkSectionSpacing, $toolbarState.canUnlinkSectionSpacing),
		segmentHeight: toLinkState($toolbarState.canLinkSegmentHeight, $toolbarState.canUnlinkSegmentHeight)
	});



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
		label="Set Column Width…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-width'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}

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
		title={modeReason}

	/>

	<!-- Link / Unlink column width: linked columns keep the same width and resize together. -->
	<MenuToggleItem
		label="Link Column Width"
		isActive={linkState.columnWidth === 'on'}
		isMixed={linkState.columnWidth === 'mixed'}
		onToggle={() => window.dispatchEvent(new CustomEvent(($toolbarState.canLinkColumnWidth ? 'link-' : 'unlink-') + 'column-width'))}
		isDisabled={isDocument || linkState.columnWidth === null || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		label="Set Column Spacing…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-column-spacing'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveColumn || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}

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
		title={modeReason}

	/>

	<!-- Link / Unlink column spacing: linked columns keep the same left gap and change
	     together (drag or Set/Reset). -->
	<MenuToggleItem
		label="Link Column Spacing"
		isActive={linkState.columnSpacing === 'on'}
		isMixed={linkState.columnSpacing === 'mixed'}
		onToggle={() => window.dispatchEvent(new CustomEvent(($toolbarState.canLinkColumnSpacing ? 'link-' : 'unlink-') + 'column-spacing'))}
		isDisabled={isDocument || linkState.columnSpacing === null || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}
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
		title={modeReason}

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
		title={modeReason}

	/>

	<!-- Link / Unlink section spacing: linked sections keep the same gap above them and
	     change together. -->
	<MenuToggleItem
		label="Link Section Spacing"
		isActive={linkState.sectionSpacing === 'on'}
		isMixed={linkState.sectionSpacing === 'mixed'}
		onToggle={() => window.dispatchEvent(new CustomEvent(($toolbarState.canLinkSectionSpacing ? 'link-' : 'unlink-') + 'section-spacing'))}
		isDisabled={isDocument || linkState.sectionSpacing === null || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}
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
		title={modeReason}

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
		title={modeReason}

	/>

	<!-- Link / Unlink segment heights: linked segments are kept at the height of the
	     tallest member and resize together. Link needs 2+ selected segments that aren't
	     already all in one group; Unlink needs the selection to include a linked segment. -->
	<MenuToggleItem
		label="Link Segment Height"
		isActive={linkState.segmentHeight === 'on'}
		isMixed={linkState.segmentHeight === 'mixed'}
		onToggle={() => window.dispatchEvent(new CustomEvent(($toolbarState.canLinkSegmentHeight ? 'link-' : 'unlink-') + 'segment-height'))}
		isDisabled={isDocument || linkState.segmentHeight === null || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}
	/>

	<DividerHorizontal />

	<!-- Segment position: pull the selected segments to the right within their column
	     (capped 36px short of the right edge of the segment above). Set is disabled when
	     every selected segment is the only segment in its column; Reset stays available. -->
	<IconButton
		classes="menu-light justify-content-left"
		label="Set Segment Position…"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('set-segment-position'));
		}}
		isDisabled={isDocument || !$toolbarState.hasActiveSegment || !$toolbarState.canSetSegmentPosition || $toolbarState.overviewMode || $toolbarState.focusMode}
		title={modeReason}
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
		title={modeReason}
	/>
</Menu>
