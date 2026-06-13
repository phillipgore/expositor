<script>
	import '$lib/stylesheets/styles.css';
	import { onMount } from 'svelte';
	import { initializeAuth, isLoading } from '$lib/stores/auth.js';
	import ViewportWarning from '$lib/componentWidgets/ViewportWarning.svelte';
	import Tooltip from '$lib/componentElements/Tooltip.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';

	onMount(async () => {
		// CSS Anchor Positioning polyfill (client-side only)
		await import('@oddbird/css-anchor-positioning');
		
		initializeAuth();
	});
</script>

<svelte:head>
	<title>Expositor App</title>
</svelte:head>

<ViewportWarning />
<Tooltip />

{#if $isLoading}
	<div class="loading">
		<Spinner size="lg" label="Loading…" />
	</div>
{:else}
	<slot />
{/if}

<style>
	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
	}
</style>
