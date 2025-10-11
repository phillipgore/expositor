<script>
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import ButtonGrouped from '$lib/elements/buttons/ButtonGrouped.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { isActive, menuOffset, setButtonLabel, closeMenu } = $props();

	let groupedItems = $state([
		{ id: '25', type: 'button', label: '25%', iconId: 'blank', isActive: false },
		{ id: '50', type: 'button', label: '50%', iconId: 'blank', isActive: false },
		{ id: '75', type: 'button', label: '75%', iconId: 'blank', isActive: false },
		{ id: '100', type: 'button', label: '100%', iconId: 'check', isActive: true },
		{ id: '125', type: 'button', label: '125%', iconId: 'blank', isActive: false },
		{ id: '150', type: 'button', label: '150%', iconId: 'blank', isActive: false },
		{ id: '200', type: 'button', label: '200%', iconId: 'blank', isActive: false },
		{ id: '300', type: 'button', label: '300%', iconId: 'blank', isActive: false },
		{ id: '400', type: 'button', label: '400%', iconId: 'blank', isActive: false },
		{ id: 'dividerHorizontalOne', type: 'dividerHorizontal' },
		{ id: 'fullWidth', type: 'button', label: 'Full Width', iconId: 'blank', isActive: false }
	]);

	const setIsActive = (button) => {
		groupedItems.forEach((item) => {
			item.isActive = false;
			item.iconId = 'blank';
		});
		let activeItem = groupedItems.find((groupItem) => groupItem.id === button.id);
		activeItem.isActive = true;
		activeItem.iconId = 'check';
		setButtonLabel(activeItem.label);
		closeMenu();
	};
</script>

<Menu {isActive} {menuOffset}>
	<ButtonGrouped isList>
		{#each groupedItems as item}
			{#if item.type === 'button'}
				<IconButton
					id={item.id}
					classes="menu-light full-width justify-content-left"
					label={item.label}
					iconId={item.iconId}
					isActive={item.isActive}
					groupedIsActive={setIsActive}
				/>
			{:else}
				<DividerHorizontal />
			{/if}
		{/each}
	</ButtonGrouped>
</Menu>
