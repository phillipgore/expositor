<script>
	import Button from '$lib/elements/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<Button
		classes="menu-light justify-content-left"
		iconId="book"
		label="Open Study"
		url="/open"
		shortcut="<span>&#8984;SO</span>"
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="plus"
		label="New Study"
		url="/new"
		shortcut="<span>&#8984;SN</span>"
	/>

	<!-- <DividerHorizontal></DividerHorizontal>

	<Button
		classes="menu-light justify-content-left"
		iconId="pencil"
		label="Edit Study"
		shortcut="<span>&#8984;SE</span>"
		isDisabled
	/> -->
</Menu>
