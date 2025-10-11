<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="book"
		label="Open Study"
		url="/open"
		handleClick={closeMenu}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="plus"
		label="New Study"
		url="/new"
		handleClick={closeMenu}
	/>

	<!-- <DividerHorizontal></DividerHorizontal>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="pencil"
		label="Edit Study"
		isDisabled
	/> -->
</Menu>
