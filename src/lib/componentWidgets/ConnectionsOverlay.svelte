<script>
	/**
	 * ConnectionsOverlay Component
	 *
	 * Renders SVG bezier curves between connected structural elements.
	 * Each end of a connection can be a different type (cross-type connections).
	 *
	 * Visual language:
	 *   Column   → ■ square endpoints,  dotted line     · · · ·
	 *   Section  → ◆ diamond endpoints, dashed line     – – – –
	 *   Segment  → ● circle endpoints,  solid line      ──────
	 *   Mixed    → dash-dot line                        – · – ·
	 *
	 * Anchor points:
	 *   Column  → top edge, centered horizontally (1/2 across)
	 *   Section → bottom edge, centered horizontally (1/2 across)
	 *   Segment → left or right side edge, 1/2 of the way down (vertically)
	 *
	 * Column anchors exit from the top (bezier control points droop downward).
	 * Section anchors exit from the bottom (bezier control points extend downward).
	 * Segment anchors exit from the side (bezier control points extend horizontally).
	 * Mixed connections blend the two control-point directions.
	 *
	 * Each end of the arc (from / to) independently uses its own type for:
	 *   • Anchor position
	 *   • Endpoint node shape
	 *
	 * Drag rerouting:
	 *   Grabbing an endpoint reveals drop-target handles on ALL structural elements.
	 *   Proximity detection (≤ SNAP_RADIUS SVG units) snaps the ghost line to the
	 *   nearest handle.  Dropping changes only the dragged end's type and ID —
	 *   the fixed end is preserved exactly, enabling or changing cross-type connections.
	 *
	 * Quick Notes:
	 *   Each connection can have a short plain-text note displayed at the midpoint
	 *   of its bezier curve.  Notes are shown when notesVisible is on AND the
	 *   connection's type toggle is on.  Click the note to edit; Enter/blur to save;
	 *   Escape to cancel; Delete toolbar button to remove the note entirely.
	 */

	import { onMount, onDestroy } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { toolbarState, setActiveConnection, setHeadingOrNoteEditorActive, setToolbarState } from '$lib/stores/toolbar.js';

	let { connections = [], scale = 1 } = $props();

	/** @type {SVGSVGElement | null} */
	let svgElement = $state(null);

	/**
	 * @typedef {'segment'|'section'|'column'} ConnType
	 * @typedef {'solid'|'dashed'|'dotted'|'dashdot'} LineStyle
	 * @typedef {{ id: string, d: string, x1: number, y1: number, x2: number, y2: number, mx: number, my: number, fromType: ConnType, toType: ConnType, lineStyle: LineStyle, note: string|null }} PathEntry
	 * @typedef {{ elementId: string, type: ConnType, side: 'left'|'right', x: number, y: number }} Handle
	 */

	/** @type {PathEntry[]} */
	let paths = $state([]);

	/**
	 * Paths filtered by individual connection type visibility.
	 * Cross-type connections (dashdot) are always shown when the master toggle is on.
	 * @type {PathEntry[]}
	 */
	let visiblePaths = $derived(
		paths.filter(path => {
			if (path.lineStyle === 'solid')  return $toolbarState.segmentConnectionsVisible;
			if (path.lineStyle === 'dashed') return $toolbarState.sectionConnectionsVisible;
			if (path.lineStyle === 'dotted') return $toolbarState.columnConnectionsVisible;
			return true; // dashdot (cross-type) always shown when master is on
		})
	);

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

	/** ID of the path currently under the pointer (for hover highlight). */
	let hoveredPathId = $state(/** @type {string|null} */ (null));

	/** IDs of the currently selected connection paths (supports multi-select). */
	let selectedPathIds = $state(/** @type {Set<string>} */ (new Set()));

	// ─── Note editing state ───────────────────────────────────────────────────

	/** ID of the connection whose note is currently being edited. */
	let noteEditingId = $state(/** @type {string|null} */ (null));

	/** Current value in the note textarea. */
	let noteInputValue = $state('');

	/** Original note value before editing began (for Escape revert). */
	let noteOriginalValue = $state('');

	/** Debounce timer for auto-save while typing. @type {ReturnType<typeof setTimeout>|null} */
	let noteSaveTimeout = null;

	/** Maximum characters allowed in a connection note. */
	const MAX_NOTE_CHARS = 140;

	/** Reference to the note textarea for auto-grow. @type {HTMLTextAreaElement|null} */
	let noteTextareaRef = $state(null);

	const SNAP_RADIUS = 32;
	let resizeObserver = /** @type {ResizeObserver | null} */ (null);
	let scrollContainer = /** @type {HTMLElement | null} */ (null);
	let contentInner = /** @type {HTMLElement | null} */ (null);

	/** Re-calculate paths once the zoom CSS transition finishes. */
	const handleTransitionEnd = () => requestAnimationFrame(calculatePaths);

	// ─── Coordinate helpers ────────────────────────────────────────────────────

	function toSvgCoords(clientX, clientY) {
		if (!svgElement) return { x: 0, y: 0 };
		const r = svgElement.getBoundingClientRect();
		return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
	}

	/**
	 * Get the SVG anchor point for a bounding rect based on connection type and side.
	 *   Column  → top edge, centered horizontally (side ignored)
	 *   Section → bottom edge, centered horizontally (side ignored)
	 *   Segment → left or right side edge, vertically centred (midpoint)
	 * @param {DOMRect} rect
	 * @param {ConnType} type
	 * @param {DOMRect} svgRect
	 * @param {'left'|'right'} [side]
	 * @returns {{ x: number, y: number }}
	 */
	function getAnchorPoint(rect, type, svgRect, side = 'left') {
		if (type === 'column') {
			return {
				x: (rect.left + rect.width / 2 - svgRect.left) / scale,
				y: (rect.top - svgRect.top) / scale
			};
		} else if (type === 'section') {
			return {
				x: (rect.left + rect.width / 2 - svgRect.left) / scale,
				y: (rect.bottom - svgRect.top) / scale
			};
		} else {
			// segment — side edge, vertical midpoint
			return {
				x: side === 'left'
					? (rect.left  - svgRect.left) / scale
					: (rect.right - svgRect.left) / scale,
				y: (rect.top + rect.height / 2 - svgRect.top) / scale
			};
		}
	}

	/**
	 * Returns true if the connection type anchors on the top edge (column only).
	 * @param {ConnType} type
	 */
	function isTopAnchor(type) { return type === 'column'; }

	/**
	 * Returns true if the connection type anchors on the bottom edge (section only).
	 * @param {ConnType} type
	 */
	function isBottomAnchor(type) { return type === 'section'; }

	// ─── Bezier midpoint helper ───────────────────────────────────────────────

	/**
	 * Compute the midpoint (t=0.5) of a cubic bezier curve.
	 * Formula: B(0.5) = (P0 + 3·C1 + 3·C2 + P3) / 8
	 * @param {number} x0 @param {number} y0  — start point (P0)
	 * @param {number} cx1 @param {number} cy1 — control point 1 (C1)
	 * @param {number} cx2 @param {number} cy2 — control point 2 (C2)
	 * @param {number} x1 @param {number} y1   — end point (P3)
	 * @returns {{ mx: number, my: number }}
	 */
	function cubicBezierMidpoint(x0, y0, cx1, cy1, cx2, cy2, x1, y1) {
		return {
			mx: (x0 + 3 * cx1 + 3 * cx2 + x1) / 8,
			my: (y0 + 3 * cy1 + 3 * cy2 + y1) / 8
		};
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

		const SAME_COL_PX = 20;
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

			// Horizontal centre of each element — used to decide left/right side for segments
			const fromCX = (fromRect.left + fromRect.right) / 2;
			const toCX   = (toRect.left   + toRect.right)   / 2;
			const sameCol = Math.abs(fromCX - toCX) < SAME_COL_PX;

			// Segment side selection: exit toward the other element, or right when same column
			const fromSide = /** @type {'left'|'right'} */ (!sameCol && fromCX > toCX ? 'left' : 'right');
			const toSide   = /** @type {'left'|'right'} */ (!sameCol && toCX > fromCX ? 'left' : 'right');

			const from = getAnchorPoint(fromRect, fromType, svgRect, fromSide);
			const to   = getAnchorPoint(toRect,   toType,   svgRect, toSide);

			const fromTop    = isTopAnchor(fromType);
			const toTop      = isTopAnchor(toType);
			const fromBottom = isBottomAnchor(fromType);
			const toBottom   = isBottomAnchor(toType);
			const fromSide2  = !fromTop && !fromBottom;  // segment
			const toSide2    = !toTop   && !toBottom;    // segment

			const dx = Math.abs(to.x - from.x);
			const dy = Math.abs(to.y - from.y);

			// Control points for the cubic bezier (used both for `d` and midpoint)
			let cx1, cy1, cx2, cy2;
			let d;

			if (fromTop && toTop) {
				// Column ↔ Column — both top anchors, arch droops downward
				if (dy < 5) {
					const curvature = Math.max(10, dx * 0.12);
					cx1 = from.x; cy1 = from.y + curvature;
					cx2 = to.x;   cy2 = to.y + curvature;
				} else {
					const vCurve = Math.max(20, dy * 0.4);
					if (from.y < to.y) {
						cx1 = from.x; cy1 = from.y + vCurve;
						cx2 = to.x;   cy2 = to.y - vCurve;
					} else {
						cx1 = from.x; cy1 = from.y - vCurve;
						cx2 = to.x;   cy2 = to.y + vCurve;
					}
				}
			} else if (fromBottom && toBottom) {
				// Section ↔ Section — both bottom anchors, arch extends downward
				if (dy < 5) {
					const curvature = Math.max(10, dx * 0.12);
					cx1 = from.x; cy1 = from.y + curvature;
					cx2 = to.x;   cy2 = to.y + curvature;
				} else {
					const vCurve = Math.max(20, dy * 0.4);
					if (from.y < to.y) {
						cx1 = from.x; cy1 = from.y + vCurve;
						cx2 = to.x;   cy2 = to.y - vCurve;
					} else {
						cx1 = from.x; cy1 = from.y - vCurve;
						cx2 = to.x;   cy2 = to.y + vCurve;
					}
				}
			} else if ((fromTop && toBottom) || (fromBottom && toTop)) {
				// Column ↔ Section — top anchor to bottom anchor (or vice versa)
				const vCurve = Math.max(20, Math.max(dy, dx) * 0.35);
				cx1 = from.x; cy1 = from.y + vCurve;
				cx2 = to.x;   cy2 = to.y + vCurve;
			} else if (fromSide2 && toSide2) {
				// Segment ↔ Segment — both side anchors, horizontal bezier
				if (sameCol) {
					const loopOut = Math.max(16, dy * 0.1);
					cx1 = from.x + loopOut; cy1 = from.y;
					cx2 = to.x   + loopOut; cy2 = to.y;
				} else {
					const curvature = Math.max(30, dx * 0.4);
					if (fromCX < toCX) {
						cx1 = from.x + curvature; cy1 = from.y;
						cx2 = to.x   - curvature; cy2 = to.y;
					} else {
						cx1 = from.x - curvature; cy1 = from.y;
						cx2 = to.x   + curvature; cy2 = to.y;
					}
				}
			} else if (fromTop && toSide2) {
				// Column → Segment
				const vCurve = Math.max(30, dy * 0.4);
				const hCurve = Math.max(30, dx * 0.4);
				cx1 = from.x;
				cy1 = from.y + vCurve;
				cx2 = toCX < fromCX ? to.x + hCurve : to.x - hCurve;
				cy2 = to.y;
			} else if (fromSide2 && toTop) {
				// Segment → Column
				const vCurve = Math.max(30, dy * 0.4);
				const hCurve = Math.max(30, dx * 0.4);
				cx1 = fromCX < toCX ? from.x + hCurve : from.x - hCurve;
				cy1 = from.y;
				cx2 = to.x;
				cy2 = to.y + vCurve;
			} else if (fromBottom && toSide2) {
				// Section → Segment
				const vCurve = Math.max(30, dy * 0.4);
				const hCurve = Math.max(30, dx * 0.4);
				cx1 = from.x;
				cy1 = from.y + vCurve;
				cx2 = toCX < fromCX ? to.x + hCurve : to.x - hCurve;
				cy2 = to.y;
			} else {
				// Segment → Section
				const vCurve = Math.max(30, dy * 0.4);
				const hCurve = Math.max(30, dx * 0.4);
				cx1 = fromCX < toCX ? from.x + hCurve : from.x - hCurve;
				cy1 = from.y;
				cx2 = to.x;
				cy2 = to.y + vCurve;
			}

			d = `M ${from.x},${from.y} C ${cx1},${cy1} ${cx2},${cy2} ${to.x},${to.y}`;
			const { mx, my } = cubicBezierMidpoint(from.x, from.y, cx1, cy1, cx2, cy2, to.x, to.y);

			newPaths.push({
				id: connection.id,
				d, x1: from.x, y1: from.y, x2: to.x, y2: to.y,
				mx, my,
				fromType, toType,
				lineStyle: getLineStyle(fromType, toType),
				note: connection.note ?? null
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

		// Column: single handle at top-center — no left/right pair needed
		document.querySelectorAll('.column[data-column-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.columnId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const { x, y } = getAnchorPoint(rect, 'column', svgRect);
			handles.push({ elementId: id, type: 'column', side: 'left', x, y });
		});

		// Section: single handle at bottom-center — no left/right pair needed
		document.querySelectorAll('.section[data-section-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.sectionId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const { x, y } = getAnchorPoint(rect, 'section', svgRect);
			handles.push({ elementId: id, type: 'section', side: 'left', x, y });
		});

		// Segment: two handles — left midpoint and right midpoint
		document.querySelectorAll('[data-segment-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.segmentId;
			if (!id || id === fixedElementId) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const left  = getAnchorPoint(rect, 'segment', svgRect, 'left');
			const right = getAnchorPoint(rect, 'segment', svgRect, 'right');
			handles.push({ elementId: id, type: 'segment', side: 'left',  x: left.x,  y: left.y  });
			handles.push({ elementId: id, type: 'segment', side: 'right', x: right.x, y: right.y });
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

	// ─── Connection selection ─────────────────────────────────────────────────

	/**
	 * Select or toggle a connection line (click on a path).
	 * - Plain click → select only this connection (replace selection).
	 * - Cmd/Ctrl+Click → toggle this connection in/out of the multi-selection.
	 * Stops the event from bubbling so the document-level deselect doesn't fire.
	 * @param {MouseEvent} event
	 * @param {PathEntry} path
	 */
	function handlePathClick(event, path) {
		event.stopPropagation();
		const isMulti = event.metaKey || event.ctrlKey;

		if (isMulti) {
			// Toggle: add if absent, remove if present
			const next = new Set(selectedPathIds);
			if (next.has(path.id)) {
				next.delete(path.id);
			} else {
				next.add(path.id);
			}
			selectedPathIds = next;
		} else {
			// Plain click: replace with just this connection
			selectedPathIds = new Set([path.id]);
		}

		const ids = [...selectedPathIds];
		// Pass hasNote for single-selection so the toolbar knows if the note button should be enabled
		const hasNote = ids.length === 1
			? !!(connections.find(c => c.id === ids[0])?.note)
			: false;
		setActiveConnection(ids.length > 0, ids, hasNote);
	}

	/**
	 * Deselect all connections when clicking within the passage content area
	 * but not on a connection path.  Clicks on the toolbar, commentary panel, or
	 * other UI chrome are ignored so the selection is preserved.
	 * @param {MouseEvent} event
	 */
	function handleDocumentClick(event) {
		if (selectedPathIds.size === 0) return;
		const target = /** @type {Element} */ (event.target);
		// Only deselect if the click landed inside the analyze content wrapper
		// (i.e. the passage area), not on toolbar buttons or the commentary panel.
		const contentWrapper =
			svgElement?.closest('.analyze-content-wrapper') ??
			svgElement?.closest('.analyze-content');
		if (contentWrapper && contentWrapper.contains(target)) {
			selectedPathIds = new Set();
			setActiveConnection(false, []);
		}
	}

	// Clear local selected state if an external action deselects the connection
	// (e.g. user clicks a segment, which calls setActiveSegment and clears the connection)
	$effect(() => {
		if (!$toolbarState.hasActiveConnection && selectedPathIds.size > 0) {
			selectedPathIds = new Set();
		}
	});

	// Deselect when the user hides connections via the toolbar (master or individual type)
	$effect(() => {
		if (selectedPathIds.size === 0) return;
		// Deselect if any selected paths are now hidden by a type toggle
		const hasHiddenSelected = [...selectedPathIds].some(id => {
			const path = paths.find(p => p.id === id);
			if (!path) return false;
			if (path.lineStyle === 'solid')  return !$toolbarState.segmentConnectionsVisible;
			if (path.lineStyle === 'dashed') return !$toolbarState.sectionConnectionsVisible;
			if (path.lineStyle === 'dotted') return !$toolbarState.columnConnectionsVisible;
			return false;
		});
		if (hasHiddenSelected) {
			selectedPathIds = new Set();
			setActiveConnection(false, []);
		}
	});

	// Update activeConnectionHasNote when connections data refreshes (e.g. after note save)
	$effect(() => {
		if ($toolbarState.hasActiveConnection && $toolbarState.activeConnectionIds.length === 1) {
			const connId = $toolbarState.activeConnectionIds[0];
			const conn = connections.find(c => c.id === connId);
			const hasNote = !!(conn?.note);
			if (hasNote !== $toolbarState.activeConnectionHasNote) {
				setToolbarState('activeConnectionHasNote', hasNote);
			}
		}
	});

	// ─── Note editing ─────────────────────────────────────────────────────────

	/**
	 * Save a note value to the API (empty string → null, clears the note).
	 * @param {string} connectionId
	 * @param {string} noteText
	 */
	async function saveNote(connectionId, noteText) {
		try {
			const response = await fetch(`/api/segments/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note: noteText.trim() || null })
			});
			if (response.ok) {
				await invalidate('app:studies');
			} else {
				const err = await response.json();
				console.error('Connection note save error:', err);
			}
		} catch (err) {
			console.error('Connection note save network error:', err);
		}
	}

	/**
	 * Schedule an auto-save after 1 second of inactivity.
	 * @param {string} connectionId
	 * @param {string} noteText
	 */
	function scheduleNoteSave(connectionId, noteText) {
		if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
		noteSaveTimeout = setTimeout(() => {
			noteSaveTimeout = null;
			saveNote(connectionId, noteText);
		}, 1000);
	}

	/**
	 * Enter edit mode for a connection's note.
	 * @param {string} connectionId
	 */
	function startNoteEdit(connectionId) {
		const conn = connections.find(c => c.id === connectionId);
		if (!conn) return;
		noteOriginalValue = conn.note ?? '';
		noteInputValue = conn.note ?? '';
		noteEditingId = connectionId;
		setHeadingOrNoteEditorActive(true, 'connection-note');
	}

	/**
	 * Commit the current note value and exit edit mode.
	 */
	function commitNoteEdit() {
		if (!noteEditingId) return;
		const id = noteEditingId;
		const text = noteInputValue;
		noteEditingId = null;
		setHeadingOrNoteEditorActive(false, null);
		if (noteSaveTimeout) { clearTimeout(noteSaveTimeout); noteSaveTimeout = null; }
		saveNote(id, text);
	}

	/**
	 * Revert to the original value and exit edit mode.
	 */
	function cancelNoteEdit() {
		if (!noteEditingId) return;
		noteEditingId = null;
		noteInputValue = '';
		noteOriginalValue = '';
		setHeadingOrNoteEditorActive(false, null);
		if (noteSaveTimeout) { clearTimeout(noteSaveTimeout); noteSaveTimeout = null; }
		// No API call — just discard local edits (note display reverts to conn.note from props)
	}

	/**
	 * Handle keyboard shortcuts inside the note textarea.
	 * @param {KeyboardEvent} event
	 */
	function handleNoteKeydown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			commitNoteEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelNoteEdit();
		}
		// Prevent the global keyboard handler from treating Delete/Backspace as a connection delete
		event.stopPropagation();
	}

	/**
	 * Svelte action: focus and select-all the element when it mounts.
	 * @param {HTMLTextAreaElement} node
	 */
	function focusOnMount(node) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
		return {};
	}

	// ─── Window event handlers ────────────────────────────────────────────────

	/**
	 * Handle "connection-insert-note" from the Outline menu or toolbar.
	 * Activates the note editor for the currently selected (single) connection.
	 */
	function handleInsertConnectionNote() {
		const ids = [...selectedPathIds];
		if (ids.length !== 1) return;
		startNoteEdit(ids[0]);
	}

	/**
	 * Handle "connection-remove-note" from the Delete toolbar button.
	 * Deletes the note of the connection currently in edit mode.
	 */
	async function handleRemoveConnectionNote() {
		if (!noteEditingId) {
			// Fallback: delete note of the single selected connection
			const ids = [...selectedPathIds];
			if (ids.length !== 1) return;
			if (noteSaveTimeout) { clearTimeout(noteSaveTimeout); noteSaveTimeout = null; }
			await saveNote(ids[0], '');
			return;
		}
		const id = noteEditingId;
		noteEditingId = null;
		noteInputValue = '';
		noteOriginalValue = '';
		setHeadingOrNoteEditorActive(false, null);
		if (noteSaveTimeout) { clearTimeout(noteSaveTimeout); noteSaveTimeout = null; }
		await saveNote(id, '');
	}

	// ─── Note textarea auto-grow ──────────────────────────────────────────────

	$effect(() => {
		if (noteTextareaRef) {
			noteInputValue; // track reactively
			noteTextareaRef.style.height = 'auto';
			noteTextareaRef.style.height = `${noteTextareaRef.scrollHeight}px`;
		}
	});

	// ─── Reactivity ──────────────────────────────────────────────────────────

	$effect(() => {
		const _conn       = connections;
		const _scale      = scale;
		const _visible    = $toolbarState.connectionsVisible;
		const _colVis     = $toolbarState.columnConnectionsVisible;
		const _secVis     = $toolbarState.sectionConnectionsVisible;
		const _segVis     = $toolbarState.segmentConnectionsVisible;
		const _studies    = $toolbarState.studiesPanelOpen;
		const _comment    = $toolbarState.commentaryPanelOpen;
		const _wide       = $toolbarState.wideLayout;
		const _overview   = $toolbarState.overviewMode;
		const _paragraphs = $toolbarState.paragraphBreaksVisible;
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

		// Re-calculate paths after the zoom CSS transition finishes so anchor points
		// and connection lines land at their correct positions rather than staying at
		// the intermediate mid-transition coordinates.
		contentInner = /** @type {HTMLElement|null} */ (svgElement.closest('.analyze-content-inner'));
		if (contentInner) {
			contentInner.addEventListener('transitionend', handleTransitionEnd, { passive: true });
		}

		window.addEventListener('pointermove', handlePointerMove, { passive: false });
		window.addEventListener('pointerup', handlePointerUp);
		document.addEventListener('click', handleDocumentClick);
		window.addEventListener('connection-insert-note', handleInsertConnectionNote);
		window.addEventListener('connection-remove-note', handleRemoveConnectionNote);

		requestAnimationFrame(calculatePaths);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		scrollContainer?.removeEventListener('scroll', calculatePaths);
		contentInner?.removeEventListener('transitionend', handleTransitionEnd);
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		document.removeEventListener('click', handleDocumentClick);
		window.removeEventListener('connection-insert-note', handleInsertConnectionNote);
		window.removeEventListener('connection-remove-note', handleRemoveConnectionNote);
		if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
		document.querySelectorAll('.connection-drop-target').forEach(el => el.classList.remove('connection-drop-target'));
	});
</script>

<!--
	Wrapper div so that HTML note elements can be positioned alongside the SVG.
	The SVG handles all pointer events for lines and endpoints.
	Note wrappers have pointer-events: auto to allow interaction.
-->
<div
	class="connections-layer"
	class:connections-layer--hidden={!$toolbarState.columnConnectionsVisible && !$toolbarState.sectionConnectionsVisible && !$toolbarState.segmentConnectionsVisible}
	class:connections-layer--dragging={!!drag}
>
	<svg
		bind:this={svgElement}
		class="connections-overlay"
		aria-hidden="true"
		focusable="false"
	>
		<!--
			Rendering is split into three passes so that active (hovered/selected)
			nodes always paint last — i.e. on top of all other nodes in SVG z-order.

			Pass 1 — lines + invisible hit-targets for ALL connections
			Pass 2 — endpoint nodes for NON-active connections
			Pass 3 — endpoint nodes for the ACTIVE connection (on top)
		-->

		{#snippet endpointNodes(path, isActive)}
			<!-- From-end: column=■ square, section=◆ diamond, segment=● circle -->
			{#if path.fromType === 'column'}
				<rect class="connection-node connection-node--square"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					x={path.x1 - 4} y={path.y1 - 4} width="8" height="8"
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.fromType === 'section'}
				<polygon class="connection-node connection-node--diamond"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					points={diamondPoints(path.x1, path.y1)}
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.fromType === 'segment'}
				<circle class="connection-node"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					cx={path.x1} cy={path.y1} r="4"
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{/if}
			<!-- To-end: column=■ square, section=◆ diamond, segment=● circle -->
			{#if path.toType === 'column'}
				<rect class="connection-node connection-node--square"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					x={path.x2 - 4} y={path.y2 - 4} width="8" height="8"
					onpointerdown={(e) => startDrag(e, path, 'to')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.toType === 'section'}
				<polygon class="connection-node connection-node--diamond"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					points={diamondPoints(path.x2, path.y2)}
					onpointerdown={(e) => startDrag(e, path, 'to')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.toType === 'segment'}
				<circle class="connection-node"
					class:connection-node--hovered={isActive && hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={isActive && selectedPathIds.has(path.id)}
					cx={path.x2} cy={path.y2} r="4"
					onpointerdown={(e) => startDrag(e, path, 'to')}
					onclick={(e) => e.stopPropagation()}
				/>
			{/if}
		{/snippet}

		<!-- Pass 1: lines + hit-targets -->
		{#each visiblePaths as path (path.id)}
			<path
				class="connection-path"
				class:connection-path--dashed={path.lineStyle === 'dashed'}
				class:connection-path--dotted={path.lineStyle === 'dotted'}
				class:connection-path--dashdot={path.lineStyle === 'dashdot'}
				class:connection-path--dimmed={!!drag && drag.connectionId === path.id}
				class:connection-path--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
				class:connection-path--selected={selectedPathIds.has(path.id)}
				d={path.d}
				fill="none"
			/>
			<path
				class="connection-hit-target"
				d={path.d}
				fill="none"
				onpointerenter={() => { hoveredPathId = path.id; }}
				onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
				onclick={(e) => handlePathClick(e, path)}
			/>
		{/each}

		<!-- Pass 2: non-active nodes -->
		{#each visiblePaths as path (path.id)}
			{#if path.id !== hoveredPathId && !selectedPathIds.has(path.id)}
				{@render endpointNodes(path, false)}
			{/if}
		{/each}

		<!-- Pass 3: active nodes — rendered last so always on top -->
		{#each visiblePaths as path (path.id)}
			{#if path.id === hoveredPathId || selectedPathIds.has(path.id)}
				{@render endpointNodes(path, true)}
			{/if}
		{/each}

		<!-- ── Drop handles (shown only while dragging) ── -->
		{#if drag}
			{#each dropHandles as handle (`${handle.elementId}-${handle.side}`)}
				{@const isActive = !!drag.activeHandle &&
					drag.activeHandle.elementId === handle.elementId &&
					drag.activeHandle.side === handle.side}

				<!-- Drop handles: column=■ square, section=◆ diamond, segment=● circle -->
				{#if handle.type === 'column'}
					<rect class="drop-handle drop-handle--square"
						class:drop-handle--active={isActive}
						x={handle.x - 5} y={handle.y - 5} width="10" height="10"
					/>
				{:else if handle.type === 'section'}
					<polygon class="drop-handle drop-handle--diamond"
						class:drop-handle--active={isActive}
						points={diamondPoints(handle.x, handle.y, 6)}
					/>
				{:else if handle.type === 'segment'}
					<circle class="drop-handle drop-handle--circle"
						class:drop-handle--active={isActive}
						cx={handle.x} cy={handle.y} r="5"
					/>
				{/if}
			{/each}

			<!-- Ghost line from fixed point to active handle or cursor -->
			{@const ghostX    = drag.activeHandle?.x    ?? drag.cursorX}
			{@const ghostY    = drag.activeHandle?.y    ?? drag.cursorY}
			{@const ghostType = drag.activeHandle?.type ?? drag.dragEndType}
			<line class="connection-ghost" x1={drag.fixedX} y1={drag.fixedY} x2={ghostX} y2={ghostY} />

			<!-- Ghost endpoint node: column=■ square, section=◆ diamond, segment=● circle -->
			{#if ghostType === 'column'}
				<rect class="connection-node connection-node--ghost connection-node--square"
					x={ghostX - 5} y={ghostY - 5} width="10" height="10" />
			{:else if ghostType === 'section'}
				<polygon class="connection-node connection-node--ghost connection-node--diamond"
					points={diamondPoints(ghostX, ghostY, 6)} />
			{:else if ghostType === 'segment'}
				<circle class="connection-node connection-node--ghost" cx={ghostX} cy={ghostY} r="5" />
			{/if}
		{/if}
	</svg>

	<!-- ── Connection Quick Notes ────────────────────────────────────────────── -->
	{#if $toolbarState.notesVisible}
		{#each visiblePaths as path (path.id)}
			{#if path.note || noteEditingId === path.id}
				<!-- Note positioned at the bezier midpoint (SVG units → CSS pixels via scale) -->
				<div
					class="connection-note-wrapper"
					class:connection-note-wrapper--editing={noteEditingId === path.id}
					class:connection-note-wrapper--selected={selectedPathIds.has(path.id)}
					style="left: {path.mx * scale}px; top: {path.my * scale}px;"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
					role="none"
				>
					{#if noteEditingId === path.id}
						<div class="connection-note-edit">
							<textarea
								class="connection-note-input"
								bind:this={noteTextareaRef}
								value={noteInputValue}
								maxlength={MAX_NOTE_CHARS}
								oninput={(e) => {
									noteInputValue = /** @type {HTMLTextAreaElement} */ (e.target).value;
									scheduleNoteSave(noteEditingId, noteInputValue);
								}}
								onblur={commitNoteEdit}
								onkeydown={handleNoteKeydown}
								use:focusOnMount
								rows="1"
							></textarea>
							<div class="connection-note-char-counter" class:at-limit={noteInputValue.length >= MAX_NOTE_CHARS}>
								{noteInputValue.length} / {MAX_NOTE_CHARS}
							</div>
						</div>
					{:else}
						<!-- Display mode: click to edit (only while connection is selected/hovered) -->
						<div
							class="connection-note-display"
							class:connection-note-display--interactive={hoveredPathId === path.id || selectedPathIds.has(path.id)}
							onclick={() => startNoteEdit(path.id)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') startNoteEdit(path.id); }}
							role="button"
							tabindex="0"
							aria-label="Edit connection note"
						>
							{path.note}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	{/if}
</div>

<style>
	/* ── Layer wrapper ── */

	.connections-layer {
		position: absolute;
		top: 0; left: 0;
		width: 100%; height: 100%;
		pointer-events: none;
		overflow: visible;
		z-index: 5;
	}

	.connections-layer--hidden { display: none; }
	.connections-layer--dragging { cursor: grabbing; }

	/* ── SVG overlay ── */

	.connections-overlay {
		position: absolute;
		top: 0; left: 0;
		width: 100%; height: 100%;
		pointer-events: none;
		overflow: visible;
	}

	/* ── Connection lines ── */

	.connection-path {
		stroke: var(--gray-300);
		stroke-width: 2;
		fill: none;
		pointer-events: none;
		stroke-linecap: round;
		transition: opacity 0.1s, stroke 0.15s;
		/* segment-segment: solid (default) */
	}

	.connection-path--dashed  { stroke-dasharray: 6 4; }      /* section-section */
	.connection-path--dotted  { stroke-dasharray: 2 4; }      /* column-column   */
	.connection-path--dashdot { stroke-dasharray: 6 3 1 3; }  /* cross-type      */
	.connection-path--dimmed  { opacity: 0.3; }

	.connection-path--hovered  { stroke: var(--blue); }
	.connection-path--selected { stroke: var(--blue); stroke-width: 2.5; }

	/* Wide transparent hit-target for easy hover/click on thin lines */
	.connection-hit-target {
		stroke: transparent;
		stroke-width: 12;
		fill: none;
		pointer-events: stroke;
		cursor: pointer;
	}

	/* ── Endpoint nodes ── */

	.connection-node {
		fill: var(--gray-600);
		stroke: var(--gray-300);
		stroke-width: 1.5;
		pointer-events: all;
		cursor: grab;
	}

	.connection-node--hovered,
	.connection-node--selected {
		fill: var(--blue);
		stroke: var(--blue);
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
		stroke-width: 2;
		stroke-dasharray: 6 4;
		stroke-linecap: round;
		pointer-events: none;
	}

	/* ── Quick Note ── */

	.connection-note-wrapper {
		position: absolute;
		transform: translateX(-50%);
		pointer-events: auto;
		z-index: 10;
	}

	.connection-note-display {
		background-color: var(--gray-light);
		border: 0.1rem solid var(--section-dark, var(--gray-600));
		border-radius: 0.3rem;
		padding: 0.6rem;
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 700;
		line-height: 1.6;
		color: var(--gray-dark);
		white-space: pre-wrap;
		word-break: break-word;
		max-width: 27.4rem;
		cursor: default;
		user-select: none;
	}

	.connection-note-display--interactive {
		cursor: pointer;
	}

	.connection-note-display--interactive:hover {
		border-top: 0.1rem dashed var(--gray);
		margin-top: -0.1rem;
	}

	/* Selected connection note gets a slightly more prominent border */
	.connection-note-wrapper--selected .connection-note-display {
		border-color: var(--blue-300, #93c5fd);
	}

	.connection-note-edit {
		position: relative;
	}

	.connection-note-input {
		display: block;
		width: 27.4rem;
		background-color: var(--gray-light);
		border: 0.1rem solid var(--section-dark, var(--gray-600));
		border-radius: 0.3rem;
		padding: 0.6rem;
		padding-bottom: 2.0rem;
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 700;
		line-height: 1.5;
		color: var(--gray-dark);
		font-family: inherit;
		caret-color: var(--gray-darker);
		resize: none;
		overflow: hidden;
		box-sizing: border-box;
		box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
		outline: none;
	}

	.connection-note-char-counter {
		position: absolute;
		bottom: 0.4rem;
		right: 0.6rem;
		font-size: 1.0rem;
		font-style: normal;
		font-weight: 400;
		color: var(--gray-dark);
		pointer-events: none;
		line-height: 1;
	}

	.connection-note-char-counter.at-limit {
		font-weight: 700;
	}

	/* ── Drop-target outline (applied to DOM elements via JS) ── */

	:global(.connection-drop-target) {
		outline: 2px solid var(--blue-400) !important;
		outline-offset: 2px;
		border-radius: 0.3rem;
	}
</style>
