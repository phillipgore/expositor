<script>
	/**
	 * SeriesPartNav
	 *
	 * Up/down chevrons that step to the previous/next part of a series, staying in
	 * the current view (`analyze` or `document`). Shared by the Analyze sub-toolbar
	 * and the Document commentary toolbar so both sit in the same spot.
	 *
	 * For a standalone study `seriesContext` is null and both buttons are disabled;
	 * at the first/last part the corresponding button is disabled.
	 */
	import { goto } from '$app/navigation';
	import Icon from '$lib/componentElements/Icon.svelte';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';

	/** @type {{ seriesContext?: any, view: 'analyze' | 'document' }} */
	let { seriesContext = null, view } = $props();

	let prevPart = $derived(
		seriesContext?.parts && seriesContext.position > 1
			? seriesContext.parts[seriesContext.position - 2]
			: null
	);
	let nextPart = $derived(
		seriesContext?.parts && seriesContext.position < seriesContext.total
			? seriesContext.parts[seriesContext.position]
			: null
	);

	let positionLabel = $derived(
		seriesContext?.parts && seriesContext.total
			? `${seriesContext.position} of ${seriesContext.total}`
			: null
	);

	function goToPart(part) {
		if (part?.id) goto(`/study/${part.id}/${view}`);
	}
</script>

<div class="series-part-nav">
	<button
		use:tooltip
		class="nav-button"
		disabled={!prevPart}
		onclick={() => goToPart(prevPart)}
		title="Previous Part"
		aria-label={positionLabel ? `Previous Part (${positionLabel})` : 'Previous Part'}
	>
		<Icon iconId="chevron-up" />
	</button>
	<!-- Plain, non-interactive position readout, always shown so the control never
	     disappears. Standalone studies show a disabled "1 of 1". Hidden from screen
	     readers because the buttons' labels already carry the position. -->
	<span class="position" class:disabled={!positionLabel} aria-hidden="true">{positionLabel ?? '1 of 1'}</span>
	<button
		use:tooltip
		class="nav-button"
		disabled={!nextPart}
		onclick={() => goToPart(nextPart)}
		title="Next Part"
		aria-label={positionLabel ? `Next Part (${positionLabel})` : 'Next Part'}
	>
		<Icon iconId="chevron-down" />
	</button>
</div>

<style>
	.series-part-nav {
		display: flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	/* Fixed min-width (fits "10 of 10") + tabular digits so the buttons never
	   shift as the number changes. Styled like the subtitle: small, gray, inert. */
	.position {
		align-self: center;
		min-width: 5.6rem;
		text-align: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--gray-400);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		user-select: none;
	}

	/* Matches .nav-button:disabled so the whole group reads as inactive. */
	/* Use the buttons' base color (not the label's lighter gray-400) so the same
	   opacity produces the same disabled tone as the chevrons. */
	.position.disabled {
		color: var(--gray-200);
		opacity: 0.4;
	}

	.nav-button {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 3rem;
		min-width: 3rem;
		padding: 0 0.6rem;
		border: none;
		border-radius: 0.3rem;
		background-color: transparent;
		color: var(--gray-200);
		cursor: pointer;
		transition: background-color 0.15s ease, opacity 0.15s ease;
	}

	.nav-button:hover:not(:disabled) {
		background-color: var(--gray-800);
	}

	.nav-button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	@media print {
		.series-part-nav {
			display: none;
		}
	}
</style>
