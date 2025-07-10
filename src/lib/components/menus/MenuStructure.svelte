<script>
	import Button from '$lib/elements/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<Button
		classes="menu-light justify-content-left"
		iconId="outline-section"
		label="New Section"
		shortcut="<span>&#8984;OS</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="outline-column"
		label="New Column"
		shortcut="<span>&#8984;OC</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="outline-group"
		label="New Group"
		shortcut="<span>&#8984;OG</span>"
		isDisabled
	/>

	<DividerHorizontal />

	<Button
		classes="menu-light justify-content-left"
		iconId="unpin"
		label="Unpin"
		shortcut="<span>&#8984;OU</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="pin"
		label="Pin"
		shortcut="<span>&#8984;OP</span>"
		isDisabled
	/>
</Menu>
