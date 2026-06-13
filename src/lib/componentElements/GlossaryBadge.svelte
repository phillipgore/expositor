<script>
	/**
	 * GlossaryBadge Component
	 *
	 * An inline, rounded "pill" badge representing a glossary term.
	 * - Color is derived from the term's category (via glossaryIndex).
	 * - On hover/focus it shows the term's definition + examples using the
	 *   global tooltip system.
	 * - Optionally shows a remove (×) button (used by the bottom Tags strip).
	 *
	 * Label, definition, and examples are always resolved LIVE from the glossary
	 * by `termId`, so edits to glossary.json propagate to existing badges.
	 */
	import * as tooltipStore from '$lib/stores/tooltipStore.svelte.js';
	import { getTermById, getTooltipHtml } from '$lib/data/glossaryIndex.js';

	let {
		termId,
		/** Fallback label if the term id is missing from the glossary */
		fallbackLabel = '',
		removable = false,
		onRemove = () => {}
	} = $props();

	let entry = $derived(getTermById(termId));
	let label = $derived(entry?.term || fallbackLabel || 'Unknown term');
	let color = $derived(entry?.color || 'gray');
	// Shape differentiates the two glossary domains: exegesis terms render as
	// fully-rounded pills, preaching/teaching terms as rounded rectangles.
	let shape = $derived(entry?.shape || 'pill');


	let badgeElement = $state(null);

	function showTooltip() {
		if (!badgeElement) return;
		// Delayed show (shared delay) so a quick mouse pass over a badge doesn't
		// flash the definition. Matches the `use:tooltip` action's behavior.
		tooltipStore.scheduleShow({
			content: getTooltipHtml(termId),
			targetElement: badgeElement,
			placement: 'top',
			offset: 2,
			allowHtml: true
		});
	}


	function hideTooltip() {
		tooltipStore.hide();
	}

	// Clicking the badge "pins" the tooltip open so the definition stays visible
	// (and selectable for copying) until the user clicks elsewhere. Stop
	// propagation so the global click-outside handler doesn't immediately close it.
	function pinTooltip(event) {
		if (!badgeElement) return;
		event.stopPropagation();
		tooltipStore.pin({
			content: getTooltipHtml(termId),
			targetElement: badgeElement,
			placement: 'top',
			offset: 2,
			allowHtml: true
		});
	}
</script>

<span
	bind:this={badgeElement}
	class="glossary-badge {color} shape-{shape}"
	role="note"
	tabindex="0"
	onmouseenter={showTooltip}
	onmouseleave={hideTooltip}
	onfocus={showTooltip}
	onblur={hideTooltip}
	onclick={pinTooltip}
>

	<span class="glossary-badge-label">{label}</span>
	{#if removable}
		<button
			type="button"
			class="glossary-badge-remove"
			aria-label={`Remove ${label} tag`}
			onclick={(e) => {
				e.stopPropagation();
				hideTooltip();
				onRemove();
			}}
		>
			&times;
		</button>
	{/if}
</span>

<style>
	.glossary-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.7rem;
		border-radius: 0.4rem;
		font-size: 1.2rem;

		font-weight: 500;
		line-height: 1.4;
		white-space: nowrap;
		cursor: default;
		vertical-align: baseline;
	}

	/* All tags use a rounded-rectangle shape (both domain shape classes resolve
	   to the same radius for now). */
	.glossary-badge.shape-pill {
		border-radius: 0.4rem;
	}
	.glossary-badge.shape-rounded {
		border-radius: 0.4rem;
	}


	.glossary-badge:focus-visible {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.glossary-badge-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.4rem;
		height: 1.4rem;
		margin-right: -0.2rem;
		padding: 0;
		border: none;
		border-radius: 999em;
		background-color: transparent;
		color: inherit;
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.15s ease, background-color 0.15s ease;
	}

	.glossary-badge-remove:hover {
		opacity: 1;
		background-color: var(--black-alpha);
	}

	/* Category colors (the tag uses the deeper `-light` shade, with dark text,
	   so it reads as the anchor against the fainter `-lighter` highlight band). */
	.glossary-badge.gray {
		background-color: var(--gray-light);
		color: var(--gray-darker);
	}
	.glossary-badge.red {
		background-color: var(--red-light);
		color: var(--red-darker);
	}
	.glossary-badge.orange {
		background-color: var(--orange-light);
		color: var(--orange-darker);
	}
	.glossary-badge.yellow {
		background-color: var(--yellow-light);
		color: var(--yellow-darker);
	}
	.glossary-badge.green {
		background-color: var(--green-light);
		color: var(--green-darker);
	}
	.glossary-badge.aqua {
		background-color: var(--aqua-light);
		color: var(--aqua-darker);
	}
	.glossary-badge.blue {
		background-color: var(--blue-light);
		color: var(--blue-darker);
	}
	.glossary-badge.purple {
		background-color: var(--purple-light);
		color: var(--purple-darker);
	}
	.glossary-badge.pink {
		background-color: var(--pink-light);
		color: var(--pink-darker);
	}

</style>
