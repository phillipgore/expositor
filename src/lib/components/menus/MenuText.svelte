<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-split"
		label="Split Text"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-join"
		label="Join Text"
		handleClick={closeMenu}
		isDisabled
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Up"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Down"
		handleClick={closeMenu}
		isDisabled
	/>
</Menu>
