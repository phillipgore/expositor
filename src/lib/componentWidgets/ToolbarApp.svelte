<script>
	/**
	 * # ToolbarApp Component
	 * 
	 * Main application toolbar for the authenticated app interface.
	 * Provides access to document operations, view controls, formatting tools, and settings.
	 * 
	 * ## Features
	 * - Document operations (Studies panel, Actions)
	 * - View controls (Zoom, Wide, Overview)
	 * - Formatting menus (Outline, Text, Literary, Color)
	 * - Mode toggles (Notes, Verses)
	 * - View mode switching (Analyze, Document)
	 * - Settings access
	 * - Dark themed with sticky positioning
	 * 
	 * ## Architecture
	 * This component is a pure renderer - all toolbar button configurations, state management,
	 * and behavior are defined in toolbarConfig.js. The component:
	 * - Reads configuration from getAppToolbarConfig()
	 * - Maps state properties dynamically using config-defined props
	 * - Handles button disabled states via config-defined functions or property names
	 * - No hardcoded button-specific logic
	 * 
	 * ## Menu Integration
	 * Integrates with several dropdown menus:
	 * - MenuZoom: Zoom level control
	 * - MenuStructure: Outline structure options
	 * - MenuHeadings: Heading insertion options
	 * - MenuLiterary: Literary device highlighting
	 * - MenuColor: Color scheme selection
	 * - MenuActions: Study/group creation and management
	 * 
	 * ## Layout Structure
	 * Left section: Studies toggle
	 * Actions and Zoom
	 * Center: Formatting menus (Outline, Headings, Literary, Color)
	 * Center-right: View toggles (Notes, Verses, Wide, Overview)
	 * Right section: Mode switcher (Analyze/Document), Settings
	 * 
	 * ## State Management
	 * @property {string} zoomLabel - Current zoom level display (default: '100%')
	 * @property {Object} handlers - Map of handler functions referenced by config
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
	import MenuHeadings from '$lib/componentWidgets/menus/MenuHeadings.svelte';
	import MenuLiterary from '$lib/componentWidgets/menus/MenuLiterary.svelte';
	import MenuColor from '$lib/componentWidgets/menus/MenuColor.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';
	import MenuView from '$lib/componentWidgets/menus/MenuView.svelte';
	import MenuActions from '$lib/componentWidgets/menus/MenuActions.svelte';
	import DeleteConfirmationModal from '$lib/componentWidgets/modals/DeleteConfirmationModal.svelte';
	import { getAppToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState, updateToolbarForRoute, toggleStudiesPanel, toggleVerses, toggleWide, toggleOverview, setZoomLevel } from '$lib/stores/toolbar.js';
	import { invalidate } from '$app/navigation';

	// Props to receive data from layout
	let { groups = [] } = $props();

	/** @type {string} Current zoom level label */
	let zoomLabel = $state('100%');

	/**
	 * Handle zoom level change from MenuZoom
	 * @param {string} label - Zoom label (e.g., "100%", "Fit Study")
	 */
	function handleZoomChange(label) {
		zoomLabel = label;
		
		// Convert label to zoom level number
		if (label === 'Fit Study') {
			setZoomLevel(0); // 0 indicates fit mode
		} else {
			const percentage = parseInt(label.replace('%', ''));
			setZoomLevel(percentage);
		}
	}

	// Modal state
	let showDeleteModal = $state(false);
	let deleteOpenedViaKeyboard = $state(false);

	// Get toolbar configuration
	const toolbarConfig = getAppToolbarConfig();

	// Handlers map for toggle buttons and other callbacks
	const handlers = {
		toggleStudiesPanel,
		toggleVerses,
		toggleWide,
		toggleOverview
	};

	/**
	 * Determine active button for mode switcher based on current route
	 */
	let activeModeButton = $derived.by(() => {
		const pathname = $page.url.pathname;
		if (pathname.includes('/study/') && !pathname.includes('/study-group')) {
			if (pathname.endsWith('/analyze') || pathname.includes('/analyze/')) {
				return 'analyze';
			} else if (pathname.endsWith('/document') || pathname.includes('/document/')) {
				return 'document';
			}
		}
		return 'analyze'; // Default
	});

	/**
	 * Handle mode button change (Analyze/Document)
	 */
	function handleModeChange(buttonId) {
		// Get the current study ID from the URL
		const pathname = $page.url.pathname;
		if (pathname.includes('/study/') && !pathname.includes('/study-group')) {
			const studyId = pathname.split('/study/')[1].split('/')[0];
			goto(`/study/${studyId}/${buttonId}`);
		}
	}

	/**
	 * Handle edit button click
	 */
	function handleEditClick() {
		if (!$toolbarState.canEdit || !$toolbarState.selectedItem) return;
		
		const { items, count } = $toolbarState.selectedItem;
		
		// Only edit single items (if multiple selected, edit the first one)
		if (count === 0) return;
		
		const item = items[0];
		const editUrl = item.type === 'group' 
			? `/study-group/${item.id}/edit`
			: `/study/${item.id}/edit`;
		
		goto(editUrl);
	}

	/**
	 * Handle move to group from Actions menu
	 */
	async function handleMoveToGroup(targetGroupId) {
		// Get multiSelect instance from StudiesPanel via toolbar state
		// For now, we'll call the API directly since we have the selected items
		if (!$toolbarState.selectedItem) return;

		try {
			const { items } = $toolbarState.selectedItem;
			
			// Separate studies and groups
			const studyItems = items.filter(item => item.type === 'study');
			const groupItems = items.filter(item => item.type === 'group');

			// Move studies
			if (studyItems.length > 0) {
				await Promise.all(
					studyItems.map(item =>
						fetch(`/api/studies/${item.id}`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ groupId: targetGroupId })
						})
					)
				);
			}

			// Move groups
			if (groupItems.length > 0) {
				await Promise.all(
					groupItems.map(item =>
						fetch(`/api/groups/${item.id}`, {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ parentGroupId: targetGroupId })
						})
					)
				);
			}

			// Reload data
			await invalidate('app:studies');
		} catch (error) {
			console.error('Error moving items:', error);
		}
	}

	/**
	 * Handle delete button click
	 */
	function handleDeleteClick(viaKeyboard) {
		if (!$toolbarState.canDelete || !$toolbarState.selectedItem) return;
		
		deleteOpenedViaKeyboard = viaKeyboard;
		showDeleteModal = true;
	}

	/**
	 * Handle delete confirmation from modal
	 */
	async function handleDeleteConfirm() {
		if (!$toolbarState.selectedItem) return;

		const { items, count } = $toolbarState.selectedItem;
		
		// Collect all selected IDs by type
		const selectedGroupIds = items.filter(i => i.type === 'group').map(i => i.id);
		const selectedStudyIds = items.filter(i => i.type === 'study').map(i => i.id);
		
		// Use bulk delete for multiple items OR when groups are involved
		// (to ensure proper handling of unselected descendants)
		if (count > 1 || selectedGroupIds.length > 0) {
			const response = await fetch('/api/bulk-delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selectedGroupIds, selectedStudyIds })
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to delete items');
			}
		} else {
			// Single study deletion - use direct endpoint
			const study = items[0];
			const response = await fetch(`/api/studies/${study.id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' }
			});

			if (!response.ok) {
				throw new Error('Failed to delete study');
			}
		}

		// Success - close modal and refresh data
		showDeleteModal = false;
		await invalidate('app:studies');
		
		// Navigate away if we're on a deleted item's page
		const currentPath = $page.url.pathname;
		const deletedIds = items.map(i => i.id);
		
		if (currentPath.includes('/study/') || currentPath.includes('/study-group/')) {
			// Extract the item ID, handling both view and edit pages
			const pathParts = currentPath.split('/');
			const lastPart = pathParts[pathParts.length - 1];
			const currentId = lastPart === 'edit' ? pathParts[pathParts.length - 2] : lastPart;
			
			if (deletedIds.includes(currentId)) {
				goto('/dashboard');
			}
		}
	}

	/**
	 * Handle delete modal close
	 */
	function handleDeleteModalClose() {
		showDeleteModal = false;
	}

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
							button.disabledCheck
								? button.disabledCheck($toolbarState)
								: button.disabledStateProp
									? !$toolbarState[button.disabledStateProp]
									: false
						}
					/>
				{:else if button.type === 'toggle'}
					<ToggleButton
						iconId={button.iconId}
						underLabel={button.underLabel}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
						isActive={button.activeStateProp ? $toolbarState[button.activeStateProp] : undefined}
						onToggle={button.toggleHandler ? handlers[button.toggleHandler] : undefined}
						isDisabled={
							button.disabledStateProp
								? !$toolbarState[button.disabledStateProp]
								: false
						}
					/>
				{:else if button.type === 'grouped'}
					<ButtonGrouped
						buttons={button.buttons}
						defaultActive={activeModeButton}
						buttonClasses={button.buttonClasses}
						underLabelClasses={button.underLabelClasses}
						onActiveChange={handleModeChange}
						isDisabled={
							button.disabledStateProp
								? !$toolbarState[button.disabledStateProp]
								: false
						}
					/>
				{/if}
			{/each}
		{/if}
	{/each}
</Toolbar>

<MenuZoom menuId="MenuZoom" onselect={handleZoomChange} />
<MenuStructure menuId="MenuStructure" />
<MenuHeadings menuId="MenuHeadings" />
<MenuLiterary menuId="MenuLiterary" />
<MenuColor menuId="MenuColor" />
<MenuSettings menuId="MenuSettings" alignment="end" />
<MenuView menuId="MenuView" />
<MenuActions 
	menuId="MenuActions" 
	{groups}
	onMoveToGroup={handleMoveToGroup}
	onEdit={handleEditClick}
	onDelete={handleDeleteClick}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	isOpen={showDeleteModal}
	selectedItem={$toolbarState.selectedItem}
	onConfirm={handleDeleteConfirm}
	onClose={handleDeleteModalClose}
	openedViaKeyboard={deleteOpenedViaKeyboard}
/>
