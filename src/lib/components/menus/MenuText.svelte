<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuText' } = $props();
</script>

<Menu {menuId}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-split"
		label="Split Text"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-join"
		label="Join Text"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Up"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Down"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
