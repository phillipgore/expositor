<script>
	/**
	 * MenuStructure Component
	 * 
	 * Document structure management menu for organizing content.
	 * Provides tools for creating sections, columns, and groups,
	 * as well as pinning/unpinning structural elements.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="pin" label="Outline" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Create new sections
	 * - Create new columns
	 * - Create new groups
	 * - Pin/unpin structural elements
	 */

	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/elements/DividerHorizontal.svelte';
	import Menu from '$lib/elements/Menu.svelte';

	let { menuId = 'MenuStructure' } = $props();
</script>

<Menu {menuId} ariaLabel="Document structure menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-section"
		label="New Section"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-column"
		label="New Column"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="outline-group"
		label="New Group"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="unpin"
		label="Unpin"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="pin"
		label="Pin"
		role="menuitem"
		popovertarget={menuId}
		popovertargetaction="hide"
		isDisabled
	/>
</Menu>
