<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Heading from '$lib/componentElements/Heading.svelte';

	/** @type {import('./$types').PageData} */
	let { data } = $props();

	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

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
</script>

<div class="container">
	<div class="study-header">
		<Heading heading="h1" classes="h4">{data.study.title}</Heading>
		{#if data.passages && data.passages.length > 0}
			<p class="study-references">
				{#each data.passages as passage, i}
					{formatPassageReference(passage)}{#if i < data.passages.length - 1},&nbsp;{/if}
				{/each}
			</p>
		{/if}
	</div>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		margin-top: 3.6rem;
	}

	.study-header {
		max-width: 60rem;
		width: 100%;
		text-align: center;
	}

	.study-references {
		font-size: 1.4rem;
		color: var(--gray-400);
		margin-top: 0.9rem;
		margin-bottom: 2.7rem;
	}
</style>
