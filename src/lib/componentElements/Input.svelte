<script>
	/**
	 * # Input Component
	 * 
	 * Standard text input field with consistent styling and behavior.
	 * Supports various input types and size variants.
	 * All inputs span their container width (100%).
	 * 
	 * ## Features
	 * - Full-width by default
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
	 * <Input id="username" name="username" bind:value={username} />
	 * ```
	 * 
	 * Email input:
	 * ```svelte
	 * <Input id="email" name="email" type="email" bind:value={email} />
	 * ```
	 * 
	 * Large input:
	 * ```svelte
	 * <Input id="title" name="title" bind:value={title} isLarge />
	 * ```
	 * 
	 * @typedef {Object} InputProps
	 * @property {string} id - Input identifier (required)
	 * @property {string} name - Input name for forms (required)
	 * @property {string} [type='text'] - HTML input type (text, email, password, number, tel, url, etc.)
	 * @property {string} [classes=''] - Additional CSS classes for styling variants
	 * @property {boolean} [isDisabled=false] - Disable input
	 * @property {boolean} [isLarge=false] - Large size variant (4.4rem height, 2rem font)
	 * @property {boolean} [required=false] - Mark input as required with HTML5 validation
	 * @property {string} value - Bindable input value
	 * @property {string} [placeholder] - Placeholder text
	 * @property {(event: KeyboardEvent) => void} [onkeydown] - Keydown event handler
	 */

	/** @type {InputProps} */
	let { id, name, type = 'text', classes = '', isDisabled = false, isLarge = false, required = false, placeholder, onkeydown = undefined, value = $bindable(''), ...restProps } = $props();
</script>

<input
	{id}
	{name}
	{type}
	bind:value
	placeholder={placeholder}
	class="{classes} {isLarge ? 'large' : ''}"
	disabled={isDisabled}
	required={required}
	aria-required={required}
	onkeydown={onkeydown}
	{...restProps}
/>

<style>
	/* ============================================
	   BASE INPUT STYLES
	   ============================================ */
	input {
		font-family: inherit;
		appearance: none;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.3rem;
		height: 2.8rem;
		padding: 0rem 0.9rem;
		font-size: 1.4rem;
		color: var(--black);
		background-color: var(--white);
		width: 100%;
	}

	/* ============================================
	   SIZE VARIANTS
	   ============================================ */
	input.large {
		height: 4.4rem;
		padding: 0rem 1.2rem;
		font-size: 2rem;
	}

	/* ============================================
	   STATE STYLES
	   ============================================ */
	input:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
	}

	input:disabled {
		background-color: var(--gray-900);
	}

	/* ============================================
	   CONTEXT VARIANTS - Heading Inputs
	   ============================================ */
	
	/* Heading One Input */
	input.heading-one-input {
		font-size: 1.4rem;
		font-weight: 700;
		text-align: center;
		padding: 0.6rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		border-radius: 0rem;
		color: var(--white);
		background-color: var(--section-darker);
		border-color: var(--section-darker);
		caret-color: var(--white);
		height: auto;
		line-height: 1.5;
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
		border-bottom-style: dashed;
		border-bottom-color: var(--section-lighter);
		transition: border 0.2s ease-in-out;
	}

	input.heading-one-input:focus {
		outline: none;
		box-shadow: none;
	}

	input.heading-one-input::placeholder {
		color: var(--section-darker);
		opacity: 0.3;
	}

	/* Heading Two Input */
	input.heading-two-input {
		font-size: 1.2rem;
		font-weight: 700;
		padding: 0.6rem;
		margin: 0.0rem;
		border-bottom: 0.1rem dashed;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-top: 0rem;
		border-radius: 0rem;
		background-color: var(--section-lighter);
		color: var(--section-darker);
		border-color: var(--section-dark);
		caret-color: var(--section-darker);
		height: auto;
		line-height: 1.5;
		transition: border 0.2s ease-in-out;
	}

	input.heading-two-input:focus {
		outline: none;
		box-shadow: none;
	}

	input.heading-two-input::placeholder {
		color: var(--section-darker);
		opacity: 0.3;
	}

	/* Heading Three Input */
	input.heading-three-input {
		font-size: 1.2rem;
		font-weight: 700;
		padding: 0.4rem 0.6rem 0.3rem;
		margin: 0.0rem 0.0rem -0.1rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-top: 0rem;
		border-radius: 0rem;
		background-color: transparent;
		color: var(--gray-100);
		border-color: var(--section-dark);
		caret-color: var(--section-darker);
		height: auto;
		line-height: 1.5;
		border-bottom: 0.1rem dashed var(--section-dark);
		transition: padding 0.2s ease-in-out, border-bottom 0.2s ease-in-out, margin 0.2s ease-in-out;
	}

	input.heading-three-input:focus {
		outline: none;
		box-shadow: none;
	}

	input.heading-three-input::placeholder {
		color: var(--gray-100);
		opacity: 0.3;
	}
</style>
