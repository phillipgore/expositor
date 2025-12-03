<script>
	import Alert from './Alert.svelte';

	let { 
		children,
		fallback = null,
		onError = null
	} = $props();

	let error = $state(null);
	let errorInfo = $state(null);

	/**
	 * Handle errors from child components
	 * @param {Error} err - The error object
	 * @param {Object} info - Additional error information
	 */
	function handleError(err, info) {
		error = err;
		errorInfo = info;
		
		// Log error to console
		console.error('Error caught by ErrorBoundary:', err, info);
		
		// Call custom error handler if provided
		if (onError) {
			onError(err, info);
		}
	}

	/**
	 * Reset error state
	 */
	function resetError() {
		error = null;
		errorInfo = null;
	}
</script>

{#if error}
	{#if fallback}
		{@render fallback({ error, errorInfo, reset: resetError })}
	{:else}
		<div class="error-boundary">
			<Alert 
				color="red" 
				look="subtle" 
				message="An error occurred while loading this content."
			/>
			<details class="error-details">
				<summary>Error Details</summary>
				<pre>{error?.message || 'Unknown error'}</pre>
				{#if errorInfo}
					<pre>{JSON.stringify(errorInfo, null, 2)}</pre>
				{/if}
			</details>
			<button class="reset-button" onclick={resetError}>
				Try Again
			</button>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.error-boundary {
		padding: 1.8rem;
		margin: 1.8rem 0;
	}

	.error-details {
		margin-top: 0.9rem;
		padding: 0.9rem;
		background-color: var(--gray-800);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.2rem;
	}

	.error-details summary {
		cursor: pointer;
		font-weight: 600;
		margin-bottom: 0.9rem;
		color: var(--gray-300);
	}

	.error-details pre {
		margin: 0;
		padding: 0.9rem;
		background-color: var(--gray-900);
		border-radius: 0.3rem;
		overflow-x: auto;
		font-family: 'Courier New', monospace;
		font-size: 1.1rem;
		line-height: 1.4;
		color: var(--red-300);
	}

	.reset-button {
		margin-top: 0.9rem;
		padding: 0.6rem 1.2rem;
		background-color: var(--blue-600);
		color: white;
		border: none;
		border-radius: 0.3rem;
		cursor: pointer;
		font-size: 1.3rem;
		font-weight: 500;
		transition: background-color 0.2s;
	}

	.reset-button:hover {
		background-color: var(--blue-700);
	}

	.reset-button:active {
		background-color: var(--blue-800);
	}
</style>
