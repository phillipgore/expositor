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
	 *   <Button label="Cancel" classes="system-gray" />
	 *   <Button label="Submit" classes="system-blue" type="submit" />
	 * </FormButtonBar>
	 * ```
	 * 
	 * With top margin:
	 * ```svelte
	 * <FormButtonBar marginTop>
	 *   <Button label="Back" classes="system-gray" />
	 *   <Button label="Continue" classes="system-blue" />
	 * </FormButtonBar>
	 * ```
	 * 
	 * Single button:
	 * ```svelte
	 * <FormButtonBar>
	 *   <Button label="Sign In" classes="system-blue" type="submit" />
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
		justify-content: flex-end;
		gap: 0.6rem;

		&.margin-top {
			margin-top: 1.8rem;
		}
	}
</style>
