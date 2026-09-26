<script>
	import { isAuthenticated, verifySession } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ToolbarAuth from '$lib/componentWidgets/ToolbarAuth.svelte';

	onMount(() => {
		let unsubscribe = () => {};
		let cancelled = false;

		// Re-check with the server before trusting the client-side flag. When the browser
		// believes it is signed in but the server does not (e.g. a dropped session cookie), a
		// protected route redirects back here; trusting the stale flag would redirect again,
		// bounce back, and leave "Redirecting to app..." on screen forever. After verifying,
		// a mismatch simply shows the sign-in form.
		verifySession().finally(() => {
			if (cancelled) return;
			unsubscribe = isAuthenticated.subscribe((authenticated) => {
				if (authenticated) {
					goto('/new-study');
				}
			});
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
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
	/* ============================================
	   AUTH LAYOUT CONTAINER
	   ============================================ */
	.container {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		padding-top: 5.4em;
	}

	/* ============================================
	   FORM WRAPPER
	   ============================================ */
	.wrapper {
		display: flex;
		flex-direction: column;
		width: 36rem;
		margin-bottom: 3.6rem;
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
