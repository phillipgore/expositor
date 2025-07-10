<script>
	import Button from '$lib/elements/Button.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { id, isActive, menuOffset } = $props();
</script>

<Menu {isActive} {menuOffset}>
	<Button
		classes="menu-light justify-content-left"
		iconId="literary-chiasim"
		label="Chiasim"
		shortcut="<span>&#8984;LC</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="literary-paralell"
		label="Paralellism"
		shortcut="<span>&#8984;LP</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="literary-repeat"
		label="Repetition"
		shortcut="<span>&#8984;LR</span>"
		isDisabled
	/>
	<Button
		classes="menu-light justify-content-left"
		iconId="literary-intensify"
		label="Intensification"
		shortcut="<span>&#8984;LI</span>"
		isDisabled
	/>
</Menu>
