<script>
	import Button from '$lib/elements/Button.svelte';
	import SpaceerFixed from '$lib/elements/SpaceerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';
</script>

<Toolbar classes="dark">
	<Button url="/" underLabel="Home" iconId="home" classes="toolbar-dark" underLabelClasses="light"
	></Button>

	<SpaceerFixed></SpaceerFixed>

	<Button
		url="/signin"
		underLabel="Sign In"
		iconId="account"
		classes="toolbar-dark"
		underLabelClasses="light"
	></Button>
	<Button
		url="/signup"
		underLabel="Sign Up"
		iconId="plus"
		classes="toolbar-dark"
		underLabelClasses="light"
	></Button>

	<SpacerFlex></SpacerFlex>

	<Button
		url="/password"
		underLabel="Password"
		iconId="lock"
		classes="toolbar-dark"
		underLabelClasses="light"
	></Button>
</Toolbar>
