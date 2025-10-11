<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuLiterary' } = $props();
</script>

<Menu {menuId}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-chiasim"
		label="Chiasim"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-paralell"
		label="Paralellism"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-repeat"
		label="Repetition"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-intensify"
		label="Intensification"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
