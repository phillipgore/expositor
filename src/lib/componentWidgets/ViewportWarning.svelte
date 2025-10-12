<script>
	/**
	 * # ViewportWarning Component
	 * 
	 * Full-screen overlay that appears on devices with viewports smaller than 744px.
	 * Informs users that the app requires a larger screen and suggests using landscape orientation.
	 * 
	 * ## Features
	 * - Only visible on screens < 744px width
	 * - Completely blocks interaction with the app
	 * - Shows app branding (icon and name)
	 * - Provides helpful guidance for users
	 * - Uses app's gray color scheme
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
			<p>This app requires a larger screen to function properly.</p>
			<p>
				Please use a device with a screen width of at least 744 pixels and a screen height of at least 600 pixels. Try rotating your device to landscape orientation.
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

	/* Show overlay on screens smaller than 744px width OR shorter than 600px height */
	@media (max-width: 743px), (max-height: 599px) {
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
