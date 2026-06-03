<script>
	/**
	 * MenuView Component
	 * 
	 * View overlay toggles for controlling which annotations and overlays are visible
	 * on the passage, as well as text display options and layout modes. Provides
	 * persistent toggle items that keep the menu open so the user can enable or
	 * disable multiple options in a single session.
	 * 
	 * Groups:
	 * - Annotations  — Headings, Quick Notes, Connections
	 * - Text Display — References, Notations, Paragraphs
	 * - Layout       — Wide View, Overview
	 * 
	 * Usage:
	 * ```svelte
	 * <MenuButton menuId="MenuView" iconId="eye" underLabel="View" classes="toolbar-dark" />
	 * <MenuView menuId="MenuView" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuView') - Unique identifier for the menu
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import MenuToggleItem from '$lib/componentElements/buttons/MenuToggleItem.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import {
		toolbarState,
		toggleHeadings,
		toggleNotes,
		toggleConnections,
		toggleColumnConnections,
		toggleSectionConnections,
		toggleSegmentConnections,
		toggleReferences,
		toggleVerses,
		toggleParagraphBreaks,
		toggleWide,
		toggleOverview
	} from '$lib/stores/toolbar.js';

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

	<DividerHorizontal />

	<MenuToggleItem
		label="All Connections"
		isActive={$toolbarState.connectionsVisible}
		onToggle={toggleConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Segment Connections"
		isActive={$toolbarState.segmentConnectionsVisible}
		onToggle={toggleSegmentConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Section Connections"
		isActive={$toolbarState.sectionConnectionsVisible}
		onToggle={toggleSectionConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Column Connections"
		isActive={$toolbarState.columnConnectionsVisible}
		onToggle={toggleColumnConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="References"
		isActive={$toolbarState.referencesVisible}
		onToggle={toggleReferences}
	/>
	<MenuToggleItem
		label="Notations"
		isActive={$toolbarState.versesVisible}
		onToggle={toggleVerses}
		isDisabled={!$toolbarState.canToggleVerses || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Paragraphs"
		isActive={$toolbarState.paragraphBreaksVisible}
		onToggle={toggleParagraphBreaks}
		isDisabled={!$toolbarState.canToggleParagraphBreaks || $toolbarState.overviewMode}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="Wide View"
		isActive={$toolbarState.wideLayout}
		onToggle={toggleWide}
		isDisabled={!$toolbarState.canToggleWide}
	/>
	<MenuToggleItem
		label="Overview"
		isActive={$toolbarState.overviewMode}
		onToggle={toggleOverview}
		isDisabled={!$toolbarState.canToggleOverview}
	/>
</Menu>
