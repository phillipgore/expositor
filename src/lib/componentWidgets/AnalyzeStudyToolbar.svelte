<script>
	/**
	 * AnalyzeStudyToolbar
	 *
	 * Sub-toolbar under the app toolbar on the Analyze page, styled like the
	 * Document page's commentary toolbar. Title/subtitle on the left; series part
	 * navigation (SeriesPartNav) on the right. It sits outside the zoomed scroll
	 * area, so it never scales. The in-content study header is still rendered for
	 * export/print (see exportAnalyze.js prepareForCapture).
	 */
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { showPopoverError } from '$lib/stores/popover.js';
	import SeriesPartNav from '$lib/componentWidgets/SeriesPartNav.svelte';
	import SeriesSelectionChip from '$lib/componentWidgets/SeriesSelectionChip.svelte';
	import Input from '$lib/componentElements/Input.svelte';

	/** @type {{ studyId?: string | null, title: string, subtitle?: string | null, seriesContext?: any }} */
	let { studyId = null, title, subtitle = null, seriesContext = null } = $props();

	/**
	 * Inline editing, mirroring HeadingEditor: click the text to edit, debounced
	 * auto-save while typing, Enter commits, Escape reverts, blur commits.
	 * For a series part the header shows the SERIES name/subtitle (§7), so edits
	 * go to the series; otherwise they go to the study itself.
	 */

	/** @typedef {'title' | 'subtitle'} Field */

	/** @type {Field | null} */
	let editingField = $state(null);
	let inputValue = $state('');
	let originalValue = '';
	/** Optimistic display values: undefined = use prop. */
	let optimisticTitle = $state(/** @type {string | undefined} */ (undefined));
	let optimisticSubtitle = $state(/** @type {string | null | undefined} */ (undefined));
	// Not $state: never rendered (see HeadingEditor's saveTimeout note).
	/** @type {ReturnType<typeof setTimeout> | null} */
	let saveTimeout = null;
	// True once a debounced auto-save has written during this edit session.
	let dirty = false;

	let displayTitle = $derived(optimisticTitle !== undefined ? optimisticTitle : title);
	let displaySubtitle = $derived(optimisticSubtitle !== undefined ? optimisticSubtitle : subtitle);
	const canEdit = $derived(Boolean(seriesContext?.id || studyId));

	// Drop optimistic values once fresh props arrive from the server.
	$effect(() => {
		title;
		subtitle;
		optimisticTitle = undefined;
		optimisticSubtitle = undefined;
	});

	/**
	 * Persist a field. Title may not be empty (NOT NULL); empty subtitle clears it.
	 * @param {Field} field
	 * @param {string} text
	 */
	async function save(field, text) {
		const trimmed = text.trim();
		if (field === 'title' && trimmed === '') return;

		const isSeries = Boolean(seriesContext?.id);
		const url = isSeries ? `/api/series/${seriesContext.id}` : `/api/studies/${studyId}`;
		const body =
			field === 'title'
				? isSeries ? { name: trimmed } : { title: trimmed }
				: { subtitle: trimmed || null };

		try {
			const response = await fetch(url, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				console.error(`Save ${field} error:`, error);
				showPopoverError(error.error || `Failed to save ${field}`);
			}
		} catch (error) {
			console.error(`Save ${field} network error:`, error);
			showPopoverError(error?.message || `Failed to save ${field}`);
		}
	}

	/** @param {Field} field @param {string} value */
	function setOptimistic(field, value) {
		if (field === 'title') {
			// Never show an empty title; fall back to the last good one.
			optimisticTitle = value.trim() || originalValue || title;
		} else {
			optimisticSubtitle = value.trim() || null;
		}
	}

	/** @param {Field} field */
	async function startEditing(field) {
		if (!canEdit || editingField === field) return;
		if (editingField) await commitChanges();
		inputValue = (field === 'title' ? displayTitle : displaySubtitle) || '';
		originalValue = inputValue;
		editingField = field;
		await tick();
		const el = document.getElementById(`study-${field}-input`);
		if (el instanceof HTMLInputElement) el.focus();
	}

	function handleInput() {
		if (!editingField) return;
		const field = editingField;
		setOptimistic(field, inputValue);
		if (saveTimeout) clearTimeout(saveTimeout);
		const valueToSave = inputValue;
		saveTimeout = setTimeout(() => {
			saveTimeout = null;
			dirty = true;
			save(field, valueToSave);
		}, 1000);
	}

	async function commitChanges() {
		if (!editingField) return;
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		const field = editingField;
		// An emptied title reverts rather than saving.
		const finalValue = field === 'title' && inputValue.trim() === '' ? originalValue : inputValue;
		setOptimistic(field, finalValue);
		editingField = null;
		inputValue = '';

		const changed = finalValue.trim() !== originalValue.trim();
		// Also save when an auto-save may have written an intermediate value.
		if (changed || dirty) await save(field, finalValue);
		dirty = false;
		if (changed) await invalidate('app:studies');
	}

	function cancelChanges() {
		if (!editingField) return;
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		const field = editingField;
		// Restore in the DB in case a debounced auto-save already fired.
		if (dirty) save(field, originalValue);
		dirty = false;
		setOptimistic(field, originalValue);
		editingField = null;
		inputValue = '';
	}

	/** @param {KeyboardEvent} event */
	function handleInputKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitChanges();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelChanges();
		}
	}

	/** Keyboard activation for the clickable text. @param {KeyboardEvent} event @param {Field} field */
	function handleTextKeyDown(event, field) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			startEditing(field);
		}
	}
</script>

<div class="analyze-study-toolbar">
	<div class="titles">
		{#if editingField === 'title'}
			<Input
				id="study-title-input"
				name="study-title"
				classes="title-input"
				aria-label="Title"
				size={Math.max(inputValue.length, 1)}
				bind:value={inputValue}
				oninput={handleInput}
				onblur={commitChanges}
				onkeydown={handleInputKeyDown}
			/>
		{:else}
			<h1
				class="title"
				class:editable={canEdit}
				role={canEdit ? 'button' : undefined}
				tabindex={canEdit ? 0 : undefined}
				onclick={() => startEditing('title')}
				onkeydown={(e) => handleTextKeyDown(e, 'title')}
			>{displayTitle}</h1>
		{/if}

		{#if editingField === 'subtitle'}
			<Input
				id="study-subtitle-input"
				name="study-subtitle"
				classes="subtitle-input"
				aria-label="Subtitle"
				placeholder="Subtitle"
				size={Math.max(inputValue.length, 8)}
				bind:value={inputValue}
				oninput={handleInput}
				onblur={commitChanges}
				onkeydown={handleInputKeyDown}
			/>
		{:else if displaySubtitle}
			<p
				class="subtitle"
				class:editable={canEdit}
				role={canEdit ? 'button' : undefined}
				tabindex={canEdit ? 0 : undefined}
				onclick={() => startEditing('subtitle')}
				onkeydown={(e) => handleTextKeyDown(e, 'subtitle')}
			>{displaySubtitle}</p>
		{:else if canEdit}
			<button type="button" class="add-subtitle" onclick={() => startEditing('subtitle')}>
				Add Subtitle
			</button>
		{/if}
	</div>
	{#if seriesContext?.id && studyId}
		<SeriesSelectionChip {seriesContext} currentPartId={studyId} />
	{/if}
	<SeriesPartNav {seriesContext} view="analyze" />
</div>

<style>
	.analyze-study-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		/* Left 4.4rem lines the title up with the content. Right 3.8rem + the nav
		   button's 0.6rem inner padding puts the chevron glyph 4.4rem from the edge. */
		padding: 0.6rem 3.8rem 0.6rem 4.4rem;
		box-sizing: border-box;
		background-color: var(--white);
		border-bottom: 0.1rem solid var(--gray-700);
		flex-shrink: 0;
	}

	/* Title and subtitle side by side on one line (baseline-aligned) so the bar
	   is the same single-row height as the Document commentary toolbar. */
	.titles {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.9rem;
		/* Fill the space left of the chevrons so the title's max-width % resolves
		   against the toolbar, not against the title's own width (which made
		   subtitle-less titles truncate to 70% of themselves). */
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}

	.title {
		font-size: 1.8rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 0;
		max-width: 70%;
	}

	/* No subtitle: the title may use the full width and shrink (with ellipsis)
	   only when it truly doesn't fit. */
	.title:only-child,
	.title:has(+ .add-subtitle) {
		max-width: 100%;
		flex-shrink: 1;
	}

	.subtitle {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--gray-400);
		line-height: 1.2;
		margin: 0;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Editable text: dashed underline on hover, like segment headings. A
	   transparent bottom border is always present so hovering doesn't shift layout. */
	.title.editable,
	.subtitle.editable {
		cursor: pointer;
		border-bottom: 0.1rem solid transparent;
		transition: border 0.2s ease-in-out;
	}

	.title.editable:hover,
	.subtitle.editable:hover,
	.title.editable:focus-visible,
	.subtitle.editable:focus-visible {
		outline: none;
		border-bottom: 0.1rem dashed var(--gray-400);
	}

	/* Inputs match the display text exactly, with the dashed underline that the
	   heading inputs use, so entering edit mode doesn't move anything. */
	.titles :global(input.title-input),
	.titles :global(input.subtitle-input) {
		width: auto;
		min-width: 4rem;
		max-width: 70%;
		height: auto;
		padding: 0;
		margin: 0;
		border: none;
		border-bottom: 0.1rem dashed var(--gray-400);
		border-radius: 0;
		background-color: transparent;
		font-weight: 700;
		line-height: 1.2;
		color: inherit;
		flex-shrink: 0;
	}

	.titles :global(input.title-input) {
		font-size: 1.8rem;
	}

	.titles :global(input.subtitle-input) {
		font-size: 1.2rem;
		color: var(--gray-400);
		flex-shrink: 1;
	}

	.titles :global(input.title-input:focus),
	.titles :global(input.subtitle-input:focus) {
		outline: none;
		box-shadow: none;
	}

	.add-subtitle {
		padding: 0;
		border: none;
		border-bottom: 0.1rem solid transparent;
		background: none;
		font: inherit;
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--gray-400);
		cursor: pointer;
		opacity: 0;
		white-space: nowrap;
		transition: opacity 0.15s ease-in-out;
	}

	/* Only reveal when hovering the title itself or the button — not the
	   whole .titles row, which stretches to the Prev/Next chevrons. */
	.title:hover + .add-subtitle,
	.add-subtitle:hover,
	.add-subtitle:focus-visible {
		opacity: 0.6;
		outline: none;
		border-bottom: 0.1rem dashed var(--gray-400);
	}

	@media print {
		.analyze-study-toolbar {
			display: none;
		}
	}
</style>
