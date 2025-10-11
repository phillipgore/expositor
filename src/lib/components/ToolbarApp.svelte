<script>
	import ButtonGrouped from '$lib/elements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import MenuButton from '$lib/elements/buttons/MenuButton.svelte';
	import ToggleButton from '$lib/elements/buttons/ToggleButton.svelte';
	import SpaceerFixed from '$lib/elements/SpaceerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';
	import MenuZoom from '$lib/components/menus/MenuZoom.svelte';
	import MenuStructure from '$lib/components/menus/MenuStructure.svelte';
	import MenuText from '$lib/components/menus/MenuText.svelte';
	import MenuLiterary from '$lib/components/menus/MenuLiterary.svelte';
	import MenuColor from '$lib/components/menus/MenuColor.svelte';

	let zoomLabel = $state('100%');
</script>

<Toolbar classes="dark" position="sticky" zIndex="1000">
	<!-- <MenuButton classes="toolbar-dark" iconId="book" menuId="MenuStudies" underLabelClasses="light" underLabel="Studies"></MenuButton> -->

	<IconButton
		classes="toolbar-dark"
		iconId="book"
		underLabelClasses="light"
		underLabel="Open"
		url="/open"
	></IconButton>

	<IconButton
		classes="toolbar-dark"
		iconId="plus"
		underLabelClasses="light"
		underLabel="New"
		url="/new"
	></IconButton>

	<SpaceerFixed></SpaceerFixed>

	<MenuButton
		classes="toolbar-dark"
		label={zoomLabel}
		menuId="MenuZoom"
		underLabelClasses="light"
		underLabel="Zoom"
	></MenuButton>

	<SpacerFlex></SpacerFlex>

	<MenuButton
		classes="toolbar-dark"
		iconId="pin"
		menuId="MenuStructure"
		underLabelClasses="light"
		underLabel="Outline"
	></MenuButton>

	<MenuButton
		classes="toolbar-dark"
		iconId="text-join"
		menuId="MenuText"
		underLabelClasses="light"
		underLabel="Text"
	></MenuButton>

	<MenuButton classes="toolbar-dark" iconId="literary-chiasim" menuId="MenuLiterary" underLabelClasses="light" underLabel="Literary"></MenuButton>

	<MenuButton
		classes="toolbar-dark"
		iconId="paintbrush"
		menuId="MenuColor"
		underLabelClasses="light"
		underLabel="Color"
	></MenuButton>

	<SpaceerFixed></SpaceerFixed>

	<ToggleButton
		classes="toolbar-dark"
		iconId="note"
		underLabel="Notes"
		underLabelClasses="light"
		isDisabled
	></ToggleButton>

	<ToggleButton
		classes="toolbar-dark"
		iconId="reference"
		underLabel="Verses"
		underLabelClasses="light"
		isDisabled
	></ToggleButton>

	<SpaceerFixed></SpaceerFixed>

	<ToggleButton
		classes="toolbar-dark"
		iconId="wide"
		underLabel="Wide"
		underLabelClasses="light"
		isDisabled
	></ToggleButton>

	<ToggleButton
		classes="toolbar-dark"
		iconId="outline"
		underLabel="Overview"
		underLabelClasses="light"
		isDisabled
	></ToggleButton>

	<SpaceerFixed></SpaceerFixed>

	<IconButton
		classes="toolbar-dark"
		iconId="trashcan"
		underLabelClasses="light"
		underLabel="Delete"
		isDisabled
	></IconButton>

	<SpacerFlex></SpacerFlex>

	<ButtonGrouped
		buttons={[
			{ id: 'analyze', iconId: 'structure', label: 'Analyze' },
			{ id: 'document', iconId: 'document', label: 'Document' }
		]}
		defaultActive="analyze"
		buttonClasses="toolbar-dark"
		underLabelClasses="light"
		isDisabled
	/>

	<SpaceerFixed></SpaceerFixed>

	<IconButton
		classes="toolbar-dark"
		iconId="gear"
		underLabelClasses="light"
		underLabel="Settings"
		url="/settings"
	></IconButton>
</Toolbar>

<MenuZoom menuId="MenuZoom" onselect={(value) => (zoomLabel = value)} />
<MenuStructure menuId="MenuStructure" />
<MenuText menuId="MenuText" />
<MenuLiterary menuId="MenuLiterary" />
<MenuColor menuId="MenuColor" />
