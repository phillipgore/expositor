<script>
	/**
	 * StudyItem Component
	 * 
	 * Displays a single study with title and passage references.
	 * Handles selection, dragging, and click/double-click events.
	 * Can render as button (default), link, or ghost (no interactivity).
	 */
	import Icon from '$lib/componentElements/Icon.svelte';

	let {
		study,
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
</script>

{#if ghost}
	<!-- Ghost mode: purely visual, no interactivity -->
	<div class="study-item ghost" style:padding-left={paddingLeft}>
		<Icon iconId={'book'} classes="book-icon" />
		<div class="study-info">
			<div class="study-title">{study.title}</div>
			{#if study.passages && study.passages.length > 0}
				<div class="study-references">
					{#each study.passages as passage, i}
						<div class="study-reference">
							{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
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
		<Icon iconId={'book'} classes="book-icon" />
		<div class="study-info">
			<div class="study-title">{study.title}</div>
			{#if study.passages && study.passages.length > 0}
				<div class="study-references">
					{#each study.passages as passage, i}
						<div class="study-reference">
							{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
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
		<Icon iconId={'book'} classes="book-icon" />
		<div class="study-info">
			<div class="study-title">{study.title}</div>
			{#if study.passages && study.passages.length > 0}
				<div class="study-references">
					{#each study.passages as passage, i}
						<div class="study-reference">
							{formatPassageReference(passage)}{#if i < study.passages.length - 1},&nbsp;{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
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

	.study-references {
		font-size: 1.1rem;
		line-height: 1.3;
		color: var(--gray-300);
	}

	.study-reference {
		display: inline-block;
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
