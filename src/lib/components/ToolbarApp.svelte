<script>
	import Button from '$lib/elements/Button.svelte';
	import SpaceerFixed from '$lib/elements/SpaceerFixed.svelte';
	import SpacerFlex from '$lib/elements/SpacerFlex.svelte';
	import Toolbar from '$lib/elements/Toolbar.svelte';

	let groupedButtons = $state([
		{
			id: 'analyze',
			iconId: 'structure',
			underLabel: 'Analyze',
			isActive: true,
			isDisabled: false
		},
		{
			id: 'document',
			iconId: 'document',
			underLabel: 'Document',
			isActive: false,
			isDisabled: false
		}
	]);

	const setIsActive = (button) => {
		groupedButtons.forEach((button) => (button.isActive = false));
		groupedButtons.find((gruopButton) => gruopButton.id === button.id).isActive = true;
	};
</script>

<Toolbar classes="dark" position="sticky" zIndex="1000">
	<!-- <Button classes="toolbar-dark" iconId="book" menuId="MenuStudies" underLabelClasses="light" underLabel="Studies"></Button> -->

	<Button
		classes="toolbar-dark"
		iconId="book"
		underLabelClasses="light"
		underLabel="Open"
		url="/open"
	></Button>

	<Button classes="toolbar-dark" iconId="plus" underLabelClasses="light" underLabel="New" url="/new"
	></Button>

	<SpaceerFixed></SpaceerFixed>

	<Button
		classes="toolbar-dark"
		label="100%"
		menuId="MenuZoom"
		underLabelClasses="light"
		underLabel="Zoom"
		isDisabled
	></Button>

	<SpacerFlex></SpacerFlex>

	<Button
		classes="toolbar-dark"
		iconId="pin"
		menuId="MenuStructure"
		underLabelClasses="light"
		underLabel="Outline"
	></Button>

	<Button
		classes="toolbar-dark"
		iconId="text-join"
		menuId="MenuText"
		underLabelClasses="light"
		underLabel="Text"
	></Button>

	<!-- <Button classes="toolbar-dark" iconId="literary-chiasim" menuId="MenuLiterary" underLabelClasses="light" underLabel="Literary"></Button> -->

	<Button
		classes="toolbar-dark"
		iconId="paintbrush"
		menuId="MenuColor"
		underLabelClasses="light"
		underLabel="Color"
	></Button>

	<SpaceerFixed></SpaceerFixed>

	<Button
		classes="toolbar-dark"
		iconId="note"
		isSwitch
		underLabelClasses="light"
		underLabel="Notes"
		isDisabled
	></Button>

	<Button
		classes="toolbar-dark"
		iconId="reference"
		isSwitch
		underLabelClasses="light"
		underLabel="Verses"
		isDisabled
	></Button>

	<SpaceerFixed></SpaceerFixed>

	<Button
		classes="toolbar-dark"
		iconId="wide"
		isSwitch
		underLabelClasses="light"
		underLabel="Wide"
		isDisabled
	></Button>

	<Button
		classes="toolbar-dark"
		iconId="outline"
		isSwitch
		underLabelClasses="light"
		underLabel="Overview"
		isDisabled
	></Button>

	<!-- <SpaceerFixed></SpaceerFixed>

	<ButtonGrouped>
		{#each groupedButtons as button}
			<Button
				id={button.id}
				classes="toolbar-dark grouped"
				iconId={button.iconId}
				underLabelClasses="light"
				underLabel={button.underLabel}
				groupId={button.groupId}
				groupedIsActive={setIsActive}
				isActive={button.isActive}
				isDisabled={button.isDisabled}
			></Button>
		{/each}
	</ButtonGrouped> -->

	<!-- <SpaceerFixed></SpaceerFixed>

	<Button
		classes="toolbar-dark"
		iconId="trashcan"
		underLabelClasses="light"
		underLabel="Delete"
		isDisabled
	></Button> -->

	<SpacerFlex></SpacerFlex>

	<Button
		classes="toolbar-dark"
		iconId="gear"
		underLabelClasses="light"
		underLabel="Settings"
		url="/settings"
	></Button>
</Toolbar>
