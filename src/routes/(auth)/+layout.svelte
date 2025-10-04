<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ToolbarAuth from '$lib/components/ToolbarAuth.svelte';

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (authenticated) {
				goto('/new');
			}
		});

		return unsubscribe;
	});
</script>

<ToolbarAuth></ToolbarAuth>

{#if !$isAuthenticated}
	<slot />
{:else}
	<div class="redirecting">Redirecting to app...</div>
{/if}

<style>
	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		font-size: 1.2rem;
	}
</style>
