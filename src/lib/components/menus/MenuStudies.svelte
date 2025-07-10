<script>
	import Button from '$lib/elements/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<Button
		classes="menu-light justify-content-left"
		iconId="plus-circle"
		label="New"
		shortcut="<span>&#8984;SN</span>"
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="arrow-right-circle"
		label="Open"
		shortcut="<span>&#8984;SO</span>"
	/>

	<DividerHorizontal></DividerHorizontal>

	<Button
		classes="menu-light justify-content-left"
		iconId="arrow-down-square"
		label="New Inner"
		shortcut="<span>&#8984;NI</span>"
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="arrow-up-square"
		label="New Outer"
		shortcut="<span>&#8984;NO</span>"
	/>

	<DividerHorizontal />

	<Button
		classes="menu-light justify-content-left"
		iconId="compare"
		label="New Comparative"
		shortcut="<span>&#8984;NC</span>"
	/>
</Menu>
