<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ToolbarApp from '$lib/components/ToolbarApp.svelte';

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (!authenticated) {
				goto('/signin');
			}
		});

		return unsubscribe;
	});
</script>

{#if $isAuthenticated}
	<ToolbarApp></ToolbarApp>
	<div class="wrapper">
		<slot />
	</div>
{:else}
	<div class="redirecting">Redirecting to sign in...</div>
{/if}

<style>
	/* ============================================
	   APP CONTENT WRAPPER
	   ============================================ */
	.wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		padding: 1.8rem;
	}

	/* ============================================
	   LOADING STATE
	   ============================================ */
	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		font-size: 1.2rem;
	}
</style>
