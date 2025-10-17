<script>
	/**
	 * # StudiesPanel Component
	 * 
	 * Slide-in panel from the left that displays available studies.
	 * Opens/closes via toggle button in toolbar without overlaying content.
	 * 
	 * ## Features
	 * - Slides in from left with smooth CSS transition
	 * - Pushes main content to the right (doesn't overlay)
	 * - Full height below toolbar
	 * - Fixed width when open
	 * - Displays list of user's studies
	 * - Clickable items navigate to study page
	 * - Sortable by title, dates, etc.
	 * 
	 * ## Props
	 * @property {boolean} isOpen - Whether panel is currently open
	 * @property {Array} studies - Array of study objects with id and title
	 * 
	 * @component
	 */
	import Heading from "$lib/componentElements/Heading.svelte";
	import Input from "$lib/componentElements/Input.svelte";
	import Icon from "$lib/componentElements/Icon.svelte";
	import { setToolbarState, setSelectedItem, clearSelectedItem, toolbarState } from "$lib/stores/toolbar.js";
	import { goto, invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import DividerHorizontal from "$lib/componentElements/DividerHorizontal.svelte";

	let { isOpen = false, studies = [], groups = [], ungroupedStudies = [] } = $props();

	let searchQuery = $state('');
	let sortedStudies = $derived(getSortedStudies());
	let filteredGroups = $derived(getFilteredGroups());
	let filteredUngroupedStudies = $derived(getFilteredUngroupedStudies());
	let sortedGroupsAndStudies = $derived(getSortedGroupsAndStudies());

	// Multi-selection state
	let selectedItems = $state([]); // Array of {type, id, data, index}
	let lastSelectedIndex = $state(null); // For Shift+Click range selection
	let lastClickTime = $state(0);
	const DOUBLE_CLICK_THRESHOLD = 300; // ms

	// Drag and drop state
	let isDragging = $state(false);
	let draggedStudies = $state([]); // Array of studies being dragged
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let currentMouseX = $state(0);
	let currentMouseY = $state(0);
	let dropTargetGroupId = $state(null);
	const DRAG_THRESHOLD = 5; // pixels to move before initiating drag
	
	// Auto-scroll state
	let autoScrollAnimationId = null;
	let autoScrollSpeed = $state(0);
	let autoScrollDirection = $state(0);
	const AUTO_SCROLL_EDGE_SIZE = 50; // pixels from edge to trigger auto-scroll
	const AUTO_SCROLL_MAX_SPEED = 20; // max pixels per frame

	/**
	 * Format a passage reference for display
	 * @param {Object} passage
	 * @returns {string}
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}

	/**
	 * Get sorted and filtered studies - always sorted by title (for backwards compatibility)
	 * @returns {Array}
	 */
	function getSortedStudies() {
		if (!studies || studies.length === 0) return [];
		
		// Filter studies by search query
		let filtered = studies;
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			filtered = studies.filter(study => {
				// Search in title
				if (study.title.toLowerCase().includes(query)) {
					return true;
				}
				
				// Search in passage references
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => {
						const reference = formatPassageReference(passage).toLowerCase();
						return reference.includes(query);
					});
				}
				
				return false;
			});
		}
		
		// Always sort by title
		const sorted = [...filtered];
		sorted.sort((a, b) => a.title.localeCompare(b.title));
		
		return sorted;
	}

	/**
	 * Get filtered groups with filtered and alphabetized studies
	 * @returns {Array}
	 */
	function getFilteredGroups() {
		if (!groups || groups.length === 0) return [];
		
		if (searchQuery.trim() === '') {
			// No search - return groups with alphabetized studies
			return groups.map(group => ({
				...group,
				studies: [...group.studies].sort((a, b) => a.title.localeCompare(b.title))
			}));
		}

		const query = searchQuery.toLowerCase();
		
		// Keep all groups, but filter and alphabetize studies within each group
		return groups.map(group => {
			const filteredStudies = group.studies.filter(study => {
				// Search in title
				if (study.title.toLowerCase().includes(query)) {
					return true;
				}
				
				// Search in passage references
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => {
						const reference = formatPassageReference(passage).toLowerCase();
						return reference.includes(query);
					});
				}
				
				return false;
			});

			// Sort filtered studies alphabetically
			filteredStudies.sort((a, b) => a.title.localeCompare(b.title));

			return {
				...group,
				studies: filteredStudies
			};
		});
	}

	/**
	 * Get filtered and alphabetized ungrouped studies
	 * @returns {Array}
	 */
	function getFilteredUngroupedStudies() {
		if (!ungroupedStudies || ungroupedStudies.length === 0) return [];
		
		let filtered = ungroupedStudies;
		
		if (searchQuery.trim() !== '') {
			const query = searchQuery.toLowerCase();
			
			filtered = ungroupedStudies.filter(study => {
				// Search in title
				if (study.title.toLowerCase().includes(query)) {
					return true;
				}
				
				// Search in passage references
				if (study.passages && study.passages.length > 0) {
					return study.passages.some(passage => {
						const reference = formatPassageReference(passage).toLowerCase();
						return reference.includes(query);
					});
				}
				
				return false;
			});
		}
		
		// Sort alphabetically
		return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
	}

	/**
	 * Get combined and sorted groups and ungrouped studies
	 * Groups and studies are mixed together and sorted alphabetically by name/title
	 * @returns {Array}
	 */
	function getSortedGroupsAndStudies() {
		const items = [];
		
		// Add groups with type identifier
		filteredGroups.forEach(group => {
			items.push({
				type: 'group',
				name: group.name,
				data: group
			});
		});
		
		// Add ungrouped studies with type identifier
		filteredUngroupedStudies.forEach(study => {
			items.push({
				type: 'study',
				name: study.title,
				data: study
			});
		});
		
		// Sort all items alphabetically by name
		items.sort((a, b) => a.name.localeCompare(b.name));
		
		return items;
	}

	/**
	 * Get flattened list of all items in display order for range selection
	 */
	function getFlattenedItemsList() {
		const items = [];
		let index = 0;
		
		sortedGroupsAndStudies.forEach(item => {
			if (item.type === 'group') {
				// Add group
				items.push({
					type: 'group',
					id: item.data.id,
					data: item.data,
					index: index++
				});
				
				// Add studies in group if not collapsed
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
				// Add ungrouped study
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
	 * Check if an item is selected
	 */
	function isItemSelected(type, id) {
		return selectedItems.some(item => item.type === type && item.id === id);
	}

	/**
	 * Clear all selections
	 */
	function clearSelection() {
		selectedItems = [];
		lastSelectedIndex = null;
		clearSelectedItem();
	}

	/**
	 * Update toolbar with current selection
	 */
	function updateToolbarSelection() {
		console.log('=== UPDATE TOOLBAR SELECTION ===');
		console.log('Selected items:', selectedItems.map(i => ({type: i.type, id: i.id})));
		console.log('Has groups:', selectedItems.some(i => i.type === 'group'));
		console.log('Has studies:', selectedItems.some(i => i.type === 'study'));
		
		if (selectedItems.length === 0) {
			clearSelectedItem();
		} else {
			setSelectedItem({
				items: selectedItems,
				count: selectedItems.length,
				hasGroups: selectedItems.some(i => i.type === 'group'),
				hasStudies: selectedItems.some(i => i.type === 'study')
			});
		}
	}

	/**
	 * Expand group and add its studies to selection
	 */
	async function expandGroupAndSelectStudies(group) {
		// If group is collapsed, expand it
		if (group.isCollapsed) {
			await toggleGroupCollapse(group.id, true);
		}
		
		// Add all studies in the group to selection
		group.studies.forEach(study => {
			// Check if study is already selected
			if (!isItemSelected('study', study.id)) {
				// Need to find the study's index in flattened list after expansion
				// For now, add with a temporary index (will be recalculated)
				selectedItems.push({
					type: 'study',
					id: study.id,
					data: study,
					index: -1 // Temporary, will be updated
				});
			}
		});
		
		// Recalculate indices for all selected items
		const flattenedList = getFlattenedItemsList();
		selectedItems.forEach(item => {
			const foundItem = flattenedList.find(
				fi => fi.type === item.type && fi.id === item.id
			);
			if (foundItem) {
				item.index = foundItem.index;
			}
		});
	}

	/**
	 * Handle item click with modifier keys
	 */
	async function handleItemClick(event, type, id, data) {
		event.preventDefault();
		event.stopPropagation();
		
		const flattenedList = getFlattenedItemsList();
		const clickedItem = flattenedList.find(item => item.type === type && item.id === id);
		
		if (!clickedItem) return;
		
		// Check for modifier keys
		const isShift = event.shiftKey;
		const isCmd = event.metaKey || event.ctrlKey;
		
		if (isShift && lastSelectedIndex !== null) {
			// Shift+Click: Range selection (multi-select)
			const startIndex = Math.min(lastSelectedIndex, clickedItem.index);
			const endIndex = Math.max(lastSelectedIndex, clickedItem.index);
			
			// Select all items in range
			const rangeItems = flattenedList.filter(
				item => item.index >= startIndex && item.index <= endIndex
			);
			
			// Add range to selection (avoiding duplicates)
			for (const item of rangeItems) {
				if (!isItemSelected(item.type, item.id)) {
					selectedItems.push({
						type: item.type,
						id: item.id,
						data: item.data,
						index: item.index
					});
				}
			}
			
		} else if (isCmd) {
			// Cmd/Ctrl+Click: Toggle individual item
			const existingIndex = selectedItems.findIndex(
				item => item.type === type && item.id === id
			);
			
			console.log('=== CMD+CLICK REMOVAL DEBUG ===');
			console.log('Removing:', type, id);
			console.log('Selected items BEFORE:', selectedItems.map(i => ({type: i.type, id: i.id})));
			console.log('Existing index:', existingIndex);
			
			if (existingIndex >= 0) {
				// Remove from selection
				// If removing a group, also remove its studies
				if (type === 'group') {
					const groupData = selectedItems[existingIndex].data;
					selectedItems = selectedItems.filter(item => {
						// Keep items that are not this group and not studies in this group
						if (item.type === 'group' && item.id === id) return false;
						if (item.type === 'study' && groupData.studies.some(s => s.id === item.id)) return false;
						return true;
					});
				} else {
					// Use filter instead of splice to ensure Svelte 5 reactivity
					const beforeFilter = selectedItems.length;
					selectedItems = selectedItems.filter((item, index) => index !== existingIndex);
					console.log('Filtered items - before:', beforeFilter, 'after:', selectedItems.length);
				}
				console.log('Selected items AFTER:', selectedItems.map(i => ({type: i.type, id: i.id})));
			} else {
				// Add to selection
				selectedItems.push({
					type,
					id,
					data,
					index: clickedItem.index
				});
				
				console.log('=== ADDED ITEM TO SELECTION ===');
				console.log('Added:', type, id);
				console.log('Selection now:', selectedItems.map(i => ({type: i.type, id: i.id})));
			}
			
			lastSelectedIndex = clickedItem.index;
			
		} else {
			// Regular click: Single selection
			selectedItems = [{
				type,
				id,
				data,
				index: clickedItem.index
			}];
			
			// Don't expand or select studies for single group selection
			
			lastSelectedIndex = clickedItem.index;
		}
		
		updateToolbarSelection();
	}

	/**
	 * Handle group header click for selection
	 */
	function handleGroupHeaderClick(event, group) {
		handleItemClick(event, 'group', group.id, group);
	}

	/**
	 * Handle study click - single click selects, double click navigates
	 */
	function handleStudyClick(event, study) {
		event.preventDefault();
		
		const currentTime = Date.now();
		const timeSinceLastClick = currentTime - lastClickTime;
		
		// Check if this is a double-click on already selected study
		if (timeSinceLastClick < DOUBLE_CLICK_THRESHOLD && 
		    selectedItems.length === 1 &&
		    isItemSelected('study', study.id)) {
			// Double-click: navigate to study
			setToolbarState('studiesPanelOpen', false);
			goto(`/study/${study.id}`);
		} else {
			// Single click: select the study
			handleItemClick(event, 'study', study.id, study);
			lastClickTime = currentTime;
		}
	}

	/**
	 * Handle panel click (for deselection)
	 */
	function handlePanelClick(event) {
		// Check if click is on a study item or group button
		const clickedOnStudy = event.target.closest('.study-item');
		const clickedOnGroupButton = event.target.closest('.group-select-button');
		const clickedOnChevron = event.target.closest('.chevron-button');
		
		// Deselect if clicked outside of any interactive item
		if (!clickedOnStudy && !clickedOnGroupButton && !clickedOnChevron) {
			clearSelection();
		}
	}

	/**
	 * Toggle group collapsed state
	 */
	async function toggleGroupCollapse(groupId, currentState) {
		try {
			const response = await fetch(`/api/groups/${groupId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ isCollapsed: !currentState })
			});

			if (response.ok) {
				// Reload the studies data
				await invalidate('app:studies');
			}
		} catch (error) {
			console.error('Error toggling group:', error);
		}
	}

	/**
	 * Handle mousedown on a study item
	 */
	function handleStudyMouseDown(event, study) {
		// Only handle left click
		if (event.button !== 0) return;
		
		// Prevent browser's default drag behavior
		event.preventDefault();
		
		// Record starting position and study
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		
		// Check if this study is in the current selection
		const isStudySelected = isItemSelected('study', study.id);
		
		// DON'T prepare drag lists yet - wait until actual drag starts
		// Just store which study was clicked and whether it's selected
		if (isStudySelected) {
			draggedStudies = selectedItems
				.filter(item => item.type === 'study')
				.map(item => item.data);
		} else {
			draggedStudies = [study];
		}
		
		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle document mousemove - check if drag threshold exceeded
	 */
	function handleDocumentMouseMove(event) {
		if (draggedStudies.length === 0) return;
		
		currentMouseX = event.clientX;
		currentMouseY = event.clientY;
		
		// Check if we've moved beyond threshold
		const deltaX = Math.abs(currentMouseX - dragStartX);
		const deltaY = Math.abs(currentMouseY - dragStartY);
		
		if (!isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
			isDragging = true;
			
			// NOW remove groups from selection (only when drag actually starts)
			console.log('=== DRAG STARTED - REMOVING GROUPS ===');
			console.log('Selection before:', selectedItems.map(i => ({type: i.type, id: i.id})));
			selectedItems = selectedItems.filter(item => item.type === 'study');
			console.log('Selection after:', selectedItems.map(i => ({type: i.type, id: i.id})));
			updateToolbarSelection();
		}
		
		// Update drop target if dragging
		if (isDragging) {
			updateDropTarget(event);
			handleAutoScroll(event);
		}
	}

	/**
	 * Update which group is the current drop target
	 * Checks the entire group-section area (header + studies if open)
	 */
	function updateDropTarget(event) {
		const groupSections = document.querySelectorAll('.group-section[data-group-id]');
		let newDropTarget = null;
		
		for (const section of groupSections) {
			const rect = section.getBoundingClientRect();
			if (
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom
			) {
				newDropTarget = section.getAttribute('data-group-id');
				break;
			}
		}
		
		dropTargetGroupId = newDropTarget;
	}

	/**
	 * Handle auto-scrolling when dragging near edges of the scrollable panel
	 */
	function handleAutoScroll(event) {
		const scrollable = document.querySelector('.panel-scrollable');
		const header = document.querySelector('.panel-header');
		if (!scrollable) return;
		
		const scrollableRect = scrollable.getBoundingClientRect();
		const mouseY = event.clientY;
		
		// Check if mouse is within the panel horizontally
		if (event.clientX < scrollableRect.left || event.clientX > scrollableRect.right) {
			stopAutoScroll();
			return;
		}
		
		// Check if cursor is in the header area - if so, scroll up
		if (header) {
			const headerRect = header.getBoundingClientRect();
			if (
				event.clientX >= headerRect.left &&
				event.clientX <= headerRect.right &&
				mouseY >= headerRect.top &&
				mouseY <= headerRect.bottom
			) {
				// Cursor is in header - scroll up at moderate speed
				autoScrollDirection = -1;
				autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * 0.7; // 70% of max speed
				startAutoScroll(scrollable);
				return;
			}
		}
		
		// Calculate distance from top and bottom edges of scrollable area
		const distanceFromTop = mouseY - scrollableRect.top;
		const distanceFromBottom = scrollableRect.bottom - mouseY;
		
		// Determine if we should scroll and in which direction
		let shouldScroll = false;
		
		if (distanceFromTop < AUTO_SCROLL_EDGE_SIZE && distanceFromTop >= 0) {
			// Near top edge - scroll up
			shouldScroll = true;
			autoScrollDirection = -1;
			// Speed increases as we get closer to edge
			autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * (1 - distanceFromTop / AUTO_SCROLL_EDGE_SIZE);
		} else if (distanceFromBottom < AUTO_SCROLL_EDGE_SIZE && distanceFromBottom >= 0) {
			// Near bottom edge - scroll down
			shouldScroll = true;
			autoScrollDirection = 1;
			// Speed increases as we get closer to edge
			autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * (1 - distanceFromBottom / AUTO_SCROLL_EDGE_SIZE);
		}
		
		if (shouldScroll) {
			startAutoScroll(scrollable);
		} else {
			stopAutoScroll();
		}
	}

	/**
	 * Start auto-scroll animation
	 */
	function startAutoScroll(scrollable) {
		// If already scrolling, don't restart the animation loop
		if (autoScrollAnimationId !== null) return;
		
		function scroll() {
			const currentScroll = scrollable.scrollTop;
			const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
			
			// Calculate new scroll position using current speed and direction
			const newScroll = currentScroll + (autoScrollDirection * autoScrollSpeed);
			
			// Check boundaries
			if (newScroll < 0) {
				scrollable.scrollTop = 0;
			} else if (newScroll > maxScroll) {
				scrollable.scrollTop = maxScroll;
			} else {
				// Apply scroll
				scrollable.scrollTop = newScroll;
			}
			
			// Continue animation
			autoScrollAnimationId = requestAnimationFrame(scroll);
		}
		
		autoScrollAnimationId = requestAnimationFrame(scroll);
	}

	/**
	 * Stop auto-scroll animation
	 */
	function stopAutoScroll() {
		if (autoScrollAnimationId !== null) {
			cancelAnimationFrame(autoScrollAnimationId);
			autoScrollAnimationId = null;
		}
		autoScrollSpeed = 0;
		autoScrollDirection = 0;
	}

	/**
	 * Handle document mouseup - finalize action
	 */
	async function handleDocumentMouseUp(event) {
		// Stop any ongoing auto-scroll
		stopAutoScroll();
		
		// Remove document listeners
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (draggedStudies.length === 0) return;
		
		// If we were dragging
		if (isDragging) {
			event.preventDefault();
			
			if (dropTargetGroupId !== null) {
				// Dropped on a group - move all dragged studies to that group
				await moveStudiesToGroup(draggedStudies.map(s => s.id), dropTargetGroupId);
			} else {
				// Check if dropped within the panel (but not on a group)
				const panel = document.querySelector('.studies-panel');
				if (panel) {
					const rect = panel.getBoundingClientRect();
					const isInPanel = 
						event.clientX >= rect.left &&
						event.clientX <= rect.right &&
						event.clientY >= rect.top &&
						event.clientY <= rect.bottom;
					
					if (isInPanel) {
						// Dropped in panel but not on a group - ungroup the studies
						await moveStudiesToGroup(draggedStudies.map(s => s.id), null);
					}
				}
			}
			
			// Clear selection after successful drop
			clearSelection();
		}
		
		// Reset drag state
		isDragging = false;
		draggedStudies = [];
		dropTargetGroupId = null;
		dragStartX = 0;
		dragStartY = 0;
		currentMouseX = 0;
		currentMouseY = 0;
	}

	/**
	 * Move multiple studies to a different group
	 */
	async function moveStudiesToGroup(studyIds, groupId) {
		try {
			// Convert 'ungrouped' to null
			const targetGroupId = groupId === 'ungrouped' ? null : groupId;
			
			// Move all studies
			await Promise.all(
				studyIds.map(studyId =>
					fetch(`/api/studies/${studyId}`, {
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ groupId: targetGroupId })
					})
				)
			);

			// Reload the studies data
			await invalidate('app:studies');
		} catch (error) {
			console.error('Error moving studies:', error);
		}
	}

	/**
	 * Set up document-level click handler for deselection
	 */
	$effect(() => {
		function handleDocumentClick(event) {
			// Only deselect if something is selected
			if (selectedItems.length === 0) return;
			
			// Check if click is inside the studies container
			const container = document.querySelector('.studies-container');
			if (!container) return;
			
			const clickedInsideContainer = container.contains(event.target);
			
			if (!clickedInsideContainer) {
				// Clicked outside the studies container - deselect
				clearSelection();
			}
		}
		
		// Add listener
		document.addEventListener('click', handleDocumentClick);
		
		// Cleanup
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

</script>

<!-- Drag ghost that follows cursor -->
{#if isDragging && draggedStudies.length > 0}
	<div 
		class="drag-ghost" 
		class:multi={draggedStudies.length > 1}
		style="left: {(currentMouseX + 6) / 10}rem; top: {(currentMouseY + 6) / 10}rem;"
	>
		{#if draggedStudies.length === 1}
			<!-- Single study ghost -->
			<Icon iconId={'book'} classes="book-icon" />
			<div class="study-info">
				<div class="study-title">{draggedStudies[0].title}</div>
				{#if draggedStudies[0].passages && draggedStudies[0].passages.length > 0}
					<div class="study-references">
						{#each draggedStudies[0].passages as passage, i}
							{formatPassageReference(passage)}{#if i < draggedStudies[0].passages.length - 1},&nbsp;{/if}
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<!-- Multiple studies ghost -->
			<div class="multi-drag-info">
				<Icon iconId={'book'} classes="book-icon" />
				<span class="drag-count">Dragging {draggedStudies.length} studies</span>
			</div>
		{/if}
	</div>
{/if}

<aside class="studies-panel" class:open={isOpen}>
	<div class="panel-content">
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
			<!-- Fallback: Show all studies if groups/ungrouped not working -->
			<ul class="studies-list">
				{#each sortedStudies as study}
					<li>
						<a 
							href="/study/{study.id}" 
							class="study-item"
							onclick={() => setToolbarState('studiesPanelOpen', false)}
						>
							<Icon iconId={'book'} classes="book-icon" />
							<div class="study-info">
								<div class="study-title">{study.title}</div>
								{#if study.passages && study.passages.length > 0}
									<div class="study-references">
										{#each study.passages as passage, i}
											{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
										{/each}
									</div>
								{/if}
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="studies-container">
				<!-- Unified alphabetized list of groups and ungrouped studies -->
				{#each sortedGroupsAndStudies as item (item.type === 'group' ? 'group-' + item.data.id : 'study-' + item.data.id)}
					<div animate:flip={{ duration: 300 }}>
						{#if item.type === 'group'}
							<!-- Group -->
							<div 
								class="group-section"
								class:drop-target={dropTargetGroupId === item.data.id}
								class:selected={isItemSelected('group', item.data.id)}
								data-group-id={item.data.id}
							>
								<div class="group-header">
									<div class="group-info">
										<button 
											class="chevron-button"
											onclick={(e) => { e.stopPropagation(); toggleGroupCollapse(item.data.id, item.data.isCollapsed); }}
											aria-label={item.data.isCollapsed ? 'Expand group' : 'Collapse group'}
											aria-expanded={!item.data.isCollapsed}
										>
											<Icon iconId={item.data.isCollapsed ? 'chevron-right' : 'chevron-down'} classes="chevron-icon" />
										</button>
										<button 
											class="group-select-button"
											onclick={(e) => handleGroupHeaderClick(e, item.data)}
											aria-label="Select group {item.data.name}"
										>
											<Icon iconId={'folder'} classes="folder-icon" />
											<span class="group-name">{item.data.name}</span>
										</button>
									</div>
									<span class="group-count">{item.data.studies.length}</span>
								</div>
								
								{#if !item.data.isCollapsed}
									<ul class="studies-list grouped" transition:slide={{ duration: 200 }}>
										{#each item.data.studies as study (study.id)}
											<li animate:flip={{ duration: 300 }}>
												<button 
													class="study-item"
													class:being-dragged={isDragging && draggedStudies.some(s => s.id === study.id)}
													class:selected={isItemSelected('study', study.id)}
													onmousedown={(e) => handleStudyMouseDown(e, study)}
													onclick={(e) => {
														if (!isDragging) {
															handleStudyClick(e, study);
														} else {
															e.preventDefault();
														}
													}}
												>
													<Icon iconId={'book'} classes="book-icon" />
													<div class="study-info">
														<div class="study-title">{study.title}</div>
														{#if study.passages && study.passages.length > 0}
															<div class="study-references">
																{#each study.passages as passage, i}
																	<div class="study-reference">
																		{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
																	</div>
																{/each}
															</div>
														{/if}
													</div>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{:else}
							<!-- Ungrouped Study -->
							<div class="study-wrapper">
								<button 
									class="study-item ungrouped"
									class:being-dragged={isDragging && draggedStudies.some(s => s.id === item.data.id)}
									class:selected={isItemSelected('study', item.data.id)}
									onmousedown={(e) => handleStudyMouseDown(e, item.data)}
									onclick={(e) => {
														if (!isDragging) {
															handleStudyClick(e, item.data);
														} else {
															e.preventDefault();
														}
													}}
								>
									<Icon iconId={'book'} classes="book-icon" />
									<div class="study-info">
										<div class="study-title">{item.data.title}</div>
										{#if item.data.passages && item.data.passages.length > 0}
											<div class="study-references">
												{#each item.data.passages as passage, i}
													<div class="study-reference">
														{formatPassageReference(passage)}{#if i < item.data.passages.length - 1},&nbsp;{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{/if}
		</div>
	</div>
</aside>

<style>
	.studies-panel {
		width: 0;
		min-width: 0;
		height: 100%;
		background-color: var(--gray-lighter);
		border-right: 1px solid var(--gray-700);
		overflow: hidden;
		transition: width 0.3s ease-in-out, min-width 0.3s ease-in-out;
		flex-shrink: 0;
	}

	.studies-panel.open {
		width: 300px;
		min-width: 300px;
	}

	.panel-content {
		width: 300px;
		height: 100%;
		display: flex;
		flex-direction: column;
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

	.panel-header :global(h1) {
		margin: 0;
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

	.study-item {
		display: flex;
		justify-content: flex-start;
		gap: 0.7rem;
		padding: 0.9rem 0.9rem 0.9rem 2.3rem;
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		color: var(--black);
		text-decoration: none;
		text-align: left;
		width: 100%;
		cursor: pointer;
		transition: background-color 0.2s, border-color 0.2s;
	}

	.study-item.ungrouped {
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
	}

	.study-item.selected {
		background-color: var(--blue);
		color: var(--white);
	}

	.study-item.selected :global(.book-icon) {
		fill: var(--white);
	}

	.study-item.selected .study-references {
		color: var(--white);
	}

	.study-item :global(.book-icon) {
		height: 1.2rem;
		margin-top: 0.2rem;
		fill: var(--gray-300);
	}

	.study-info {
		display: flex;
		flex-direction: column;
	}

	.study-title {
		font-size: 1.4rem;
		font-weight: 500;
		margin-bottom: 0.3rem;
	}

	.study-references {
		font-size: 1.1rem;
		line-height: 1.3;
		color: var(--gray-300);
	}

	.study-reference {
		display: inline-block;
	}

	.study-item:hover {
		background-color: var(--blue-light);
	}

	.study-item:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.study-item:hover .study-references {
		color: var(--black);
	}

	.studies-container {
		display: flex;
		flex-direction: column;
	}

	.group-section {
		display: flex;
		flex-direction: column;
	}

	.group-section.selected {
		background-color: var(--blue-light);
		border-radius: 0.3rem;
	}

	.group-section.selected .group-select-button {
		color: var(--blue);
	}

	.group-section.selected .group-select-button :global(.folder-icon) {
		fill: var(--blue);
	}

	.group-header {
		display: flex;
		justify-content: space-between;
		padding: 0.9rem 0.6rem;
		background-color: transparent;
		border-radius: 0.3rem;
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
	}

	.group-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
	}

	.group-count {
		font-size: 1.2rem;
		color: var(--gray-400);
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.3rem 0.6rem;
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		cursor: pointer;
		margin: -1.3rem -0.6rem -1.3rem -0.6rem;
		flex-shrink: 0;
	}

	.chevron-button:hover {
		background-color: var(--gray-700);
	}

	.chevron-button:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.chevron-button :global(.chevron-icon) {
		height: 0.9rem;
		fill: var(--gray-200);
	}

	.group-select-button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0;
		background-color: transparent;
		border: none;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		cursor: pointer;
		text-align: left;
		flex: 1;
		border-radius: 0.3rem;
		padding: 0.3rem;
		margin: -0.3rem;
		transition: background-color 0.2s;
	}

	.group-select-button:hover {
		background-color: var(--gray-700);
	}

	.group-select-button:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.group-select-button :global(.folder-icon) {
		fill: var(--gray-300);
		transition: fill 0.2s;
	}

	.group-name {
		flex: 1;
	}

	.studies-list.grouped {
		padding-left: 1.2rem;
	}

	/* Drag and drop styles */
	.study-item.being-dragged {
		border-radius: 0.0rem;
		border-left: 0.2rem solid var(--blue);
		cursor: grabbing;
		padding-left: 0.9rem;
		margin-left: 2.3rem;
	}

	.study-item.being-dragged * {
		opacity: 0;
	}

	.study-item.being-dragged :global(.icon) {
		opacity: 0;
	}

	.study-item.being-dragged:hover {
		background-color: transparent;
	}

	.group-section.drop-target {
		background-color: var(--blue-light);
		border-radius: 0.3rem;
	}

	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 9999;
		width: 28.2rem;
		background-color: var(--gray-lighter);
		padding: 0.9rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		display: flex;
		gap: 0.7rem;
	}

	.drag-ghost.multi {
		width: auto;
		min-width: 20rem;
	}

	.drag-ghost :global(.book-icon) {
		height: 1.2rem;
		margin-top: 0.2rem;
		fill: var(--gray-300);
		flex-shrink: 0;
	}

	.multi-drag-info {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.drag-count {
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--black);
		white-space: nowrap;
	}

	/* Prevent text selection while dragging */
	:global(body.dragging) {
		user-select: none;
		cursor: grabbing;
	}
</style>
