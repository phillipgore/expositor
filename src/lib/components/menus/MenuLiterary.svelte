<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset, closeMenu } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-chiasim"
		label="Chiasim"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-paralell"
		label="Paralellism"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-repeat"
		label="Repetition"
		handleClick={closeMenu}
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-intensify"
		label="Intensification"
		handleClick={closeMenu}
		isDisabled
	/>
</Menu>
