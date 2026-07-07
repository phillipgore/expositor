<script>
	/**
	 * # ToolbarBackOffice Component
	 * 
	 * Blue toolbar for the admin Back Office pages.
	 * 
	 * ## Features
	 * - Dark blue themed toolbar (distinct from the app's dark toolbar)
	 * - Account dropdown menu (user info, Application link, Sign Out)
	 * 
	 * ## Layout Structure
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

	import MenuButton from '$lib/componentElements/buttons/MenuButton.svelte';
	import SpacerFlex from '$lib/componentElements/SpacerFlex.svelte';
	import Toolbar from '$lib/componentElements/Toolbar.svelte';
	import MenuSettings from '$lib/componentWidgets/menus/MenuSettings.svelte';
</script>

<Toolbar classes="blue" position="sticky" zIndex="1000">
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
