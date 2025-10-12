<script>
	/**
	 * # ToolbarApp Component
	 * 
	 * Main application toolbar for the authenticated app interface.
	 * Provides access to document operations, view controls, formatting tools, and settings.
	 * 
	 * ## Features
	 * - Document operations (Open, New, Delete)
	 * - View controls (Zoom, Wide, Overview)
	 * - Formatting menus (Outline, Text, Literary, Color)
	 * - Mode toggles (Notes, Verses)
	 * - View mode switching (Analyze, Document)
	 * - Settings access
	 * - Dark themed with sticky positioning
	 * 
	 * ## Menu Integration
	 * Integrates with several dropdown menus:
	 * - MenuZoom: Zoom level control
	 * - MenuStructure: Outline structure options
	 * - MenuText: Text formatting options
	 * - MenuLiterary: Literary device highlighting
	 * - MenuColor: Color scheme selection
	 * 
	 * ## Layout Structure
	 * Left section: Open, New buttons
	 * Center-left: Zoom control
	 * Center: Formatting menus (Outline, Text, Literary, Color)
	 * Center-right: View toggles (Notes, Verses)
	 * Right section: Layout toggles, mode switcher, Settings
	 * 
	 * ## State Management
	 * @property {string} zoomLabel - Current zoom level display (default: '100%')
	 * 
	 * ## Usage
	 * ```svelte
	 * <ToolbarApp />
	 * ```
	 * 
	 * @component
	 */

	import { page } from '$app/stores';
	import ButtonGrouped from '$lib/elements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import MenuButton from '$lib/elements/buttons/MenuButton.svelte';
	import ToggleButton from '$lib/elements/buttons/ToggleButton.svelte';
	import SpacerFixed from '$lib/elements/SpacerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';
	import MenuZoom from '$lib/components/menus/MenuZoom.svelte';
	import MenuStructure from '$lib/components/menus/MenuStructure.svelte';
	import MenuText from '$lib/components/menus/MenuText.svelte';
	import MenuLiterary from '$lib/components/menus/MenuLiterary.svelte';
	import MenuColor from '$lib/components/menus/MenuColor.svelte';
	import { getAppToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState, updateToolbarForRoute } from '$lib/stores/toolbar.js';

	/** @type {string} Current zoom level label */
	let zoomLabel = $state('100%');

	// Get toolbar configuration
	const toolbarConfig = getAppToolbarConfig();

	// Update toolbar state when route changes
	$effect(() => {
		updateToolbarForRoute($page.url.pathname);
	});
</script>

<Toolbar classes="dark" position="sticky" zIndex="1000">
	<!-- <MenuButton classes="toolbar-dark" iconId="book" menuId="MenuStudies" underLabelClasses="light" underLabel="Studies"></MenuButton> -->

	{#each toolbarConfig as item}
		{#if item.type === 'spacer'}
			{#if item.variant === 'fixed'}
				<SpacerFixed />
			{:else if item.variant === 'flex'}
				<SpacerFlex />
			{/if}
		{:else if item.type === 'section'}
			{#each item.items as button}
				{#if button.type === 'icon'}
					<IconButton
						iconId={button.iconId}
						underLabel={button.underLabel}
						href={button.href}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
						isDisabled={button.iconId === 'trashcan' ? !$toolbarState.canDelete : button.isDisabled}
					/>
				{:else if button.type === 'menu'}
					<MenuButton
						iconId={button.iconId}
						label={button.dynamicLabel ? zoomLabel : undefined}
						menuId={button.menuId}
						underLabel={button.underLabel}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
						isDisabled={
							button.menuId === 'MenuZoom' ? !$toolbarState.canZoom :
							button.menuId === 'MenuStructure' ? !$toolbarState.canStructure :
							button.menuId === 'MenuText' ? !$toolbarState.canText :
							button.menuId === 'MenuLiterary' ? !$toolbarState.canLiterary :
							button.menuId === 'MenuColor' ? !$toolbarState.canColor :
							false
						}
					/>
				{:else if button.type === 'toggle'}
					<ToggleButton
						iconId={button.iconId}
						underLabel={button.underLabel}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
						isDisabled={
							button.iconId === 'note' ? !$toolbarState.canToggleNotes :
							button.iconId === 'reference' ? !$toolbarState.canToggleVerses :
							button.iconId === 'wide' ? !$toolbarState.canToggleWide :
							button.iconId === 'outline' ? !$toolbarState.canToggleOverview :
							button.isDisabled
						}
					/>
				{:else if button.type === 'grouped'}
					<ButtonGrouped
						buttons={button.buttons}
						defaultActive={button.defaultActive}
						buttonClasses={button.buttonClasses}
						underLabelClasses={button.underLabelClasses}
						isDisabled={button.isDisabled}
					/>
				{/if}
			{/each}
		{/if}
	{/each}
</Toolbar>

<MenuZoom menuId="MenuZoom" onselect={(value) => (zoomLabel = value)} />
<MenuStructure menuId="MenuStructure" />
<MenuText menuId="MenuText" />
<MenuLiterary menuId="MenuLiterary" />
<MenuColor menuId="MenuColor" />
