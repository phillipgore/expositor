<script>
	/**
	 * MenuView Component
	 * 
	 * View overlay toggles for controlling which annotations and panels are visible
	 * on the passage. Provides persistent toggle items that keep the menu open so
	 * the user can enable or disable multiple options in a single session.
	 * 
	 * Items:
	 * - Headings    — shows heading annotations on segments
	 * - Notes       — shows note annotations on segments
	 * - Connections — shows connection lines between segments
	 * - Compare     — shows translation comparison alongside the passage
	 * - Commentary  — opens the commentary side panel
	 * 
	 * Usage:
	 * ```svelte
	 * <MenuButton menuId="MenuView" iconId="glasses" underLabel="View" classes="toolbar-dark" />
	 * <MenuView menuId="MenuView" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuView') - Unique identifier for the menu
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import MenuToggleItem from '$lib/componentElements/buttons/MenuToggleItem.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState, toggleHeadings, toggleNotes, toggleConnections, toggleComparison, toggleCommentary } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuView' } = $props();
</script>

<Menu {menuId} ariaLabel="View options">
	<MenuToggleItem
		label="Headings"
		isActive={$toolbarState.headingsVisible}
		onToggle={toggleHeadings}
		isDisabled={!$toolbarState.canToggleHeadings || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Quick Notes"
		isActive={$toolbarState.notesVisible}
		onToggle={toggleNotes}
		isDisabled={!$toolbarState.canToggleNotes}
	/>
	<MenuToggleItem
		label="Connections"
		isActive={$toolbarState.connectionsVisible}
		onToggle={toggleConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="Compare"
		isActive={$toolbarState.comparisonsVisible}
		onToggle={toggleComparison}
		isDisabled={!$toolbarState.canToggleComparison}
	/>
	<MenuToggleItem
		label="Commentary"
		isActive={$toolbarState.commentaryPanelOpen}
		onToggle={toggleCommentary}
		isDisabled={!$toolbarState.canToggleComment || $toolbarState.overviewMode}
	/>
</Menu>
