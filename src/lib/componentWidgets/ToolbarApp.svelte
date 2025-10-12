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
	import { goto } from '$app/navigation';
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import MenuButton from '$lib/componentElements/buttons/MenuButton.svelte';
	import ToggleButton from '$lib/componentElements/buttons/ToggleButton.svelte';
	import SpacerFixed from '$lib/componentElements/SpacerFixed.svelte';
	import SpacerFlex from '$lib/componentElements/SpacerFlex.svelte';
	import Toolbar from '$lib/componentElements/Toolbar.svelte';
	import MenuZoom from '$lib/componentWidgets/menus/MenuZoom.svelte';
	import MenuStructure from '$lib/componentWidgets/menus/MenuStructure.svelte';
	import MenuText from '$lib/componentWidgets/menus/MenuText.svelte';
	import MenuLiterary from '$lib/componentWidgets/menus/MenuLiterary.svelte';
	import MenuColor from '$lib/componentWidgets/menus/MenuColor.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';
	import MenuView from '$lib/componentWidgets/menus/MenuView.svelte';
	import { getAppToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState, updateToolbarForRoute, toggleStudiesPanel } from '$lib/stores/toolbar.js';

	/** @type {string} Current zoom level label */
	let zoomLabel = $state('100%');

	// Get toolbar configuration
	const toolbarConfig = getAppToolbarConfig();

	// Update toolbar state when route changes
	$effect(() => {
		updateToolbarForRoute($page.url.pathname);
	});

	// Close MenuView when screen becomes wider than 99.0rem
	$effect(() => {
		if (typeof window === 'undefined') return;

		const mediaQuery = window.matchMedia('(min-width: 99.1rem)');
		
		const handleResize = (e) => {
			if (e.matches) {
				// Screen is wider than 99.0rem - close MenuView if open
				const menuView = document.getElementById('MenuView');
				if (menuView && menuView.matches(':popover-open')) {
					menuView.hidePopover();
				}
			}
		};

		// Check initial state
		handleResize(mediaQuery);

		// Listen for changes
		mediaQuery.addEventListener('change', handleResize);

		return () => {
			mediaQuery.removeEventListener('change', handleResize);
		};
	});
</script>

<Toolbar classes="dark" position="sticky" zIndex="1000">
	<!-- <MenuButton classes="toolbar-dark" iconId="book" menuId="MenuStudies" underLabelClasses="light" underLabel="Studies"></MenuButton> -->

	{#each toolbarConfig as item}
		{#if item.type === 'spacer'}
			{#if item.variant === 'fixed'}
				<SpacerFixed classes={item.classes || ''} />
			{:else if item.variant === 'flex'}
				<SpacerFlex classes={item.classes || ''} />
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
						isDisabled={button.iconId === 'trashcan' ? !$toolbarState.canDelete : false}
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
						isActive={button.iconId === 'book' ? $toolbarState.studiesPanelOpen : undefined}
						onToggle={button.iconId === 'book' ? toggleStudiesPanel : undefined}
						isDisabled={
							button.iconId === 'note' ? !$toolbarState.canToggleNotes :
							button.iconId === 'reference' ? !$toolbarState.canToggleVerses :
							button.iconId === 'wide' ? !$toolbarState.canToggleWide :
							button.iconId === 'outline' ? !$toolbarState.canToggleOverview :
							false
						}
					/>
				{:else if button.type === 'grouped'}
					<ButtonGrouped
						buttons={button.buttons}
						defaultActive={button.defaultActive}
						buttonClasses={button.buttonClasses}
						underLabelClasses={button.underLabelClasses}
						isDisabled={!$toolbarState.canSwitchMode}
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
<MenuSettings menuId="MenuSettings" alignment="end" />
<MenuView menuId="MenuView" />
