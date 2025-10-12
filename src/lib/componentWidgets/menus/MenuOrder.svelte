<script>
	/**
	 * MenuOrder Component
	 * 
	 * Sort order selection menu for studies list.
	 * Allows users to sort studies by title, dates, etc.
	 * 
	 * Usage:
	 * ```
	 * let orderLabel = $state('Title');
	 * <MenuButton label={orderLabel} menuId="MenuOrder" />
	 * <MenuOrder menuId="MenuOrder" onselect={(value) => orderLabel = value} />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuOrder') - Unique identifier for the menu
	 * - onselect (function, optional) - Callback when order selected, receives {id, label}
	 * 
	 * Features:
	 * - 5 sort options (title, Date Opened, Date Added, Date Modified, Date Created)
	 * - Visual checkmark indicator for active sort order
	 * - Callback support for parent component updates
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';

	let { menuId = 'MenuOrder', onselect } = $props();

	let menuItems = $state([
		{ id: 'title', type: 'button', label: 'Title', iconId: 'check', isActive: true },
		{ id: 'dateOpened', type: 'button', label: 'Date Opened', iconId: 'blank', isActive: false },
		{ id: 'dateModified', type: 'button', label: 'Date Modified', iconId: 'blank', isActive: false },
		{ id: 'dateCreated', type: 'button', label: 'Date Created', iconId: 'blank', isActive: false }
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
			onselect({ id: item.id, label: item.label });
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

<Menu {menuId} ariaLabel="Sort order menu">
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
		{/if}
	{/each}
</Menu>
