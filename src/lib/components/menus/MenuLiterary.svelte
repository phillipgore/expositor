<script>
	/**
	 * MenuLiterary Component
	 * 
	 * Literary device markup menu for analyzing biblical text.
	 * Provides tools for identifying and marking various literary devices
	 * such as chiasmus, parallelism, repetition, and intensification.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuLiterary" iconId="literary-chiasim" label="Literary" />
	 * <MenuLiterary menuId="MenuLiterary" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuLiterary') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Mark chiasmus structures
	 * - Identify parallel passages
	 * - Highlight repetition patterns
	 * - Note intensification devices
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuLiterary' } = $props();
</script>

<Menu {menuId} ariaLabel="Literary devices menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-chiasim"
		label="Chiasim"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-paralell"
		label="Paralellism"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-repeat"
		label="Repetition"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="literary-intensify"
		label="Intensification"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
