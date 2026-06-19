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
	 *
	 * (Connect, which creates a connection between two selected structural
	 * elements, now lives in its own MenuConnect alongside quick-note placement.)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="section" underLabel="Structure" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view this menu serves.
	 *   The "Select All" items put the canvas into a selection mode, which only makes
	 *   sense in the interactive Analyze view; on the read-only Document view they are
	 *   DISABLED (not hidden), keeping the menu's shape stable across mode switches.
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuStructure', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');

	// "Select All" enters a selection mode that only applies to the interactive Analyze
	// canvas, so it's disabled on the Document view (in addition to the usual capability
	// gate). The split/join/move items below are already gated by selection state, which
	// the read-only Document view never produces, so they stay disabled there naturally.
	let selectAllDisabled = $derived(isDocument || !$toolbarState.canUseStructureItems);

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
		iconId="column"
		label="Select All Columns"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every column across the study (puts the app in column-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-columns'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="sections"
		label="Select All Sections"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every section across the study (puts the app in section-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-sections'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segments"
		label="Select All Segments"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every segment across the study (puts the app in segment-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-segments'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Select All Connections"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every currently VISIBLE connection across the study (respects the
			// per-type visibility toggles). ConnectionsOverlay handles the selection.
			window.dispatchEvent(new CustomEvent('select-all-connections'));
		}}
		isDisabled={selectAllDisabled}
	/>


	<DividerHorizontal />


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
		handleClick={() => {
			closeMenu();
			// Trigger join column event via custom event
			window.dispatchEvent(new CustomEvent('join-column'));
		}}
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
		handleClick={() => {
			closeMenu();
			// Trigger join section event via custom event
			window.dispatchEvent(new CustomEvent('join-section'));
		}}
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
		handleClick={() => {
			closeMenu();
			// Trigger join segment event via custom event
			window.dispatchEvent(new CustomEvent('join-segment'));
		}}
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
</Menu>
