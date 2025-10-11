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
	 * @typedef {'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'aqua' | 'purple' | 'pink' | 'gray'} AlertColor
	 * @typedef {'subtle' | ''} AlertLook
	 */

	/**
	 * @typedef {Object} AlertProps
	 * @property {AlertColor} [color='red'] - Alert color theme
	 * @property {AlertLook} [look=''] - Visual style variant. 'subtle' adds border and lighter background
	 * @property {string} [message=''] - Message text to display. Empty string hides alert
	 */

	/** @type {AlertProps} */
	let { color = 'red', look = '', message = '' } = $props();
</script>

{#if message}
	<div 
		class="alert {color} {look}" 
		transition:slide={{ duration: 300 }}
		role="alert"
		aria-live="polite"
	>
		<span class="alert-prefix" aria-hidden="true">
			{#if color === 'red'}⚠️ {/if}
			{#if color === 'green'}✓ {/if}
			{#if color === 'blue'}ℹ️ {/if}
			{#if color === 'yellow'}⚠️ {/if}
			{#if color === 'orange'}⚠️ {/if}
		</span>
		{message}
	</div>
{/if}

<style>
	.alert {
		padding: 1rem;
		border-radius: 0.3rem;
		margin-bottom: 1.8rem;
		line-height: 1.5;
	}

	.alert.subtle {
		border: 1px solid;
	}

	.alert.red {
		background-color: var(--red);
		color: var(--white);
	}

	.alert.red.subtle {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border-color: var(--red-light);
	}

	.alert.green {
		background-color: var(--green);
		color: var(--white);
	}

	.alert.green.subtle {
		background-color: var(--green-lighter);
		color: var(--green-darker);
		border-color: var(--green-light);
	}

	.alert.yellow {
		background-color: var(--yellow);
		color: var(--black);
	}

	.alert.yellow.subtle {
		background-color: var(--yellow-lighter);
		color: var(--yellow-darker);
		border-color: var(--yellow-light);
	}

	.alert.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.alert.blue.subtle {
		background-color: var(--blue-lighter);
		color: var(--blue-darker);
		border-color: var(--blue-light);
	}

	.alert.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.alert.orange.subtle {
		background-color: var(--orange-lighter);
		color: var(--orange-darker);
		border-color: var(--orange-light);
	}

	.alert.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.alert.aqua.subtle {
		background-color: var(--aqua-lighter);
		color: var(--aqua-darker);
		border-color: var(--aqua-light);
	}

	.alert.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.alert.purple.subtle {
		background-color: var(--purple-lighter);
		color: var(--purple-darker);
		border-color: var(--purple-light);
	}

	.alert.pink {
		background-color: var(--pink);
		color: var(--white);
	}

	.alert.pink.subtle {
		background-color: var(--pink-lighter);
		color: var(--pink-darker);
		border-color: var(--pink-light);
	}

	.alert.gray {
		background-color: var(--gray);
		color: var(--white);
	}

	.alert.gray.subtle {
		background-color: var(--gray-lighter);
		color: var(--gray-darker);
		border-color: var(--gray-light);
	}
</style>
