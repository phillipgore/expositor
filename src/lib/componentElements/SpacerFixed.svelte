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
	 * - Optional CSS classes for responsive behavior
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
	 * With responsive classes:
	 * ```svelte
	 * <Button label="Back" />
	 * <SpacerFixed classes="hide-at-narrow" />
	 * <Button label="Next" />
	 * ```
	 * 
	 * @typedef {Object} SpacerFixedProps
	 * @property {string} [width='2.4rem'] - Fixed width spacing (CSS value)
	 * @property {string} [classes=''] - Optional CSS classes
	 */

	/** @type {SpacerFixedProps} */
	let { width = '2.4rem', classes = '' } = $props();
</script>

<div class={classes} style="width: {width ? width : '2.4rem'}"></div>
