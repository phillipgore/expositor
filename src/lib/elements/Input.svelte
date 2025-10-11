<script>
	/**
	 * # Input Component
	 * 
	 * Standard text input field with consistent styling and behavior.
	 * Supports various input types and size variants.
	 * 
	 * ## Features
	 * - Full-width and fixed-width modes
	 * - Large size variant for prominent inputs
	 * - Disabled state with visual feedback
	 * - Focus state with blue highlight
	 * - Bindable value with two-way binding
	 * - Support for all HTML input types
	 * 
	 * ## Usage Examples
	 * 
	 * Basic text input:
	 * ```svelte
	 * <Input id="username" name="username" bind:value={username} isFullWidth />
	 * ```
	 * 
	 * Email input:
	 * ```svelte
	 * <Input id="email" name="email" type="email" bind:value={email} isFullWidth />
	 * ```
	 * 
	 * Large input:
	 * ```svelte
	 * <Input id="title" name="title" bind:value={title} isLarge isFullWidth />
	 * ```
	 * 
	 * @typedef {Object} InputProps
	 * @property {string} id - Input identifier (required)
	 * @property {string} name - Input name for forms (required)
	 * @property {string} [type='text'] - HTML input type (text, email, password, number, tel, url, etc.)
	 * @property {boolean} [isFullWidth=false] - Stretch to container width
	 * @property {boolean} [isDisabled=false] - Disable input
	 * @property {boolean} [isLarge=false] - Large size variant (4.4rem height, 2rem font)
	 * @property {string} value - Bindable input value
	 */

	/** @type {InputProps} */
	let { id, name, type = 'text', isFullWidth = false, isDisabled = false, isLarge = false, value = $bindable('') } = $props();
</script>

<input
	{id}
	{name}
	{type}
	bind:value
	class="{isFullWidth ? 'full-width' : ''} {isLarge ? 'large' : ''}"
	disabled={isDisabled}
/>

<style>
	input {
		appearance: none;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.3rem;
		height: 2.6rem;
		padding: 0rem 0.6rem 0rem 0.6rem;
		font-size: 1.4rem;
		color: var(--black);
		background-color: var(--white);

		&.full-width {
			width: 100%;
		}

		&.large {
			height: 4.4rem;
			padding: 0rem 1.2rem 0rem 1.2rem;
			font-size: 2rem;
		}

		&:focus {
			outline: none;
			border-color: var(--blue);
			box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
		}

		&:disabled {
			background-color: var(--gray-900);
		}
	}
</style>
