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
	import MenuNew from '$lib/componentWidgets/menus/MenuNew.svelte';
	import MenuZoom from '$lib/componentWidgets/menus/MenuZoom.svelte';
	import MenuStructure from '$lib/componentWidgets/menus/MenuStructure.svelte';
	import MenuText from '$lib/componentWidgets/menus/MenuText.svelte';
	import MenuLiterary from '$lib/componentWidgets/menus/MenuLiterary.svelte';
	import MenuColor from '$lib/componentWidgets/menus/MenuColor.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';
	import MenuView from '$lib/componentWidgets/menus/MenuView.svelte';
	import MenuActions from '$lib/componentWidgets/menus/MenuActions.svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import { getAppToolbarConfig } from '$lib/utils/toolbarConfig.js';
	import { toolbarState, updateToolbarForRoute, toggleStudiesPanel } from '$lib/stores/toolbar.js';
	import { invalidate } from '$app/navigation';

	// Props to receive data from layout
	let { groups = [] } = $props();

	/** @type {string} Current zoom level label */
	let zoomLabel = $state('100%');

	// Modal state
	let showDeleteModal = $state(false);
	let deleteInProgress = $state(false);
	let deleteError = $state('');

	// Get toolbar configuration
	const toolbarConfig = getAppToolbarConfig();

	/**
	 * Recursively count all nested groups and studies within a group
	 */
	function countNestedItems(group) {
		let nestedGroups = 0;
		let nestedStudies = group.studies?.length || 0;

		if (group.subgroups && group.subgroups.length > 0) {
			for (const subgroup of group.subgroups) {
				nestedGroups += 1;
				const counts = countNestedItems(subgroup);
				nestedGroups += counts.groups;
				nestedStudies += counts.studies;
			}
		}

		return { groups: nestedGroups, studies: nestedStudies };
	}

	// Derived state for delete modal content
	let deleteModalContent = $derived.by(() => {
		if (!$toolbarState.selectedItem) return null;

		const { items, count, hasGroups, hasStudies } = $toolbarState.selectedItem;
		
		if (count === 0) return null;

		// Single item
		if (count === 1) {
			const item = items[0];
			if (item.type === 'group') {
				const counts = countNestedItems(item.data);
				const totalGroups = counts.groups;
				const totalStudies = counts.studies;
				
				let warningParts = [];
				if (totalGroups > 0) {
					warningParts.push(`${totalGroups} nested ${totalGroups === 1 ? 'group' : 'groups'}`);
				}
				if (totalStudies > 0) {
					warningParts.push(`${totalStudies} ${totalStudies === 1 ? 'study' : 'studies'}`);
				}
				
				const warning = warningParts.length > 0
					? `This will permanently delete ${warningParts.join(' and ')}.`
					: 'This action cannot be undone.';

				return {
					title: 'Delete Study Group',
					message: `Are you sure you want to delete the study group "${item.data.name}"?`,
					warning: warning,
					itemName: item.data.name,
					itemType: 'group'
				};
			} else {
				return {
					title: 'Delete Study',
					message: `Are you sure you want to delete the study "${item.data.title}"?`,
					warning: 'This action cannot be undone.',
					itemName: item.data.title,
					itemType: 'study'
				};
			}
		}

		// Multiple items - show only selected counts (smart preservation handles unselected items)
		const groupItems = items.filter(i => i.type === 'group');
		const studyItems = items.filter(i => i.type === 'study');
		
		const selectedGroupCount = groupItems.length;
		const selectedStudyCount = studyItems.length;

		let parts = [];
		if (selectedGroupCount > 0) {
			parts.push(`${selectedGroupCount} ${selectedGroupCount === 1 ? 'group' : 'groups'}`);
		}
		if (selectedStudyCount > 0) {
			parts.push(`${selectedStudyCount} ${selectedStudyCount === 1 ? 'study' : 'studies'}`);
		}

		// Warning: Mention that unselected items will be preserved
		let warning = 'Unselected items within groups will be preserved and moved to safe locations. This action cannot be undone.';

		return {
			title: 'Delete Multiple Items',
			message: `Are you sure you want to delete ${parts.join(' and ')}?`,
			warning: warning,
			itemName: `${count} items`,
			itemType: 'multiple'
		};
	});

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
	function handleDeleteClick(event) {
		if (!$toolbarState.canDelete || !$toolbarState.selectedItem) return;
		
		// Prevent event propagation to avoid clearing multi-selection
		if (event) {
			event.stopPropagation();
			event.preventDefault();
		}
		
		deleteError = '';
		showDeleteModal = true;
	}

	/**
	 * Handle delete confirmation
	 */
	async function handleDeleteConfirm() {
		if (!$toolbarState.selectedItem || deleteInProgress) return;

		deleteInProgress = true;
		deleteError = '';

		try {
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
		} catch (error) {
			console.error('Error deleting items:', error);
			deleteError = error.message || 'Failed to delete. Please try again.';
		} finally {
			deleteInProgress = false;
		}
	}

	/**
	 * Handle delete modal close
	 */
	function handleDeleteModalClose() {
		if (!deleteInProgress) {
			showDeleteModal = false;
			deleteError = '';
		}
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
							button.menuId === 'MenuActions' ? !$toolbarState.canDelete && !$toolbarState.canEdit :
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

<MenuNew menuId="MenuNew" />
<MenuZoom menuId="MenuZoom" onselect={(value) => (zoomLabel = value)} />
<MenuStructure menuId="MenuStructure" />
<MenuText menuId="MenuText" />
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
{#if deleteModalContent}
	<Modal
		isOpen={showDeleteModal}
		title={deleteModalContent.title}
		size="small"
		confirmLabel={deleteInProgress ? 'Deleting...' : 'Delete'}
		confirmClasses="red"
		cancelLabel="Cancel"
		onConfirm={handleDeleteConfirm}
		onCancel={handleDeleteModalClose}
		onClose={handleDeleteModalClose}
		showCloseButton={false}
		closeOnBackdropClick={false}
	>
		<p class="modal-message">
			{deleteModalContent.message}{#if deleteModalContent.warning}&nbsp;{deleteModalContent.warning}{/if}
		</p>
		
		{#if deleteError}
			<p class="modal-message error">
				{deleteError}
			</p>
		{/if}
	</Modal>
{/if}

<style>
	p.modal-message {
		margin: 0.0rem; 
		font-size: 1.6rem; 
		line-height: 1.75; 
		color: var(--gray-400);
	}

	p.modal-message.error {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border: 0.1rem solid var(--red-light);
		border-radius: 0.3rem;
		padding: 0.3rem 0.9rem;
	}
</style>
