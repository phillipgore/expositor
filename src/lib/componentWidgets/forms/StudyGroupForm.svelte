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
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import messages from '$lib/data/messages.json';

	let {
		mode = 'new',
		initialData = null,
		existingGroups = [],
		form = null,
		onSubmittingChange = null,
		cancelHref = '/'
	} = $props();

	let isSubmitting = $state(false);

	// Initialize form state
	let groupName = $state(initialData?.name || form?.name || '');

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
	<Heading heading="h1" classes="h4">{mode === 'new' ? 'New Study Group' : 'Edit Study Group'}</Heading>

	{#if form?.error}
		<Alert color="red" message={form.error} />
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

	<FormButtonBar>
		<Button href={cancelHref} label="Cancel" classes="gray" isDisabled={isSubmitting}></Button>
		<Button type="submit" label={isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || hasDuplicateName}></Button>
	</FormButtonBar>
</form>
