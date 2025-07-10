<script>
	import MenuColor from './menus/MenuColor.svelte';
	import MenuLiterary from './menus/MenuLiterary.svelte';
	import MenuSettings from './menus/MenuSettings.svelte';
	import MenuStructure from './menus/MenuStructure.svelte';
	import MenuStudies from './menus/MenuStudies.svelte';
	import MenuText from './menus/MenuText.svelte';
	import MenuZoom from './menus/MenuZoom.svelte';

	let { menuId, isActive, menuOffset, setButtonLabel } = $props();
</script>

{#if menuId === 'MenuStudies'}
	<MenuStudies {isActive} {menuOffset}></MenuStudies>
{/if}
{#if menuId === 'MenuZoom'}
	<MenuZoom {isActive} {menuOffset} {setButtonLabel}></MenuZoom>
{/if}
{#if menuId === 'MenuStructure'}
	<MenuStructure {isActive} {menuOffset}></MenuStructure>
{/if}
{#if menuId === 'MenuText'}
	<MenuText {isActive} {menuOffset}></MenuText>
{/if}
{#if menuId === 'MenuLiterary'}
	<MenuLiterary {isActive} {menuOffset}></MenuLiterary>
{/if}
{#if menuId === 'MenuColor'}
	<MenuColor {isActive} {menuOffset}></MenuColor>
{/if}

{#if menuId === 'MenuSettings'} <MenuSettings {isActive} {menuOffset}></MenuSettings> {/if}
