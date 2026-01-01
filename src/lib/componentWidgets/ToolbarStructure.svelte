<script>
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		isActive = false,
		segmentId = '',
		toolbarMode = $bindable('outline')
	} = $props();

	// Calculate inverse scale to keep toolbar at fixed size when page zooms
	let inverseScale = $derived.by(() => {
		const zoomLevel = $toolbarState.zoomLevel || 100;
		return 100 / zoomLevel;
	});

	// Calculate scaled position offsets to maintain correct positioning at different zoom levels
	// Use inverse scale: when zoomed in (larger), toolbar should be closer; when zoomed out (smaller), farther
	let scaledLeft = $derived.by(() => {
		return -3.4 * inverseScale;
	});

	let scaledTop = $derived.by(() => {
		return 0;
	});

	// Button click handlers
	function handleActiveChange(buttonId) {
		if (buttonId === 'section') {
			// Toggle between color and outline modes
			toolbarMode = toolbarMode === 'color' ? 'outline' : 'color';
		}
		// Column select functionality will be implemented later
	}
</script>

{#if isActive}
	<div class="controls" style="transform: scale({inverseScale}); transform-origin: top left; left: {scaledLeft}rem; top: {scaledTop}rem;" transition:fade={{ duration: 150, easing: quintOut }}>
		<ButtonGrouped
			buttons={[
				{ id: 'column', iconId: 'outline-column', label: '', title: 'Column Select' },
				{ id: 'section', iconId: 'split', label: '', title: 'Section Select' }
			]}
			activeButton={null}
			onActiveChange={handleActiveChange}
			buttonClasses='passage-toolbar'
			isSquare
			isList
		/>
	</div>
{/if}

<style>
	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		content: " ";
		width: 3.4rem;
		position: absolute;
		left: -3.4rem;
		top: 0;
		min-height: calc(100% - 1.2rem);
		overflow: hidden;
		gap: 0.6rem;
	}

	.controls :global(.group-container) {
		margin: 0.0rem;
	}
</style>
