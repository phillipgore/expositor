<script>
	/**
	 * MenuZoom Component
	 * 
	 * Zoom level selection menu with predefined percentage options.
	 * Allows users to adjust document zoom from 25% to 400% or set to full width.
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
	 * 
	 * Features:
	 * - 9 predefined zoom levels (25% - 400%)
	 * - Full width option
	 * - Visual checkmark indicator for active zoom level
	 * - Callback support for parent component updates
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';

	let { menuId = 'MenuZoom', onselect } = $props();

	let menuItems = $state([
		{ id: '25', type: 'button', label: '25%', iconId: 'blank', isActive: false },
		{ id: '50', type: 'button', label: '50%', iconId: 'blank', isActive: false },
		{ id: '75', type: 'button', label: '75%', iconId: 'blank', isActive: false },
		{ id: '100', type: 'button', label: '100%', iconId: 'check', isActive: true },
		{ id: '125', type: 'button', label: '125%', iconId: 'blank', isActive: false },
		{ id: '150', type: 'button', label: '150%', iconId: 'blank', isActive: false },
		{ id: '200', type: 'button', label: '200%', iconId: 'blank', isActive: false },
		{ id: '300', type: 'button', label: '300%', iconId: 'blank', isActive: false },
		{ id: '400', type: 'button', label: '400%', iconId: 'blank', isActive: false },
		{ id: 'dividerHorizontalOne', type: 'divider' },
		{ id: 'fullWidth', type: 'button', label: 'Full Width', iconId: 'blank', isActive: false }
	]);

	const handleSelect = (item) => {
		menuItems.forEach((menuItem) => {
			if (menuItem.type === 'button') {
				menuItem.isActive = false;
				menuItem.iconId = 'blank';
			}
		});
		item.isActive = true;
		item.iconId = 'check';
		
		// Call onselect callback if provided
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
			<IconButton
				id={item.id}
				classes="menu-light full-width justify-content-left"
				label={item.label}
				iconId={item.iconId}
				isActive={item.isActive}
				role="menuitem"
				handleClick={() => handleSelect(item)}
			/>
		{:else}
			<DividerHorizontal />
		{/if}
	{/each}
</Menu>
