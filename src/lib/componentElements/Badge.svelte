<script>
	/**
	 * # Badge Component
	 *
	 * Short status or summary text on a coloured chip.
	 *
	 * ## Features
	 * - 9 colour variants, solid or `subtle` (lighter fill, bordered)
	 * - `small` size variant
	 * - `isFullWidth` for a badge that spans its container and reads as a bar
	 * - Optional `aria-live`, for a value that updates in place
	 *
	 * ## Usage Examples
	 *
	 * Inline status chip:
	 * ```svelte
	 * <Badge color="green" size="small" look="subtle" message="Verified" />
	 * ```
	 *
	 * A live value that updates in place, as `Stepper` uses it:
	 * ```svelte
	 * <Badge color="blue" look="subtle" ariaLive="polite" message="150 parts · avg 16 verses each" />
	 * ```
	 *
	 * Full-width, for a badge that reads as a bar rather than a chip:
	 * ```svelte
	 * <Badge color="blue" look="subtle" isFullWidth message="Summary of the section below" />
	 * ```
	 *
	 * @typedef {'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'aqua' | 'purple' | 'pink' | 'gray'} BadgeColor
	 * @typedef {'subtle' | ''} BadgeLook
	 * @typedef {'small' | ''} BadgeSize
	 */

	/**
	 * @typedef {Object} BadgeProps
	 * @property {BadgeColor} [color='red'] - Badge colour theme
	 * @property {BadgeSize} [size=''] - Size variant
	 * @property {BadgeLook} [look=''] - Visual style. 'subtle' adds a border and lighter fill
	 * @property {string} [message=''] - Text to display. Empty string hides the badge
	 * @property {boolean} [isFullWidth=false] - Span the container, squaring off the pill radius
	 * @property {'off' | 'polite' | 'assertive'} [ariaLive] - Politeness for a value that
	 *   updates in place
	 * @property {string} [classes=''] - Additional CSS classes
	 */

	/** @type {BadgeProps} */
	let {
		color = 'red',
		size = '',
		look = '',
		message = '',
		isFullWidth = false,
		ariaLive,
		classes = ''
	} = $props();
</script>

{#if message}
	<div
		class="badge {color} {size} {look} {classes} {isFullWidth ? 'full-width' : ''}"
		aria-live={ariaLive}
	>
		{message}
	</div>
{/if}

<style>
	.badge {
		padding: 0.6rem 0.9rem;
		border-radius: 999em;
        font-size: 1.2rem;
        font-weight: 500;
	}

	.badge.subtle {
		border: 1px solid;
	}

	/* A 999em radius on a full-width badge draws a giant lozenge, so the radius squares off to
	   match `Alert`, which is the other full-width block in the same forms. `display: block`
	   because a badge is otherwise sized by its text. */
	.badge.full-width {
		display: block;
		width: 100%;
		border-radius: 0.3rem;
		text-align: center;
	}

	.badge.small {
		padding: 0.3rem 0.6rem;
        font-size: 1.0rem;
	}

	.badge.gray {
		background-color: var(--gray);
		color: var(--white);
	}

	.badge.gray.subtle {
		background-color: var(--gray-lighter);
		color: var(--gray-darker);
		border-color: var(--gray-light);
	}

	.badge.red {
		background-color: var(--red);
		color: var(--white);
	}

	.badge.red.subtle {
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border-color: var(--red-light);
	}

	.badge.orange {
		background-color: var(--orange);
		color: var(--white);
	}

	.badge.orange.subtle {
		background-color: var(--orange-lighter);
		color: var(--orange-darker);
		border-color: var(--orange-light);
	}

	.badge.yellow {
		background-color: var(--yellow-light);
		color: var(--yellow-darker);
	}

	.badge.yellow.subtle {
		background-color: var(--yellow-lighter);
		color: var(--yellow-darker);
		border-color: var(--yellow-light);
	}

	.badge.green {
		background-color: var(--green);
		color: var(--white);
	}

	.badge.green.subtle {
		background-color: var(--green-lighter);
		color: var(--green-darker);
		border-color: var(--green-light);
	}

	.badge.aqua {
		background-color: var(--aqua);
		color: var(--white);
	}

	.badge.aqua.subtle {
		background-color: var(--aqua-lighter);
		color: var(--aqua-darker);
		border-color: var(--aqua-light);
	}

	.badge.blue {
		background-color: var(--blue);
		color: var(--white);
	}

	.badge.blue.subtle {
		background-color: var(--blue-lighter);
		color: var(--blue-darker);
		border-color: var(--blue-light);
	}

	.badge.purple {
		background-color: var(--purple);
		color: var(--white);
	}

	.badge.purple.subtle {
		background-color: var(--purple-lighter);
		color: var(--purple-darker);
		border-color: var(--purple-light);
	}

	.badge.pink {
		background-color: var(--pink);
		color: var(--white);
	}

	.badge.pink.subtle {
		background-color: var(--pink-lighter);
		color: var(--pink-darker);
		border-color: var(--pink-light);
	}
</style>
