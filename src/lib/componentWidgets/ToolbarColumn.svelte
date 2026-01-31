<script>
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		columnId = '',
		isActive = false
	} = $props();

	// Calculate inverse scale to keep toolbar at fixed size when page zooms
	let inverseScale = $derived.by(() => {
		const zoomLevel = $toolbarState.zoomLevel || 100;
		return 100 / zoomLevel;
	});

	// Calculate scaled position offsets to maintain correct positioning at different zoom levels
	let scaledLeft = $derived.by(() => {
		return -3.2 * inverseScale;
	});

	let scaledTop = $derived.by(() => {
		return -3.2 * inverseScale;
	});

	// Button click handler
	function handleColumnSelect(event) {
		// CRITICAL: Stop event propagation to prevent segment click handler from firing
		event?.stopPropagation();
		event?.preventDefault();
		
		console.log('[TOOLBAR] Column Select clicked for column:', columnId);
		console.log('[TOOLBAR] Current isActive:', isActive);
		
		if (isActive) {
			console.log('[TOOLBAR] Deactivating column mode, dispatching deselect-column event');
			// Deactivating - dispatch event to reactivate segment
			window.dispatchEvent(new CustomEvent('deselect-column', {
				detail: { columnId }
			}));
			console.log('[TOOLBAR] deselect-column event dispatched');
		} else {
			console.log('[TOOLBAR] Activating column mode, dispatching select-column event');
			// Dispatch event to parent to activate column
			window.dispatchEvent(new CustomEvent('select-column', {
				detail: { columnId }
			}));
			console.log('[TOOLBAR] select-column event dispatched');
		}
	}
</script>

<div class="controls" style="transform: scale({inverseScale}); transform-origin: top left; left: {scaledLeft}rem; top: {scaledTop}rem;" transition:fade={{ duration: 150, easing: quintOut }}>
	<IconButton
		iconId="outline-column"
		classes="passage-toolbar"
		title="Column Select"
		isSquare
		isActive={isActive}
		handleClick={handleColumnSelect}
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
		left: -3.2rem;
		top: -3.2rem;
		overflow: hidden;
		gap: 0.3rem;
		z-index: 11;
	}
</style>
