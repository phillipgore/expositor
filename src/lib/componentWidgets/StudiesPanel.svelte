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
	import { setToolbarState } from "$lib/stores/toolbar.js";
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import DividerHorizontal from "$lib/componentElements/DividerHorizontal.svelte";

	let { isOpen = false, studies = [], groups = [], ungroupedStudies = [] } = $props();

	let searchQuery = $state('');
	let sortedStudies = $derived(getSortedStudies());
	let filteredGroups = $derived(getFilteredGroups());
	let filteredUngroupedStudies = $derived(getFilteredUngroupedStudies());
	let sortedGroupsAndStudies = $derived(getSortedGroupsAndStudies());

	// Drag and drop state
	let isDragging = $state(false);
	let draggedStudy = $state(null);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let currentMouseX = $state(0);
	let currentMouseY = $state(0);
	let dropTargetGroupId = $state(null);
	const DRAG_THRESHOLD = 5; // pixels to move before initiating drag

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
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		draggedStudy = study;
		
		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle document mousemove - check if drag threshold exceeded
	 */
	function handleDocumentMouseMove(event) {
		if (!draggedStudy) return;
		
		currentMouseX = event.clientX;
		currentMouseY = event.clientY;
		
		// Check if we've moved beyond threshold
		const deltaX = Math.abs(currentMouseX - dragStartX);
		const deltaY = Math.abs(currentMouseY - dragStartY);
		
		if (!isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
			isDragging = true;
		}
		
		// Update drop target if dragging
		if (isDragging) {
			updateDropTarget(event);
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
	 * Handle document mouseup - finalize action
	 */
	async function handleDocumentMouseUp(event) {
		// Remove document listeners
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (!draggedStudy) return;
		
		// If we were dragging
		if (isDragging) {
			event.preventDefault();
			
			if (dropTargetGroupId !== null) {
				// Dropped on a group - move to that group
				await moveStudyToGroup(draggedStudy.id, dropTargetGroupId);
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
						// Dropped in panel but not on a group - ungroup the study
						await moveStudyToGroup(draggedStudy.id, null);
					}
				}
			}
		}
		// else: No drag occurred - this was a click, allow navigation (anchor tag handles it)
		
		// Reset drag state
		isDragging = false;
		draggedStudy = null;
		dropTargetGroupId = null;
		dragStartX = 0;
		dragStartY = 0;
		currentMouseX = 0;
		currentMouseY = 0;
	}

	/**
	 * Move a study to a different group
	 */
	async function moveStudyToGroup(studyId, groupId) {
		try {
			// Convert 'ungrouped' to null
			const targetGroupId = groupId === 'ungrouped' ? null : groupId;
			
			const response = await fetch(`/api/studies/${studyId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ groupId: targetGroupId })
			});

			if (response.ok) {
				// Reload the studies data
				await invalidate('app:studies');
			}
		} catch (error) {
			console.error('Error moving study:', error);
		}
	}

</script>

<!-- Drag ghost that follows cursor -->
{#if isDragging && draggedStudy}
	<div 
		class="drag-ghost" 
		style="left: {(currentMouseX + 6) / 10}rem; top: {(currentMouseY + 6) / 10}rem;"
	>
		<Icon iconId={'book'} classes="book-icon" />
		<div class="drag-ghost-title">{draggedStudy.title}</div>
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
		
		<div class="panel-scrollable">
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
								data-group-id={item.data.id}
							>
								<button 
									class="group-header"
									onclick={() => toggleGroupCollapse(item.data.id, item.data.isCollapsed)}
								>
									<div class="group-info">
										<Icon iconId={item.data.isCollapsed ? 'caret-right' : 'caret-down'} classes="caret-icon" />
										<Icon iconId={'folder'} classes="folder-icon" />
										<span class="group-name">{item.data.name}</span>
									</div>
									<span class="group-count">{item.data.studies.length}</span>
								</button>
								
								{#if !item.data.isCollapsed}
									<ul class="studies-list grouped" transition:slide={{ duration: 200 }}>
										{#each item.data.studies as study (study.id)}
											<li animate:flip={{ duration: 300 }}>
												<a 
													href="/study/{study.id}" 
													class="study-item"
													class:being-dragged={isDragging && draggedStudy?.id === study.id}
													onmousedown={(e) => handleStudyMouseDown(e, study)}
													onclick={(e) => {
														if (isDragging) {
															e.preventDefault();
														} else {
															setToolbarState('studiesPanelOpen', false);
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
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{:else}
							<!-- Ungrouped Study -->
							<div class="study-wrapper">
								<a 
									href="/study/{item.data.id}" 
									class="study-item ungrouped"
									class:being-dragged={isDragging && draggedStudy?.id === item.data.id}
									onmousedown={(e) => handleStudyMouseDown(e, item.data)}
									onclick={(e) => {
										if (isDragging) {
											e.preventDefault();
										} else {
											setToolbarState('studiesPanelOpen', false);
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
								</a>
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
		border-radius: 0.3rem;
		color: var(--black);
		text-decoration: none;
		transition: background-color 0.2s, border-color 0.2s;
	}

	.study-item.ungrouped {
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
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

	.group-header {
		display: flex;
		justify-content: space-between;
		padding: 0.9rem 0.6rem;
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.group-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.group-count {
		font-size: 1.2rem;
		color: var(--gray-400);
	}

	.group-header :global(button) {
		margin-bottom: 0.0rem;
	}

	.group-header :global(.caret-icon) {
		height: 0.9rem;
		fill: var(--gray-400);
	}

	.group-header :global(.folder-icon) {
		fill: var(--gray-300);
	}

	.group-header:hover {
		background-color: var(--blue-light);
	}

	.studies-list.grouped {
		padding-left: 1.2rem;
	}

	/* Drag and drop styles */
	.study-item.being-dragged {
		opacity: 0.5;
		cursor: grabbing;
	}

	.group-section.drop-target {
		background-color: var(--blue-light);
		border-radius: 0.3rem;
	}

	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 9999;
		max-width: 25.0rem;
		display: flex;
		justify-content: flex-start;
		align-content: center;
		gap: 0.6rem;
		background-color: transparent;
		color: var(--black);
		text-decoration: none;
	}

	.drag-ghost-title {
		font-size: 1.4rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-radius: 2.5vh;
		background-color: var(--blue);
		color: var(--white);
		padding: 0.2rem 0.9rem;
	}

	.drag-ghost :global(.book-icon) {
		height: 1.2rem;
		margin-top: 0.4rem;
		fill: var(--gray-300);
	}

	/* Prevent text selection while dragging */
	:global(body.dragging) {
		user-select: none;
		cursor: grabbing;
	}
</style>
