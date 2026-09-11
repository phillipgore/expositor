<script>
	/**
	 * # Series landing page
	 *
	 * The destination a series row navigates to, mirroring `/study-group/[id]` for groups. See
	 * `+page.server.js` for why a series needs a page of its own rather than opening one of its
	 * parts.
	 *
	 * The "Continue reading" button is Q18's resume, kept as an explicit choice: `lastPartId` still
	 * records where the user was, but acting on it is now something they do rather than something
	 * selecting the series does to them.
	 */
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import Heading from '$lib/componentElements/Heading.svelte';
	import InstructionText from '$lib/componentElements/InstructionText.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { data } = $props();

	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

	let partCount = $derived(data.parts?.length ?? 0);

	// The view the user was last reading in, so resuming returns them to Document or Analyze as
	// they left it rather than always snapping to one. Same fallback the Finder uses.
	let resumeView = $derived(get(toolbarState).lastStudyView || 'analyze');
</script>

<div class="container">
	<!-- `series` — the dedicated series glyph, matching the Finder row (§9, Q29). Registered in
	     icons.json; a public/*.svg file alone would render as blank space (trap 13). -->
	<Icon iconId="series" isActive={false} classes=""></Icon>

	<Heading heading="h1" alignCenter hasSub={data.series.subtitle ? true : false}>
		{data.series.name}
	</Heading>

	{#if data.series.subtitle}
		<Heading heading="h3" isMuted>{data.series.subtitle}</Heading>
	{/if}

	<p class="series-count">
		Series · {partCount}
		{partCount === 1 ? 'part' : 'parts'}
	</p>

	{#if data.series.description}
		<InstructionText>
			<p class="series-description">{data.series.description}</p>
		</InstructionText>
	{/if}

	<!-- A series whose parts have all been deleted. The Finder hides these (see the
	     `parts.length > 0` filter in the app layout loader), so this is only reachable by URL — a
	     bookmark, or history from before the last part went. Saying so is better than rendering a
	     Continue button that leads nowhere and an Edit button whose loader 404s. -->
	{#if partCount === 0}
		<Alert
			color="yellow"
			look="subtle"
			message="This series has no parts left. Nothing can be read or edited here."
		/>
	{/if}

	<div class="button-group">
		{#if data.resumePartId}
			<Button
				href="/study/{data.resumePartId}/{resumeView}"
				label={data.resumePartTitle ? `Continue: ${data.resumePartTitle}` : 'Continue reading'}
				classes="blue"
			/>
		{/if}
		{#if partCount > 0}
			<Button href="/series/{data.series.id}/edit" label="Edit Series" classes="gray" />
		{/if}
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
		height: 10rem;
		max-width: initial;
		margin-bottom: 2.7rem;
		fill: var(--gray-700);
	}

	/* Matches the Finder row's own "Series · N parts" phrasing, so the page names the thing the
	   same way the row that led here does. */
	.series-count {
		margin: 0.9rem 0 0;
		font-size: 1.4rem;
		color: var(--gray-300);
	}

	.series-description {
		max-width: 60rem;
		white-space: pre-wrap;
	}

	.button-group {
		display: flex;
		gap: 1.5rem;
		padding-top: 5.4rem;
	}
</style>
