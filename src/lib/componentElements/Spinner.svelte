<script>
	/**
	 * # Spinner Component
	 *
	 * The single, app-wide loading primitive. Used everywhere a "working…" state
	 * needs to be communicated — navigation overlays, streamed content, inline
	 * async actions, and inside submit buttons — just at different sizes.
	 *
	 * Rather than maintaining two loader styles (spinner + skeletons), this one
	 * primitive scales contextually so the loading language stays consistent.
	 *
	 * ## Features
	 * - Three sizes: `sm` (inline / buttons), `md` (default), `lg` (full-page / overlay)
	 * - Optional visible label rendered beside/below the spinner
	 * - Accessible: role="status" + aria-live, with a visually-hidden label fallback
	 * - Honors `prefers-reduced-motion` (slows + softens the animation)
	 * - Themeable via CSS custom properties / the app color variables
	 *
	 * ## Usage Examples
	 *
	 * Inline in a button:
	 * ```svelte
	 * <Spinner size="sm" inline />
	 * ```
	 *
	 * Centered with a label:
	 * ```svelte
	 * <Spinner size="lg" label="Loading study…" />
	 * ```
	 *
	 * @typedef {'sm' | 'md' | 'lg'} SpinnerSize
	 *
	 * @typedef {Object} SpinnerProps
	 * @property {SpinnerSize} [size='md'] - Visual size of the spinner
	 * @property {string} [label] - Optional status text. Always announced to screen readers; only shown visually when `showLabel` is true.
	 * @property {boolean} [showLabel] - Whether to render the label visibly (defaults to true when a label is provided and not inline)
	 * @property {boolean} [inline=false] - Render inline (no centering/margins) for use inside buttons or text
	 * @property {string} [color] - Override the spinner accent color (any CSS color / var). Defaults to a dark gray for a subtle, scholarly feel.
	 */

	/** @type {SpinnerProps} */
	let {
		size = 'md',
		label,
		showLabel,
		inline = false,
		color
	} = $props();

	// Show the label visibly by default when one is supplied and we're not inline.
	const labelVisible = $derived(showLabel ?? (!!label && !inline));
	const accessibleLabel = $derived(label || 'Loading');
</script>

<div
	class="spinner-wrap {size} {inline ? 'inline' : 'block'}"
	role="status"
	aria-live="polite"
	style={color ? `--spinner-color: ${color};` : undefined}
>
	<span class="spinner" aria-hidden="true"></span>
	{#if labelVisible}
		<span class="spinner-label">{label}</span>
	{:else}
		<span class="visually-hidden">{accessibleLabel}</span>
	{/if}
</div>

<style>
	/* ============================================
	   LAYOUT
	   ============================================ */
	.spinner-wrap {
		--spinner-color: var(--gray-darker);
		--spinner-track: var(--gray-700-alpha);
		display: flex;
		align-items: center;
		gap: 0.9rem;
		color: var(--gray-400);
	}

	.spinner-wrap.block {
		flex-direction: column;
		justify-content: center;
	}

	.spinner-wrap.inline {
		display: inline-flex;
		gap: 0.6rem;
		vertical-align: middle;
	}

	/* ============================================
	   SPINNER RING
	   ============================================ */
	.spinner {
		display: block;
		border-radius: 50%;
		border-style: solid;
		border-color: var(--spinner-track);
		border-top-color: var(--spinner-color);
		animation: spinner-rotate 0.7s linear infinite;
	}

	/* ============================================
	   SIZE VARIANTS
	   ============================================ */
	.sm .spinner {
		width: 1.2rem;
		height: 1.2rem;
		border-width: 0.2rem;
	}

	.md .spinner {
		width: 2.2rem;
		height: 2.2rem;
		border-width: 0.25rem;
	}

	.lg .spinner {
		width: 3.2rem;
		height: 3.2rem;
		border-width: 0.3rem;
	}

	/* ============================================
	   LABEL
	   ============================================ */
	.spinner-label {
		font-size: 1.3rem;
		color: var(--gray-400);
	}

	.sm .spinner-label {
		font-size: 1.2rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* ============================================
	   ANIMATION
	   ============================================ */
	@keyframes spinner-rotate {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			/* Slow + ease the motion for motion-sensitive users rather than
			   removing all feedback (which would hide the loading state). */
			animation-duration: 1.8s;
			animation-timing-function: ease-in-out;
		}
	}
</style>
