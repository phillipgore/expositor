<script>
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
