<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuStructure' } = $props();
</script>

<Menu {menuId}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-section"
		label="New Section"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-column"
		label="New Column"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-group"
		label="New Group"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="unpin"
		label="Unpin"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="pin"
		label="Pin"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
