<script>
	/**
	 * # ToolbarAuth Component
	 * 
	 * Authentication-specific toolbar for non-authenticated pages.
	 * Provides navigation for sign in, sign up, password recovery, and home.
	 * 
	 * ## Features
	 * - Dark themed toolbar
	 * - Navigation to authentication pages (signin, signup, password reset)
	 * - Home link for returning to landing page
	 * - Responsive layout with flex spacing
	 * 
	 * ## Layout Structure
	 * - Home button (left)
	 * - Fixed spacer
	 * - Sign In and Sign Up buttons (center-left)
	 * - Flexible spacer (pushes remaining items right)
	 * - Password reset button (right)
	 * 
	 * ## Usage
	 * ```svelte
	 * <ToolbarAuth />
	 * ```
	 * 
	 * @component
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import SpacerFixed from '$lib/elements/SpacerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';
	import { getAuthToolbarConfig } from '$lib/utils/toolbarConfig.js';

	// Get toolbar configuration
	const toolbarConfig = getAuthToolbarConfig();
</script>

<Toolbar classes="dark">
	{#each toolbarConfig as item}
		{#if item.type === 'spacer'}
			{#if item.variant === 'fixed'}
				<SpacerFixed />
			{:else if item.variant === 'flex'}
				<SpacerFlex />
			{/if}
		{:else if item.type === 'section'}
			{#each item.items as button}
				{#if button.type === 'icon'}
					<IconButton
						iconId={button.iconId}
						underLabel={button.underLabel}
						href={button.href}
						classes={button.classes}
						underLabelClasses={button.underLabelClasses}
					/>
				{/if}
			{/each}
		{/if}
	{/each}
</Toolbar>
