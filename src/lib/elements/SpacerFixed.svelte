<script>
	/**
	 * # SpacerFixed Component
	 * 
	 * Fixed-width spacer element for consistent spacing in layouts.
	 * Commonly used in toolbars and navigation to add horizontal spacing between elements.
	 * 
	 * ## Features
	 * - Configurable fixed width
	 * - Default 2.4rem width
	 * - Simple inline div with no additional styling
	 * 
	 * ## Usage Examples
	 * 
	 * Default spacing:
	 * ```svelte
	 * <Button label="Back" />
	 * <SpacerFixed />
	 * <Button label="Next" />
	 * ```
	 * 
	 * Custom width:
	 * ```svelte
	 * <Icon iconId="home" />
	 * <SpacerFixed width="1rem" />
	 * <span>Home</span>
	 * ```
	 * 
	 * @typedef {Object} SpacerFixedProps
	 * @property {string} [width='2.4rem'] - Fixed width spacing (CSS value)
	 */

	/** @type {SpacerFixedProps} */
	let { width = '2.4rem' } = $props();
</script>

<div style="width: {width ? width : '2.4rem'}"></div>
