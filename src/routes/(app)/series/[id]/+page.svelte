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
	import { getTranslationAbbreviation } from '$lib/utils/translationConfig.js';

	let { data } = $props();

	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

	let partCount = $derived(data.parts?.length ?? 0);

	/**
	 * The resume button names its part the way the Finder's part rows do: passage reference plus
	 * translation, not the part's derived title. `resumePartReference` is built in the loader
	 * (see the comment there); the badge is appended here because the abbreviation lookup lives
	 * client-side, alongside every other place that renders one.
	 */
	let resumeLabel = $derived.by(() => {
		if (!data.resumePartReference) return 'Continue reading';
		const abbr = getTranslationAbbreviation(data.resumePartTranslation);
		return `Continue: ${data.resumePartReference} [${abbr}]`;
	});

	// The view the user was last reading in, so resuming returns them to Document or Analyze as
	// they left it rather than always snapping to one. Same fallback the Finder uses.
	let resumeView = $derived(get(toolbarState).lastStudyView || 'analyze');

	/**
	 * The series' own badge, beside its title — the same annotation the Finder row now carries, so
	 * navigating from that row to this page does not drop a fact the row was showing.
	 * `studySeries.translation` is authoritative (§4); part 1 answers for a series row that
	 * somehow lacks it, since every part shares the one translation by construction.
	 */
	let translationAbbr = $derived(
		getTranslationAbbreviation(data.series.translation ?? data.parts?.[0]?.translation)
	);
</script>

<div class="container">
	<!-- `series` — the dedicated series glyph, matching the Finder row (§9, Q29). Registered in
	     icons.json; a public/*.svg file alone would render as blank space (trap 13). -->
	<Icon iconId="series" isActive={false} classes=""></Icon>

	<Heading heading="h1" alignCenter hasSub={data.series.subtitle ? true : false}>
		{data.series.name}<span
			class="translation-badge"
			aria-label="Translation: {translationAbbr}">[{translationAbbr}]</span
		>
	</Heading>

	{#if data.series.subtitle}
		<Heading heading="h3" isMuted>{data.series.subtitle}</Heading>
	{/if}

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
				label={resumeLabel}
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

	/* Same annotation as the Finder row and the Document header, scaled to an h1: it stays notably
	   smaller and lighter than the name so it reads as a note on the title rather than part of it,
	   and does not inherit the heading's weight. */
	.translation-badge {
		display: inline-block;
		margin-left: 0.5rem;
		font-size: 1.4rem;
		font-weight: 400;
		color: var(--gray-300);
		vertical-align: middle;
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
