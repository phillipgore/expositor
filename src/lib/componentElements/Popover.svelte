<script>
	/**
	 * # Popover Component
	 *
	 * A single, app-level transient message popover ("toast"). Subscribes to the
	 * shared {@link popoverStore} and renders a centered notice whenever a message
	 * is present. The store's `showPopover()` helper handles the auto-dismiss
	 * timer, so this component is purely presentational.
	 *
	 * Mount it once near the root of a page (e.g. the analyze page). Trigger it
	 * from anywhere with:
	 * ```js
	 * import { showPopover } from '$lib/stores/popover.js';
	 * showPopover('Connection already exists. Toggle on connections to see it.');
	 * ```
	 *
	 * Accessibility: rendered as an `aria-live="polite"` status region so screen
	 * readers announce the message without stealing focus.
	 */
	import { fade, scale } from 'svelte/transition';
	import { popoverStore } from '$lib/stores/popover.js';
</script>

{#if $popoverStore.message}
	<div class="popover-overlay" aria-live="polite" role="status">
		{#key $popoverStore.id}
			<div
				class="popover-toast"
				in:scale={{ duration: 150, start: 0.96 }}
				out:fade={{ duration: 200 }}
			>
				{$popoverStore.message}
			</div>
		{/key}
	</div>
{/if}

<style>
	.popover-overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Non-interactive: clicks pass through to the content beneath. */
		pointer-events: none;
		z-index: 9999;
	}

	.popover-toast {
		max-width: 32rem;
		padding: 1.2rem 1.6rem;
		border-radius: 0.5rem;
		background-color: var(--gray-200);
		color: var(--white);
		font-size: 1.4rem;
		line-height: 1.5;
		text-align: center;
		box-shadow: 0 0.4rem 1.6rem var(--black-alpha);
	}

</style>
