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
		/* Only as wide as the circle, so it doesn't block the Section Spacing grab
		   strip beside it. */
		width: fit-content;
		position: absolute;
		/* In the gap ABOVE the section, on the same row as the column checkbox and just
		   to its right (checkbox at left -2.1rem, 1.8rem wide). Same spot for every
		   section, since sections always have a top gap. Keeps the section's left
		   border free for the segment and column drag handles. The section sits inside
		   the column's 0.2rem padding, so top is 0.2rem higher than the checkbox's
		   -2.3rem to land on the same row. */
		/* Left edge lines up with the left edge of unmoved segments. */
		left: 0;
		top: -2.5rem;
		overflow: hidden;
		gap: 0.3rem;
		/* Above the Section Spacing grab strip (z-index 16), which runs across the
		   section's top edge and overlaps the circle's bottom few px. */
		z-index: 17;
	}

	/* Circular radio-style control. Inherits the section's color via the
	   --section-dark CSS variable cascaded from the parent .section element. */
	.section-radio {
		box-sizing: border-box;
		width: 1.8rem;
		height: 1.8rem;
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
