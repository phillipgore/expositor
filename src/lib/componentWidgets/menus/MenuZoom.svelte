<script>
	/**
	 * MenuZoom Component
	 * 
	 * Zoom level selection menu with predefined percentage options plus fit modes.
	 * Allows users to adjust document zoom from 25% to 200%, or use Fit Width / Fit Study.
	 * 
	 * Usage:
	 * ```
	 * let zoomLabel = $state('100%');
	 * <MenuButton label={zoomLabel} menuId="MenuZoom" />
	 * <MenuZoom menuId="MenuZoom" onselect={(value) => zoomLabel = value} />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuZoom') - Unique identifier for the menu
	 * - onselect (function, optional) - Callback when zoom level selected, receives label
	 * - currentLabel (string, default: '100%') - The ACTIVE view's current zoom label
	 *   (e.g. '150%', 'Fit Width'). Drives the checkmark so it reflects the view the
	 *   user is on. Because Analyze and Document keep independent zoom, this label can
	 *   change when the user switches views — the menu mirrors it rather than tracking
	 *   its own click state.
	 *
	 * Features:
	 * - 8 predefined zoom levels (25% - 200%)
	 * - Fit Width option — scales content to fill the viewport width
	 * - Fit Study option — scales content to be fully visible in the viewport
	 * - Visual checkmark indicator for active zoom level
	 * - Callback support for parent component updates
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';

	let { menuId = 'MenuZoom', onselect = undefined, currentLabel = '100%' } = $props();

	const menuItems = [
		{ id: '25', type: 'button', label: '25%' },
		{ id: '50', type: 'button', label: '50%' },
		{ id: '75', type: 'button', label: '75%' },
		{ id: '100', type: 'button', label: '100%' },
		{ id: '110', type: 'button', label: '110%' },
		{ id: '125', type: 'button', label: '125%' },
		{ id: '150', type: 'button', label: '150%' },
		{ id: '200', type: 'button', label: '200%' },
		{ id: 'divider-fit', type: 'divider' },
		{ id: 'fit-width', type: 'button', label: 'Fit Width' },
		{ id: 'fit-study', type: 'button', label: 'Fit Study' }
	];

	const handleSelect = (item) => {
		// Call onselect callback if provided; the parent owns the active state (per view),
		// so the checkmark updates reactively via currentLabel rather than local state.
		if (onselect) {
			onselect(item.label);
		}

		// Close menu after selection
		closeMenu();
	};

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>

<Menu {menuId} ariaLabel="Zoom level menu">
	{#each menuItems as item}
		{#if item.type === 'button'}
			{@const isActive = item.label === currentLabel}
			<IconButton
				id={item.id}
				classes="menu-light full-width justify-content-left"
				label={item.label}
				iconId={isActive ? 'check' : 'blank'}
				{isActive}
				role="menuitem"
				handleClick={() => handleSelect(item)}
			/>
		{:else}
			<DividerHorizontal />
		{/if}
	{/each}
</Menu>

