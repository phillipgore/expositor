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
		parentGroupId={data.parentGroupId}
		parentGroupName={data.parentGroupName}
		cancelHref={data.parentGroupId ? `/study-group/${data.parentGroupId}` : '/dashboard'}
	/>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		margin-top: 3.6rem;
	}
</style>
