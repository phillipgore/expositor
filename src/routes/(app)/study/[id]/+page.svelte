<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { data } = $props();

	// Redirect to the user's last-used study view (document vs analyze) so that
	// re-entering a study (or opening a different one) restores the same view and
	// highlights the matching toolbar button. Falls back to 'analyze' (the prior
	// default) when no preference is set. lastStudyView is hydrated from the DB in
	// the (app) layout, so this works on hard reloads / cold starts too.
	onMount(() => {
		const view = get(toolbarState).lastStudyView || 'analyze';
		goto(`/study/${data.study.id}/${view}`, { replaceState: true });
	});
</script>
