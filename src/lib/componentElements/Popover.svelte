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
	 * For failures use `showPopoverError()` instead. That variant is styled red, announced
	 * assertively, and stays on screen until dismissed:
	 * ```js
	 * import { showPopoverError } from '$lib/stores/popover.js';
	 * showPopoverError('Failed to insert column');
	 * ```
	 *
	 * Accessibility: notices render as an `aria-live="polite"` status region so screen readers
	 * announce them without stealing focus. Errors use `role="alert"` / `aria-live="assertive"`,
	 * because they answer an action the user just took.
	 */
	import { fade, scale } from 'svelte/transition';
	import { popoverStore, hidePopover } from '$lib/stores/popover.js';
	import Button from '$lib/componentElements/buttons/Button.svelte';

	let isError = $derived($popoverStore.variant === 'error');
</script>

<!--
	The live region's politeness follows the variant. A notice is an aside and must not interrupt
	whatever the screen reader is currently saying; a failure is the answer to something the user
	just asked for, so it takes 'assertive'. `role` moves with it, because the two have to agree.

	⚠️ The overlay stays `pointer-events: none` so a notice never swallows a click meant for the
	page beneath it. An error re-enables them on the TOAST only — it carries a dismiss button, and
	a button that cannot be clicked is worse than no button at all.
-->
{#if $popoverStore.message}
	<div
		class="popover-overlay"
		aria-live={isError ? 'assertive' : 'polite'}
		role={isError ? 'alert' : 'status'}
	>
		{#key $popoverStore.id}
			<div
				class="popover-toast"
				class:error={isError}
				in:scale={{ duration: 150, start: 0.96 }}
				out:fade={{ duration: 200 }}
			>
				<span>{$popoverStore.message}</span>

				<!-- Errors are sticky, so they MUST carry their own way out. A notice dismisses
				     itself and would be offering a control for something already under way. -->
				{#if isError}
					<Button label="Dismiss" classes="gray" handleClick={hidePopover} />
				{/if}
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

	/* The same three colours as `.alert.red.subtle`, so a failure in a toast and a failure in a
	   form are recognisably the same thing. The shadow and the centring stay: it is still a toast. */
	.popover-toast.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
		max-width: 40rem;
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border: 0.1rem solid var(--red-light);
		/* Re-enabled only here; the overlay stays click-through. */
		pointer-events: auto;
	}

</style>
