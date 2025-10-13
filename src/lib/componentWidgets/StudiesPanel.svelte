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
	import Button from "$lib/componentElements/buttons/Button.svelte";
	import { setToolbarState } from "$lib/stores/toolbar.js";

	let { isOpen = false, studies = [] } = $props();

	let searchQuery = $state('');
	let sortedStudies = $derived(getSortedStudies());

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
	 * Format a date to human readable format
	 * @param {Date | string | null} date
	 * @returns {string}
	 */
	function formatDate(date) {
		if (!date) return 'Never';
		
		const d = new Date(date);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);
		
		// Less than 1 minute
		if (diffMins < 1) return 'Just now';
		// Less than 1 hour
		if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
		// Less than 24 hours
		if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
		// Less than 7 days
		if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
		
		// Format as date
		return d.toLocaleDateString('en-US', { 
			month: 'short', 
			day: 'numeric', 
			year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
		});
	}

	/**
	 * Get sorted and filtered studies - always sorted by title
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
</script>

<aside class="studies-panel" class:open={isOpen}>
	<div class="panel-content">
		<div class="panel-header">
			<Heading heading="h1" classes="h4 panel-heading">Studies</Heading>
			<Button label="New Group"></Button>
		</div>
		
		<Input 
			id="search-studies" 
			name="search" 
			type="search" 
			placeholder="Search Studies"
			bind:value={searchQuery}
		/>
		
		{#if studies.length === 0}
			<p class="empty-message">No studies yet. Create one to get started!</p>
		{:else}
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
							<div class="study-dates">
								<span class="study-date">Modified: {formatDate(study.updatedAt)}</span>
								<span class="study-date">Created: {formatDate(study.createdAt)}</span>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
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
		padding: 1.8rem;
		overflow-y: auto;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.9rem;
	}

	.panel-header :global(h1) {
		margin: 0;
	}

	.panel-content :global(#search-studies) {
		margin-bottom: 1.8rem;
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
		margin-bottom: 0.6rem;
	}

	.study-dates {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.study-date {
		font-size: 0.9rem;
		color: var(--gray-500);
	}

	.study-item:hover {
		background-color: var(--blue-lighter);
		border-color: var(--blue);
	}

	.study-item:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}
</style>
