<script>
	/**
	 * ConnectionsOverlay Component
	 *
	 * Renders SVG bezier curves between connected segments.
	 * Positioned absolutely inside .analyze-content-inner so it shares
	 * the same CSS-transform coordinate space as the segments.
	 *
	 * Supports drag-and-drop rerouting: grab a node (circle) and drop it
	 * onto a different segment to update one end of the connection.
	 *
	 * Coordinate math:
	 *   - getBoundingClientRect() returns viewport pixels (post-transform)
	 *   - The SVG's internal coordinate system is pre-transform CSS pixels
	 *   - To convert: svgCoord = (viewportCoord - svgOriginViewport) / scale
	 *
	 * Props:
	 *   connections  - Array of { id, fromSegmentId, toSegmentId } from DB
	 *   scale        - Current CSS scale factor (e.g. 1.0, 1.5, 0.75)
	 */

	import { onMount, onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let {
		connections = [],
		scale = 1
	} = $props();

	/** @type {SVGSVGElement | null} */
	let svgElement = $state(null);

	/** @type {Array<{ id: string, d: string, x1: number, y1: number, x2: number, y2: number }>} */
	let paths = $state([]);

	/**
	 * Active drag state, or null when not dragging.
	 * @type {{ connectionId: string, end: 'from'|'to', fixedSegmentId: string|null, fixedX: number, fixedY: number, cursorX: number, cursorY: number, hoveredSegmentId: string|null } | null}
	 */
	let drag = $state(null);

	let resizeObserver = /** @type {ResizeObserver | null} */ (null);
	let scrollContainer = /** @type {HTMLElement | null} */ (null);

	// ─── Coordinate helpers ──────────────────────────────────────────────────────

	/**
	 * Convert viewport client coordinates to SVG local coordinates.
	 * @param {number} clientX
	 * @param {number} clientY
	 * @returns {{ x: number, y: number }}
	 */
	function toSvgCoords(clientX, clientY) {
		if (!svgElement) return { x: 0, y: 0 };
		const r = svgElement.getBoundingClientRect();
		return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
	}

	// ─── Path calculation ────────────────────────────────────────────────────────

	/**
	 * Recalculate all SVG path data from current segment DOM positions.
	 */
	function calculatePaths() {
		if (!svgElement || !connections.length) {
			paths = [];
			return;
		}

		const svgRect = svgElement.getBoundingClientRect();
		if (svgRect.width === 0 && svgRect.height === 0) {
			paths = [];
			return;
		}

		const newPaths = [];

		for (const connection of connections) {
			const fromEl = document.querySelector(`[data-segment-id="${connection.fromSegmentId}"]`);
			const toEl = document.querySelector(`[data-segment-id="${connection.toSegmentId}"]`);

			if (!fromEl || !toEl) continue;

			const fromRect = fromEl.getBoundingClientRect();
			const toRect = toEl.getBoundingClientRect();

			if (fromRect.width === 0 || toRect.width === 0) continue;

			const y1 = (fromRect.top + fromRect.height / 2 - svgRect.top) / scale;
			const y2 = (toRect.top + toRect.height / 2 - svgRect.top) / scale;

			const fromCenterX = (fromRect.left + fromRect.right) / 2;
			const toCenterX = (toRect.left + toRect.right) / 2;
			const SAME_COLUMN_PX = 20;

			let d, ex1, ex2;
			if (Math.abs(fromCenterX - toCenterX) < SAME_COLUMN_PX) {
				ex1 = (fromRect.right - svgRect.left) / scale;
				ex2 = (toRect.right - svgRect.left) / scale;
				const curvature = Math.max(48, Math.abs(y2 - y1) * 0.35);
				d = `M ${ex1},${y1} C ${ex1 + curvature},${y1} ${ex2 + curvature},${y2} ${ex2},${y2}`;
			} else if (fromCenterX < toCenterX) {
				ex1 = (fromRect.right - svgRect.left) / scale;
				ex2 = (toRect.left - svgRect.left) / scale;
				const curvature = Math.max(20, (ex2 - ex1) * 0.4);
				d = `M ${ex1},${y1} C ${ex1 + curvature},${y1} ${ex2 - curvature},${y2} ${ex2},${y2}`;
			} else {
				ex1 = (fromRect.left - svgRect.left) / scale;
				ex2 = (toRect.right - svgRect.left) / scale;
				const curvature = Math.max(20, (ex1 - ex2) * 0.4);
				d = `M ${ex1},${y1} C ${ex1 - curvature},${y1} ${ex2 + curvature},${y2} ${ex2},${y2}`;
			}

			newPaths.push({ id: connection.id, d, x1: ex1, y1, x2: ex2, y2 });
		}

		paths = newPaths;
	}

	// ─── Drag handlers ───────────────────────────────────────────────────────────

	/**
	 * Begin dragging an endpoint node.
	 * @param {PointerEvent} event
	 * @param {{ id: string, x1: number, y1: number, x2: number, y2: number }} path
	 * @param {'from'|'to'} end - Which end of the connection is being dragged
	 */
	function startDrag(event, path, end) {
		event.preventDefault();
		event.stopPropagation();

		// The "fixed" side stays put; the "dragged" side follows the cursor
		const fixedX = end === 'from' ? path.x2 : path.x1;
		const fixedY = end === 'from' ? path.y2 : path.y1;
		const dragX  = end === 'from' ? path.x1 : path.x2;
		const dragY  = end === 'from' ? path.y1 : path.y2;

		// Identify which segment ID is on the fixed end (cannot drop back there)
		const conn = connections.find(c => c.id === path.id);
		const fixedSegmentId = end === 'from' ? (conn?.toSegmentId ?? null) : (conn?.fromSegmentId ?? null);

		drag = { connectionId: path.id, end, fixedSegmentId, fixedX, fixedY, cursorX: dragX, cursorY: dragY, hoveredSegmentId: null };
	}

	/**
	 * Track cursor and highlight potential drop target while dragging.
	 * @param {PointerEvent} event
	 */
	function handlePointerMove(event) {
		if (!drag) return;
		event.preventDefault();

		const { x, y } = toSvgCoords(event.clientX, event.clientY);
		drag.cursorX = x;
		drag.cursorY = y;

		// Hit-test: find the topmost segment element under the cursor
		// Temporarily hide the SVG so elementsFromPoint can reach the segments below
		const wasVisible = svgElement?.style.display;
		if (svgElement) svgElement.style.pointerEvents = 'none';

		const hits = document.elementsFromPoint(event.clientX, event.clientY);

		if (svgElement) svgElement.style.pointerEvents = '';

		const segmentEl = hits.find(el => el instanceof HTMLElement && el.dataset.segmentId);
		const hoveredId = segmentEl instanceof HTMLElement ? (segmentEl.dataset.segmentId ?? null) : null;

		drag.hoveredSegmentId = hoveredId;

		// Update drop-target CSS class
		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
		if (hoveredId && hoveredId !== drag.fixedSegmentId && segmentEl) {
			segmentEl.classList.add('connection-drop-target');
		}
	}

	/**
	 * Complete or cancel the drag on pointer release.
	 * @param {PointerEvent} event
	 */
	async function handlePointerUp(event) {
		if (!drag) return;

		const { connectionId, end, fixedSegmentId, hoveredSegmentId } = drag;

		// Cleanup visual state
		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
		drag = null;

		// Valid drop: hovering a segment that isn't the fixed end
		if (!hoveredSegmentId || hoveredSegmentId === fixedSegmentId) return;

		try {
			const body = end === 'from'
				? { fromSegmentId: hoveredSegmentId }
				: { toSegmentId: hoveredSegmentId };

			const response = await fetch(`/api/segments/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (response.ok) {
				await invalidate('app:studies');
			} else {
				const err = await response.json();
				console.error('Connection reroute error:', err);
			}
		} catch (error) {
			console.error('Connection reroute network error:', error);
		}
	}

	// ─── Reactivity ─────────────────────────────────────────────────────────────

	$effect(() => {
		const _conn    = connections;
		const _scale   = scale;
		const _visible = $toolbarState.connectionsVisible;
		const _studies = $toolbarState.studiesPanelOpen;
		const _comment = $toolbarState.commentaryPanelOpen;
		const _wide    = $toolbarState.wideLayout;
		const _overview = $toolbarState.overviewMode;
		requestAnimationFrame(calculatePaths);
	});

	// ─── Lifecycle ───────────────────────────────────────────────────────────────

	onMount(() => {
		if (!svgElement) return;

		const contentWrapper = svgElement.closest('.analyze-content-wrapper');
		if (contentWrapper) {
			resizeObserver = new ResizeObserver(() => requestAnimationFrame(calculatePaths));
			resizeObserver.observe(contentWrapper);
		}

		scrollContainer = svgElement.closest('.analyze-content');
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', calculatePaths, { passive: true });
		}

		// Global pointer events for drag (attached to window so drag works if cursor leaves SVG)
		window.addEventListener('pointermove', handlePointerMove, { passive: false });
		window.addEventListener('pointerup', handlePointerUp);

		requestAnimationFrame(calculatePaths);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		scrollContainer?.removeEventListener('scroll', calculatePaths);
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		// Clean up any stray drop-target classes
		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
	});
</script>

<svg
	bind:this={svgElement}
	class="connections-overlay"
	class:connections-overlay--hidden={!$toolbarState.connectionsVisible}
	class:connections-overlay--dragging={!!drag}
	aria-hidden="true"
	focusable="false"
>
	{#each paths as path (path.id)}
		<!-- Draw the existing connection line (dimmed while dragging this specific connection) -->
		<path
			class="connection-path"
			class:connection-path--dimmed={!!drag && drag.connectionId === path.id}
			d={path.d}
			fill="none"
		/>

		<!-- From-end node -->
		<circle
			class="connection-node"
			cx={path.x1} cy={path.y1} r="4"
			onpointerdown={(e) => startDrag(e, path, 'from')}
			onclick={(e) => e.stopPropagation()}
		/>

		<!-- To-end node -->
		<circle
			class="connection-node"
			cx={path.x2} cy={path.y2} r="4"
			onpointerdown={(e) => startDrag(e, path, 'to')}
			onclick={(e) => e.stopPropagation()}
		/>
	{/each}

	<!-- Ghost line shown during drag -->
	{#if drag}
		<line
			class="connection-ghost"
			x1={drag.fixedX} y1={drag.fixedY}
			x2={drag.cursorX} y2={drag.cursorY}
		/>
		<!-- Floating node that follows the cursor -->
		<circle
			class="connection-node connection-node--ghost"
			cx={drag.cursorX} cy={drag.cursorY} r="5"
		/>
	{/if}
</svg>

<style>
	.connections-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		overflow: visible;
		z-index: 5;
	}

	.connections-overlay--hidden {
		display: none;
	}

	/* Change cursor for the whole overlay while a drag is in progress */
	.connections-overlay--dragging {
		cursor: grabbing;
	}

	.connection-path {
		stroke: var(--gray-300);
		stroke-width: 1.5;
		fill: none;
		pointer-events: stroke;
		stroke-linecap: round;
		transition: opacity 0.1s;
	}

	.connection-path--dimmed {
		opacity: 0.3;
	}

	.connection-node {
		fill: var(--gray-600);
		stroke: var(--gray-300);
		stroke-width: 1.5;
		pointer-events: all;
		cursor: grab;
	}

	.connection-node--ghost {
		fill: var(--gray-400);
		stroke: var(--gray-200);
		cursor: grabbing;
		pointer-events: none;
	}

	/* Dashed ghost line during drag */
	.connection-ghost {
		stroke: var(--gray-300);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		stroke-linecap: round;
		pointer-events: none;
	}

	/* Drop-target highlight applied to .segment elements via JS */
	:global(.connection-drop-target) {
		outline: 2px solid var(--blue-400) !important;
		outline-offset: 2px;
		border-radius: 0.3rem;
	}
</style>
