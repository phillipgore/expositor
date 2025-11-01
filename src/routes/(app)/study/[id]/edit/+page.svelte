<script>
	import StudyForm from '$lib/componentWidgets/forms/StudyForm.svelte';
	import { setToolbarState } from '$lib/stores/toolbar.js';

	let { form, data } = $props();

	// Open the studies panel when this page loads
	$effect(() => {
		setToolbarState('studiesPanelOpen', true);
	});
</script>

<div class="container">
	<StudyForm
		mode="edit"
		initialData={data.study}
		{form}
		existingStudies={data.studies}
		cancelHref="/dashboard"
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
