<script>
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	let { 
		sectionId = '',
		isActive = false
	} = $props();

	// NOTE: This control renders INSIDE the zoom-transformed content
	// (.analyze-content-inner has transform: scale(currentScale)), so it scales WITH
	// the study at every zoom level/mode automatically. We intentionally do NOT apply
	// an inverse-scale counter-transform here — the button is meant to grow when zooming
	// in and shrink when zooming out, staying proportional to its section. Position is
	// handled purely by the static CSS .controls offsets below.

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

<div class="controls" transition:fade={{ duration: 150, easing: quintOut }}>
	<button
		type="button"
		class="section-radio"
		class:active={isActive}
		title="Section Select"
		aria-label="Section Select"
		aria-pressed={isActive}
		onclick={handleSectionSelect}
	></button>
</div>



<style>
	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		content: " ";
		width: 2.8rem;
		position: absolute;
		left: -2.9rem;
		top: 0;
		overflow: hidden;
		gap: 0.3rem;
		z-index: 11;
	}

	/* Circular radio-style control. Inherits the section's color via the
	   --section-dark CSS variable cascaded from the parent .section element. */
	.section-radio {
		box-sizing: border-box;
		width: 2.0rem;
		height: 2.0rem;
		padding: 0.3rem;
		border-radius: 50%;
		border: 0.1rem solid var(--section-dark);
		background-color: transparent;
		/* Clip the fill to the content box so padding creates a gap between the
		   filled center and the outline when active (radio-button style). */
		background-clip: content-box;
		cursor: pointer;
		outline: 0;
		transition: background-color 80ms ease-in-out;
	}

	.section-radio:hover {
		background-color: var(--section-light);
	}

	.section-radio.active {
		background-color: var(--section-dark);
	}

	.section-radio.active:hover {
		background-color: var(--section-dark);
	}

	.section-radio:focus-visible {
		outline: 0.2rem solid var(--section-dark);
		outline-offset: 0.2rem;
	}
</style>
