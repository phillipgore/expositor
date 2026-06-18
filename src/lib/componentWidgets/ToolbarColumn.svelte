<script>
	import { fade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { 
		columnId = '',
		isActive = false,
		sectionColor = 'green'
	} = $props();

	// Resolve the control color from the (first) section's color name. The column
	// control sits outside any .section element, so the --section-* variables don't
	// cascade here — we map the color name to the global --{color}-dark variable.
	let controlColor = $derived(`var(--${sectionColor || 'green'}-dark)`);
	let controlLight = $derived(`var(--${sectionColor || 'green'}-light)`);

	// Calculate inverse scale to keep toolbar at fixed size when page zooms
	let inverseScale = $derived.by(() => {
		const zoomLevel = $toolbarState.zoomLevel || 100;
		return 100 / zoomLevel;
	});

	// Calculate scaled position offsets to maintain correct positioning at different zoom levels.
	// Horizontal: the .column has 0.2rem (2px) padding, so -2.7rem aligns this control's right
	// edge with the section control (9px left of the section content).
	// Vertical: -2.5rem (25px) puts the 20px button's bottom edge at -5px; the section radio's
	// top sits ~2px below the column's padding-box top, leaving a 7px gap above the section button.
	// NOTE: when the column's top segment is pushed down, the whole .column box slides down by
	// margin-top: var(--first-section-offset) (see the analyze page's .column rule). This
	// .controls div is position:absolute INSIDE that .column, so it rides down with it
	// automatically — no extra --first-section-offset compensation is needed on `top` here.

	let scaledLeft = $derived.by(() => {
		return -2.7 * inverseScale;
	});

	let scaledTop = $derived.by(() => {
		return -2.5 * inverseScale;
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

	<button
		type="button"
		class="column-checkbox"
		class:active={isActive}
		style="--control-color: {controlColor}; --control-light: {controlLight};"
		title="Column Select"
		aria-label="Column Select"
		aria-pressed={isActive}
		onclick={handleColumnSelect}
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
		left: -2.7rem;
		top: -2.5rem;
		overflow: hidden;
		gap: 0.3rem;
		z-index: 11;
	}

	/* Rounded-square checkbox-style control. Color is resolved from the first
	   section's color name and passed in via the --control-color variable. */
	.column-checkbox {
		box-sizing: border-box;
		width: 2.0rem;
		height: 2.0rem;
		padding: 0.3rem;
		border-radius: 0.4rem;
		border: 0.1rem solid var(--control-color);
		background-color: transparent;
		/* Clip the fill to the content box so padding creates a gap between the
		   filled center and the outline when active (checkbox style). */
		background-clip: content-box;
		cursor: pointer;
		outline: 0;
		transition: background-color 80ms ease-in-out;
	}

	.column-checkbox:hover {
		background-color: var(--control-light);
	}

	.column-checkbox.active {
		background-color: var(--control-color);
	}

	.column-checkbox.active:hover {
		background-color: var(--control-color);
	}

	.column-checkbox:focus-visible {
		outline: 0.2rem solid var(--control-color);
		outline-offset: 0.2rem;
	}
</style>
