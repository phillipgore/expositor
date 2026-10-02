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
	 * Friendly headline + fallback description for common statuses.
	 * @type {Record<number, { title: string, description: string }>}
	 */
	const COPY = {
		400: { title: 'Bad Request', description: 'The request could not be understood.' },
		401: { title: 'Sign In Required', description: 'Please sign in to view this page.' },
		403: { title: 'Access Denied', description: "You don't have permission to view this page." },
		404: {
			title: 'Not Found',
			description: "The page you're looking for doesn't exist or may have been moved."
		},
		500: {
			title: 'Something Went Wrong',
			description: 'An unexpected error occurred. Please try again later.'
		},
		503: {
			title: 'Service Unavailable',
			description: 'The service is temporarily unavailable. Please try again shortly.'
		}
	};

	const FALLBACK = {
		title: 'Something Went Wrong',
		description: 'An unexpected error occurred. Please try again later.'
	};

	/**
	 * Generic messages SvelteKit (or HTTP) fills in automatically — these add no
	 * information beyond the headline, so we replace them with our description.
	 */
	const GENERIC_MESSAGES = ['not found', 'internal error', 'internal server error', 'error'];

	$: copy = COPY[$page.status] ?? FALLBACK;

	/**
	 * Show the error's own message only if it is meaningful and doesn't just
	 * repeat the headline (e.g. "Not Found" under "Not Found").
	 */
	$: description = (() => {
		const message = $page.error?.message?.trim();
		if (!message) return copy.description;
		const normalized = message.toLowerCase();
		if (normalized === copy.title.toLowerCase() || GENERIC_MESSAGES.includes(normalized)) {
			return copy.description;
		}
		return message;
	})();
</script>

<svelte:head>
	<title>{$page.status} — Expositor App</title>
</svelte:head>

<div class="error-page">
	<div class="error-card">
		<div class="error-status">{$page.status}</div>
		<h1>{copy.title}</h1>
		<p>{description}</p>
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
