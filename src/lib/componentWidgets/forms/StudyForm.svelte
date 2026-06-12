<script>
	/**
	 * StudyForm Component
	 * 
	 * Reusable form for creating or editing a study.
	 * Handles title input, passage selection, validation, and submission UI.
	 * 
	 * @property {string} mode - 'new' or 'edit'
	 * @property {Object} initialData - Initial form data for edit mode
	 * @property {Array} existingStudies - List of existing studies for duplicate check
	 * @property {Object} form - Form state from SvelteKit form actions
	 * @property {Function} onSubmittingChange - Callback when submitting state changes
	 */
	import { onMount } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';



	import bibleData from '$lib/data/bible.json';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Label from '$lib/componentElements/Label.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import PassageSelector from '$lib/componentWidgets/PassageSelector.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import messages from '$lib/data/messages.json';
	import { getAllTranslationsMetadata } from '$lib/utils/translationConfig';
	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';
	import { setStudyEditDirty, clearStudyEditDirty } from '$lib/stores/studyEditDirty.js';



	let {
		mode = 'new',
		initialData = null,
		existingStudies = [],
		form = null,
		onSubmittingChange = null,
		cancelHref = '/',
		groupId = null,
		groupName = null
	} = $props();

	let isSubmitting = $state(false);

	// --- Edit-mode review flow state ---------------------------------------
	let formElement = $state(null);
	let isAnalyzing = $state(false);




	const testamentData = bibleData[0].testamentData;
	const ntBookData = testamentData[1].bookData;

	// Get translation metadata for radio button options
	const translationsMetadata = getAllTranslationsMetadata();
	const translationOptions = translationsMetadata.map(t => ({
		id: `translation-${t.id}`,
		value: t.id,
		text: t.abbreviation,
		title: t.name,
		isChecked: t.id === 'esv'
	}));

	// Initialize form state
	let studyTitle = $state(initialData?.title || form?.title || '');
	let studySubtitle = $state(initialData?.subtitle || form?.subtitle || '');
	let passages = $state(initialData?.passages || [
		{
			id: uuidv4(),
			testament: testamentData[1]._id,
			book: ntBookData[0]._id,
			fromChapter: 1,
			toChapter: 1,
			fromVerse: 1,
			toVerse: ntBookData[0].chapterData[0]['1']
		}
	]);

	// Duplicate title validation
	let duplicateTitleMessage = $derived(getDuplicateTitleMessage(studyTitle));
	let hasDuplicateTitle = $derived(duplicateTitleMessage.length > 0);

	// --- Unsaved-changes (dirty) tracking, edit mode only ------------------
	// Baseline snapshot of the last-saved values. The edit-flow layout watches
	// the shared `studyEditDirty` store (set below) to decide whether to prompt
	// before the user navigates away and discards in-progress edits.
	const savedSnapshot = JSON.stringify({
		title: initialData?.title || '',
		subtitle: initialData?.subtitle || '',
		passages: initialData?.passages || []
	});

	/** Current form values serialized the same way as `savedSnapshot`. */
	let currentSnapshot = $derived(
		JSON.stringify({ title: studyTitle, subtitle: studySubtitle, passages })
	);

	/** Dirty when editing and the current values differ from the saved baseline. */
	let isDirty = $derived(
		mode === 'edit' && !!initialData?.id && currentSnapshot !== savedSnapshot
	);


	/**
	 * Get duplicate title message if a study with this title already exists
	 * @param {string} title
	 * @returns {string}
	 */
	function getDuplicateTitleMessage(title) {
		if (!title || !title.trim()) return '';
		const trimmedTitle = title.trim().toLowerCase();
		
		// When editing, exclude the current study from duplicate check
		const studiesToCheck = mode === 'edit' && initialData?.id
			? existingStudies.filter(s => s.id !== initialData.id)
			: existingStudies;
		
		const hasDuplicate = studiesToCheck?.some(study => 
			study.title.toLowerCase() === trimmedTitle
		) || false;
		
		return hasDuplicate ? messages.validation.duplicateStudyTitle : '';
	}

	const handlePassagesChange = (updatedPassages) => {
		passages = updatedPassages;
	};

	/**
	 * Discard any in-progress review hand-off payload. Called when the user
	 * cancels the edit so a later fresh edit session starts from saved data
	 * rather than rehydrating abandoned changes.
	 */
	function clearPendingEdit() {
		if (mode !== 'edit' || !initialData?.id) return;
		// Also drop the dirty flag so the edit-flow layout's navigation guard
		// doesn't prompt on this intentional Cancel.
		clearStudyEditDirty();
		try {
			sessionStorage.removeItem(pendingEditKey(initialData.id));
			sessionStorage.removeItem(armedKey(initialData.id));
		} catch {
			// sessionStorage unavailable — nothing to clear.
		}
	}



	/**
	 * Restore in-progress edits when the user returns from the full-page review
	 * via "Back". The review hand-off payload lives in sessionStorage until the
	 * edit is actually saved, so if it's still present (and the user hasn't yet
	 * persisted) we rehydrate the title/subtitle/passages they were editing
	 * rather than resetting to the last-saved `initialData`.
	 */
	onMount(() => {
		if (mode !== 'edit' || !initialData?.id) return;
		let raw;
		try {
			raw = sessionStorage.getItem(pendingEditKey(initialData.id));
		} catch {
			return;
		}
		if (!raw) return;
		try {
			const pending = JSON.parse(raw);
			if (pending && typeof pending === 'object') {
				if (typeof pending.title === 'string') studyTitle = pending.title;
				if (typeof pending.subtitle === 'string') studySubtitle = pending.subtitle;
				if (Array.isArray(pending.passages) && pending.passages.length) {
					passages = pending.passages;
				}
			}
		} catch {
			// Ignore a corrupt payload — fall back to the saved initialData.
		}
	});


	// Notify parent of submitting state changes
	$effect(() => {
		onSubmittingChange?.(isSubmitting);
	});

	// Publish dirtiness to the shared store the edit-flow layout reads from its
	// `beforeNavigate` guard. Cleared on unmount so a stale "true" never lingers
	// after the form is gone (cancel/save clear it explicitly as well).
	$effect(() => {
		setStudyEditDirty(isDirty);
	});

	onMount(() => {
		return () => clearStudyEditDirty();
	});


	/**
	 * In edit mode, the first submit must be intercepted so we can analyze the
	 * passage changes and decide whether the user needs to make decisions before
	 * anything is written. We do this from inside `use:enhance` using its
	 * `cancel()` callback — `event.preventDefault()` from a separate onsubmit
	 * handler does NOT stop enhance from posting.
	 *
	 * - If the edit needs review, the proposed edit + report are stashed in
	 *   sessionStorage and we navigate to the dedicated full-page review.
	 * - Otherwise the edit is submitted straight through with empty decisions.
	 *
	 * @param {{ cancel: () => void }} param0
	 */
	async function runAnalysisGate({ cancel }) {
		// Stop this submission; we'll either navigate to review or submit directly.
		cancel();

		if (hasDuplicateTitle || isAnalyzing || isSubmitting) return;

		isAnalyzing = true;
		try {
			const res = await fetch(`/api/studies/${initialData.id}/analyze-edit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ passages })
			});

			if (!res.ok) {
				// If analysis fails, fall back to a normal submit rather than blocking.
				await submitDirect();
				return;
			}

			const report = await res.json();
			if (report?.requiresReview) {
				// Hand the pending edit off to the full-page review. The payload is
				// NOT yet persisted; the "armed" flag is consumed on the review
				// page's first mount so a refresh redirects back here.
				const studyId = initialData.id;
				sessionStorage.setItem(
					pendingEditKey(studyId),
					JSON.stringify({
						title: studyTitle,
						subtitle: studySubtitle,
						passages,
						report
					})
				);
				sessionStorage.setItem(armedKey(studyId), '1');
				await goto(`/study/${studyId}/edit/review`);
			} else {
				// Nothing needs a decision — submit with empty decisions.
				await submitDirect();
			}
		} catch (err) {
			console.error('Edit analysis failed:', err);
			await submitDirect();
		} finally {
			isAnalyzing = false;
		}
	}

	/**
	 * Submit the edit directly via fetch with empty decisions (no review needed).
	 * Posting the form data directly is immune to navigation/enhance edge cases,
	 * and we apply the redirect result ourselves.
	 */
	async function submitDirect() {
		if (isSubmitting) return;
		isSubmitting = true;
		try {
			const data = new FormData(formElement);
			data.set('decisions', JSON.stringify({}));

			const response = await fetch(formElement.action || window.location.pathname, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: data
			});

			const result = deserialize(await response.text());

			if (result.type === 'redirect') {
				// Saved successfully — drop the dirty flag so the edit-flow layout
				// won't prompt as we navigate away to the saved study.
				clearStudyEditDirty();
				await goto(result.location, { invalidateAll: true });
				return;
			}


			if (result.type === 'error') {
				console.error('Save failed:', result.error);
				await applyAction(result);
				return;
			}

			// failure / success without redirect: surface via form prop
			await applyAction(result);
			await invalidateAll();
		} catch (err) {
			console.error('Error saving study:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>


<form 
	bind:this={formElement}
	method="POST" 
	use:enhance={({ cancel }) => {
		// In edit mode, gate EVERY submit on analysis/review. The analysis step
		// decides whether to navigate to the full-page review or submit straight
		// through. New studies post normally below.
		if (mode === 'edit' && initialData?.id) {

			runAnalysisGate({ cancel });
			return;
		}

		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}}
>



	<Heading heading="h1" hasSub={groupName? true : false}>{mode === 'new' ? 'New Study' : 'Edit Study'}</Heading>
	{#if groupName}
		<Heading heading="h2" isMuted notBold>{`To be created in "${groupName}".`}</Heading>
	{/if}

	{#if form?.error}
		<Alert color="red" look="subtle" message={form.error} />
	{/if}

	<InputField
		label="Title"
		id="title"
		name="title"
		bind:value={studyTitle}
		isLarge
		required
		infoMessage={duplicateTitleMessage}
	/>

	<InputField
		label="Subtitle"
		id="subtitle"
		name="subtitle"
		bind:value={studySubtitle}
	/>

	{#if mode === 'new'}
		<Label text="Translation"></Label>
		<RadioButtons
			RadioButtonProperties={translationOptions}
			name="translation"
			isInline
		/>
	{/if}

	<input type="hidden" name="passages" value={JSON.stringify(passages)} />
	{#if groupId}

		<input type="hidden" name="groupId" value={groupId} />
	{/if}


	<Label text="Passages"></Label>

	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
	<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

	<FormButtonBar>
		<Button href={cancelHref} label="Cancel" classes="gray" isDisabled={isSubmitting || isAnalyzing} handleClick={clearPendingEdit}></Button>

		<Button type="submit" label={isAnalyzing ? 'Checking...' : isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || isAnalyzing || hasDuplicateTitle}></Button>
	</FormButtonBar>
</form>


<style>

	form {
		width: 41.4rem;
		min-width: 36.0rem;
	}
</style>
