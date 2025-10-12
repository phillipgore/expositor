<script>
	/**
	 * # InstructionText Component
	 * 
	 * Wrapper for displaying instructional or help text with consistent styling.
	 * Supports rich content including paragraphs, lists, and other HTML elements.
	 * 
	 * ## Features
	 * - Muted gray color for de-emphasized text
	 * - Proper line height for readability
	 * - Styled paragraphs with bottom margin
	 * - Styled ordered lists with proper indentation
	 * - Global style support for nested elements
	 * 
	 * ## Usage Examples
	 * 
	 * Simple instruction:
	 * ```svelte
	 * <InstructionText>
	 *   Enter your email address and we'll send you a reset link.
	 * </InstructionText>
	 * ```
	 * 
	 * With paragraphs:
	 * ```svelte
	 * <InstructionText>
	 *   <p>First paragraph of instructions.</p>
	 *   <p>Second paragraph with more details.</p>
	 * </InstructionText>
	 * ```
	 * 
	 * With list:
	 * ```svelte
	 * <InstructionText>
	 *   <p>Follow these steps:</p>
	 *   <ol>
	 *     <li>Complete the form</li>
	 *     <li>Click submit</li>
	 *   </ol>
	 * </InstructionText>
	 * ```
	 * 
	 * @typedef {Object} InstructionTextProps
	 * @property {import('svelte').Snippet} children - Instructional content (required)
	 */

	/** @type {InstructionTextProps} */
	let { children } = $props();
</script>

<div class="instructions">
	{@render children()}
</div>

<style>
	.instructions {
		color: var(--gray-500);
		line-height: 1.5;
		margin-bottom: 1.8rem;
	}

	.instructions :global(p) {
		margin: 0.0rem 0.0rem 0.9rem;
	}

	.instructions :global(ol) {
		margin: 0;
		padding-left: 2.4rem;
	}

	.instructions :global(li) {
		margin-bottom: 0.9rem;
	}
</style>
