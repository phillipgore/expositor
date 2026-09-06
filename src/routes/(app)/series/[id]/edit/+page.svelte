<script>
	/**
	 * # Edit Series — the whole serialized study
	 *
	 * Shows the study AS THE USER CREATED IT: one passage list, recomposed from the parts (see
	 * `+page.server.js`), rather than one part's fragment of it.
	 *
	 * Saving does not post to an action. A series edit can narrow parts, delete parts and add text
	 * in one go, so `StudyForm` routes `series-edit` submissions through
	 * `/api/series/[id]/analyze-edit` and then the review page, which collects the user's Merge/
	 * Delete decisions and their acknowledgement of any deletion before calling `reserialize`.
	 */
	import StudyForm from '$lib/componentWidgets/forms/StudyForm.svelte';
	import { get } from 'svelte/store';
	import { setToolbarState, toolbarState, setCommentaryPanelOpen } from '$lib/stores/toolbar.js';

	let { data } = $props();

	$effect(() => {
		setToolbarState('studiesPanelOpen', true);
		if (get(toolbarState).commentaryPanelOpen) {
			setCommentaryPanelOpen(false);
		}
	});
</script>

<div class="container">
	<StudyForm
		mode="series-edit"
		initialData={data.series}
		existingStudies={data.studies}
		cancelHref="/series/{data.series.id}"
	/>
</div>

<style>
	.container {
		display: flex;
		justify-content: center;
		margin-top: 3.6rem;
		padding-bottom: 3.6rem;
	}

	:global(form) {
		width: 41.4rem;
		min-width: 36rem;
	}
</style>
