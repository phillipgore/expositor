<script>
	/**
	 * DocumentCommentaryToolbar
	 *
	 * The universal commentary toolbar that sits just below the Document page's
	 * main toolbar. It mirrors the Analyze slideout's commentary toolbar buttons
	 * (Bold, Italic, Underline, Highlight, Lists, Insert, Link, Footnote, Glossary,
	 * Clear) MINUS the zoom control — there is no per-section zoom on the Document
	 * page.
	 *
	 * It is a thin controller: it never owns an editor. Instead it reads the active
	 * commentary editor's command API from the commentaryToolbar bus. When NO
	 * section is editable the whole toolbar is disabled; clicking a commentary
	 * section in the document activates it, which enables these buttons.
	 *
	 * Buttons that open popovers (Link, Glossary) pass their own element as the
	 * trigger so the active editor positions the popover beneath this toolbar.
	 */
	import Icon from '$lib/componentElements/Icon.svelte';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';
	import {
		getActiveCommentaryApi,
		hasActiveCommentary,
		isCommentaryActive
	} from '$lib/stores/commentaryToolbar.svelte.js';

	// Reactive: re-evaluates as the active editor (and its selection) changes.
	let enabled = $derived(hasActiveCommentary());

	let showListsMenu = $state(false);
	let showInsertMenu = $state(false);
	let listsMenuElement = $state(null);
	let insertMenuElement = $state(null);
	let listsButtonElement = $state(null);
	let insertButtonElement = $state(null);

	/** Convenience: run a callback on the active editor API if present. */
	function withApi(fn) {
		const api = getActiveCommentaryApi();
		if (api) fn(api);
	}

	function toggleListsMenu() {
		showListsMenu = !showListsMenu;
		showInsertMenu = false;
	}
	function toggleInsertMenu() {
		showInsertMenu = !showInsertMenu;
		showListsMenu = false;
	}

	// Close dropdowns on outside click.
	$effect(() => {
		if (showListsMenu || showInsertMenu) {
			const handler = (event) => {
				if (
					listsMenuElement && !listsMenuElement.contains(event.target) &&
					listsButtonElement && !listsButtonElement.contains(event.target)
				) showListsMenu = false;
				if (
					insertMenuElement && !insertMenuElement.contains(event.target) &&
					insertButtonElement && !insertButtonElement.contains(event.target)
				) showInsertMenu = false;
			};
			setTimeout(() => window.addEventListener('click', handler), 0);
			return () => window.removeEventListener('click', handler);
		}
	});
</script>

<div class="doc-commentary-toolbar" class:disabled={!enabled}>
	<div class="toolbar-group">
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('bold')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.toggleBold())}
			title="Bold (Cmd+B)"
			aria-label="Bold"
		>
			<Icon iconId="bold" />
		</button>
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('italic')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.toggleItalic())}
			title="Italic (Cmd+I)"
			aria-label="Italic"
		>
			<Icon iconId="italic" />
		</button>
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('underline')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.toggleUnderline())}
			title="Underline (Cmd+U)"
			aria-label="Underline"
		>
			<Icon iconId="underline" />
		</button>
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('highlight')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.toggleHighlight())}
			title="Highlight"
			aria-label="Highlight"
			aria-pressed={isCommentaryActive('highlight')}
		>
			<Icon iconId="highlight" />
		</button>
	</div>

	<div class="toolbar-group dropdown-group">
		<button
			use:tooltip
			type="button"
			class="toolbar-button has-caret"
			class:active={isCommentaryActive('bulletList') || isCommentaryActive('orderedList')}
			disabled={!enabled}
			bind:this={listsButtonElement}
			onmousedown={(e) => e.preventDefault()}
			onclick={toggleListsMenu}
			title="Lists"
			aria-label="Lists"
			aria-haspopup="menu"
			aria-expanded={showListsMenu}
		>
			<Icon iconId="outline-bulleted" />
			<Icon iconId="caret-down" classes="menu-caret" />
		</button>

		{#if showListsMenu}
			<div class="dropdown-menu" role="menu" bind:this={listsMenuElement}>
				<button
					type="button"
					class="dropdown-menu-item"
					class:active={isCommentaryActive('bulletList')}
					role="menuitem"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => { withApi((api) => api.toggleBulletList()); showListsMenu = false; }}
				>
					Bullet List
				</button>
				<button
					type="button"
					class="dropdown-menu-item"
					class:active={isCommentaryActive('orderedList')}
					role="menuitem"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => { withApi((api) => api.toggleOrderedList()); showListsMenu = false; }}
				>
					Numbered List
				</button>
			</div>
		{/if}
	</div>

	<div class="toolbar-group dropdown-group">
		<button
			use:tooltip
			type="button"
			class="toolbar-button has-caret"
			class:active={isCommentaryActive('blockquote')}
			disabled={!enabled}
			bind:this={insertButtonElement}
			onmousedown={(e) => e.preventDefault()}
			onclick={toggleInsertMenu}
			title="Insert"
			aria-label="Insert"
			aria-haspopup="menu"
			aria-expanded={showInsertMenu}
		>
			<Icon iconId="plus" />
			<Icon iconId="caret-down" classes="menu-caret" />
		</button>

		{#if showInsertMenu}
			<div class="dropdown-menu" role="menu" bind:this={insertMenuElement}>
				<button
					type="button"
					class="dropdown-menu-item"
					class:active={isCommentaryActive('blockquote')}
					role="menuitem"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => { withApi((api) => api.toggleBlockquote()); showInsertMenu = false; }}
				>
					Blockquote
				</button>
				<button
					type="button"
					class="dropdown-menu-item"
					role="menuitem"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => { withApi((api) => api.insertHorizontalRule()); showInsertMenu = false; }}
				>
					Horizontal Rule
				</button>
			</div>
		{/if}
	</div>

	<div class="toolbar-group">
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('link')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={(e) => withApi((api) => api.openLink(e.currentTarget))}
			title="Link"
			aria-label="Link"
		>
			<Icon iconId="link" />
		</button>
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			class:active={isCommentaryActive('footnote')}
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.addFootnote())}
			title="Add Footnote"
			aria-label="Add Footnote"
		>
			<Icon iconId="footnote" />
		</button>
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={(e) => withApi((api) => api.openGlossary(e.currentTarget))}
			title="Insert Glossary Tag"
			aria-label="Insert Glossary Tag"
		>
			<Icon iconId="tag" />
		</button>
	</div>

	<div class="toolbar-group">
		<button
			use:tooltip
			type="button"
			class="toolbar-button"
			disabled={!enabled}
			onmousedown={(e) => e.preventDefault()}
			onclick={() => withApi((api) => api.clearFormatting())}
			title="Clear Formatting"
			aria-label="Clear Formatting"
		>
			<Icon iconId="x" />
		</button>
	</div>
</div>

<style>
	.doc-commentary-toolbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		padding: 0.6rem;
		background-color: var(--white);
		border-bottom: 0.1rem solid var(--gray-700);
		flex-shrink: 0;
	}

	.toolbar-group {
		display: flex;
		gap: 0.3rem;
	}

	.dropdown-group {
		position: relative;
	}

	.toolbar-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		height: 3rem;
		min-width: 3rem;
		padding: 0 0.6rem;
		border: none;
		border-radius: 0.3rem;
		background-color: transparent;
		color: var(--gray-200);
		cursor: pointer;
		transition: background-color 0.15s ease, opacity 0.15s ease;
	}

	.toolbar-button:hover:not(:disabled) {
		background-color: var(--gray-800);
	}

	.toolbar-button.active:not(:disabled) {
		background-color: var(--blue-lighter, var(--gray-800));
		color: var(--blue);
	}

	.toolbar-button.active:not(:disabled) :global(svg.icon path) {
		fill: var(--blue);
	}

	.toolbar-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 200;
		display: flex;
		flex-direction: column;
		min-width: 14rem;
		padding: 0.3rem;
		background-color: var(--gray-800);
		border: none;
		border-radius: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
	}

	.dropdown-menu-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.6rem 0.9rem;
		border: none;
		border-radius: 0.3rem;
		background-color: transparent;
		color: var(--white);
		font-size: 1.3rem;
		text-align: left;
		cursor: pointer;
	}

	.dropdown-menu-item:hover {
		background-color: var(--gray-700);
	}

	.dropdown-menu-item.active {
		color: var(--blue);
	}

	/* Print: the editing toolbar is a screen-only control. */
	@media print {
		.doc-commentary-toolbar {
			display: none;
		}
	}
</style>
