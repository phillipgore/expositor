<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

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
	};
</script>

<Menu {menuId}>
	{#each menuItems as item}
		{#if item.type === 'button'}
			<IconButton
				id={item.id}
				classes="menu-light full-width justify-content-left"
				label={item.label}
				iconId={item.iconId}
				isActive={item.isActive}
				handleClick={() => handleSelect(item)}
				popovertarget={menuId}
				popovertargetaction="hide"
			/>
		{:else}
			<DividerHorizontal />
		{/if}
	{/each}
</Menu>
