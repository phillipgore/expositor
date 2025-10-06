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
	<div class="container">
		<div class="wrapper">
			<slot />
		</div>
	</div>
{:else}
	<div class="redirecting">Redirecting to app...</div>
{/if}

<style>
	.container {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		padding-top: 5.4em;
	}

	.wrapper {
		display: flex;
		flex-direction: column;
		width: 36rem;
		margin-bottom: 3.6rem;
	}

	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		font-size: 1.2rem;
	}
</style>
