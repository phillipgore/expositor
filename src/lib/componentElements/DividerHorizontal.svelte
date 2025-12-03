<script>
	/**
	 * # DividerHorizontal Component
	 * 
	 * Simple horizontal divider line for visually separating content.
	 * Uses adjustable top and bottom spacing and configurable width.
	 * 
	 * ## Features
	 * - Configurable top and bottom spacing
	 * - Customizable width
	 * - Full-width by default
	 * - Subtle gray border
	 * - Inline style for dynamic spacing and width
	 * 
	 * ## Usage Examples
	 * 
	 * Basic divider:
	 * ```svelte
	 * <DividerHorizontal />
	 * ```
	 * 
	 * Custom spacing:
	 * ```svelte
	 * <DividerHorizontal spacingTop="2rem" spacingBottom="2rem" />
	 * ```
	 * 
	 * Custom width:
	 * ```svelte
	 * <DividerHorizontal width="50%" />
	 * <DividerHorizontal width="20rem" />
	 * ```
	 * 
	 * No spacing:
	 * ```svelte
	 * <DividerHorizontal spacingTop="0" spacingBottom="0" />
	 * ```
	 * 
	 * @typedef {Object} DividerHorizontalProps
	 * @property {string} [spacingTop='0.4rem'] - Top margin spacing (CSS value)
	 * @property {string} [spacingBottom='0.4rem'] - Bottom padding spacing (CSS value)
	 * @property {string} [width='100%'] - Width of the divider (CSS value)
	 */

	/** @type {DividerHorizontalProps} */
	let { spacingTop = '0.4rem', spacingBottom = '0.4rem', width = '100%' } = $props();
</script>

<div
	class="horizontal-divider"
	style="margin-top: {spacingTop}; padding-bottom: {spacingBottom}; width: {width}"
></div>

<style>
	.horizontal-divider {
		margin-top: 0.4rem;
		border-top: 0.1rem solid var(--gray-700);
	}
</style>
