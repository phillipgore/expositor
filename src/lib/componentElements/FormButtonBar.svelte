<script>
	/**
	 * # FormButtonBar Component
	 * 
	 * Container for form action buttons with consistent layout and spacing.
	 * Typically used at the bottom of forms for submit/cancel button groups.
	 * 
	 * ## Features
	 * - Right-aligned button layout
	 * - Consistent gap spacing between buttons
	 * - Flexbox layout for proper alignment
	 * - Optional top margin
	 * 
	 * ## Usage Examples
	 * 
	 * Basic form buttons:
	 * ```svelte
	 * <FormButtonBar>
	 *   <Button label="Cancel" classes="gray" />
	 *   <Button label="Save" classes="blue" type="submit" />
	 * </FormButtonBar>
	 * ```
	 * 
	 * With top margin:
	 * ```svelte
	 * <FormButtonBar marginTop>
	 *   <Button label="Back" classes="gray" />
	 *   <Button label="Continue" classes="blue" />
	 * </FormButtonBar>
	 * ```
	 * 
	 * Single button:
	 * ```svelte
	 * <FormButtonBar>
	 *   <Button label="Sign In" classes="blue" type="submit" />
	 * </FormButtonBar>
	 * ```
	 * 
	 * @typedef {Object} FormButtonBarProps
	 * @property {import('svelte').Snippet} children - Button elements (required)
	 * @property {boolean} [marginTop=false] - Add top margin for spacing
	 */

	/** @type {FormButtonBarProps} */
	let { children, marginTop = false } = $props();
</script>

<div class="button-bar {marginTop ? 'margin-top' : ''}">
	{@render children()}
</div>

<style>
	.button-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem;

		/* A child marked `data-align="start"` is pushed to the far left, with the buttons
		   staying right. Used for the large-series confirmation, which belongs beside Save
		   because it gates it. `margin-right: auto` on the child rather than
		   `space-between` on the bar: the latter would spread the buttons apart too. */
		:global([data-align='start']) {
			margin-right: auto;
		}

		&.margin-top {
			margin-top: 1.8rem;
		}
	}
</style>
