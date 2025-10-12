<script>
	/**
	 * MenuColor Component
	 * 
	 * Color highlighting menu for text selection.
	 * Provides 8 color options for highlighting text passages
	 * including red, orange, yellow, green, aqua, blue, purple, and pink.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuColor" iconId="paintbrush" label="Color" />
	 * <MenuColor menuId="MenuColor" onselect={(color) => applyColor(color)} />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuColor') - Unique identifier for the menu
	 * - onselect (function, optional) - Callback when color selected, receives color id
	 * 
	 * Features:
	 * - 8 distinct highlight colors
	 * - Visual color preview with circle icon
	 * - Data-driven for easy color additions
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuColor', onselect } = $props();

	// Color configuration
	const colors = [
		{ id: 'red', label: 'Red', class: 'icon-fill-red' },
		{ id: 'orange', label: 'Orange', class: 'icon-fill-orange' },
		{ id: 'yellow', label: 'Yellow', class: 'icon-fill-yellow' },
		{ id: 'green', label: 'Green', class: 'icon-fill-green' },
		{ id: 'aqua', label: 'Aqua', class: 'icon-fill-aqua' },
		{ id: 'blue', label: 'Blue', class: 'icon-fill-blue' },
		{ id: 'purple', label: 'Purple', class: 'icon-fill-purple' },
		{ id: 'pink', label: 'Pink', class: 'icon-fill-pink' }
	];

	function handleColorSelect(color) {
		if (onselect) {
			onselect(color.id);
		}
		// Close menu after selection
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Color highlighting menu">
	{#each colors as color}
		<IconButton
			classes="menu-light {color.class} justify-content-left"
			iconId="circle"
			label={color.label}
			role="menuitem"
			handleClick={() => handleColorSelect(color)}
			isDisabled={!$toolbarState.canUseColorItems}
		/>
	{/each}
</Menu>
