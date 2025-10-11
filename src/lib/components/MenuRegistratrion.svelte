<script>
	import MenuColor from './menus/MenuColor.svelte';
	import MenuLiterary from './menus/MenuLiterary.svelte';
	import MenuSettings from './menus/MenuSettings.svelte';
	import MenuStructure from './menus/MenuStructure.svelte';
	import MenuStudies from './menus/MenuStudies.svelte';
	import MenuText from './menus/MenuText.svelte';
	import MenuZoom from './menus/MenuZoom.svelte';

	let { menuId, isActive, menuOffset, setButtonLabel, closeMenu } = $props();
</script>

{#if menuId === 'MenuStudies'}
	<MenuStudies {isActive} {menuOffset} {closeMenu}></MenuStudies>
{/if}
{#if menuId === 'MenuZoom'}
	<MenuZoom {isActive} {menuOffset} {setButtonLabel} {closeMenu}></MenuZoom>
{/if}
{#if menuId === 'MenuStructure'}
	<MenuStructure {isActive} {menuOffset} {closeMenu}></MenuStructure>
{/if}
{#if menuId === 'MenuText'}
	<MenuText {isActive} {menuOffset} {closeMenu}></MenuText>
{/if}
{#if menuId === 'MenuLiterary'}
	<MenuLiterary {isActive} {menuOffset} {closeMenu}></MenuLiterary>
{/if}
{#if menuId === 'MenuColor'}
	<MenuColor {isActive} {menuOffset} {closeMenu}></MenuColor>
{/if}

{#if menuId === 'MenuSettings'} <MenuSettings {isActive} {menuOffset} {closeMenu}></MenuSettings> {/if}
