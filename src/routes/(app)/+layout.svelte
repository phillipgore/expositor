<script>
	import ToolbarApp from '$lib/components/ToolbarApp.svelte';
</script>

<ToolbarApp></ToolbarApp>

<div class="wrapper">
	<slot />
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		padding: 1.8rem;
	}
</style>
