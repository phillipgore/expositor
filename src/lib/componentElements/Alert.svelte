<script>
	import { slide } from 'svelte/transition';

	/**
	 * # Alert Component
	 * 
	 * Notification component for displaying messages with different severity levels.
	 * Automatically shows/hides based on message presence with slide transition.
	 * 
	 * ## Features
	 * - 9 color variants (red, green, yellow, blue, orange, aqua, purple, pink, gray)
	 * - Subtle bordered style option
	 * - Smooth slide transition animation
	 * - Conditional rendering based on message
	 * 
	 * ## Usage Examples
	 * 
	 * Error alert:
	 * ```svelte
	 * <Alert color="red" look="subtle" message={errorMessage} />
	 * ```
	 * 
	 * Success message:
	 * ```svelte
	 * <Alert color="green" message="Changes saved successfully!" />
	 * ```
	 *
	 * Last item in a modal body, where the footer already supplies padding:
	 * ```svelte
	 * <Alert color="red" look="subtle" message={error} spacingBottom="0rem" />
	 * ```
	 * 
	 * @typedef {'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'aqua' | 'purple' | 'pink' | 'gray'} AlertColor
	 * @typedef {'subtle' | ''} AlertLook
	 */

	/**
	 * @typedef {Object} AlertProps
	 * @property {AlertColor} [color='red'] - Alert color theme
	 * @property {AlertLook} [look=''] - Visual style variant. 'subtle' adds border and lighter background
	 * @property {string} [message=''] - Message text to display. Empty string hides alert
	 * @property {string} [spacingBottom='1.8rem'] - Gap below the alert. The default is the
	 *   form-page rhythm every existing caller relies on; modals pass a smaller value because the
	 *   modal footer already supplies padding. Passed in rather than reached in with `:global`,
	 *   which is not scoped to the calling component - the same reasoning `Checkbox` records for
	 *   its identically named prop, after three call sites there overwrote one another.
	 */

	/** @type {AlertProps} */
	let { color = 'red', look = '', message = '', spacingBottom = '1.8rem' } = $props();
</script>

{#if message}
	<div 
		class="alert {color} {look}" 
		style="margin-bottom: {spacingBottom};"
		transition:slide={{ duration: 300 }}
		role="alert"
		aria-live="polite"
	>
		{message}
	</div>
{/if}

<style>
	/* ============================================
	   BASE ALERT STYLES
	   ============================================ */
	/* `margin-bottom` lives on the element's `style` attribute, fed by the `spacingBottom`
	   prop, so a caller can tighten it without a `:global` rule. Do not reintroduce it here:
	   a stylesheet declaration would not lose to the inline one, but it would mean two places
	   claim the same property. */
	.alert {
		padding: 1rem;
		border-radius: 0.3rem;
		line-height: 1.5;
		width: 100%;
	}

	.alert.subtle {
		border: 1px solid;
	}

	/* ============================================
	   COLOR VARIANTS - Solid
	   ============================================ */
	.alert.red {
		background-color: var(--red);
		color: var(--white);
	}

	.alert.green {
		background-color: var(--green);
		color: var(--white);
	}

	.alert.yellow {
		background-color: var(--yellow);
		color: var(--black);
	}

	.alert.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.alert.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.alert.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.alert.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.alert.pink {
		background-color: var(--pink);
		color: var(--white);
	}

	.alert.gray {
		background-color: var(--gray);
		color: var(--white);
	}

	/* ============================================
	   COLOR VARIANTS - Subtle (Bordered)
	   ============================================ */
	.alert.red.subtle {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border-color: var(--red-light);
	}

	.alert.green.subtle {
		background-color: var(--green-lighter);
		color: var(--green-darker);
		border-color: var(--green-light);
	}

	.alert.yellow.subtle {
		background-color: var(--yellow-lighter);
		color: var(--yellow-darker);
		border-color: var(--yellow-light);
	}

	.alert.blue.subtle {
		background-color: var(--blue-lighter);
		color: var(--blue-darker);
		border-color: var(--blue-light);
	}

	.alert.orange.subtle {
		background-color: var(--orange-lighter);
		color: var(--orange-darker);
		border-color: var(--orange-light);
	}

	.alert.aqua.subtle {
		background-color: var(--aqua-lighter);
		color: var(--aqua-darker);
		border-color: var(--aqua-light);
	}

	.alert.purple.subtle {
		background-color: var(--purple-lighter);
		color: var(--purple-darker);
		border-color: var(--purple-light);
	}

	.alert.pink.subtle {
		background-color: var(--pink-lighter);
		color: var(--pink-darker);
		border-color: var(--pink-light);
	}

	.alert.gray.subtle {
		background-color: var(--gray-lighter);
		color: var(--gray-darker);
		border-color: var(--gray-light);
	}
</style>
