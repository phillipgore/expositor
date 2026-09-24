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
	 * The row carries its translation badge, the same `[ESV]` a study row shows. It is not
	 * metadata-for-its-own-sake like the "Series · N parts" suffix that used to sit here: the
	 * same-translation invariant (§4) makes `studySeries.translation` the authoritative answer for
	 * the whole series, so one badge on the row says what N badges on the parts would, and it is
	 * the fact that decides whether a dragged study can join (Q17). A collapsed series showing no
	 * translation while every study around it shows one is the row's own fact missing, not a row
	 * kept clean.
	 *
	 * **The icons are the only differentiator.** The row carried a "Series · N parts" suffix and
	 * numbered every part in a 3.4rem gutter; both are gone. The suffix was metadata no group row
	 * shows, and the gutter sat OUTSIDE the selectable row, so a part's text and its selection
	 * highlight both landed right of a grouped study's — two rows of the same kind that did not
	 * line up. Parts now render at `depth + 1` through the same list markup StudyGroup uses, so
	 * the alignment is shared by construction rather than by two numbers being kept in sync.
	 * `series` / `series-part` carry the distinction instead.
	 *
	 * Two things it does NOT do, both by decision rather than omission:
	 *  - It does not nest. A series contains parts and nothing else (§6, Q14).
	 *  - It does not offer a per-part reorder handle. Reordering permutes *runs*, not parts, and a
	 *    contiguous series is a single run with nothing to reorder (§4, §11 phase 3). The handle
	 *    lives in ReorderRunsModal, where a row IS a run and dragging one cannot express a false
	 *    claim about the text.
	 *
	 * It IS a drop target, though: dropping a standalone study on the row proposes adding it as a new
	 * part (Q17). `isDropTarget` only draws the highlight — the composable decides whether the gesture
	 * is legal, and the confirm dialog states §4's warnings before anything is written.
	 *
	 * And it is a drag SOURCE: the row can be dragged into a group, or back out to the top level.
	 * §4 gives a series its own Finder slot and `studySeries.groupId` records which group holds it,
	 * so this is placement, not membership — nothing about which studies are parts, or their order,
	 * changes. The "Move to…" menu command could already do this; the gesture could not, which left
	 * the two disagreeing about whether a series was a movable thing.
	 *
	 * ⚠️ A PART is not draggable at all, and that is enforced in the composable rather than by
	 * withholding `onStudyMouseDown` here — a part can also be dragged as part of a multi-selection
	 * grabbed by a standalone study elsewhere in the Finder, which no guard in this file could see.
	 */
	import Icon from '$lib/componentElements/Icon.svelte';
	import { getTranslationAbbreviation } from '$lib/utils/translationConfig.js';

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
		dropTargetSeriesId = null,
		formatPassageReference,
		// For search — force expand during search, matching StudyGroup
		forceExpanded = false
	} = $props();

	import StudyItem from './StudyItem.svelte';
	import { slide } from 'svelte/transition';

	let isEffectivelyExpanded = $derived(!series.isCollapsed || forceExpanded);

	let isDropTarget = $derived(dropTargetSeriesId === series.id);

	/**
	 * `studySeries.translation` is authoritative (§4), but a part answers for a row loaded without
	 * that column — every part of a series shares one translation by construction, so part 1 is the
	 * same answer from a different table rather than a guess.
	 */
	let translationAbbr = $derived(
		getTranslationAbbreviation(series.translation ?? series.parts?.[0]?.translation)
	);
</script>

<div
	class="series-section"
	class:drop-target={isDropTarget}
	data-series-id={series.id}
	data-depth={depth}
>
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
				<Icon
					iconId={isEffectivelyExpanded ? 'chevron-down' : 'chevron-right'}
					classes="chevron-icon"
				/>
			</button>
			<button
				class="series-select-button"
				{tabindex}
				data-series-id={series.id}
				onfocus={(e) => onfocus?.(e)}
				onclick={(e) => {
					// A mouseup after a drag is still followed by a click, so without this a series
					// dropped into a group would ALSO be selected and navigated to on landing —
					// the row would file itself and then open itself. `StudyItem` guards its own
					// click the same way, for the same reason.
					if (isDragging) {
						e.preventDefault();
						return;
					}
					onSeriesHeaderClick?.(e, series);
				}}
				ondblclick={(e) => {
					e.stopPropagation();
					onToggleCollapse?.(series.id, series.isCollapsed);
				}}
				onmousedown={(e) => {
					// Suppress the focus a mousedown would otherwise give this button, so a CLICKED
					// series does not draw the `:focus-within` outline — a group does not, because
					// `handleGroupMouseDown` preventDefaults for its own reasons (drag start) and
					// suppresses focus as a side effect. Matching that here rather than deleting the
					// `:focus-within` rule keeps the outline for KEYBOARD focus, where it is the only
					// thing showing where you are.
					e.preventDefault();
					onSeriesMouseDown?.(e, series);
				}}
				aria-label="Select series {series.name}"
			>
				<!-- `series` — a dedicated glyph rather than the old `books` plural, which read as
				     "more than one study" and not "one ordered thing" (§9, Q29). Registered in
				     icons.json; a public/*.svg file alone would render as blank space (trap 13). -->
				<Icon iconId={'series'} classes="series-icon" />
				<!-- The badge rides inside the name span so it sits immediately after the title text
				     rather than being pushed to the row's right edge by `flex: 1` — the same
				     placement a study row uses, where it trails the reference line. -->
				<span class="series-name"
					>{series.name}<span class="translation-badge" aria-label="Translation: {translationAbbr}"
						>[{translationAbbr}]</span
					></span
				>
			</button>
		</div>
	</div>

	{#if isEffectivelyExpanded}
		<div class="series-contents" transition:slide={{ duration: 200 }}>
			<!-- Structurally identical to StudyGroup's studies list, and deliberately so: a series
			     and a group present the same way in the Finder, and only the ICON distinguishes
			     them. The parts are NOT numbered here — a number gutter beside each row pushed the
			     text and the selection highlight out of line with a grouped study, which is the
			     misalignment this replaces; the order is the list order.

			     `referenceAsTitle` makes each part ONE line showing its range. A part's title is
			     derived from that range at creation, so the default two-line row printed
			     "Ephesians 1" directly above "Ephesians 1:1-23" — a duplicate that doubled the
			     height of every row in the series. -->
			<ul class="parts-list">
				{#each series.parts as part (part.id)}
					<li role="presentation">
						<StudyItem
							study={part}
							iconId="series-part"
							referenceAsTitle={true}
							depth={depth + 1}
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

	/* Matches StudyGroup's drop-target treatment, plus an outline: a series drop means something
	   different from a group drop (it adds a PART, §4), and a user who has just learned the grey
	   highlight means "files into here" should be able to see this is not that. */
	.series-section.drop-target {
		background-color: var(--gray-light);
		border-radius: 0.3rem;
		outline: 0.2rem dashed var(--blue);
		outline-offset: -0.2rem;
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

	.series-header.active :global(.series-icon),
	.series-header.selected.active :global(.series-icon) {
		fill: var(--white);
	}

	.series-header.active .chevron-button :global(.chevron-icon),
	.series-header.selected.active .chevron-button :global(.chevron-icon) {
		fill: var(--white);
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

	.series-select-button :global(.series-icon) {
		fill: var(--gray-300);
		transition: fill 0.2s;
	}

	.series-name {
		flex: 1;
	}

	/* Same size, colour and offset as StudyItem's badge: a series row and a study row are the same
	   kind of row in the Finder, so their badges must not read as two different things. The series
	   NAME is 600 weight (.series-header), which the badge deliberately does not inherit — it is an
	   annotation on the title, not part of it. */
	.translation-badge {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--gray-300);
	}

	/* On the solid-blue active row the muted grey would be unreadable, exactly as in StudyItem. */
	.series-header.active .translation-badge,
	.series-header.selected.active .translation-badge {
		color: var(--white);
	}

	/* Matches StudyGroup's `.studies-list.grouped` exactly — the parts must sit on the same
	   left edge as a grouped study, since `depth + 1` now does the indenting. */
	.parts-list {
		list-style: none;
		padding-left: 0;
		margin: 0;
	}
</style>
