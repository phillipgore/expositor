<script>
	/**
	 * StudyGroupForm Component
	 * 
	 * Reusable form for creating or editing a study group.
	 * Handles group name input, validation, and submission UI.
	 * 
	 * @property {string} mode - 'new' or 'edit'
	 * @property {Object} initialData - Initial form data for edit mode
	 * @property {Array} existingGroups - List of existing groups for duplicate check
	 * @property {Object} form - Form state from SvelteKit form actions
	 * @property {Function} onSubmittingChange - Callback when submitting state changes
	 */
	import { enhance } from '$app/forms';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import TextareaField from '$lib/componentWidgets/TextareaField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import messages from '$lib/data/messages.json';

	let {
		mode = 'new',
		initialData = null,
		existingGroups = [],
		form = null,
		onSubmittingChange = null,
		cancelHref = '/',
		parentGroupId = null,
		parentGroupName = null
	} = $props();

	let isSubmitting = $state(false);

	// Initialize form state
	let groupName = $state(initialData?.name || form?.name || '');
	let groupSubtitle = $state(initialData?.subtitle || form?.subtitle || '');
	let groupDescription = $state(initialData?.description || form?.description || '');

	// Duplicate name validation
	let duplicateNameMessage = $derived(getDuplicateNameMessage(groupName));
	let hasDuplicateName = $derived(duplicateNameMessage.length > 0);

	/**
	 * Get duplicate name message if a group with this name already exists
	 * @param {string} name
	 * @returns {string}
	 */
	function getDuplicateNameMessage(name) {
		if (!name || !name.trim()) return '';
		const trimmedName = name.trim().toLowerCase();
		
		// When editing, exclude the current group from duplicate check
		const groupsToCheck = mode === 'edit' && initialData?.id
			? existingGroups.filter(g => g.id !== initialData.id)
			: existingGroups;
		
		const hasDuplicate = groupsToCheck?.some(group => 
			group.name.toLowerCase() === trimmedName
		) || false;
		
		return hasDuplicate ? messages.validation.duplicateGroupName : '';
	}

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
	<Heading heading="h1" classes="h4" hasSub={parentGroupName ? true : false}>{mode === 'new' ? 'New Study Group' : 'Edit Study Group'}</Heading>
	{#if parentGroupName}
		<Heading heading="h1" classes="h6" isMuted notBold>{`To be created in "${parentGroupName}".`}</Heading>
	{/if}

	{#if form?.error}
		<Alert color="red" look="subtle" message={form.error} />
	{/if}

	<InputField
		label="Group Name"
		id="name"
		name="name"
		bind:value={groupName}
		isLarge
		required
		infoMessage={duplicateNameMessage}
	/>

	<InputField
		label="Subtitle"
		id="subtitle"
		name="subtitle"
		bind:value={groupSubtitle}
	/>

	<TextareaField
		label="Description"
		id="description"
		name="description"
		bind:value={groupDescription}
		isLarge
		rows={3}
	/>

	{#if parentGroupId}
		<input type="hidden" name="parentGroupId" value={parentGroupId} />
	{/if}

	<FormButtonBar>
		<Button href={cancelHref} label="Cancel" classes="gray" isDisabled={isSubmitting}></Button>
		<Button type="submit" label={isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || hasDuplicateName}></Button>
	</FormButtonBar>
</form>

<style>
	form {
		width: 41.4rem;
		min-width: 36.0rem;
	}
</style>
