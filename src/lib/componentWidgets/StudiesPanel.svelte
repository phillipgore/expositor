<script>
	/**
	 * StudiesPanel Component (Refactored)
	 * 
	 * Orchestrates the studies panel with delegated responsibilities:
	 * - Data filtering and search (this file)
	 * - Multi-select logic (useMultiSelect composable)
	 * - Drag-and-drop logic (useDragAndDrop composable)
	 * - Group display (StudyGroup component)
	 * - Study display (StudyItem component)
	 */
	import Input from "$lib/componentElements/Input.svelte";
	import Icon from "$lib/componentElements/Icon.svelte";
	import StudyGroup from "./studies/StudyGroup.svelte";
	import StudyItem from "./studies/StudyItem.svelte";
	import { useMultiSelect } from "$lib/composables/useMultiSelect.svelte.js";
	import { useDragAndDrop } from "$lib/composables/useDragAndDrop.svelte.js";
	import { setToolbarState } from "$lib/stores/toolbar.js";
	import { goto, invalidate } from '$app/navigation';
	import { page } from '$app/stores';
	import { flip } from 'svelte/animate';

	let { isOpen = false, studies = [], groups = [], ungroupedStudies = [], initialWidth = 300 } = $props();

	// Search state
	let searchQuery = $state('');
	
	// Panel width state (initialized from localStorage or user data)
	const savedWidth = typeof window !== 'undefined' 
		? localStorage.getItem('studiesPanelWidth')
		: null;
	let panelWidth = $state(savedWidth ? parseInt(savedWidth) : initialWidth);
	
	// Resize state
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;
	
	// Derived filtered/sorted data
	let sortedStudies = $derived(getSortedStudies());
	let filteredGroups = $derived(getFilteredGroups());
	let filteredUngroupedStudies = $derived(getFilteredUngroupedStudies());
	let sortedGroupsAndStudies = $derived(getSortedGroupsAndStudies());

	// Initialize composables
	const multiSelect = useMultiSelect();
	const dragDrop = useDragAndDrop(() => invalidate('app:studies'));
	
	// Track active study from current route
	let activeStudyId = $derived(
		$page.url.pathname.startsWith('/study/') 
			? $page.url.pathname.split('/study/')[1] 
			: null
	);
	
	// Track active group from current route
	let activeGroupId = $derived(
		$page.url.pathname.startsWith('/study-group/') 
			? $page.url.pathname.split('/study-group/')[1] 
			: null
	);

	/**
	 * Format a passage reference for display
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}

	/**
	 * Get sorted and filtered studies
	 */
	function getSortedStudies() {
		if (!studies || studies.length === 0) return [];
		
		let filtered = studies;
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			filtered = studies.filter(study => {
				if (study.title.toLowerCase().includes(query)) return true;
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => 
						formatPassageReference(passage).toLowerCase().includes(query)
					);
				}
				return false;
			});
		}
		
		const sorted = [...filtered];
		sorted.sort((a, b) => a.title.localeCompare(b.title));
		return sorted;
	}

	/**
	 * Get filtered groups with filtered and alphabetized studies
	 */
	function getFilteredGroups() {
		if (!groups || groups.length === 0) return [];
		
		if (searchQuery.trim() === '') {
			return groups.map(group => ({
				...group,
				studies: [...group.studies].sort((a, b) => a.title.localeCompare(b.title))
			}));
		}

		const query = searchQuery.toLowerCase();
		return groups.map(group => {
			const filteredStudies = group.studies.filter(study => {
				if (study.title.toLowerCase().includes(query)) return true;
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => 
						formatPassageReference(passage).toLowerCase().includes(query)
					);
				}
				return false;
			});

			filteredStudies.sort((a, b) => a.title.localeCompare(b.title));
			return {
				...group,
				studies: filteredStudies
			};
		});
	}

	/**
	 * Get filtered and alphabetized ungrouped studies
	 */
	function getFilteredUngroupedStudies() {
		if (!ungroupedStudies || ungroupedStudies.length === 0) return [];
		
		let filtered = ungroupedStudies;
		
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			filtered = ungroupedStudies.filter(study => {
				if (study.title.toLowerCase().includes(query)) return true;
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => 
						formatPassageReference(passage).toLowerCase().includes(query)
					);
				}
				return false;
			});
		}
		
		return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
	}

	/**
	 * Get combined and sorted groups and ungrouped studies
	 */
	function getSortedGroupsAndStudies() {
		const items = [];
		
		filteredGroups.forEach(group => {
			items.push({
				type: 'group',
				name: group.name,
				data: group
			});
		});
		
		filteredUngroupedStudies.forEach(study => {
			items.push({
				type: 'study',
				name: study.title,
				data: study
			});
		});
		
		items.sort((a, b) => a.name.localeCompare(b.name));
		return items;
	}

	/**
	 * Get flattened list of all items in display order
	 */
	function getFlattenedItemsList() {
		const items = [];
		let index = 0;
		
		sortedGroupsAndStudies.forEach(item => {
			if (item.type === 'group') {
				items.push({
					type: 'group',
					id: item.data.id,
					data: item.data,
					index: index++
				});
				
				if (!item.data.isCollapsed) {
					item.data.studies.forEach(study => {
						items.push({
							type: 'study',
							id: study.id,
							data: study,
							index: index++
						});
					});
				}
			} else {
				items.push({
					type: 'study',
					id: item.data.id,
					data: item.data,
					index: index++
				});
			}
		});
		
		return items;
	}

	/**
	 * Toggle group collapsed state
	 */
	async function toggleGroupCollapse(groupId, currentState) {
		try {
			const response = await fetch(`/api/groups/${groupId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isCollapsed: !currentState })
			});

			if (response.ok) {
				await invalidate('app:studies');
			}
		} catch (error) {
			console.error('Error toggling group:', error);
		}
	}

	/**
	 * Handle group header click
	 */
	function handleGroupHeaderClick(event, group) {
		event.preventDefault();
		
		// Check for modifier keys
		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
		
		// Always select the group
		multiSelect.handleItemClick(event, 'group', group.id, group, getFlattenedItemsList());
		
		// Only navigate if no modifier keys are pressed
		if (!hasModifier) {
			goto(`/study-group/${group.id}`);
		}
	}

	/**
	 * Handle study click
	 */
	function handleStudyClick(event, study) {
		event.preventDefault();
		
		// Check for modifier keys
		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;
		
		// Always select the study
		multiSelect.handleItemClick(event, 'study', study.id, study, getFlattenedItemsList());
		
		// Only navigate if no modifier keys are pressed
		if (!hasModifier) {
			goto(`/study/${study.id}`);
		}
	}

	/**
	 * Handle study mousedown for drag
	 */
	function handleStudyMouseDown(event, study) {
		const isStudySelected = multiSelect.isItemSelected('study', study.id);
		const getSelectedStudies = () => multiSelect.getSelectedStudies().map(item => item.data);
		
		dragDrop.handleStudyMouseDown(event, study, isStudySelected, getSelectedStudies);
	}

	/**
	 * Handle panel click (for deselection)
	 */
	function handlePanelClick(event) {
		const clickedOnStudy = event.target.closest('.study-item');
		const clickedOnGroupButton = event.target.closest('.group-select-button');
		const clickedOnChevron = event.target.closest('.chevron-button');
		
		if (!clickedOnStudy && !clickedOnGroupButton && !clickedOnChevron) {
			multiSelect.clearSelection();
		}
	}

	/**
	 * Document click handler for deselection
	 */
	$effect(() => {
		function handleDocumentClick(event) {
			if (multiSelect.selectedItems.length === 0) return;
			
			const container = document.querySelector('.studies-container');
			if (!container) return;
			
			const clickedInsideContainer = container.contains(event.target);
			
			if (!clickedInsideContainer) {
				multiSelect.clearSelection();
			}
		}
		
		document.addEventListener('click', handleDocumentClick);
		
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	/**
	 * Document mouseup handler for drag
	 */
	$effect(() => {
		const handleMouseUp = (e) => dragDrop.handleDocumentMouseUp(e, multiSelect.clearSelection);
		// This is set up by dragDrop.handleStudyMouseDown
		return () => {};
	});

	/**
	 * Handle resize start
	 */
	function handleResizeStart(event) {
		if (!isOpen) return;
		event.preventDefault();
		isResizing = true;
		startX = event.clientX;
		startWidth = panelWidth;
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Handle resize move
	 */
	function handleResizeMove(event) {
		if (!isResizing) return;
		const delta = event.clientX - startX;
		const newWidth = startWidth + delta;
		// Min: 300px, Max: 600px or 50% viewport
		panelWidth = Math.max(300, Math.min(600, Math.min(newWidth, window.innerWidth * 0.5)));
	}

	/**
	 * Handle resize end
	 */
	async function handleResizeEnd() {
		if (!isResizing) return;
		isResizing = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		
		// Save to localStorage immediately
		localStorage.setItem('studiesPanelWidth', panelWidth.toString());
		
		// Save to database (background)
		try {
			await fetch('/api/user/preferences', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ studiesPanelWidth: panelWidth })
			});
		} catch (error) {
			console.error('Failed to save panel width:', error);
		}
	}

	/**
	 * Effect for global resize listeners
	 */
	$effect(() => {
		if (isResizing) {
			window.addEventListener('mousemove', handleResizeMove);
			window.addEventListener('mouseup', handleResizeEnd);
			return () => {
				window.removeEventListener('mousemove', handleResizeMove);
				window.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	});

	/**
	 * Auto-select active group or study on page load
	 */
	$effect(() => {
		if (activeGroupId) {
			// Find the group in the flattened list
			const flatList = getFlattenedItemsList();
			const groupItem = flatList.find(item => item.type === 'group' && item.id === activeGroupId);
			
			if (groupItem && !multiSelect.isItemSelected('group', activeGroupId)) {
				// Select the active group
				multiSelect.selectedItems = [{
					type: 'group',
					id: activeGroupId,
					data: groupItem.data,
					index: groupItem.index
				}];
				multiSelect.lastSelectedIndex = groupItem.index;
				multiSelect.updateToolbarSelection();
			}
		} else if (activeStudyId) {
			// Find the study in the flattened list
			const flatList = getFlattenedItemsList();
			const studyItem = flatList.find(item => item.type === 'study' && item.id === activeStudyId);
			
			if (studyItem && !multiSelect.isItemSelected('study', activeStudyId)) {
				// Select the active study
				multiSelect.selectedItems = [{
					type: 'study',
					id: activeStudyId,
					data: studyItem.data,
					index: studyItem.index
				}];
				multiSelect.lastSelectedIndex = studyItem.index;
				multiSelect.updateToolbarSelection();
			}
		}
	});
</script>

<!-- Drag ghost -->
{#if dragDrop.isDragging && dragDrop.draggedStudies.length > 0}
	<div 
		class="drag-ghost" 
		class:multi={dragDrop.draggedStudies.length > 1}
		style="left: {(dragDrop.currentMouseX + 6) / 10}rem; top: {(dragDrop.currentMouseY + 6) / 10}rem;"
	>
		{#if dragDrop.draggedStudies.length > 1}
			<div class="drag-count">{dragDrop.draggedStudies.length}</div>
		{/if}
			<StudyItem
				study={dragDrop.draggedStudies[0]}
				ghost={true}
				{formatPassageReference}
			/>
		<!-- {:else}
			<div class="multi-drag-info">
				<Icon iconId={'book'} classes="book-icon" />
				
			</div>
		{/if} -->
	</div>
{/if}

<aside class="studies-panel" class:open={isOpen} class:resizing={isResizing} style:width="{isOpen ? panelWidth : 0}px">
	<div class="panel-content" style:width="{panelWidth}px">
		<div class="panel-header">
			<Input 
				id="search-studies" 
				name="search" 
				type="search" 
				placeholder="Search"
				bind:value={searchQuery}
			/>
		</div>
		
		<div class="panel-scrollable" onclick={handlePanelClick}>
			{#if studies.length === 0}
				<p class="empty-message">No studies yet. Create one to get started!</p>
			{:else if filteredGroups.length === 0 && filteredUngroupedStudies.length === 0 && searchQuery.trim() === ''}
				<!-- Fallback -->
				<ul class="studies-list">
					{#each sortedStudies as study}
						<li>
							<StudyItem
								{study}
								asLink={true}
								href="/study/{study.id}"
								isActive={study.id === activeStudyId}
								{formatPassageReference}
								onClick={() => setToolbarState('studiesPanelOpen', false)}
							/>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="studies-container">
					{#each sortedGroupsAndStudies as item (item.type === 'group' ? 'group-' + item.data.id : 'study-' + item.data.id)}
						<div role="presentation" animate:flip={{ duration: 300 }}>
							{#if item.type === 'group'}
								<StudyGroup
									group={item.data}
									isSelected={multiSelect.isItemSelected('group', item.data.id)}
									selectionPosition={multiSelect.getSelectionPosition('group', item.data.id)}
									isActive={item.data.id === activeGroupId}
									isDropTarget={dragDrop.dropTargetGroupId === item.data.id}
									onToggleCollapse={toggleGroupCollapse}
									onGroupHeaderClick={handleGroupHeaderClick}
									onStudyMouseDown={handleStudyMouseDown}
									onStudyClick={handleStudyClick}
									isStudySelected={(studyId) => multiSelect.isItemSelected('study', studyId)}
									getStudySelectionPosition={(studyId) => multiSelect.getSelectionPosition('study', studyId)}
									isStudyActive={(studyId) => studyId === activeStudyId}
									isStudyBeingDragged={dragDrop.isStudyBeingDragged}
									isDragging={dragDrop.isDragging}
									{formatPassageReference}
								/>
							{:else}
								<div class="study-wrapper">
									<StudyItem
										study={item.data}
										isSelected={multiSelect.isItemSelected('study', item.data.id)}
										selectionPosition={multiSelect.getSelectionPosition('study', item.data.id)}
										isActive={item.data.id === activeStudyId}
										beingDragged={dragDrop.isStudyBeingDragged(item.data.id)}
										isDragging={dragDrop.isDragging}
										ungrouped={true}
										{formatPassageReference}
										onMouseDown={handleStudyMouseDown}
										onClick={handleStudyClick}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	{#if isOpen}
		<div class="resize-handle" onmousedown={handleResizeStart}></div>
	{/if}
</aside>

<style>
	.studies-panel {
		position: relative;
		min-width: 0;
		height: 100%;
		background-color: var(--gray-lighter);
		border-right: 1px solid var(--gray-700);
		overflow: hidden;
		transition: width 0.3s ease-in-out;
		flex-shrink: 0;
	}

	.studies-panel.resizing {
		transition: none;
	}

	.panel-content {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.resize-handle {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		z-index: 10;
		background-color: transparent;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem;
		background-color: var(--gray-lighter);
		position: sticky;
		top: 0;
		z-index: 1;
		flex-shrink: 0;
	}

	.panel-header :global(input) {
		border-radius: 2.5vh;
	}

	.panel-scrollable {
		flex: 1;
		overflow-y: auto;
		padding: 0 0.9rem 0.9rem;
	}

	.empty-message {
		color: var(--gray-400);
		font-size: 1.2rem;
		text-align: center;
		padding: 2rem 0;
	}

	.studies-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.studies-container {
		display: flex;
		flex-direction: column;
	}

	/* Drag ghost styles */
	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 9999;
		width: 28.2rem;
		border-radius: 0.3rem;
	}

	.drag-ghost :global(.study-item) {
		position: relative;
		z-index: 3;
		background-color: var(--gray-lighter);
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
	}

	.drag-ghost.multi::before,
	.drag-ghost.multi::after {
		content: "";
		position: absolute;
		top: 0.5rem;
		right: -0.5rem;
		bottom: -0.5rem;
		left: 0.5rem;
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
		background-color: var(--gray-lighter);
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		z-index: 2;
	}

	.drag-ghost.multi::after {
		top: 1.0rem;
		right: -1.0rem;
		bottom: -1.0rem;
		left: 1.0rem;
		z-index: 1;
	}

	.drag-ghost.multi .drag-count {
		display: flex;
		align-items: center;
		justify-content: center;
		position: absolute;
		z-index: 4;
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--white);
		background-color: var(--red);
		border-radius: 100vw;
		height: 2.4rem;
		width: 2.4rem;
		top: -0.9rem;
		right: -0.9rem;
	}

	:global(body.dragging) {
		user-select: none;
		cursor: grabbing;
	}
</style>
