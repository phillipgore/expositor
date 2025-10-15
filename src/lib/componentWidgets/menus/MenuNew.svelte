<script>
	/**
	 * # MenuNew Component
	 * 
	 * Menu for creating new items (studies and study groups).
	 * 
	 * ## Features
	 * - New Study option - navigates to /new-study
	 * - New Study Group option - navigates to /new-study-group
	 * - Dark themed menu
	 * 
	 * ## Props
	 * @property {string} menuId - Unique identifier for the menu
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuNew menuId="MenuNew" />
	 * ```
	 * 
	 * @component
	 */

	import { goto } from '$app/navigation';
	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	/** @type {{ menuId: string }} Props */
	let { menuId } = $props();

	/** Navigate to new study page */
	const handleNewStudy = () => {
		goto('/new-study');
	};

	/** Navigate to new group page */
	const handleNewGroup = () => {
		goto('/new-study-group');
	};
</script>

<Menu {menuId} classes="dark">
	<IconButton
		iconId="folder"
		label="New Study Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleNewGroup}
	/>
	<IconButton
		iconId="book"
		label="New Study"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleNewStudy}
	/>
</Menu>
