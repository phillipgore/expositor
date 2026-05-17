<script>
	/**
	 * # ViewportWarning Component
	 *
	 * Full-screen overlay that blocks the app on unsupported devices.
	 * Triggers under any of three conditions (CSS media queries — no JS required):
	 *
	 *   1. Screen width  < 744px  (phones / very small tablets)
	 *   2. Screen height < 600px  (landscape phones / short viewports)
	 *   3. Primary pointer is coarse  (touch-only device — no mouse or trackpad attached)
	 *
	 * Condition 3 catches iPads and Android tablets used without a pointing device.
	 * An iPad with a connected Magic Keyboard + Trackpad reports `pointer: fine`
	 * and is therefore NOT blocked — those users have a proper pointing device.
	 *
	 * ## Features
	 * - Completely blocks interaction with the app (z-index: 9999)
	 * - Shows app branding (icon and name)
	 * - Informs users why the app isn't available and what to do
	 * - Pure CSS — zero JavaScript
	 *
	 * ## Usage
	 * ```svelte
	 * <ViewportWarning />
	 * ```
	 *
	 * @component
	 */

	import Icon from '$lib/componentElements/Icon.svelte';
</script>

<div class="viewport-warning">
	<div class="content">
		<div class="branding">
			<Icon iconId="book" isActive={false} classes="warning-icon" />
			<h1>Expositor App</h1>
		</div>
		<div class="message">
			<p>This app is designed for desktop computers.</p>
			<p>
				Please use a desktop or laptop with a mouse or trackpad. The app requires a minimum screen size of 744&times;600 pixels. Touch support is planned for a future update.
			</p>
		</div>
	</div>
</div>

<style>
	.viewport-warning {
		/* Hide by default - only show on small screens */
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100vw;
		height: 100vh;
		background-color: var(--gray-200);
		z-index: 9999;
		overflow: hidden;
	}

	/* Show overlay on screens smaller than 744px width, shorter than 600px height,
	   OR when the primary pointer is coarse (touch-only device — no mouse/trackpad) */
	@media (max-width: 743px), (max-height: 599px), (pointer: coarse) {
		.viewport-warning {
			display: flex;
			align-items: center;
			justify-content: center;
		}
	}

	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 2rem;
		max-width: 50rem;
		text-align: center;
	}

	.branding {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-bottom: 3rem;
	}

	.branding :global(.warning-icon) {
		height: 6rem;
		width: auto;
		max-width: initial;
		margin-bottom: 1.5rem;
		fill: var(--gray-700);
	}

	h1 {
		font-size: 3rem;
		font-weight: 400;
		margin: 0;
		color: var(--gray-700);
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	p {
		font-size: 1.8rem;
		line-height: 1.6;
		margin: 0;
		color: var(--gray-600);
	}

	p:first-child {
		font-weight: 500;
		color: var(--gray-700);
	}
</style>
