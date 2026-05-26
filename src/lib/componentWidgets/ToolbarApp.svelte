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
	 * - Formatting menus (Structure, Text, Literary, Color)
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
	 * - MenuStructure: Structure options
	 * - MenuHeadings: Heading insertion options
	 * - MenuLiterary: Literary device highlighting
	 * - MenuColor: Color scheme selection
	 * - MenuActions: Study/group creation and management
	 * 
	 * ## Layout Structure
	 * Left section: Studies toggle
	 * Actions and Zoom
	 * Center: Formatting menus (Structure, Headings, Literary, Color)
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
	import MenuOutline from '$lib/componentWidgets/menus/MenuOutline.svelte';
	import MenuColor from '$lib/componentWidgets/menus/MenuColor.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';
	import MenuText from '$lib/componentWidgets/menus/MenuText.svelte';
	import MenuView from '$lib/componentWidgets/menus/MenuView.svelte';
	import MenuActions from '$lib/componentWidgets/menus/MenuActions.svelte';
	import DeleteConfirmationModal from '$lib/componentWidgets/modals/DeleteConfirmationModal.svelte';
	import { getAppToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState, updateToolbarForRoute, toggleStudiesPanel, toggleComparison, toggleHeadings, toggleConnections, toggleNotes, toggleReferences, toggleVerses, toggleParagraphBreaks, toggleWide, toggleOverview, toggleCommentary, setZoomLevel } from '$lib/stores/toolbar.js';
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

	/**
	 * Handle color selection from MenuColor
	 * Supports both column mode (bulk update all sections) and section mode (single section)
	 * @param {string} colorId - The selected color ID (e.g., "red", "blue")
	 */
	async function handleColorChange(colorId) {
		// Determine if we're in column or section mode
		const isColumnMode = $toolbarState.activeColumnId !== null;
		const isSectionMode = $toolbarState.activeSectionId !== null;

		if (!isColumnMode && !isSectionMode) {
			console.error('No active column or section ID');
			return;
		}

		try {
			let response;
			
			if (isColumnMode) {
				// Column mode: update all sections in the column
				console.log('Updating all sections in column:', $toolbarState.activeColumnId);
				response = await fetch(`/api/passages/columns/${$toolbarState.activeColumnId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ color: colorId })
				});
			} else {
				// Section mode: update single section
				console.log('Updating single section:', $toolbarState.activeSectionId);
				response = await fetch(`/api/passages/sections/${$toolbarState.activeSectionId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ color: colorId })
				});
			}

			if (response.ok) {
				const mode = isColumnMode ? 'Column sections' : 'Section';
				console.log(`${mode} color updated successfully`);
				// Refresh data to show the new color
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Update color error:', error);
				alert(`Error: ${error.error || 'Failed to update color'}`);
			}
		} catch (error) {
			console.error('Update color network error:', error);
			alert(`Error: ${error.message || 'Failed to update color'}`);
		}
	}

	// Modal state
	let showDeleteModal = $state(false);
	let deleteOpenedViaKeyboard = $state(false);
	// Snapshot of selected items captured at click time, so the document-level
	// click-outside handler in StudiesPanel can't nullify selectedItem before the
	// modal renders (Svelte batches both reactive updates in the same tick).
	let pendingDeleteItem = $state(null);

	// Get toolbar configuration
	const toolbarConfig = getAppToolbarConfig();

	// Handlers map for toggle buttons and other callbacks
	const handlers = {
		toggleStudiesPanel,
		toggleComparison,
		toggleConnections,
		toggleHeadings,
		toggleNotes,
		toggleReferences,
		toggleVerses,
		toggleParagraphBreaks,
		toggleWide,
		toggleOverview,
		toggleCommentary,
		handleDelete: handleDeleteAction,
		handleEdit: handleEditClick
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
	 * Handle delete button click from MenuActions (legacy, kept for menu compatibility)
	 */
	function handleDeleteClick(viaKeyboard) {
		if (!$toolbarState.canDelete || !$toolbarState.selectedItem) return;
		
		pendingDeleteItem = $toolbarState.selectedItem;
		deleteOpenedViaKeyboard = viaKeyboard;
		showDeleteModal = true;
	}

	/**
	 * Unified Delete toolbar button handler.
	 * Determines what is currently active/selected and performs the appropriate deletion:
	 * 1. Studies selected in panel → show confirmation modal
	 * 2. Connection selected → dispatch remove-connection event
	 * 3. Active segment with headings/note → dispatch all applicable remove events
	 */
	function handleDeleteAction() {
		// Priority 1: Studies/groups selected in the panel
		if ($toolbarState.canDelete && $toolbarState.selectedItem) {
			// Snapshot selectedItem NOW before the document-level click-outside handler
			// in StudiesPanel can clear it (both updates are batched in the same Svelte tick).
			pendingDeleteItem = $toolbarState.selectedItem;
			deleteOpenedViaKeyboard = false;
			showDeleteModal = true;
			return;
		}

		// Priority 2: Connection is currently selected
		if ($toolbarState.hasActiveConnection) {
			window.dispatchEvent(new CustomEvent('remove-connection'));
			return;
		}

		// Priority 3: A specific heading or note editor is in input mode — delete only that one
		if ($toolbarState.hasActiveHeadingOrNoteEditor && $toolbarState.activeHeadingOrNoteType) {
			const segmentId = $toolbarState.activeSegmentId;
			const type = $toolbarState.activeHeadingOrNoteType;
			const eventName = type === 'note' ? 'remove-note' : `remove-heading-${type}`;
			window.dispatchEvent(new CustomEvent(eventName, { detail: { segmentId } }));
		}
	}

	/**
	 * Handle delete confirmation from modal
	 */
	async function handleDeleteConfirm() {
		if (!pendingDeleteItem) return;

		const { items, count } = pendingDeleteItem;
		
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

		// Success - close modal, refresh data, and navigate to dashboard
		showDeleteModal = false;
		await invalidate('app:studies');
		goto('/dashboard');
	}

	/**
	 * Handle delete modal close
	 */
	function handleDeleteModalClose() {
		showDeleteModal = false;
		pendingDeleteItem = null;
	}

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
							button.disabledCheck
								? button.disabledCheck($toolbarState)
								: button.disabledStateProp
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
				{:else if button.type === 'action'}
					<IconButton
						iconId={button.iconId}
						underLabel={button.underLabel}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
						handleClick={button.actionHandler ? handlers[button.actionHandler] : undefined}
						isDisabled={
							button.disabledCheck
								? button.disabledCheck($toolbarState)
								: button.disabledStateProp
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
<MenuOutline menuId="MenuOutline" />
<MenuColor menuId="MenuColor" onselect={handleColorChange} />
<MenuText menuId="MenuText" />
<MenuView menuId="MenuView" />
<MenuSettings menuId="MenuSettings" alignment="end" />
<MenuActions 
	menuId="MenuActions" 
	{groups}
	onMoveToGroup={handleMoveToGroup}
	onDelete={handleDeleteClick}
/>

<!-- Delete Confirmation Modal -->
<DeleteConfirmationModal
	isOpen={showDeleteModal}
	selectedItem={pendingDeleteItem}
	onConfirm={handleDeleteConfirm}
	onClose={handleDeleteModalClose}
	openedViaKeyboard={deleteOpenedViaKeyboard}
/>
