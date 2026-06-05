<script>
	/**
	 * GlossaryPicker Component
	 *
	 * A popover with a search box and a category-grouped, keyboard-navigable list
	 * of glossary terms. Used by BOTH entry points:
	 *  - inserting an inline glossary badge into commentary
	 *  - adding a bottom "tag" to the item being commented on
	 *
	 * Emits the chosen term's id via `onSelect(termId)`. Caller positions the
	 * popover via the `position` prop and closes it via `onClose`.
	 *
	 * @typedef {Object} PickerPosition
	 * @property {number} top
	 * @property {number} left
	 * @property {'top'|'bottom'} arrowPosition
	 * @property {number} [arrowOffset] Horizontal px shift of the arrow from the
	 *   popover's center, used when the popover is clamped to the viewport so the
	 *   arrow still points at the trigger.
	 * @property {number} [maxHeight] Max height (px) the popover may occupy based
	 *   on the room available between the trigger and the viewport edge.
	 */


	import { searchGlossary, groupByCategory } from '$lib/data/glossaryIndex.js';

	let {
		/** @type {PickerPosition} */
		position,
		onSelect = () => {},
		onClose = () => {},
		popoverElement = $bindable()
	} = $props();

	let query = $state('');
	let inputElement = $state(null);
	let activeIndex = $state(0);

	// Flat (for keyboard nav) + grouped (for display) results
	let results = $derived(searchGlossary(query));
	let groups = $derived(groupByCategory(results));

	// Keep the active index in range as results change
	$effect(() => {
		if (activeIndex >= results.length) {
			activeIndex = Math.max(0, results.length - 1);
		}
	});

	// Autofocus the search input when mounted
	$effect(() => {
		if (inputElement) {
			inputElement.focus();
		}
	});

	function choose(termId) {
		onSelect(termId);
	}

	function handleKeydown(event) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (results.length) activeIndex = (activeIndex + 1) % results.length;
				scrollActiveIntoView();
				break;
			case 'ArrowUp':
				event.preventDefault();
				if (results.length) activeIndex = (activeIndex - 1 + results.length) % results.length;
				scrollActiveIntoView();
				break;
			case 'Enter':
				event.preventDefault();
				if (results[activeIndex]) choose(results[activeIndex]._id);
				break;
			case 'Escape':
				event.preventDefault();
				onClose();
				break;
		}
	}

	function scrollActiveIntoView() {
		// Defer until DOM reflects new activeIndex
		setTimeout(() => {
			const el = popoverElement?.querySelector('.glossary-option.active');
			el?.scrollIntoView({ block: 'nearest' });
		}, 0);
	}
</script>

<div
	class="glossary-picker"
	class:arrow-top={position.arrowPosition === 'top'}
	bind:this={popoverElement}
	style="top: {position.top}px; left: {position.left}px; --arrow-offset: {position.arrowOffset ?? 0}px; --picker-max-height: {position.maxHeight ? position.maxHeight + 'px' : 'calc(100vh - 8rem)'};"

>
	<div class="popover-arrow"></div>


	<div class="picker-search">
		<input
			type="search"
			bind:this={inputElement}
			bind:value={query}
			placeholder="Search"
			onkeydown={handleKeydown}
			aria-label="Search glossary terms"
		/>
	</div>


	<div class="picker-results">
		{#if results.length === 0}
			<p class="picker-empty">No terms match “{query}”.</p>
		{:else}
			{#each groups as group (group.categoryId)}
				<div class="picker-group">
					<div class="picker-group-title">{group.category}</div>
					{#each group.entries as entry (entry._id)}
						{@const flatIndex = results.indexOf(entry)}
						<button
							type="button"
							class="glossary-option {entry.color}"
							class:active={flatIndex === activeIndex}
							onmouseenter={() => (activeIndex = flatIndex)}
							onclick={() => choose(entry._id)}
						>
							<span class="option-term">{entry.term}</span>
							<span class="option-def">{entry.definition}</span>
						</button>
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.glossary-picker {
		position: fixed;
		transform: translate(-50%, -100%);
		width: 34rem;
		max-height: var(--picker-max-height, calc(100vh - 8rem));
		display: flex;


		flex-direction: column;
		padding: 0.9rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.4rem;
		box-shadow: 0rem 0.4rem 1.2rem var(--black-alpha);
		z-index: 1000;
	}

	.glossary-picker.arrow-top {
		transform: translate(-50%, 0);
	}

	.popover-arrow {
		position: absolute;
		bottom: -0.6rem;
		left: calc(50% + var(--arrow-offset, 0px));
		transform: translateX(-50%) rotate(45deg);

		width: 1.2rem;
		height: 1.2rem;
		background: var(--white);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		z-index: -1;
	}

	.glossary-picker.arrow-top .popover-arrow {
		bottom: auto;
		top: -0.6rem;
		transform: translateX(-50%) rotate(225deg);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		border-left: none;
		border-top: none;
	}

	.picker-search {
		flex-shrink: 0;
		margin-bottom: 0.6rem;
	}

	.picker-search input {
		appearance: none;
		width: 100%;
		height: 2.8rem;
		padding: 0rem 1.2rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 2.5vh;
		font-size: 1.4rem;
		font-family: inherit;
		color: var(--black);
		background-color: var(--white);
	}

	.picker-search input:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
	}

	.picker-results {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.picker-empty {
		margin: 0;
		padding: 1.2rem 0.6rem;
		text-align: center;
		font-size: 1.3rem;
		color: var(--gray-400);
	}

	.picker-group {
		margin-bottom: 0.6rem;
	}

	.picker-group-title {
		position: sticky;
		top: 0;
		padding: 0.4rem 0.6rem;
		font-size: 1.3rem;
		font-weight: 600;
		letter-spacing: 0.04em;

		color: var(--gray-400);
		background: var(--white);

	}

	.glossary-option {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.5rem 0.6rem;
		margin-bottom: 0.3rem;
		border: none;

		border-radius: 0.3rem;
		background: transparent;
		cursor: pointer;
		font-family: inherit;
	}

	/* Each option uses the same background the resulting tag/badge will have. */
	.glossary-option.gray { background-color: var(--gray-lighter); }
	.glossary-option.red { background-color: var(--red-lighter); }
	.glossary-option.orange { background-color: var(--orange-lighter); }
	.glossary-option.yellow { background-color: var(--yellow-lighter); }
	.glossary-option.green { background-color: var(--green-lighter); }
	.glossary-option.aqua { background-color: var(--aqua-lighter); }
	.glossary-option.blue { background-color: var(--blue-lighter); }
	.glossary-option.purple { background-color: var(--purple-lighter); }
	.glossary-option.pink { background-color: var(--pink-lighter); }

	/* Keyboard / hover highlight: a 1px inset border in a darker shade of the
	   option's own background color so the tag color still shows through. */
	.glossary-option.gray.active { box-shadow: inset 0 0 0 1px var(--gray); }
	.glossary-option.red.active { box-shadow: inset 0 0 0 1px var(--red); }
	.glossary-option.orange.active { box-shadow: inset 0 0 0 1px var(--orange); }
	.glossary-option.yellow.active { box-shadow: inset 0 0 0 1px var(--yellow); }
	.glossary-option.green.active { box-shadow: inset 0 0 0 1px var(--green); }
	.glossary-option.aqua.active { box-shadow: inset 0 0 0 1px var(--aqua); }
	.glossary-option.blue.active { box-shadow: inset 0 0 0 1px var(--blue); }
	.glossary-option.purple.active { box-shadow: inset 0 0 0 1px var(--purple); }
	.glossary-option.pink.active { box-shadow: inset 0 0 0 1px var(--pink); }


	/* Term text uses the matching darker tone of the tag color. */
	.glossary-option.gray .option-term { color: var(--gray-darker); }
	.glossary-option.red .option-term { color: var(--red-darker); }
	.glossary-option.orange .option-term { color: var(--orange-darker); }
	.glossary-option.yellow .option-term { color: var(--yellow-darker); }
	.glossary-option.green .option-term { color: var(--green-darker); }
	.glossary-option.aqua .option-term { color: var(--aqua-darker); }
	.glossary-option.blue .option-term { color: var(--blue-darker); }
	.glossary-option.purple .option-term { color: var(--purple-darker); }
	.glossary-option.pink .option-term { color: var(--pink-darker); }

	.option-term {
		display: block;
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--black);
	}

	.option-def {
		display: block;
		font-size: 1.2rem;
		line-height: 1.4;
		color: var(--gray-darker);
	}


</style>
