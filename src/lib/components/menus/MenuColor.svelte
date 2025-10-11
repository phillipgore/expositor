<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<IconButton
		classes="menu-light icon-fill-red justify-content-left"
		iconId="circle"
		label="Red"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-orange justify-content-left"
		iconId="circle"
		iconColor="orange"
		iconStrokeColor="orange"
		label="Orange"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-yellow justify-content-left"
		iconId="circle"
		iconColor="yellow"
		iconStrokeColor="yellow"
		label="Yellow"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-green justify-content-left"
		iconId="circle"
		iconColor="green"
		iconStrokeColor="green"
		label="Green"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-aqua justify-content-left"
		iconId="circle"
		iconColor="aqua"
		iconStrokeColor="aqua"
		label="Aqua"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-blue justify-content-left"
		iconId="circle"
		iconColor="blue"
		iconStrokeColor="blue"
		label="Blue"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-purple justify-content-left"
		iconId="circle"
		iconColor="purple"
		iconStrokeColor="purple"
		label="Purple"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-pink justify-content-left"
		iconId="circle"
		iconColor="pink"
		iconStrokeColor="pink"
		label="Pink"
		handleClick={closeMenu}
		isDisabled
	/>
</Menu>
