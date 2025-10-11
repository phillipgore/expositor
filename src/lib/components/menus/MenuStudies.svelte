<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuStudies' } = $props();
</script>

<Menu {menuId}>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="book"
		label="Open Study"
		url="/open"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="plus"
		label="New Study"
		url="/new"
		popovertarget={menuId}
		popovertargetaction="hide"
	/>

	<!-- <DividerHorizontal></DividerHorizontal>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="pencil"
		label="Edit Study"
		isDisabled
	/> -->
</Menu>
