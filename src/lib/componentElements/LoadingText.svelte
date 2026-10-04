<script>
	/**
	 * # LoadingText Component
	 *
	 * The app's single loading indicator for content areas and pages: a quiet, small
	 * gray "Loading…" line. Fits the scholarly look better than a spinner.
	 *
	 * Convention: content areas use LoadingText; buttons use an inline Spinner + busy
	 * label (see Spinner.svelte / Modal `confirmBusy`).
	 *
	 * ## Usage
	 * ```svelte
	 * <LoadingText />
	 * <LoadingText label="Preparing the split…" />
	 * ```
	 *
	 * @typedef {Object} LoadingTextProps
	 * @property {string} [label='Loading…'] - Status text (also announced to screen readers)
	 */

	/** @type {LoadingTextProps} */
	let { label = 'Loading…' } = $props();
</script>

<p class="loading-text" role="status" aria-live="polite">{label}</p>

<style>
	.loading-text {
		margin: 0;
		font-size: 1.2rem;
		color: var(--gray-400);
	}
</style>
