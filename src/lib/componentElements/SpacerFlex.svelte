<script>
	/**
	 * # SpacerFlex Component
	 * 
	 * Flexible spacer element that expands to fill available space in flex layouts.
	 * Commonly used in toolbars and navigation bars to push elements to opposite sides.
	 * 
	 * ## Features
	 * - Uses flex-grow: 1 to expand
	 * - Takes up all available space
	 * - Optional CSS classes for responsive behavior
	 * - No visual appearance
	 * - Perfect for left/right alignment in toolbars
	 * 
	 * ## Usage Examples
	 * 
	 * Push buttons to opposite ends:
	 * ```svelte
	 * <Toolbar>
	 *   <Button label="Home" />
	 *   <SpacerFlex />
	 *   <Button label="Settings" />
	 * </Toolbar>
	 * ```
	 * 
	 * Multiple elements on each side:
	 * ```svelte
	 * <Toolbar>
	 *   <Button label="Back" />
	 *   <Button label="Forward" />
	 *   <SpacerFlex />
	 *   <Button label="Account" />
	 *   <Button label="Sign Out" />
	 * </Toolbar>
	 * ```
	 * 
	 * With responsive classes:
	 * ```svelte
	 * <Toolbar>
	 *   <Button label="Home" />
	 *   <SpacerFlex classes="hide-at-narrow" />
	 *   <Button label="Settings" />
	 * </Toolbar>
	 * ```
	 * 
	 * @typedef {Object} SpacerFlexProps
	 * @property {string} [classes=''] - Optional CSS classes
	 */

	/** @type {SpacerFlexProps} */
	let { classes = '' } = $props();
</script>

<div class={classes} style="flex-grow: 1"></div>
