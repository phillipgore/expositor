<script>
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

	/** @type {import('./$types').ActionData} */
	let { form } = $props();

	const testamentData = bibleData[0].testamentData;
	const ntBookData = testamentData[1].bookData;

	let passages = $state([
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

	let isSubmitting = $state(false);

	const handlePassagesChange = (updatedPassages) => {
		passages = updatedPassages;
	};
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
		<Heading heading="h1" classes="h4">New Study</Heading>

		{#if form?.error}
			<Alert color="red" message={form.error} />
		{/if}

		<InputField
			label="Title"
			id="title"
			name="title"
			value={form?.title || ''}
			isLarge
			required
		/>

		<input type="hidden" name="passages" value={JSON.stringify(passages)} />

		<Label text="Passages"></Label>

		<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
		<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
		<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

		<FormButtonBar>
			<Button href="/open" label="Cancel" classes="gray" isDisabled={isSubmitting}></Button>
			<Button type="submit" label={isSubmitting ? 'Creating...' : 'Submit'} classes="blue" isDisabled={isSubmitting}></Button>
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
