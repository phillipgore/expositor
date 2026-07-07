<script>
	/**
	 * # ToolbarBackOffice Component
	 * 
	 * Blue toolbar for the admin Back Office pages.
	 * 
	 * ## Features
	 * - Dark blue themed toolbar (distinct from the app's dark toolbar)
	 * - Grouped page switcher (Settings / Users) on the left
	 * - Account dropdown menu (user info, Application link, Sign Out)
	 * 
	 * ## Layout Structure
	 * - Settings/Users grouped buttons (left, lighter blue)
	 * - Flexible spacer
	 * - Account menu button (right, lighter blue)
	 * 
	 * ## Usage
	 * ```svelte
	 * <ToolbarBackOffice />
	 * ```
	 * 
	 * @component
	 */

	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import MenuButton from '$lib/componentElements/buttons/MenuButton.svelte';
	import SpacerFlex from '$lib/componentElements/SpacerFlex.svelte';
	import Toolbar from '$lib/componentElements/Toolbar.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';

	/** Back Office pages available from the toolbar switcher */
	const pageButtons = [
		{ id: 'settings', iconId: 'gear', label: 'Settings' },
		{ id: 'users', iconId: 'account', label: 'Users' }
	];

	/** Active switcher button derived from the current route (Settings is the default page) */
	let activePageButton = $derived(
		$page.url.pathname.includes('/back-office/users') ? 'users' : 'settings'
	);

	/**
	 * Navigate to the selected Back Office page
	 * @param {string} buttonId
	 */
	function handlePageChange(buttonId) {
		goto(`/back-office/${buttonId}`);
	}
</script>

<Toolbar classes="blue" position="sticky" zIndex="1000">
	<ButtonGrouped
		buttons={pageButtons}
		activeButton={activePageButton}
		buttonClasses="toolbar-blue"
		underLabelClasses="light"
		onActiveChange={handlePageChange}
	/>
	<SpacerFlex />
	<MenuButton
		iconId="account"
		menuId="MenuSettingsBackOffice"
		underLabel="Account"
		underLabelClasses="light"
		classes="toolbar-blue"
	/>
</Toolbar>

<MenuSettings menuId="MenuSettingsBackOffice" alignment="end" inBackOffice={true} />
