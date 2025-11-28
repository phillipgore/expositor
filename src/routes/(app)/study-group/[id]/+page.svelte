<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import InstructionText from '$lib/componentElements/InstructionText.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';

	let { data } = $props();

	// Invalidate studies list when study group is accessed
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
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}
</script>

<div class="container">
	<Icon iconId="folder" isActive={false}  classes=""></Icon>
	<Heading heading="h1" alignCenter hasSub={data.group.subtitle ? true : false}>{data.group.name}</Heading>
	{#if data.group.subtitle}
		<Heading heading="h3" isMuted>{data.group.subtitle}</Heading>
	{/if}
	{#if data.group.description}
		<InstructionText>
			<p class="group-description">{data.group.description}</p>
		</InstructionText>
	{/if}
	<div class="button-group">
		<Button 
			href="/new-study-group?parentGroupId={data.group.id}" 
			label="New Group in Group" 
			classes="blue"
		/>
		<Button 
			href="/new-study?groupId={data.group.id}" 
			label="New Study in Group" 
			classes="blue"
		/>
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;
	}

	.container :global(.icon) {
		margin-top: -15.5rem;
		height: 10.0rem;
		max-width: initial;
		margin-bottom: 5.4rem;
		fill: var(--gray-700);
	}

	.group-description {
		max-width: 60rem;
		white-space: pre-wrap;
	}

	.button-group {
		display: flex;
		gap: 1.5rem;
		padding-top: 1.8rem;
	}
</style>
