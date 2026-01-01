<script>
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		isActive = false,
		segmentId = ''
	} = $props();

	// Track button active states
	let columnSelectActive = $state(false);
	let sectionSelectActive = $state(false);

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

	// Reset button states when toolbar becomes inactive
	$effect(() => {
		if (!isActive) {
			columnSelectActive = false;
			sectionSelectActive = false;
		}
	});

	// Button click handlers
	function handleColumnSelect(event) {
		// CRITICAL: Stop event propagation to prevent segment click handler from firing
		event?.stopPropagation();
		event?.preventDefault();
		
		console.log('[TOOLBAR] Column Select clicked for segment:', segmentId);
		console.log('[TOOLBAR] Current columnSelectActive:', columnSelectActive);
		
		// Toggle column select mode
		columnSelectActive = !columnSelectActive;
		
		console.log('[TOOLBAR] New columnSelectActive:', columnSelectActive);
		
		// If activating column select, deactivate section select
		if (columnSelectActive) {
			console.log('[TOOLBAR] Activating column mode, dispatching select-column event');
			sectionSelectActive = false;
			// Dispatch event to parent to activate column
			window.dispatchEvent(new CustomEvent('select-column', {
				detail: { segmentId }
			}));
			console.log('[TOOLBAR] select-column event dispatched');
		} else {
			console.log('[TOOLBAR] Deactivating column mode, dispatching deselect-column event');
			// Deactivating - dispatch event to reactivate segment
			window.dispatchEvent(new CustomEvent('deselect-column', {
				detail: { segmentId }
			}));
			console.log('[TOOLBAR] deselect-column event dispatched');
		}
	}

	function handleSectionSelect(event) {
		// CRITICAL: Stop event propagation to prevent segment click handler from firing
		event?.stopPropagation();
		event?.preventDefault();
		
		console.log('[TOOLBAR] Section Select clicked for segment:', segmentId);
		
		// Toggle section select mode
		sectionSelectActive = !sectionSelectActive;
		
		// If activating section select, deactivate column select
		if (sectionSelectActive) {
			columnSelectActive = false;
			// Dispatch event to parent to activate section
			window.dispatchEvent(new CustomEvent('select-section', {
				detail: { segmentId }
			}));
		} else {
			// Deactivating - dispatch event to reactivate segment
			window.dispatchEvent(new CustomEvent('deselect-section', {
				detail: { segmentId }
			}));
		}
	}
</script>

{#if isActive}
	<div class="controls" style="transform: scale({inverseScale}); transform-origin: top left; left: {scaledLeft}rem; top: {scaledTop}rem;" transition:fade={{ duration: 150, easing: quintOut }}>
		<IconButton
			iconId="outline-column"
			classes="passage-toolbar"
			title="Column Select"
			isSquare
			isActive={columnSelectActive}
			handleClick={handleColumnSelect}
		/>
		<IconButton
			iconId="split"
			classes="passage-toolbar"
			title="Section Select"
			isSquare
			isActive={sectionSelectActive}
			handleClick={handleSectionSelect}
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
		overflow: hidden;
		gap: 0.3rem;
	}
</style>
