<script>
	/**
	 * MenuColor Component
	 * 
	 * Color menu. The 8 colors (red, orange, yellow, green, aqua, blue, purple,
	 * pink) color the selected sections/segments — or, when connection lines are
	 * selected, those lines. Gray (the default) and Mixed (fade between the two
	 * connected items' colors) are reserved for connection lines.
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
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
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

	/**
	 * Color the selected connection line(s). Any of the eight colors, plus the
	 * connection-only Gray and Mixed. ConnectionsOverlay listens for the event
	 * (handleSetColor) and applies the color to every selected connection.
	 * @param {string} color
	 */
	function handleConnectionColorSelect(color) {
		window.dispatchEvent(new CustomEvent('connection-set-color', { detail: { color } }));
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	function handleColorSelect(color) {
		// With connection lines selected, the eight colors recolor those lines.
		if ($toolbarState.hasActiveConnection) {
			handleConnectionColorSelect(color.id);
			return;
		}
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
	<!-- The eight colors apply to sections/segments, or — when connection lines
	     are selected — to those lines (solid color). -->
	{#each colors as color (color.id)}
		<IconButton
			classes="menu-light {color.class} justify-content-left"
			iconId="circle"
			label={color.label}
			role="menuitem"
			handleClick={() => handleColorSelect(color)}
			isDisabled={!$toolbarState.hasActiveSection && !$toolbarState.hasActiveSegment && !$toolbarState.hasActiveConnection}
		/>
	{/each}

	<DividerHorizontal />

	<!-- Reserved for connection lines: active only while lines are selected. -->
	<IconButton
		classes="menu-light icon-fill-line-gray justify-content-left"
		iconId="circle"
		label="Gray"
		role="menuitem"
		handleClick={() => handleConnectionColorSelect('gray')}
		isDisabled={!$toolbarState.hasActiveConnection}
	/>

	<!-- Mixed: the icon's circle is drawn in CSS (a two-tone split) rather than
	     from icons.json — see .icon-fill-line-mixed below. -->
	<IconButton
		classes="menu-light icon-fill-line-mixed justify-content-left"
		iconId="circle"
		label="Mixed"
		role="menuitem"
		handleClick={() => handleConnectionColorSelect('mixed')}
		isDisabled={!$toolbarState.hasActiveConnection}
	/>
</Menu>

<style>
	/* Gray (connection lines): the default line gray, outlined like the other
	   color circles. */
	:global(button.menu-light:enabled.icon-fill-line-gray .icon path) {
		fill: var(--gray-300);
		stroke: var(--gray-darker);
		stroke-width: 0.15rem;
	}

	/* Mixed (connection lines): hide the SVG circle and paint a CSS circle with a
	   diagonal two-tone split in its place, same size as the other circles. */
	:global(button.menu-light.icon-fill-line-mixed .icon path) {
		fill: transparent;
	}

	:global(button.menu-light.icon-fill-line-mixed .icon) {
		border-radius: 50%;
		width: 1.4rem;
		box-sizing: border-box;
		border: 0.1rem solid var(--gray-darker);
		background: linear-gradient(135deg, var(--red-light) 50%, var(--blue-light) 50%);
	}

	/* Disabled: plain gray, matching the disabled color circles. */
	:global(button.menu-light:disabled.icon-fill-line-gray .icon path) {
		fill: var(--gray-700);
		stroke: var(--gray-200);
	}

	:global(button.menu-light:disabled.icon-fill-line-mixed .icon) {
		background: var(--gray-700);
		border-color: var(--gray-200);
	}
</style>
