<script>
	/**
	 * # Root Error Page
	 *
	 * Client-side error boundary for the whole app. Without this file, any error
	 * thrown from a `load` function (e.g. a 404 after the current study/group is
	 * deleted, or a 403 permission error) falls back to SvelteKit's static
	 * server-rendered error page — which looks and behaves like a full page
	 * reload. With this boundary, errors render inside the app shell and the
	 * user can navigate away client-side without losing app state.
	 */
	import { page } from '$app/stores';
	import Button from '$lib/componentElements/buttons/Button.svelte';

	/**
	 * Friendly headline for common statuses.
	 * @param {number} status
	 * @returns {string}
	 */
	function headline(status) {
		if (status === 404) return 'Not Found';
		if (status === 403) return 'Access Denied';
		return 'Something Went Wrong';
	}
</script>

<svelte:head>
	<title>{$page.status} — Expositor App</title>
</svelte:head>

<div class="error-page">
	<div class="error-card">
		<div class="error-status">{$page.status}</div>
		<h1>{headline($page.status)}</h1>
		<p>{$page.error?.message || 'An unexpected error occurred.'}</p>
		<Button label="Go to Dashboard" href="/dashboard" classes="blue" />
	</div>
</div>

<style>
	.error-page {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		padding: 2.4rem;
	}

	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.2rem;
		text-align: center;
		max-width: 48rem;
	}

	.error-status {
		font-size: 4.8rem;
		font-weight: 700;
		line-height: 1;
		color: var(--gray-400);
	}

	h1 {
		margin: 0;
		font-size: 2.4rem;
		font-weight: 600;
	}

	p {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--gray-400);
	}
</style>
