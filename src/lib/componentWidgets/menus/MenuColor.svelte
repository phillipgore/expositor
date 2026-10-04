<script>
	/**
	 * MenuColor Component
	 * 
	 * Color menu. The 8 colors (red, orange, yellow, green, aqua, blue, purple,
	 * pink) color the selected columns/sections/segments (color is stored per
	 * segment: a column or section recolors every segment it contains, a segment
	 * recolors only itself) — or, when connection lines are
	 * selected, those lines. Gray (the default) and Color to Color (fade between the two
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
	 * connection-only Gray and Color to Color (stored as 'mixed'). ConnectionsOverlay listens for the event
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
	<!-- The eight colors apply to columns/sections/segments, or — when connection lines
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

	<!-- Color to Color: the standard circle icon, filled with a left→right color
	     fade (see .icon-fill-line-mixed below). The gradient is defined once here. -->
	<svg class="color-to-color-defs" aria-hidden="true" focusable="false">
		<defs>
			<linearGradient id="color-to-color-fade" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" class="color-to-color-stop-start" />
				<stop offset="100%" class="color-to-color-stop-end" />
			</linearGradient>
			<!-- Border: the same left→right fade in the colors' darker shades, as
			     each color circle's outline uses its own -darker shade. -->
			<linearGradient id="color-to-color-border" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" class="color-to-color-border-start" />
				<stop offset="100%" class="color-to-color-border-end" />
			</linearGradient>
		</defs>
	</svg>
	<IconButton
		classes="menu-light icon-fill-line-mixed justify-content-left"
		iconId="circle"
		label="Color to Color"
		role="menuitem"
		handleClick={() => handleConnectionColorSelect('mixed')}
		isDisabled={!$toolbarState.hasActiveConnection}
	/>
</Menu>

<style>
	/* Gray (connection lines): styled like the other color circles — a light
	   center with a darker outline (cf. --green-light / --green-darker). Also
	   held on hover/focus so the menu's hover style doesn't repaint it. */
	:global(button.menu-light:enabled.icon-fill-line-gray .icon path),
	:global(button.menu-light:enabled:hover.icon-fill-line-gray .icon path),
	:global(button.menu-light:enabled:focus-visible.icon-fill-line-gray .icon path) {
		fill: var(--gray-light);
		stroke: var(--gray-darker);
		stroke-width: 0.15rem;
	}

	/* Color to Color (connection lines): the SAME SVG circle as the other color
	   items (so size and outline match exactly), filled with a smooth left→right
	   fade (#color-to-color-fade, defined in the template) instead of one color.
	   Held on hover/focus so the menu's hover style doesn't repaint it. */
	:global(button.menu-light:enabled.icon-fill-line-mixed .icon path),
	:global(button.menu-light:enabled:hover.icon-fill-line-mixed .icon path),
	:global(button.menu-light:enabled:focus-visible.icon-fill-line-mixed .icon path) {
		fill: url(#color-to-color-fade);
		stroke: url(#color-to-color-border);
		stroke-width: 0.15rem;
	}

	/* Fade stops: light aqua → light purple (the light shades used by the other
	   color circles). */
	.color-to-color-stop-start {
		stop-color: var(--aqua-light);
	}

	.color-to-color-stop-end {
		stop-color: var(--purple-light);
	}

	/* Border fade: the darker shades, matching how each color circle is outlined
	   in its own -darker shade (e.g. aqua: --aqua-light fill, --aqua-darker edge). */
	.color-to-color-border-start {
		stop-color: var(--aqua-darker);
	}

	.color-to-color-border-end {
		stop-color: var(--purple-darker);
	}

	/* Holds only the gradient definition; takes no space and is never seen. */
	.color-to-color-defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	/* Disabled: plain gray, matching the disabled color circles. */
	:global(button.menu-light:disabled.icon-fill-line-gray .icon path) {
		fill: var(--gray-700);
		stroke: var(--gray-200);
	}

	:global(button.menu-light:disabled.icon-fill-line-mixed .icon path) {
		fill: var(--gray-700);
		stroke: var(--gray-200);
	}
</style>
