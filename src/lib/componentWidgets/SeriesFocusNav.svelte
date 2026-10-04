<script>
	/**
	 * SeriesFocusNav
	 *
	 * Shown in the Analyze header while Focus is travelling across parts of a
	 * series (CROSS_PART_PLAN step 3, Option B). Lists the parts that have focused
	 * items ("Focus: Part 1 · Part 3"); clicking one opens it, still focused. The
	 * current part is highlighted.
	 */
	import { goto } from '$app/navigation';
	import { seriesFocus, focusedPartIds } from '$lib/stores/seriesSelection.js';

	/** @type {{ seriesContext?: any, currentPartId: string }} */
	let { seriesContext = null, currentPartId } = $props();

	let parts = $derived.by(() => {
		const focus = $seriesFocus;
		if (!focus || focus.seriesId !== seriesContext?.id) return [];
		const all = seriesContext?.parts ?? [];
		return focusedPartIds(focus, all).map((id) => ({
			id,
			number: all.findIndex((/** @type {any} */ p) => p.id === id) + 1
		}));
	});
</script>

{#if parts.length > 1 || (parts.length === 1 && parts[0].id !== currentPartId)}
	<nav class="series-focus-nav" aria-label="Focused parts">
		<span class="label">Focus:</span>
		{#each parts as part (part.id)}
			<button
				class="part"
				class:current={part.id === currentPartId}
				aria-current={part.id === currentPartId ? 'page' : undefined}
				onclick={() => part.id !== currentPartId && goto(`/study/${part.id}/analyze`)}
			>
				Part {part.number}
			</button>
		{/each}
	</nav>
{/if}

<style>
	.series-focus-nav {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
		margin-right: 0.8rem;
		font-size: 1.2rem;
	}

	.label {
		font-weight: 700;
		color: var(--gray-400);
	}

	.part {
		padding: 0.3rem 0.7rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.4rem;
		background-color: var(--white);
		font: inherit;
		font-weight: 700;
		color: var(--gray-200);
		cursor: pointer;
	}

	.part:hover {
		background-color: var(--gray-800);
	}

	.part.current {
		border-color: var(--blue);
		background-color: var(--blue);
		color: var(--white);
		cursor: default;
	}

	@media print {
		.series-focus-nav {
			display: none;
		}
	}
</style>
