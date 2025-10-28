<script>
	import StudyGroupForm from '$lib/componentWidgets/forms/StudyGroupForm.svelte';
	import { setToolbarState } from '$lib/stores/toolbar.js';

	let { form, data } = $props();

	// Open the studies panel when this page loads
	$effect(() => {
		setToolbarState('studiesPanelOpen', true);
	});
</script>

<div class="container">
	<StudyGroupForm
		mode="new"
		{form}
		existingGroups={data.groups}
		cancelHref="/dashboard"
	/>
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
