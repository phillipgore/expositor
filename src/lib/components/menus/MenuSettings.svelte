<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset} classes="menu-right">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="account"
		label="Account"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="toolbar"
		label="Toolbar"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="help"
		label="Help"
		handleClick={closeMenu}
	/>

	<DividerHorizontal />

	<IconButton classes="menu-light justify-content-left" iconId="power" label="Sign Out" labelIsLeft handleClick={closeMenu} />
</Menu>
