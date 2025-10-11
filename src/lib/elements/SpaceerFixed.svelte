<script>
	/**
	 * # SpaceerFixed Component
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
	 * <SpaceerFixed />
	 * <Button label="Next" />
	 * ```
	 * 
	 * Custom width:
	 * ```svelte
	 * <Icon iconId="home" />
	 * <SpaceerFixed width="1rem" />
	 * <span>Home</span>
	 * ```
	 * 
	 * @typedef {Object} SpaceerFixedProps
	 * @property {string} [width='2.4rem'] - Fixed width spacing (CSS value)
	 */

	/** @type {SpaceerFixedProps} */
	let { width = '2.4rem' } = $props();
</script>

<div style="width: {width ? width : '2.4rem'}"></div>
