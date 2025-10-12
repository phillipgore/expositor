<script>
	import { v4 as uuidv4 } from 'uuid';
	import bibleData from '$lib/data/bible.json';
	import Button from '$lib/elements/buttons/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Label from '$lib/elements/Label.svelte';
	import InputField from '$lib/components/InputField.svelte';
	import FormButtonBar from '$lib/elements/FormButtonBar.svelte';
	import PassageSelector from '$lib/components/PassageSelector.svelte';

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

	$effect(() => {
		$inspect(passages);
	});

	const handlePassagesChange = (updatedPassages) => {
		passages = updatedPassages;
	};
</script>

<div class="container">
	<form>
		<Heading heading="h1" classes="h4">New Study</Heading>

		<InputField
			label="Title"
			id="title"
			name="title"
			isLarge
		/>

		<Label text="Passages"></Label>

		<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
		<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
		<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

		<FormButtonBar>
			<Button href="/open" label="Cancel" classes="gray"></Button>
			<Button label="Submit" classes="blue"></Button>
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
		width: 48rem;
	}

</style>
