<script>
	/**
	 * # Label Component
	 * 
	 * Form label with flexible sizing and display options.
	 * Supports both text prop and children snippet for custom content.
	 * 
	 * ## Features
	 * - Inline or block display
	 * - Large size variant (1.8rem font)
	 * - Custom color classes (dark variant available)
	 * - Proper form association via `for` attribute
	 * - Snippet support for rich label content
	 * 
	 * ## Usage Examples
	 * 
	 * Simple text label:
	 * ```svelte
	 * <Label forId="email" text="Email Address" />
	 * ```
	 * 
	 * Large label:
	 * ```svelte
	 * <Label forId="title" text="Document Title" isLarge />
	 * ```
	 * 
	 * Custom content with snippet:
	 * ```svelte
	 * <Label forId="terms">
	 *   I agree to the <a href="/terms">terms</a>
	 * </Label>
	 * ```
	 * 
	 * @typedef {Object} LabelProps
	 * @property {string} [classes=''] - Additional CSS classes (use 'dark' for black text)
	 * @property {string} [forId] - ID of associated form element
	 * @property {string} [text=''] - Label text content (ignored if children provided)
	 * @property {boolean} [isInline=false] - Display inline instead of block
	 * @property {boolean} [isLarge=false] - Large size variant (1.8rem font)
	 * @property {import('svelte').Snippet} [children] - Snippet for custom label content
	 */

	/** @type {LabelProps} */
	let { classes = '', forId, text = '', isInline = false, isLarge = false, children } = $props();
</script>

<label for={forId} class="{classes} {isInline ? 'inline' : ''} {isLarge ? 'large' : ''}">
	{#if children}
		{@render children()}
	{:else}
		{text}
	{/if}
</label>

<style>
	label {
		display: flex;
		font-size: 1.4rem;
		color: var(--gray-400);
		font-weight: 500;
		margin-bottom: 0.6rem;

		&.inline {
			display: inline;
		}

		&.large {
			font-size: 1.8rem;
		}

		&.dark {
			color: var(--black);
		}
	}
</style>
