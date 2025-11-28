<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let { data } = $props();

	// Redirect to analyze view by default
	onMount(() => {
		goto(`/study/${data.study.id}/analyze`, { replaceState: true });
	});
</script>
