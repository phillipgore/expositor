<script>
	import '$lib/stylesheets/styles.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { getPageTitle } from '$lib/utils/pageTitle.js';
	import { initializeAuth, isLoading } from '$lib/stores/auth.js';
	import ViewportWarning from '$lib/componentWidgets/ViewportWarning.svelte';
	import Tooltip from '$lib/componentElements/Tooltip.svelte';
	import LoadingText from '$lib/componentElements/LoadingText.svelte';

	onMount(async () => {
		// CSS Anchor Positioning polyfill (client-side only)
		await import('@oddbird/css-anchor-positioning');
		
		initializeAuth();
	});
</script>

<svelte:head>
	<title>{getPageTitle($page.route.id, $page.data?.pageTitle)}</title>
</svelte:head>

<ViewportWarning />
<Tooltip />

{#if $isLoading}
	<div class="loading">
		<LoadingText />
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
