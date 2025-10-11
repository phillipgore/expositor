<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuSettings' } = $props();
</script>

<Menu {menuId} alignment="end">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="account"
		label="Account"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="toolbar"
		label="Toolbar"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="help"
		label="Help"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="power"
		label="Sign Out"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>
</Menu>
