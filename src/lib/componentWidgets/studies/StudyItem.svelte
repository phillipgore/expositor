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
		isSelected = false,
		isActive = false,
		beingDragged = false,
		isDragging = false,
		ungrouped = false,
		asLink = false,
		href = null,
		ghost = false,
		onMouseDown = null,
		onClick = null,
		formatPassageReference
	} = $props();
</script>

{#if ghost}
	<!-- Ghost mode: purely visual, no interactivity -->
	<div class="study-item ghost">
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
		class:active={isActive && isSelected}
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
		gap: 0.7rem;
		padding: 0.9rem 0.9rem 0.9rem 3.5rem;
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
		padding: 0;
	}

	.study-item.ghost:hover {
		background-color: transparent;
	}

	.study-item.ungrouped {
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
	}

	.study-item.selected {
		background-color: var(--gray-light);
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
	.study-item.being-dragged {
		border-radius: 0.0rem;
		border-left: 0.2rem solid var(--blue);
		cursor: grabbing;
		padding-left: 0.9rem;
		margin-left: 2.3rem;
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
