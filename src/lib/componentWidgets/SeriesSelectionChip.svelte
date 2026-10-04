<script>
	/**
	 * SeriesSelectionChip
	 *
	 * Header indicator for a selection that spans parts of a series
	 * (cross-part selection, step 1). Hidden unless items from ANOTHER part are
	 * selected; then shows "N Selections". Clicking opens a list grouped
	 * by part: × removes an item, clicking an item goes to its part and scrolls
	 * to it, "Clear all" empties the selection.
	 */
	import { goto } from '$app/navigation';
	import Icon from '$lib/componentElements/Icon.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import { seriesSelection, removeItem, clearSeriesSelection, requestReveal } from '$lib/stores/seriesSelection.js';

	/** @type {{ seriesContext?: any, currentPartId: string }} */
	let { seriesContext = null, currentPartId } = $props();

	let open = $state(false);
	/** @type {HTMLElement|null} */
	let rootEl = $state(null);

	/** Parts in series order, each with its selected items. */
	let groups = $derived.by(() => {
		const parts = seriesContext?.parts ?? [];
		const items = $seriesSelection.seriesId === seriesContext?.id ? $seriesSelection.items : [];
		return parts
			.map((/** @type {any} */ part, /** @type {number} */ index) => ({
				part,
				number: index + 1,
				items: items.filter((i) => i.partId === part.id)
			}))
			.filter((/** @type {any} */ g) => g.items.length > 0);
	});

	let total = $derived(groups.reduce((n, g) => n + g.items.length, 0));
	let visible = $derived(groups.some((g) => g.part.id !== currentPartId));

	$effect(() => {
		if (!visible) open = false;
	});

	/** @type {Record<string, string>} */
	const TYPE_LABEL = { column: 'Column', section: 'Section', segment: 'Segment' };

	/** Same solid icons as the Structure menu. @type {Record<string, string>} */
	const TYPE_ICON = { column: 'column', section: 'sections', segment: 'segments' };

	/** @param {any} part @param {any} item */
	function goToItem(part, item) {
		open = false;
		if (part.id === currentPartId) {
			const el = document.querySelector(`[data-${item.type}-id="${item.id}"]`);
			el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			return;
		}
		requestReveal(part.id);
		goto(`/study/${part.id}/analyze`);
	}

	/** @param {MouseEvent} event */
	function handleWindowClick(event) {
		if (open && rootEl && !rootEl.contains(/** @type {Node} */ (event.target))) open = false;
	}

	/** @param {KeyboardEvent} event */
	function handleKey(event) {
		if (open && event.key === 'Escape') {
			event.stopPropagation();
			open = false;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKey} />

{#if visible}
	<div class="series-selection" bind:this={rootEl}>
		<!-- Standard blue app button (white text and icon). -->
		<Button
			classes="blue"
			title="Selection across parts"
			ariaHaspopup="dialog"
			ariaExpanded={open ? 'true' : 'false'}
			handleClick={() => (open = !open)}
		>
			{total} {total === 1 ? 'Selection' : 'Selections'}
			<!-- Same triangle caret + spacing as the toolbar dropdown buttons (MenuButton). -->
			<Icon iconId="caret-down" classes="menu-caret" />
		</Button>

		{#if open}
			<div class="panel" role="dialog" aria-label="Selection across parts">
				{#each groups as group (group.part.id)}
					<div class="group">
						<div class="group-heading">
							Part {group.number}{group.part.id === currentPartId ? ' (Current Part)' : ''}
						</div>
						<ul>
							{#each group.items as item (`${item.type}:${item.id}`)}
								<li>
									<button class="item" onclick={() => goToItem(group.part, item)}>
										<span class="item-type"><Icon iconId={TYPE_ICON[item.type]} />{TYPE_LABEL[item.type]}</span>
										<span class="item-label">{item.label || '—'}</span>
									</button>
									<button
										class="remove"
										aria-label={`Remove ${TYPE_LABEL[item.type]} from selection`}
										onclick={() => removeItem(item)}
									>
										<Icon iconId="x" />
									</button>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
				<div class="clear">
					<Button classes="red" handleClick={() => { clearSeriesSelection(); open = false; }}>Clear All</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.series-selection {
		position: relative;
		flex-shrink: 0;
		margin-right: 0.6rem;
	}

	.panel {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 50;
		width: 32rem;
		max-height: 50vh;
		overflow-y: auto;
		padding: 1rem;
		background-color: var(--white);
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.4rem;
		box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.15);
	}

	.group + .group {
		margin-top: 1rem;
	}

	.group-heading {
		padding: 0.2rem 0.6rem 0.2rem;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--gray-400);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	/* Two lines: icon + bold type, then the passage excerpt in gray. */
	.item {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.6rem;
		border: none;
		border-radius: 0.3rem;
		background: none;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.item-type {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--black, #000);
	}

	.item-type :global(svg) {
		flex-shrink: 0;
		width: 1.4rem;
		height: 1.4rem;
	}

	.item-label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 1.2rem;
		color: var(--gray-400);
	}

	.item:hover,
	.item:focus-visible {
		outline: none;
		background-color: var(--gray-800);
	}

	/* Red circle with a white ×. */
	.remove {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		margin-right: 0.4rem;
		padding: 0;
		border: none;
		border-radius: 50%;
		background-color: var(--red);
		color: var(--white);
		cursor: pointer;
	}

	.remove:hover {
		filter: brightness(0.9);
	}

	.remove :global(svg) {
		width: 1rem;
		height: 1rem;
		fill: var(--white);
		stroke: var(--white);
	}

	/* Full-width standard red button (destructive). */
	.clear {
		margin-top: 1.2rem;
	}

	.clear :global(button) {
		width: 100%;
		justify-content: center;
	}

	@media print {
		.series-selection {
			display: none;
		}
	}
</style>
