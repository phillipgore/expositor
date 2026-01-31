<script>
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		sectionId = '',
		isActive = false
	} = $props();

	// Calculate inverse scale to keep toolbar at fixed size when page zooms
	let inverseScale = $derived.by(() => {
		const zoomLevel = $toolbarState.zoomLevel || 100;
		return 100 / zoomLevel;
	});

	// Calculate scaled position offsets to maintain correct positioning at different zoom levels
	let scaledLeft = $derived.by(() => {
		return -3.4 * inverseScale;
	});

	let scaledTop = $derived.by(() => {
		return 0;
	});

	// Button click handler
	function handleSectionSelect(event) {
		// CRITICAL: Stop event propagation to prevent segment click handler from firing
		event?.stopPropagation();
		event?.preventDefault();
		
		console.log('[TOOLBAR] Section Select clicked for section:', sectionId);
		console.log('[TOOLBAR] Current isActive:', isActive);
		
		if (isActive) {
			console.log('[TOOLBAR] Deactivating section mode, dispatching deselect-section event');
			// Deactivating - dispatch event to reactivate segment
			window.dispatchEvent(new CustomEvent('deselect-section', {
				detail: { sectionId }
			}));
			console.log('[TOOLBAR] deselect-section event dispatched');
		} else {
			console.log('[TOOLBAR] Activating section mode, dispatching select-section event');
			// Dispatch event to parent to activate section
			window.dispatchEvent(new CustomEvent('select-section', {
				detail: { sectionId }
			}));
			console.log('[TOOLBAR] select-section event dispatched');
		}
	}
</script>

<div class="controls" style="transform: scale({inverseScale}); transform-origin: top left; left: {scaledLeft}rem; top: {scaledTop}rem;" transition:fade={{ duration: 150, easing: quintOut }}>
	<IconButton
		iconId="outline-section"
		classes="passage-toolbar"
		title="Section Select"
		isSquare
		isActive={isActive}
		handleClick={handleSectionSelect}
	/>
</div>

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
		overflow: hidden;
		gap: 0.3rem;
		z-index: 11;
	}
</style>
