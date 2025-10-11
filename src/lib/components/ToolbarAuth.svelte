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
	import SpaceerFixed from '$lib/elements/SpaceerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';
</script>

<Toolbar classes="dark">
	<IconButton
		url="/"
		underLabel="Home"
		iconId="home"
		classes="toolbar-dark"
		underLabelClasses="light"
	></IconButton>

	<SpaceerFixed></SpaceerFixed>

	<IconButton
		url="/signin"
		underLabel="Sign In"
		iconId="account"
		classes="toolbar-dark"
		underLabelClasses="light"
	></IconButton>
	<IconButton
		url="/signup"
		underLabel="Sign Up"
		iconId="plus"
		classes="toolbar-dark"
		underLabelClasses="light"
	></IconButton>

	<SpacerFlex></SpacerFlex>

	<IconButton
		url="/password"
		underLabel="Password"
		iconId="lock"
		classes="toolbar-dark"
		underLabelClasses="light"
	></IconButton>
</Toolbar>
