<script>
	/**
	 * ConnectionsOverlay Component
	 *
	 * Renders SVG bezier curves between connected structural elements.
	 * Each end of a connection can be a different type (cross-type connections).
	 *
	 * Visual language:
	 *   Segment  → ● circle endpoints,  solid line      ──────
	 *   Section  → ■ square endpoints,  dashed line     – – – –
	 *   Column   → ◆ diamond endpoints, dotted line     · · · ·
	 *   Mixed    → dash-dot line                        – · – ·
	 *
	 * Per-end anchor points:
	 *   Segment  → vertical middle of the .segment element
	 *   Section  → top + 12 px of the .section element
	 *   Column   → very top of the .column element
	 *
	 * Each end of the arc (from / to) independently uses its own type for:
	 *   • Anchor position (y-coordinate)
	 *   • Endpoint node shape
	 *
	 * Drag rerouting:
	 *   Grabbing an endpoint reveals drop-target handles on ALL structural elements.
	 *   Proximity detection (≤ SNAP_RADIUS SVG units) snaps the ghost line to the
	 *   nearest handle.  Dropping changes only the dragged end's type and ID —
	 *   the fixed end is preserved exactly, enabling or changing cross-type connections.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { connections = [], scale = 1 } = $props();

	/** @type {SVGSVGElement | null} */
	let svgElement = $state(null);

	/**
	 * @typedef {'segment'|'section'|'column'} ConnType
	 * @typedef {'solid'|'dashed'|'dotted'|'dashdot'} LineStyle
	 * @typedef {{ id: string, d: string, x1: number, y1: number, x2: number, y2: number, fromType: ConnType, toType: ConnType, lineStyle: LineStyle }} PathEntry
	 * @typedef {{ elementId: string, type: ConnType, side: 'left'|'right', x: number, y: number }} Handle
	 */

	/** @type {PathEntry[]} */
	let paths = $state([]);

	/**
	 * Active drag state.
	 * @type {{
	 *   connectionId: string,
	 *   end: 'from'|'to',
	 *   dragEndType: ConnType,    // type of the endpoint being dragged
	 *   fixedElementId: string|null,
	 *   fixedX: number, fixedY: number,
	 *   cursorX: number, cursorY: number,
	 *   activeHandle: Handle|null
	 * } | null}
	 */
	let drag = $state(null);

	/** Drop-target handles computed at drag start. @type {Handle[]} */
	let dropHandles = $state([]);

	const SNAP_RADIUS = 32;
	const COLUMN_ANCHOR_OFFSET_PX  = 5;   // px from top of column element
	const SECTION_ANCHOR_OFFSET_PX = 20;  // px from top of section element

	let resizeObserver = /** @type {ResizeObserver | null} */ (null);
	let scrollContainer = /** @type {HTMLElement | null} */ (null);

	// ─── Coordinate helpers ────────────────────────────────────────────────────

	function toSvgCoords(clientX, clientY) {
		if (!svgElement) return { x: 0, y: 0 };
		const r = svgElement.getBoundingClientRect();
		return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
	}

	/**
	 * Get SVG y-anchor for a bounding rect based on connection type.
	 * @param {DOMRect} rect @param {ConnType} type @param {number} svgTop
	 */
	function getAnchorY(rect, type, svgTop) {
		if (type === 'segment') return (rect.top + rect.height / 2 - svgTop) / scale;
		if (type === 'section') return (rect.top + SECTION_ANCHOR_OFFSET_PX - svgTop) / scale;
		return (rect.top + COLUMN_ANCHOR_OFFSET_PX - svgTop) / scale; // column
	}

	// ─── Line style determination ─────────────────────────────────────────────

	/**
	 * Determine line style from the two endpoint types.
	 * Same-type: use the type's style. Cross-type: dash-dot.
	 * @param {ConnType} fromType @param {ConnType} toType
	 * @returns {LineStyle}
	 */
	function getLineStyle(fromType, toType) {
		if (fromType !== toType) return 'dashdot';
		if (fromType === 'section') return 'dashed';
		if (fromType === 'column') return 'dotted';
		return 'solid';
	}

	// ─── DOM element lookup ───────────────────────────────────────────────────

	/**
	 * Find the DOM element for one end of a connection.
	 * @param {object} connection @param {'from'|'to'} end
	 * @returns {Element|null}
	 */
	function getElementForConnection(connection, end) {
		const type = /** @type {ConnType} */ (end === 'from' ? connection.fromType : connection.toType) || 'segment';
		if (type === 'segment') {
			const id = end === 'from' ? connection.fromSegmentId : connection.toSegmentId;
			return id ? document.querySelector(`[data-segment-id="${id}"]`) : null;
		} else if (type === 'section') {
			const id = end === 'from' ? connection.fromSectionId : connection.toSectionId;
			return id ? document.querySelector(`[data-section-id="${id}"]`) : null;
		} else {
			const id = end === 'from' ? connection.fromColumnId : connection.toColumnId;
			return id ? document.querySelector(`[data-column-id="${id}"]`) : null;
		}
	}

	/**
	 * Get the ID of the fixed end's element (the end NOT being dragged).
	 * @param {object} conn @param {'from'|'to'} draggedEnd
	 * @returns {string|null}
	 */
	function getFixedElementId(conn, draggedEnd) {
		if (draggedEnd === 'from') {
			// Fixed end is 'to'
			const type = conn?.toType || 'segment';
			if (type === 'segment') return conn?.toSegmentId ?? null;
			if (type === 'section') return conn?.toSectionId ?? null;
			return conn?.toColumnId ?? null;
		} else {
			// Fixed end is 'from'
			const type = conn?.fromType || 'segment';
			if (type === 'segment') return conn?.fromSegmentId ?? null;
			if (type === 'section') return conn?.fromSectionId ?? null;
			return conn?.fromColumnId ?? null;
		}
	}

	// ─── Path calculation ─────────────────────────────────────────────────────

	function calculatePaths() {
		if (!svgElement || !connections.length) { paths = []; return; }
		const svgRect = svgElement.getBoundingClientRect();
		if (svgRect.width === 0 && svgRect.height === 0) { paths = []; return; }

		/** @type {PathEntry[]} */
		const newPaths = [];

		for (const connection of connections) {
			const fromType = /** @type {ConnType} */ (connection.fromType || 'segment');
			const toType   = /** @type {ConnType} */ (connection.toType   || 'segment');

			const fromEl = getElementForConnection(connection, 'from');
			const toEl   = getElementForConnection(connection, 'to');
			if (!fromEl || !toEl) continue;

			const fromRect = fromEl.getBoundingClientRect();
			const toRect   = toEl.getBoundingClientRect();
			if (fromRect.width === 0 || toRect.width === 0) continue;

			// Each end uses its OWN type for anchor y
			const y1 = getAnchorY(fromRect, fromType, svgRect.top);
			const y2 = getAnchorY(toRect,   toType,   svgRect.top);

			const fromCenterX = (fromRect.left + fromRect.right) / 2;
			const toCenterX   = (toRect.left   + toRect.right)   / 2;
			const SAME_COL_PX = 20;

			let d, ex1, ex2;
			if (Math.abs(fromCenterX - toCenterX) < SAME_COL_PX) {
				ex1 = (fromRect.right - svgRect.left) / scale;
				ex2 = (toRect.right   - svgRect.left) / scale;
				const curvature = Math.max(48, Math.abs(y2 - y1) * 0.35);
				d = `M ${ex1},${y1} C ${ex1 + curvature},${y1} ${ex2 + curvature},${y2} ${ex2},${y2}`;
			} else if (fromCenterX < toCenterX) {
				ex1 = (fromRect.right - svgRect.left) / scale;
				ex2 = (toRect.left    - svgRect.left) / scale;
				const curvature = Math.max(20, (ex2 - ex1) * 0.4);
				d = `M ${ex1},${y1} C ${ex1 + curvature},${y1} ${ex2 - curvature},${y2} ${ex2},${y2}`;
			} else {
				ex1 = (fromRect.left  - svgRect.left) / scale;
				ex2 = (toRect.right   - svgRect.left) / scale;
				const curvature = Math.max(20, (ex1 - ex2) * 0.4);
				d = `M ${ex1},${y1} C ${ex1 - curvature},${y1} ${ex2 + curvature},${y2} ${ex2},${y2}`;
			}

			newPaths.push({
				id: connection.id,
				d, x1: ex1, y1, x2: ex2, y2,
				fromType, toType,
				lineStyle: getLineStyle(fromType, toType)
			});
		}

		paths = newPaths;
	}

	// ─── Drop handle computation ──────────────────────────────────────────────

	/**
	 * @param {string|null} fixedElementId
	 * @returns {Handle[]}
	 */
	function computeDropHandles(fixedElementId) {
		if (!svgElement) return [];
		const svgRect = svgElement.getBoundingClientRect();
		/** @type {Handle[]} */
		const handles = [];

		document.querySelectorAll('.column[data-column-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.columnId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const y = getAnchorY(rect, 'column', svgRect.top);
			handles.push({ elementId: id, type: 'column', side: 'left',  x: (rect.left  - svgRect.left) / scale, y });
			handles.push({ elementId: id, type: 'column', side: 'right', x: (rect.right - svgRect.left) / scale, y });
		});

		document.querySelectorAll('.section[data-section-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.sectionId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const y = getAnchorY(rect, 'section', svgRect.top);
			handles.push({ elementId: id, type: 'section', side: 'left',  x: (rect.left  - svgRect.left) / scale, y });
			handles.push({ elementId: id, type: 'section', side: 'right', x: (rect.right - svgRect.left) / scale, y });
		});

		document.querySelectorAll('[data-segment-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.segmentId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const y = getAnchorY(rect, 'segment', svgRect.top);
			handles.push({ elementId: id, type: 'segment', side: 'left',  x: (rect.left  - svgRect.left) / scale, y });
			handles.push({ elementId: id, type: 'segment', side: 'right', x: (rect.right - svgRect.left) / scale, y });
		});

		return handles;
	}

	/**
	 * @param {Handle[]} handles @param {number} cursorX @param {number} cursorY
	 * @returns {Handle|null}
	 */
	function findClosestHandle(handles, cursorX, cursorY) {
		let closest = null;
		let minDist = SNAP_RADIUS;
		for (const h of handles) {
			const dist = Math.sqrt((h.x - cursorX) ** 2 + (h.y - cursorY) ** 2);
			if (dist < minDist) { minDist = dist; closest = h; }
		}
		return closest;
	}

	// ─── SVG shape helpers ────────────────────────────────────────────────────

	/**
	 * @param {number} cx @param {number} cy @param {number} [size=5]
	 * @returns {string}
	 */
	function diamondPoints(cx, cy, size = 5) {
		return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
	}

	// ─── Drag handlers ────────────────────────────────────────────────────────

	/**
	 * @param {PointerEvent} event
	 * @param {PathEntry} path
	 * @param {'from'|'to'} end
	 */
	function startDrag(event, path, end) {
		event.preventDefault();
		event.stopPropagation();

		const fixedX = end === 'from' ? path.x2 : path.x1;
		const fixedY = end === 'from' ? path.y2 : path.y1;
		const dragX  = end === 'from' ? path.x1 : path.x2;
		const dragY  = end === 'from' ? path.y1 : path.y2;

		const conn = connections.find(c => c.id === path.id);
		const dragEndType = /** @type {ConnType} */ (end === 'from' ? path.fromType : path.toType);
		const fixedElementId = getFixedElementId(conn, end);

		drag = {
			connectionId: path.id,
			end,
			dragEndType,
			fixedElementId,
			fixedX, fixedY,
			cursorX: dragX, cursorY: dragY,
			activeHandle: null
		};

		dropHandles = computeDropHandles(fixedElementId);
	}

	/** @param {PointerEvent} event */
	function handlePointerMove(event) {
		if (!drag) return;
		event.preventDefault();

		const { x, y } = toSvgCoords(event.clientX, event.clientY);
		drag.cursorX = x;
		drag.cursorY = y;

		const closest = findClosestHandle(dropHandles, x, y);
		drag.activeHandle = closest;

		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
		if (closest) {
			let targetEl = null;
			if (closest.type === 'segment') targetEl = document.querySelector(`[data-segment-id="${closest.elementId}"]`);
			else if (closest.type === 'section') targetEl = document.querySelector(`[data-section-id="${closest.elementId}"]`);
			else targetEl = document.querySelector(`[data-column-id="${closest.elementId}"]`);
			targetEl?.classList.add('connection-drop-target');
		}
	}

	/** @param {PointerEvent} _event */
	async function handlePointerUp(_event) {
		if (!drag) return;

		const { connectionId, end, activeHandle } = drag;

		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
		drag = null;
		dropHandles = [];

		if (!activeHandle) return;

		try {
			// Only update the dragged end — PATCH handler preserves the fixed end
			/** @type {Record<string,string>} */
			const body = {};

			if (end === 'from') {
				body.fromType = activeHandle.type;
				if (activeHandle.type === 'segment') body.fromSegmentId = activeHandle.elementId;
				else if (activeHandle.type === 'section') body.fromSectionId = activeHandle.elementId;
				else body.fromColumnId = activeHandle.elementId;
			} else {
				body.toType = activeHandle.type;
				if (activeHandle.type === 'segment') body.toSegmentId = activeHandle.elementId;
				else if (activeHandle.type === 'section') body.toSectionId = activeHandle.elementId;
				else body.toColumnId = activeHandle.elementId;
			}

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

	// ─── Reactivity ──────────────────────────────────────────────────────────

	$effect(() => {
		const _conn     = connections;
		const _scale    = scale;
		const _visible  = $toolbarState.connectionsVisible;
		const _studies  = $toolbarState.studiesPanelOpen;
		const _comment  = $toolbarState.commentaryPanelOpen;
		const _wide     = $toolbarState.wideLayout;
		const _overview = $toolbarState.overviewMode;
		requestAnimationFrame(calculatePaths);
	});

	// ─── Lifecycle ────────────────────────────────────────────────────────────

	onMount(() => {
		if (!svgElement) return;

		const contentWrapper = svgElement.closest('.analyze-content-wrapper');
		if (contentWrapper) {
			resizeObserver = new ResizeObserver(() => requestAnimationFrame(calculatePaths));
			resizeObserver.observe(contentWrapper);
		}

		scrollContainer = /** @type {HTMLElement|null} */ (svgElement.closest('.analyze-content'));
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', calculatePaths, { passive: true });
		}

		window.addEventListener('pointermove', handlePointerMove, { passive: false });
		window.addEventListener('pointerup', handlePointerUp);

		requestAnimationFrame(calculatePaths);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		scrollContainer?.removeEventListener('scroll', calculatePaths);
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
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
	<!-- ── Existing connections ── -->
	{#each paths as path (path.id)}
		<path
			class="connection-path"
			class:connection-path--dashed={path.lineStyle === 'dashed'}
			class:connection-path--dotted={path.lineStyle === 'dotted'}
			class:connection-path--dashdot={path.lineStyle === 'dashdot'}
			class:connection-path--dimmed={!!drag && drag.connectionId === path.id}
			d={path.d}
			fill="none"
		/>

		<!-- From-end endpoint shape (driven by fromType) -->
		{#if path.fromType === 'segment'}
			<circle class="connection-node" cx={path.x1} cy={path.y1} r="4"
				onpointerdown={(e) => startDrag(e, path, 'from')}
				onclick={(e) => e.stopPropagation()}
			/>
		{:else if path.fromType === 'section'}
			<rect class="connection-node connection-node--square"
				x={path.x1 - 4} y={path.y1 - 4} width="8" height="8"
				onpointerdown={(e) => startDrag(e, path, 'from')}
				onclick={(e) => e.stopPropagation()}
			/>
		{:else if path.fromType === 'column'}
			<polygon class="connection-node connection-node--diamond"
				points={diamondPoints(path.x1, path.y1)}
				onpointerdown={(e) => startDrag(e, path, 'from')}
				onclick={(e) => e.stopPropagation()}
			/>
		{/if}

		<!-- To-end endpoint shape (driven by toType) -->
		{#if path.toType === 'segment'}
			<circle class="connection-node" cx={path.x2} cy={path.y2} r="4"
				onpointerdown={(e) => startDrag(e, path, 'to')}
				onclick={(e) => e.stopPropagation()}
			/>
		{:else if path.toType === 'section'}
			<rect class="connection-node connection-node--square"
				x={path.x2 - 4} y={path.y2 - 4} width="8" height="8"
				onpointerdown={(e) => startDrag(e, path, 'to')}
				onclick={(e) => e.stopPropagation()}
			/>
		{:else if path.toType === 'column'}
			<polygon class="connection-node connection-node--diamond"
				points={diamondPoints(path.x2, path.y2)}
				onpointerdown={(e) => startDrag(e, path, 'to')}
				onclick={(e) => e.stopPropagation()}
			/>
		{/if}
	{/each}

	<!-- ── Drop handles (shown only while dragging) ── -->
	{#if drag}
		{#each dropHandles as handle (`${handle.elementId}-${handle.side}`)}
			{@const isActive = !!drag.activeHandle &&
				drag.activeHandle.elementId === handle.elementId &&
				drag.activeHandle.side === handle.side}

			{#if handle.type === 'segment'}
				<circle class="drop-handle drop-handle--circle"
					class:drop-handle--active={isActive}
					cx={handle.x} cy={handle.y} r="5"
				/>
			{:else if handle.type === 'section'}
				<rect class="drop-handle drop-handle--square"
					class:drop-handle--active={isActive}
					x={handle.x - 5} y={handle.y - 5} width="10" height="10"
				/>
			{:else if handle.type === 'column'}
				<polygon class="drop-handle drop-handle--diamond"
					class:drop-handle--active={isActive}
					points={diamondPoints(handle.x, handle.y, 6)}
				/>
			{/if}
		{/each}

		<!-- Ghost line from fixed point to active handle or cursor -->
		{@const ghostX    = drag.activeHandle?.x    ?? drag.cursorX}
		{@const ghostY    = drag.activeHandle?.y    ?? drag.cursorY}
		{@const ghostType = drag.activeHandle?.type ?? drag.dragEndType}
		<line class="connection-ghost" x1={drag.fixedX} y1={drag.fixedY} x2={ghostX} y2={ghostY} />

		<!-- Ghost endpoint node (shape matches hovered handle type or dragged-end type) -->
		{#if ghostType === 'segment'}
			<circle class="connection-node connection-node--ghost" cx={ghostX} cy={ghostY} r="5" />
		{:else if ghostType === 'section'}
			<rect class="connection-node connection-node--ghost connection-node--square"
				x={ghostX - 5} y={ghostY - 5} width="10" height="10" />
		{:else if ghostType === 'column'}
			<polygon class="connection-node connection-node--ghost connection-node--diamond"
				points={diamondPoints(ghostX, ghostY, 6)} />
		{/if}
	{/if}
</svg>

<style>
	.connections-overlay {
		position: absolute;
		top: 0; left: 0;
		width: 100%; height: 100%;
		pointer-events: none;
		overflow: visible;
		z-index: 5;
	}

	.connections-overlay--hidden { display: none; }
	.connections-overlay--dragging { cursor: grabbing; }

	/* ── Connection lines ── */

	.connection-path {
		stroke: var(--gray-300);
		stroke-width: 1.5;
		fill: none;
		pointer-events: stroke;
		stroke-linecap: round;
		transition: opacity 0.1s;
		/* segment-segment: solid (default) */
	}

	.connection-path--dashed  { stroke-dasharray: 6 4; }      /* section-section */
	.connection-path--dotted  { stroke-dasharray: 2 4; }      /* column-column   */
	.connection-path--dashdot { stroke-dasharray: 6 3 1 3; }  /* cross-type      */
	.connection-path--dimmed  { opacity: 0.3; }

	/* ── Endpoint nodes ── */

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

	/* ── Drop handles ── */

	.drop-handle {
		fill: none;
		stroke: var(--gray-500);
		stroke-width: 1.5;
		pointer-events: none;
		opacity: 0.35;
		transition: opacity 0.08s, fill 0.08s;
	}

	.drop-handle--active {
		fill: var(--gray-600);
		stroke: var(--gray-300);
		opacity: 1;
	}

	/* ── Ghost line ── */

	.connection-ghost {
		stroke: var(--gray-300);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		stroke-linecap: round;
		pointer-events: none;
	}

	/* ── Drop-target outline (applied to DOM elements via JS) ── */

	:global(.connection-drop-target) {
		outline: 2px solid var(--blue-400) !important;
		outline-offset: 2px;
		border-radius: 0.3rem;
	}
</style>
