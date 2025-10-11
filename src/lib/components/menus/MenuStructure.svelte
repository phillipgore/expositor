<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-section"
		label="New Section"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-column"
		label="New Column"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-group"
		label="New Group"
		handleClick={closeMenu}
		isDisabled
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="unpin"
		label="Unpin"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="pin"
		label="Pin"
		handleClick={closeMenu}
		isDisabled
	/>
</Menu>
