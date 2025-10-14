<script>
	import { enhance } from '$app/forms';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import { setToolbarState } from '$lib/stores/toolbar.js';
	import messages from '$lib/data/messages.json';

	let { form, data } = $props();

	let isSubmitting = $state(false);
	let groupName = $state('');
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
		const hasDuplicate = data.groups?.some(group => 
			group.name.toLowerCase() === trimmedName
		) || false;
		return hasDuplicate ? messages.validation.duplicateGroupName : '';
	}

	// Open the studies panel when this page loads
	$effect(() => {
		setToolbarState('studiesPanelOpen', true);
	});
</script>

<div class="container">
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
		<Heading heading="h1" classes="h4">New Study Group</Heading>

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
			<Button href="/new-study" label="Cancel" classes="gray" isDisabled={isSubmitting}></Button>
			<Button type="submit" label={isSubmitting ? 'Saving...' : 'Save'} classes="blue" isDisabled={isSubmitting || hasDuplicateName}></Button>
		</FormButtonBar>
	</form>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		margin-top: 3.6rem;
	}

	form {
		width: 41.4rem;
		min-width: 36.0rem
	}
</style>
