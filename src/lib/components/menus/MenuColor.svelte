<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuColor' } = $props();
</script>

<Menu {menuId}>
	<IconButton
		classes="menu-light icon-fill-red justify-content-left"
		iconId="circle"
		label="Red"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-orange justify-content-left"
		iconId="circle"
		iconColor="orange"
		iconStrokeColor="orange"
		label="Orange"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-yellow justify-content-left"
		iconId="circle"
		iconColor="yellow"
		iconStrokeColor="yellow"
		label="Yellow"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-green justify-content-left"
		iconId="circle"
		iconColor="green"
		iconStrokeColor="green"
		label="Green"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-aqua justify-content-left"
		iconId="circle"
		iconColor="aqua"
		iconStrokeColor="aqua"
		label="Aqua"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-blue justify-content-left"
		iconId="circle"
		iconColor="blue"
		iconStrokeColor="blue"
		label="Blue"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-purple justify-content-left"
		iconId="circle"
		iconColor="purple"
		iconStrokeColor="purple"
		label="Purple"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light icon-fill-pink justify-content-left"
		iconId="circle"
		iconColor="pink"
		iconStrokeColor="pink"
		label="Pink"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
