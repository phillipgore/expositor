<script>
	/**
	 * MenuText Component
	 * 
	 * Text display option toggles for controlling how passage text is rendered.
	 * Provides persistent toggle items that keep the menu open so the user can
	 * enable or disable multiple options in a single session.
	 * 
	 * Items:
	 * - Reference  — shows scripture heading references
	 * - Notation   — shows verse/notation numbers
	 * - Paragraphs — shows translator paragraph break markers
	 * - Wide       — enables wide layout (wider passage columns)
	 * - Outline View — outline-only overview (hides passage text, structure only)
	 * 
	 * Usage:
	 * ```svelte
	 * <MenuButton menuId="MenuText" iconId="scroll" underLabel="Passage" classes="toolbar-dark" />
	 * <MenuText menuId="MenuText" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuText') - Unique identifier for the menu
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import MenuToggleItem from '$lib/componentElements/buttons/MenuToggleItem.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState, toggleReferences, toggleVerses, toggleParagraphBreaks, toggleWide, toggleOverview } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuText' } = $props();
</script>

<Menu {menuId} ariaLabel="Text display options">
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
		label="Outline View"
		isActive={$toolbarState.overviewMode}
		onToggle={toggleOverview}
		isDisabled={!$toolbarState.canToggleOverview}
	/>
</Menu>
