<script>
	/**
	 * MenuView Component
	 * 
	 * View overlay toggles for controlling which annotations and overlays are visible
	 * on the passage, as well as text display options and layout modes. Provides
	 * persistent toggle items that keep the menu open so the user can enable or
	 * disable multiple options in a single session.
	 * 
	 * Order flows from what is printed on the text → annotations layered on top →
	 * how the whole view is laid out:
	 * - Structure labels — Headings, References (refs render within headings)
	 * - Text markers     — Notations, Paragraphs
	 * - Quick Notes      — All / Passage / Connection
	 * - Connections      — All / Column / Section / Segment (largest container first)
	 * - Layout / mode    — Wide View, Overview
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
		togglePassageNotes,
		toggleConnectionNotes,
		toggleConnections,
		toggleColumnConnections,
		toggleSectionConnections,
		toggleSegmentConnections,
		toggleCrossItemConnections,
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
		label="References"
		isActive={$toolbarState.referencesVisible}
		onToggle={toggleReferences}
	/>

	<DividerHorizontal />

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
		label="All Quick Notes"
		isActive={$toolbarState.notesVisible}
		onToggle={toggleNotes}
		isDisabled={!$toolbarState.canToggleNotes}
	/>
	<MenuToggleItem
		label="Passage Quick Notes"
		isActive={$toolbarState.passageNotesVisible}
		onToggle={togglePassageNotes}
		isDisabled={!$toolbarState.canToggleNotes}
	/>
	<MenuToggleItem
		label="Connection Quick Notes"
		isActive={$toolbarState.connectionNotesVisible}
		onToggle={toggleConnectionNotes}
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
		label="Column Connections"
		isActive={$toolbarState.columnConnectionsVisible}
		onToggle={toggleColumnConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Section Connections"
		isActive={$toolbarState.sectionConnectionsVisible}
		onToggle={toggleSectionConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Segment Connections"
		isActive={$toolbarState.segmentConnectionsVisible}
		onToggle={toggleSegmentConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
	/>
	<MenuToggleItem
		label="Cross-Item Connections"
		isActive={$toolbarState.crossItemConnectionsVisible}
		onToggle={toggleCrossItemConnections}
		isDisabled={!$toolbarState.canToggleConnections || $toolbarState.overviewMode}
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
