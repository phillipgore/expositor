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
	import { enhance } from '$app/forms';
	import bibleData from '$lib/data/bible.json';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Label from '$lib/componentElements/Label.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import PassageSelector from '$lib/componentWidgets/PassageSelector.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import messages from '$lib/data/messages.json';

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

	const testamentData = bibleData[0].testamentData;
	const ntBookData = testamentData[1].bookData;

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
</script>

<form 
	method="POST" 
	use:enhance={() => {
		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}}
>
	<Heading heading="h1" classes="h4" hasSub={groupName? true : false}>{mode === 'new' ? 'New Study' : 'Edit Study'}</Heading>
	{#if groupName}
		<Heading heading="h1" classes="h6" isMuted notBold>{`To be created in "${groupName}".`}</Heading>
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

	<input type="hidden" name="passages" value={JSON.stringify(passages)} />
	{#if groupId}
		<input type="hidden" name="groupId" value={groupId} />
	{/if}

	<Label text="Passages"></Label>

	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
	<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

	<FormButtonBar>
		<Button href={cancelHref} label="Cancel" classes="gray" isDisabled={isSubmitting}></Button>
		<Button type="submit" label={isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || hasDuplicateTitle}></Button>
	</FormButtonBar>
</form>

<style>
	form {
		width: 41.4rem;
		min-width: 36.0rem;
	}
</style>
