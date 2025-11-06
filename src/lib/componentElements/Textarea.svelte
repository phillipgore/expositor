<script>
	/**
	 * # Textarea Component
	 * 
	 * Standard textarea field with consistent styling and behavior.
	 * Supports auto-resize functionality and size variants.
	 * All textareas span their container width (100%).
	 * 
	 * ## Features
	 * - Full-width by default
	 * - Large size variant for prominent textareas
	 * - Disabled state with visual feedback
	 * - Focus state with blue highlight
	 * - Bindable value with two-way binding
	 * 
	 * @typedef {Object} TextareaProps
	 * @property {string} id - Textarea identifier (required)
	 * @property {string} name - Textarea name for forms (required)
	 * @property {boolean} [isDisabled=false] - Disable textarea
	 * @property {boolean} [isLarge=false] - Large size variant (larger font)
	 * @property {boolean} [required=false] - Mark textarea as required with HTML5 validation
	 * @property {string} value - Bindable textarea value
	 * @property {string} [placeholder] - Placeholder text
	 * @property {number} [rows=4] - Number of visible text lines
	 */

	/** @type {TextareaProps} */
	let { 
		id, 
		name, 
		isDisabled = false, 
		isLarge = false, 
		required = false, 
		placeholder, 
		rows = 4,
		value = $bindable('') 
	} = $props();
</script>

<textarea
	{id}
	{name}
	bind:value
	{placeholder}
	{rows}
	class="{isLarge ? 'large' : ''}"
	disabled={isDisabled}
	required={required}
	aria-required={required}
></textarea>

<style>
	/* ============================================
	   BASE TEXTAREA STYLES
	   ============================================ */
	textarea {
		appearance: none;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.3rem;
		padding: 0.9rem;
		font-size: 1.4rem;
		font-family: inherit;
		color: var(--black);
		background-color: var(--white);
		width: 100%;
		resize: vertical;
		line-height: 1.5;
	}

	/* ============================================
	   SIZE VARIANTS
	   ============================================ */
	textarea.large {
		padding: 1.2rem;
		font-size: 2rem;
	}

	/* ============================================
	   STATE STYLES
	   ============================================ */
	textarea:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
	}

	textarea:disabled {
		background-color: var(--gray-900);
	}
</style>
