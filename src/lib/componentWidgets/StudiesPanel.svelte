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

	let { isOpen = false, studies = [], groups = [], ungroupedStudies = [] } = $props();

	let searchQuery = $state('');
	let sortedStudies = $derived(getSortedStudies());
	let filteredGroups = $derived(getFilteredGroups());
	let filteredUngroupedStudies = $derived(getFilteredUngroupedStudies());

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
	 * Get filtered groups with filtered studies
	 * @returns {Array}
	 */
	function getFilteredGroups() {
		if (!groups || groups.length === 0) return [];
		
		if (searchQuery.trim() === '') {
			return groups;
		}

		const query = searchQuery.toLowerCase();
		
		// Keep all groups, but filter studies within each group
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

			return {
				...group,
				studies: filteredStudies
			};
		});
	}

	/**
	 * Get filtered ungrouped studies
	 * @returns {Array}
	 */
	function getFilteredUngroupedStudies() {
		if (!ungroupedStudies || ungroupedStudies.length === 0) return [];
		
		if (searchQuery.trim() === '') {
			return ungroupedStudies;
		}

		const query = searchQuery.toLowerCase();
		
		return ungroupedStudies.filter(study => {
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

</script>

<aside class="studies-panel" class:open={isOpen}>
	<div class="panel-content">
		<div class="panel-header">
			<Input 
				id="search-studies" 
				name="search" 
				type="search" 
				placeholder="Search Studies"
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
							<div class="study-title">{study.title}</div>
							{#if study.passages && study.passages.length > 0}
								<div class="study-references">
									{#each study.passages as passage, i}
										{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
									{/each}
								</div>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="studies-container">
				<!-- Groups -->
				{#if filteredGroups.length > 0}
					{#each filteredGroups as group}
						<div class="group-section">
							<button 
								class="group-header"
								onclick={() => toggleGroupCollapse(group.id, group.isCollapsed)}
							>
								<Icon 
									iconId={group.isCollapsed ? 'caret-right' : 'caret-down'}
								/>
								<span class="group-name">{group.name}</span>
								<span class="group-count">({group.studies.length})</span>
							</button>
							
							{#if !group.isCollapsed}
								<ul class="studies-list grouped">
									{#each group.studies as study}
										<li>
											<a 
												href="/study/{study.id}" 
												class="study-item"
												onclick={() => setToolbarState('studiesPanelOpen', false)}
											>
												<div class="study-title">{study.title}</div>
												{#if study.passages && study.passages.length > 0}
													<div class="study-references">
														{#each study.passages as passage, i}
															{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
														{/each}
													</div>
												{/if}
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				{/if}

				<!-- Ungrouped Studies -->
				{#if filteredUngroupedStudies.length > 0}
					<div class="group-section">
						<div class="group-header ungrouped">
							<span class="group-name">Ungrouped</span>
							<span class="group-count">({filteredUngroupedStudies.length})</span>
						</div>
						
						<ul class="studies-list">
							{#each filteredUngroupedStudies as study}
								<li>
									<a 
										href="/study/{study.id}" 
										class="study-item"
										onclick={() => setToolbarState('studiesPanelOpen', false)}
									>
										<div class="study-title">{study.title}</div>
										{#if study.passages && study.passages.length > 0}
											<div class="study-references">
												{#each study.passages as passage, i}
													{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
												{/each}
											</div>
										{/if}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
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
		gap: 0.9rem;
		padding: 1.8rem 1.8rem 1.8rem 1.8rem;
		background-color: var(--gray-lighter);
		position: sticky;
		top: 0;
		z-index: 1;
		flex-shrink: 0;
	}

	.panel-header :global(h1) {
		margin: 0;
	}

	.panel-scrollable {
		flex: 1;
		overflow-y: auto;
		padding: 0 1.8rem 1.8rem 1.8rem;
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

	.studies-list li {
		margin-bottom: 0.6rem;
	}

	.study-item {
		display: block;
		padding: 1.2rem;
		background-color: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		color: var(--black);
		text-decoration: none;
		transition: background-color 0.2s, border-color 0.2s;
	}

	.study-title {
		font-size: 1.2rem;
		font-weight: 500;
		margin-bottom: 0.4rem;
	}

	.study-references {
		font-size: 1.0rem;
		color: var(--gray-400);
	}

	.study-item:hover {
		background-color: var(--blue-lighter);
		border-color: var(--blue);
	}

	.study-item:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.studies-container {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}

	.group-section {
		display: flex;
		flex-direction: column;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.9rem 1.2rem;
		background-color: var(--gray-700);
		border: none;
		border-radius: 0.3rem;
		color: var(--black);
		font-size: 1.2rem;
		font-weight: 600;
		cursor: pointer;
		margin-bottom: 0.6rem;
		transition: background-color 0.2s;
	}

	.group-header:hover {
		background-color: var(--gray-600);
	}

	.group-header.ungrouped {
		cursor: default;
		background-color: transparent;
		border: 1px solid var(--gray-700);
	}

	.group-header.ungrouped:hover {
		background-color: transparent;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		color: var(--gray-400);
		font-weight: normal;
		font-size: 1.0rem;
	}

	.studies-list.grouped {
		padding-left: 1.2rem;
	}
</style>
