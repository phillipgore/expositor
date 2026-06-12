<script>
	import StudyForm from '$lib/componentWidgets/forms/StudyForm.svelte';
	import { get } from 'svelte/store';
	import { setToolbarState, toolbarState, setCommentaryPanelOpen } from '$lib/stores/toolbar.js';

	let { form, data } = $props();

	// Open the studies panel and close the commentary panel when this page loads
	$effect(() => {
		setToolbarState('studiesPanelOpen', true);
		// Close the commentary panel if it is currently open
		if (get(toolbarState).commentaryPanelOpen) {
			setCommentaryPanelOpen(false);
		}
	});

</script>

<div class="container">
	<StudyForm
		mode="edit"
		initialData={data.study}
		{form}
		existingStudies={data.studies}
		cancelHref="/study/{data.study.id}"
	/>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		margin-top: 3.6rem;
	}

	:global(form) {
		width: 41.4rem;
		min-width: 36.0rem
	}
</style>
