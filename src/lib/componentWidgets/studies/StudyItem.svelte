<script>
	/**
	 * StudyItem Component
	 * 
	 * Displays a single study with title and passage references.
	 * Handles selection, dragging, and click/double-click events.
	 * Can render as button (default), link, or ghost (no interactivity).
	 *
	 * `iconId` defaults to `book` — a standalone study. A part of a series passes `series-part`
	 * (StudySeries.svelte), so the Finder reads `book` = study, `series-part` = a part,
	 * `series` = the series row itself. It is a prop rather than a branch here because this
	 * component draws every study in the app, most of which are not parts.
	 *
	 * `referenceAsTitle` collapses the row to a single line showing the passage reference where
	 * the title would go. Parts only (StudySeries.svelte). A part's title is generated from its
	 * range at creation — "Ephesians 1" above "Ephesians 1:1-23" says the same thing twice and
	 * costs a second line per row, which at 16 or 150 parts is the difference between scanning
	 * the series and scrolling it. The reference is the more precise of the two, so it is the one
	 * that stays. A standalone study keeps both lines: its title is authored, not derived, and
	 * carries meaning the reference cannot.
	 */
	import Icon from '$lib/componentElements/Icon.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';

	let {
		study,
		iconId = 'book',
		referenceAsTitle = false,
		depth = 0,
		tabindex = -1,
		isSelected = false,
		selectionPosition = null,
		isActive = false,
		beingDragged = false,
		isDragging = false,
		ungrouped = false,
		asLink = false,
		href = null,
		ghost = false,
		onfocus = null,
		onMouseDown = null,
		onClick = null,
		formatPassageReference
	} = $props();
	
	// Calculate padding based on depth (studies are one level deeper than their group)
	let paddingLeft = $derived(ungrouped ? '2.2rem' : `${(depth * 1.4) + 2.2}rem`);
	
	// Get translation abbreviation
	let translationAbbr = $derived.by(() => {
		const metadata = getTranslationMetadata(study.translation || 'esv');
		return metadata?.abbreviation || study.translation?.toUpperCase() || 'ESV';
	});

	let hasPassages = $derived(Boolean(study.passages && study.passages.length > 0));

	/**
	 * The reference line as a single string, for `referenceAsTitle`.
	 *
	 * Falls back to the title when a part has no passages. That should not happen — a part is
	 * created FROM a range — but a row that renders blank is a worse failure than one that
	 * shows the title it was trying to replace.
	 */
	let referenceTitle = $derived(
		hasPassages ? study.passages.map((p) => formatPassageReference(p)).join(', ') : study.title
	);
</script>

<!--
	One body for all three render modes (ghost / link / button), which differ only in their
	wrapper element. Duplicating it was already a three-way sync risk before `referenceAsTitle`
	added a second axis to keep in step.
-->
{#snippet studyBody()}
	<Icon {iconId} classes="book-icon" />
	<div class="study-info">
		{#if referenceAsTitle}
			<!-- Single line: the reference IS the title. The badge rides along rather than
			     dropping, since which translation a part is in is exactly what a mixed library
			     needs to show — and the same-translation invariant (§4) makes it consistent
			     down a series, not noise. -->
			<div class="study-title reference-title">
				{referenceTitle}<span
					class="translation-badge"
					aria-label="Translation: {translationAbbr}">[{translationAbbr}]</span
				>
			</div>
		{:else}
			<div class="study-title">{study.title}</div>
			{#if hasPassages}
				<div class="study-references">
					{#each study.passages as passage, i}
						<div class="study-reference">
							{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
						</div>
					{/each}
					<span class="translation-badge" aria-label="Translation: {translationAbbr}">[{translationAbbr}]</span>
				</div>
			{/if}
		{/if}
	</div>
{/snippet}

{#if ghost}
	<!-- Ghost mode: purely visual, no interactivity -->
	<div class="study-item ghost" style:padding-left={paddingLeft}>
		{@render studyBody()}
	</div>
{:else if asLink}
	<!-- Link mode: renders as anchor tag -->
	<a 
		{href}
		class="study-item"
		class:ungrouped
		class:selected={isSelected}
		class:active={isActive}
		style:padding-left={paddingLeft}
		onclick={(e) => onClick?.(e, study)}
	>
		{@render studyBody()}
	</a>
{:else}
	<!-- Button mode: default interactive mode -->
	<button 
		class="study-item"
		class:ungrouped
		class:being-dragged={beingDragged}
		class:selected={isSelected}
		class:selection-first={isSelected && selectionPosition === 'first'}
		class:selection-middle={isSelected && selectionPosition === 'middle'}
		class:selection-last={isSelected && selectionPosition === 'last'}
		class:selection-isolated={isSelected && selectionPosition === 'isolated'}
		class:active={isActive && isSelected}
		class:active-only={isActive && !isSelected}
		style:padding-left={paddingLeft}
		{tabindex}
		data-study-id={study.id}
		onfocus={(e) => onfocus?.(e)}
		onmousedown={(e) => onMouseDown?.(e, study)}
		onclick={(e) => {
			if (!isDragging) {
				onClick?.(e, study);
			} else {
				e.preventDefault();
			}
		}}
	>
		{@render studyBody()}
	</button>
{/if}

<style>
	.study-item {
		display: flex;
		justify-content: flex-start;
		gap: 0.6rem;
		padding: 0.9rem 0.9rem 0.9rem 3.5rem; /* Default, overridden by inline style */
		background-color: transparent;
		border: none;
		border-radius: 0.3rem;
		color: var(--black);
		text-decoration: none;
		text-align: left;
		width: 100%;
		cursor: pointer;
		transition: background-color 0.2s, border-color 0.2s;
	}

	.study-item.ghost {
		cursor: default;
		padding-top: 0;
		padding-bottom: 0;
		padding-right: 0;
	}

	.study-item.ghost:hover {
		background-color: transparent;
	}

	.study-item.selected {
		background-color: var(--blue-light);
	}

	/* Multi-selection border-radius styles */
	.study-item.selected.selection-first {
		border-radius: 0.3rem 0.3rem 0 0;
	}

	.study-item.selected.selection-middle {
		border-radius: 0;
	}

	.study-item.selected.selection-last {
		border-radius: 0 0 0.3rem 0.3rem;
	}

	.study-item.selected.selection-isolated {
		border-radius: 0.3rem;
	}

	/* Active + selected: solid blue (current study AND selected in Finder) */
	.study-item.active,
	.study-item.selected.active {
		background-color: var(--blue);
		color: var(--white);
	}

	.study-item.active :global(.book-icon),
	.study-item.selected.active :global(.book-icon) {
		fill: var(--white);
	}

	.study-item.active .study-references,
	.study-item.selected.active .study-references {
		color: var(--white);
	}

	/* Active only: muted gray (current study but NOT selected in Finder) */
	.study-item.active-only {
		background-color: var(--gray-light);
	}

	.study-item :global(.book-icon) {
		height: 1.2rem;
		margin-top: 0.2rem;
		padding: 0.0rem 0.1rem;
		fill: var(--gray-300);
	}

	.study-info {
		display: flex;
		flex-direction: column;
	}

	.study-title {
		font-size: 1.4rem;
		font-weight: 500;
		margin-bottom: 0.3rem;
	}

	/* The single-line part row. No second line follows, so the gap that separates title from
	   reference would otherwise hang off the bottom and misalign the row's text against a
	   two-line sibling. */
	.study-title.reference-title {
		margin-bottom: 0;
	}

	.study-references {
		font-size: 1.1rem;
		line-height: 1.3;
		color: var(--gray-300);
	}

	.study-reference {
		display: inline-block;
	}

	.translation-badge {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 1.1rem;
		color: var(--gray-300);
	}

	.study-item.active .translation-badge,
	.study-item.selected.active .translation-badge {
		color: var(--white);
	}

	.study-item:focus {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	/* Drag state */
	.study-item.being-dragged,
	.study-item.active.being-dragged,
	.study-item.selected.active.being-dragged {
		border-radius: 0.0rem;
		border-left: 0.2rem solid var(--blue);
		cursor: grabbing;
		padding-left: 0.9rem;
		margin-left: 2.3rem;
		background-color: transparent;
	}

	.study-item.being-dragged * {
		opacity: 0;
	}

	.study-item.being-dragged :global(.icon) {
		opacity: 0;
	}

	.study-item.being-dragged:hover {
		background-color: transparent;
	}
</style>
