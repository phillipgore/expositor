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
	import ReviewStudyEditModal from '$lib/componentWidgets/modals/ReviewStudyEditModal.svelte';
	import messages from '$lib/data/messages.json';
	import { getAllTranslationsMetadata } from '$lib/utils/translationConfig';

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
	let showReviewModal = $state(false);
	let analyzeReport = $state(null);
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

	// Notify parent of submitting state changes
	$effect(() => {
		onSubmittingChange?.(isSubmitting);
	});

	/**
	 * In edit mode, the first submit must be intercepted so we can analyze the
	 * passage changes and (if needed) collect the user's decisions in the Review
	 * modal BEFORE anything is written. We do this from inside `use:enhance` using
	 * its `cancel()` callback — `event.preventDefault()` from a separate onsubmit
	 * handler does NOT stop enhance from posting, which previously caused the
	 * modal to flash while the form submitted anyway.
	 *
	 * @param {{ cancel: () => void }} param0
	 */
	async function runAnalysisGate({ cancel }) {
		// Stop this submission; we'll submit programmatically once reviewed.
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
				await submitReviewed({});
				return;
			}

			const report = await res.json();
			if (report?.requiresReview) {
				// Pause and wait for the user to confirm in the modal.
				analyzeReport = report;
				showReviewModal = true;
			} else {
				// Nothing needs a decision — submit with empty decisions.
				await submitReviewed({});
			}
		} catch (err) {
			console.error('Edit analysis failed:', err);
			await submitReviewed({});
		} finally {
			isAnalyzing = false;
		}
	}

	/**
	 * Submit the edit directly via fetch (NOT through use:enhance / requestSubmit).
	 *
	 * Why fetch instead of requestSubmit(): the Review modal is a native
	 * <dialog> opened with showModal(), which makes the rest of the page inert.
	 * Programmatic form submission interacts badly with that inert state and the
	 * dialog close timing — every variation either swallowed the first submit
	 * (requiring a second Save click) or was blocked entirely. Posting the form
	 * data directly with fetch is immune to the dialog's inert state, so the
	 * single "Save Changes" click always works. We then apply the action result
	 * (which is a redirect to the study page) ourselves.
	 *
	 * @param {Object} decisions - keyed by passageId
	 */
	async function submitReviewed(decisions) {
		if (isSubmitting) return;
		isSubmitting = true;
		try {
			const data = new FormData(formElement);
			data.set('decisions', JSON.stringify(decisions || {}));

			const response = await fetch(formElement.action || window.location.pathname, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: data
			});

			const result = deserialize(await response.text());

			if (result.type === 'redirect') {
				showReviewModal = false;
				await goto(result.location, { invalidateAll: true });
				return;
			}

			if (result.type === 'error') {
				console.error('Save failed:', result.error);
				await applyAction(result);
				showReviewModal = false;
				return;
			}

			// failure / success without redirect: surface via form prop
			await applyAction(result);
			await invalidateAll();
			showReviewModal = false;
		} catch (err) {
			console.error('Error saving study:', err);
		} finally {
			isSubmitting = false;
		}
	}

	/**
	 * The user confirmed their choices in the Review modal.
	 * @param {Object} decisions - keyed by passageId
	 */
	async function handleReviewConfirm(decisions) {
		await submitReviewed(decisions);
	}

	function handleReviewCancel() {
		showReviewModal = false;
	}
</script>

<form 
	bind:this={formElement}
	method="POST" 
	use:enhance={({ cancel }) => {
		// In edit mode, gate EVERY submit on analysis/review. The analysis step
		// decides whether to open the modal or submit straight through (both paths
		// post via fetch in submitReviewed). New studies post normally below.
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
		<Button href={cancelHref} label="Cancel" classes="gray" isDisabled={isSubmitting || isAnalyzing}></Button>
		<Button type="submit" label={isAnalyzing ? 'Checking...' : isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || isAnalyzing || hasDuplicateTitle}></Button>
	</FormButtonBar>
</form>

{#if mode === 'edit'}
	<ReviewStudyEditModal
		isOpen={showReviewModal}
		report={analyzeReport}
		isSaving={isSubmitting}
		onConfirm={handleReviewConfirm}
		onCancel={handleReviewCancel}
	/>
{/if}


<style>
	form {
		width: 41.4rem;
		min-width: 36.0rem;
	}
</style>
