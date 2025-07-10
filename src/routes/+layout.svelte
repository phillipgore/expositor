<script>
	import ToolbarMain from '$lib/components/ToolbarMain.svelte';
	import '$lib/stylesheets/styles.css';
</script>

<svelte:head>
	<title>Expositor App</title>
</svelte:head>

<ToolbarMain></ToolbarMain>
<div class="wrapper">
	<slot />
</div>

<style>
	.wrapper {
		padding: 1.8rem;
	}
</style>
