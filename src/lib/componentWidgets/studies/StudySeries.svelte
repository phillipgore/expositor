<script>
	/**
	 * StudySeries Component
	 *
	 * Displays a series as a single collapsible Finder row containing its ordered parts.
	 *
	 * Deliberately mirrors StudyGroup's shape (chevron button + select button, isCollapsed,
	 * slide transition) because a series and a group present identically in the Finder — one
	 * row with a disclosure chevron. They are *modelled* differently on purpose (SERIES_PLAN §4
	 * rejected `studyGroup` with `kind: 'series'`: a group is an arbitrary nestable folder, a
	 * series is a flat ordered sequence with invariants), so this is presentational reuse only.
	 *
	 * Two things it does NOT do, both by decision rather than omission:
	 *  - It does not nest. A series contains parts and nothing else (§6, Q14).
	 *  - It does not offer a reorder handle. Reordering permutes *runs*, not parts, and a
	 *    contiguous series is a single run with nothing to reorder (§4, §11 phase 3).
	 */
	import Icon from '$lib/componentElements/Icon.svelte';

	let {
		series,
		depth = 0,
		tabindex = -1,
		isSelected = false,
		selectionPosition = null,
		isActive = false,
		onfocus = null,
		onToggleCollapse,
		onSeriesHeaderClick,
		onSeriesMouseDown,
		onStudyMouseDown,
		onStudyClick,
		isStudySelected,
		getStudySelectionPosition,
		isStudyActive,
		isStudyBeingDragged,
		isDragging = false,
		formatPassageReference,
		// For search — force expand during search, matching StudyGroup
		forceExpanded = false
	} = $props();

	import StudyItem from './StudyItem.svelte';
	import { slide } from 'svelte/transition';

	let isEffectivelyExpanded = $derived(!series.isCollapsed || forceExpanded);

	// Part count is always shown on the row (Q16). The verse total is deferred to hover and
	// is not computed here — it would mean summing every part's passages on every render.
	let partCount = $derived(series.parts?.length ?? 0);
</script>

<div class="series-section" data-series-id={series.id} data-depth={depth}>
	<div
		class="series-header"
		class:selected={isSelected}
		class:selection-first={isSelected && selectionPosition === 'first'}
		class:selection-middle={isSelected && selectionPosition === 'middle'}
		class:selection-last={isSelected && selectionPosition === 'last'}
		class:selection-isolated={isSelected && selectionPosition === 'isolated'}
		class:active={isActive}
		style:padding-left="{depth ? depth * 1.4 + 0.6 : 0.6}rem"
	>
		<div class="series-info">
			<button
				class="chevron-button"
				onclick={(e) => {
					e.stopPropagation();
					onToggleCollapse?.(series.id, series.isCollapsed);
				}}
				aria-label={isEffectivelyExpanded ? 'Collapse series' : 'Expand series'}
				aria-expanded={isEffectivelyExpanded}
			>
				<Icon iconId={isEffectivelyExpanded ? 'chevron-down' : 'chevron-right'} classes="chevron-icon" />
			</button>
			<button
				class="series-select-button"
				{tabindex}
				data-series-id={series.id}
				onfocus={(e) => onfocus?.(e)}
				onclick={(e) => onSeriesHeaderClick?.(e, series)}
				ondblclick={(e) => {
					e.stopPropagation();
					onToggleCollapse?.(series.id, series.isCollapsed);
				}}
				onmousedown={(e) => onSeriesMouseDown?.(e, series)}
				aria-label="Select series {series.name}"
			>
				<!-- `books`, on the folder/folders precedent (§9, Q29). Registered in icons.json;
				     a public/*.svg file alone would render as blank space (trap 13). -->
				<Icon iconId={'books'} classes="books-icon" />
				<span class="series-name">{series.name}</span>
				<span class="series-count">Series · {partCount} {partCount === 1 ? 'part' : 'parts'}</span>
			</button>
		</div>
	</div>

	{#if isEffectivelyExpanded}
		<div class="series-contents" transition:slide={{ duration: 200 }}>
			<ul class="parts-list">
				{#each series.parts as part, i (part.id)}
					<li class="part-row">
						<!-- "Part N of M" is text, not a badge: at 150 parts a badge would need
						     three digits inside 32px (§9, Q31). N is the position in the
						     displayed order, which is seriesOrder as sorted server-side. -->
						<span class="part-number" style:padding-left="{depth * 1.4 + 2.2}rem">
							{i + 1}
						</span>
						<div class="part-item">
							<StudyItem
								study={part}
								{depth}
								tabindex={-1}
								isSelected={isStudySelected?.(part.id) || false}
								selectionPosition={getStudySelectionPosition?.(part.id)}
								isActive={isStudyActive?.(part.id) || false}
								beingDragged={isStudyBeingDragged?.(part.id) || false}
								{isDragging}
								onMouseDown={onStudyMouseDown}
								onClick={onStudyClick}
								{formatPassageReference}
							/>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.series-section {
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.series-contents {
		display: flex;
		flex-direction: column;
	}

	.series-header {
		display: flex;
		justify-content: space-between;
		padding: 0rem 0rem 0rem 0.6rem;
		background-color: transparent;
		border-radius: 0.3rem;
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.series-header.selected {
		background-color: var(--blue-light);
	}

	.series-header.selected.selection-first {
		border-radius: 0.3rem 0.3rem 0 0;
	}

	.series-header.selected.selection-middle {
		border-radius: 0;
	}

	.series-header.selected.selection-last {
		border-radius: 0 0 0.3rem 0.3rem;
	}

	.series-header.selected.selection-isolated {
		border-radius: 0.3rem;
	}

	.series-header.active,
	.series-header.selected.active {
		background-color: var(--blue);
		color: var(--white);
	}

	.series-header.active :global(.books-icon),
	.series-header.selected.active :global(.books-icon) {
		fill: var(--white);
	}

	.series-header.active .chevron-button :global(.chevron-icon),
	.series-header.selected.active .chevron-button :global(.chevron-icon) {
		fill: var(--white);
	}

	.series-header.active .series-count,
	.series-header.selected.active .series-count {
		color: var(--white);
	}

	.series-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex: 1;
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.3rem 0rem;
		width: 2.2rem;
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		cursor: pointer;
		margin: -1.3rem -0.6rem -1.3rem -0.6rem;
		flex-shrink: 0;
	}

	.chevron-button:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.chevron-button :global(.chevron-icon) {
		height: 0.9rem;
		fill: var(--gray-200);
	}

	.series-select-button {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background-color: transparent;
		border: none;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		cursor: pointer;
		text-align: left;
		flex: 1;
		border-radius: 0.3rem;
		padding: 0.9rem 0.9rem 0.9rem 0rem;
		transition: background-color 0.2s;
	}

	.series-select-button:focus {
		outline: none;
	}

	.series-header:focus-within {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	.series-select-button :global(.books-icon) {
		fill: var(--gray-300);
		transition: fill 0.2s;
	}

	.series-name {
		flex: 1;
	}

	.series-count {
		font-size: 1.2rem;
		font-weight: 400;
		color: var(--gray-400);
		white-space: nowrap;
	}

	.parts-list {
		list-style: none;
		padding-left: 0;
		margin: 0;
	}

	.part-row {
		display: flex;
		align-items: stretch;
	}

	.part-number {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		width: 3.4rem;
		box-sizing: content-box;
		font-size: 1.2rem;
		color: var(--gray-400);
		flex-shrink: 0;
	}

	.part-item {
		flex: 1;
		min-width: 0;
	}
</style>
