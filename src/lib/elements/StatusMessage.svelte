<script>
	/**
	 * # StatusMessage Component
	 * 
	 * Centered status message display for loading states, empty states,
	 * or informational messages.
	 * 
	 * ## Features
	 * - Center-aligned text
	 * - Muted gray color
	 * - Top margin for spacing
	 * - Simple, minimal styling
	 * 
	 * ## Usage Examples
	 * 
	 * Loading state:
	 * ```svelte
	 * <StatusMessage>
	 *   <p>Loading...</p>
	 * </StatusMessage>
	 * ```
	 * 
	 * Validating state:
	 * ```svelte
	 * <StatusMessage>
	 *   <p>Validating your information...</p>
	 * </StatusMessage>
	 * ```
	 * 
	 * Empty state:
	 * ```svelte
	 * <StatusMessage>
	 *   <p>No items found</p>
	 * </StatusMessage>
	 * ```
	 * 
	 * @typedef {Object} StatusMessageProps
	 * @property {import('svelte').Snippet} children - Status message content (required)
	 */

	/** @type {StatusMessageProps} */
	let { children } = $props();
</script>

<div class="status-message">
	{@render children()}
</div>

<style>
	.status-message {
		margin-top: 2.7rem;
		text-align: center;
		color: var(--gray-500);
	}
</style>
