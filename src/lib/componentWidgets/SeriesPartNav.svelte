<script>
	/**
	 * # SeriesPartNav Component
	 *
	 * Prev/next navigation and a "Part N of M" jump menu for a study that is part of a
	 * series (SERIES_PLAN §7). Renders nothing for a standalone study.
	 *
	 * ## Behaviour settled by the plan
	 * - Arrows are **disabled at the ends, not hidden** (§7) — the control keeps its width so
	 *   the header does not reflow when moving between the first and middle parts.
	 * - **No wrapping** (Q19): part 16's `›` is inert, it does not return to part 1.
	 * - **The current view is preserved** across navigation (§7). Moving from part 3's Document
	 *   view must land on part 4's Document view; jumping to Analyze would silently discard the
	 *   view the user chose. This is why the component takes `view` and builds the URL itself
	 *   rather than linking to a bare `/study/[id]`, which would resolve via `lastStudyView`
	 *   and only *usually* agree.
	 * - `⌥←` / `⌥→` (Q21). Bare arrows belong to text/segment selection, so the Alt modifier is
	 *   required, and the handler ignores the event while a text input or contenteditable has
	 *   focus so it cannot hijack typing in a heading or note.
	 *
	 * ## Props
	 * @property {Object|null} seriesContext - From the study layout load: `{ name, parts,
	 *   position, total, previousPart, nextPart }`. Null for a standalone study.
	 * @property {'analyze'|'document'} view - The view to preserve across navigation.
	 *
	 * @component
	 */

	import { goto } from '$app/navigation';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import MenuButton from '$lib/componentElements/buttons/MenuButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';

	let { seriesContext = null, view = 'analyze' } = $props();

	const menuId = 'MenuSeriesParts';

	/**
	 * Navigate to a sibling part, keeping the current view.
	 * @param {{id: string}|null} part
	 */
	function goToPart(part) {
		// Null at the ends — the arrows are disabled there, but the keyboard handler shares this
		// path, so the guard belongs here rather than only on the buttons.
		if (!part) return;
		goto(`/study/${part.id}/${view}`);
	}

	function closeMenu() {
		document.getElementById(menuId)?.hidePopover();
	}

	/**
	 * @param {{id: string}} part
	 */
	function handleJump(part) {
		closeMenu();
		goToPart(part);
	}

	/**
	 * `⌥←` / `⌥→` (Q21).
	 *
	 * Ignored while the user is typing: headings, notes and commentary are editable text, and
	 * ⌥← is a word-wise cursor move on macOS. Stealing it there would move the user to another
	 * part mid-sentence — losing their place for a keystroke they meant for the caret.
	 * @param {KeyboardEvent} event
	 */
	function handleKeydown(event) {
		if (!seriesContext) return;
		if (!event.altKey || event.metaKey || event.ctrlKey) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

		const target = /** @type {HTMLElement|null} */ (event.target);
		if (target?.isContentEditable) return;
		const tag = target?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		const destination =
			event.key === 'ArrowLeft' ? seriesContext.previousPart : seriesContext.nextPart;

		// At the ends there is nowhere to go (Q19: no wrapping). Return *without* preventing
		// default so the keystroke still does whatever it normally would.
		if (!destination) return;

		event.preventDefault();
		goToPart(destination);
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if seriesContext}
	<!--
		aria-label names the series because "Part 3 of 16" alone is ambiguous to a screen reader
		arriving at this landmark cold.
	-->
	<nav class="series-part-nav" aria-label={`${seriesContext.name} part navigation`}>
		<IconButton
			classes="toolbar-light"
			iconId="caret-left"
			title={seriesContext.previousPart
				? `Previous part: ${seriesContext.previousPart.title}`
				: 'This is the first part'}
			isDisabled={!seriesContext.previousPart}
			handleClick={() => goToPart(seriesContext.previousPart)}
		/>

		<MenuButton
			{menuId}
			classes="toolbar-light"
			label={`Part ${seriesContext.position} of ${seriesContext.total}`}
			title="Jump to a part"
		/>

		<IconButton
			classes="toolbar-light"
			iconId="caret-right"
			title={seriesContext.nextPart
				? `Next part: ${seriesContext.nextPart.title}`
				: 'This is the last part'}
			isDisabled={!seriesContext.nextPart}
			handleClick={() => goToPart(seriesContext.nextPart)}
		/>
	</nav>

	<!--
		The jump menu is what makes 16 parts usable and 150 parts possible (§7), so it lists every
		part by title rather than by number alone — at 150 parts "Part 87" is not a thing anyone
		recognises, but "Psalm 87" is.
	-->
	<Menu {menuId} alignment="end" ariaLabel={`Parts of ${seriesContext.name}`}>
		{#each seriesContext.parts as part, index}
			{@const isCurrent = index + 1 === seriesContext.position}
			<IconButton
				classes="menu-light full-width justify-content-left"
				label={`${index + 1}. ${part.title}`}
				iconId={isCurrent ? 'check' : 'blank'}
				isActive={isCurrent}
				role="menuitem"
				handleClick={() => handleJump(part)}
			/>
		{/each}
	</Menu>
{/if}

<style>
	.series-part-nav {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
	}

	/*
		The study header is printable output (the Document view prints onto real sheets), and
		navigation controls are interface, not content. The (app) layout strips the toolbar and
		panels for print but cannot reach inside the page, so this hides itself.
	*/
	@media print {
		.series-part-nav {
			display: none;
		}
	}
</style>
