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
	import { toolbarState, setActiveConnection, setHeadingOrNoteEditorActive, setToolbarState, clearSelectedItem, setActiveSegment, setActiveSection, setActiveColumn } from '$lib/stores/toolbar.js';

	let { connections = [], scale = 1 } = $props();

	/** @type {SVGSVGElement | null} */
	let svgElement = $state(null);

	/**
	 * @typedef {'segment'|'section'|'column'} ConnType
	 * @typedef {'solid'|'dashed'|'dotted'|'dashdot'} LineStyle
	 * @typedef {{ id: string, d: string, x1: number, y1: number, x2: number, y2: number, mx: number, my: number, cx1: number, cy1: number, cx2: number, cy2: number, fromType: ConnType, toType: ConnType, lineStyle: LineStyle, note: string|null, notePlacement: 'center'|'right'|'left'|'above'|'below', noteAnchorX: number, noteAnchorY: number }} PathEntry
	 * @typedef {{ elementId: string, type: ConnType, side: 'left'|'right', x: number, y: number }} Handle
	 */

	/** @type {PathEntry[]} */
	let paths = $state([]);

	/**
	 * Paths filtered by individual connection type visibility.
	 * Cross-item connections (dashdot, between items of a different kind) have
	 * their own toggle, just like the same-kind types.
	 * @type {PathEntry[]}
	 */
	let visiblePaths = $derived(
		paths.filter(path => {
			if (path.lineStyle === 'solid')  return $toolbarState.segmentConnectionsVisible;
			if (path.lineStyle === 'dashed') return $toolbarState.sectionConnectionsVisible;
			if (path.lineStyle === 'dotted') return $toolbarState.columnConnectionsVisible;
			return $toolbarState.crossItemConnectionsVisible; // dashdot (cross-item)
		})
	);

	/**
	 * Active drag state.
	 * @type {{
	 *   connectionId: string,
	 *   end: 'from'|'to',
	 *   dragEndType: ConnType,    // type of the endpoint being dragged
	 *   dragLineStyle: LineStyle, // line style of the dragged connection
	 *   fixedType: ConnType,      // type of the fixed (non-dragged) endpoint
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

	/** ID of the connection whose note is currently being edited (textarea open). */
	let noteEditingId = $state(/** @type {string|null} */ (null));

	/** ID of the connection note in "selected / display" mode (no textarea, just highlighted). */
	let noteSelectedId = $state(/** @type {string|null} */ (null));

	/**
	 * Drives hasActiveHeadingOrNoteEditor via $effect (not a direct store call).
	 * Using $state + $effect mirrors NoteEditor's pattern so Svelte 5 schedules the
	 * store update as a microtask — which means a Delete button click (fired after
	 * the textarea's blur) still sees hasActiveHeadingOrNoteEditor=true in the toolbar.
	 */
	let noteEditorActive = $state(false);

	/** Current value in the note textarea. */
	let noteInputValue = $state('');

	/** Original note value before editing began (for Escape revert). */
	let noteOriginalValue = $state('');

	/** Debounce timer for auto-save while typing. @type {ReturnType<typeof setTimeout>|null} */
	let noteSaveTimeout = null;

	/** Maximum characters allowed in a connection note. */
	const MAX_NOTE_CHARS = 280;

	/** Reference to the note textarea for auto-grow. @type {HTMLTextAreaElement|null} */
	let noteTextareaRef = $state(null);

	const SNAP_RADIUS = 32;
	let resizeObserver = /** @type {ResizeObserver | null} */ (null);
	let scrollContainer = /** @type {HTMLElement | null} */ (null);
	let contentInner = /** @type {HTMLElement | null} */ (null);

	/**
	 * rAF-coalesced recompute scheduler.  Multiple triggers in the same frame
	 * (scroll, resize, spacing-drag mousemoves, store changes …) collapse into a
	 * single calculatePaths() run on the next animation frame.  This keeps the
	 * note-avoidance pass — which reads every segment's bounding box — from piling
	 * up while a column/section spacing handle is being dragged.
	 */
	let rafScheduled = false;
	function scheduleCalculate() {
		if (rafScheduled) return;
		rafScheduled = true;
		requestAnimationFrame(() => {
			rafScheduled = false;
			calculatePaths();
		});
	}

	/** Re-calculate paths once the zoom CSS transition finishes. */
	const handleTransitionEnd = () => scheduleCalculate();

	/**
	 * Recompute on column/section spacing changes (live drag + modal apply/reset).
	 * The page-level reposition composables dispatch 'analyze-layout-changed' on
	 * every drag mousemove; the spacing modals fire their own set/reset events.
	 * All route through the rAF coalescer so the note layout re-flows to keep
	 * notes over white space as the passage reflows.
	 */
	const handleLayoutChanged = () => scheduleCalculate();


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
	 * Spacing (SVG units) between adjacent anchor points that share the same
	 * element edge.  Large enough to clear the 8px square / r4 circle endpoint
	 * nodes so multiple connections on one element never visually overlap.
	 */
	const ANCHOR_SPACING = 14;

	/**
	 * Inset (SVG units) kept clear at each corner of an edge so distributed
	 * anchors never sit exactly on the element's corner.
	 */
	const ANCHOR_EDGE_PAD = 6;

	/**
	 * Canonical anchor point for a specific edge of a rect (before any
	 * multi-connection distribution offset is applied).
	 *   top    → top edge, horizontally centred
	 *   bottom → bottom edge, horizontally centred
	 *   left   → left edge, vertically centred
	 *   right  → right edge, vertically centred
	 * @param {DOMRect} rect
	 * @param {'top'|'bottom'|'left'|'right'} edge
	 * @param {DOMRect} svgRect
	 * @returns {{ x: number, y: number }}
	 */
	function edgeAnchorPoint(rect, edge, svgRect) {
		const cx = (rect.left + rect.width / 2 - svgRect.left) / scale;
		const cy = (rect.top + rect.height / 2 - svgRect.top) / scale;
		switch (edge) {
			case 'top':    return { x: cx, y: (rect.top    - svgRect.top) / scale };
			case 'bottom': return { x: cx, y: (rect.bottom - svgRect.top) / scale };
			case 'left':   return { x: (rect.left  - svgRect.left) / scale, y: cy };
			default:       return { x: (rect.right - svgRect.left) / scale, y: cy };
		}
	}

	/**
	 * Decide which edge of an element a connection end should anchor to so the
	 * connection line is as short as possible.
	 *   Column  → always top (preserves the column visual language)
	 *   Section → top or bottom, whichever is nearer the opposite endpoint
	 *   Segment → left or right (already decided from element centres)
	 * @param {ConnType} type
	 * @param {DOMRect} rect
	 * @param {number} otherCY — opposite element's vertical centre (client px)
	 * @param {'left'|'right'} side — precomputed segment side
	 * @returns {'top'|'bottom'|'left'|'right'}
	 */
	function decideEdge(type, rect, otherCY, side) {
		if (type === 'column') return 'top';
		if (type === 'section') {
			const cy = rect.top + rect.height / 2;
			return otherCY <= cy ? 'top' : 'bottom';
		}
		return side;
	}

	/**
	 * Test whether the straight line segment (x1,y1)→(x2,y2) intersects the
	 * axis-aligned box b.  Liang–Barsky clipping: returns true when any portion of
	 * the segment lies inside the box (including fully-contained segments).  All
	 * inputs are in the SVG/note coordinate space (CSS px ÷ scale).
	 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
	 * @param {{ x: number, y: number, w: number, h: number }} b
	 * @returns {boolean}
	 */
	function lineIntersectsBox(x1, y1, x2, y2, b) {
		const minX = b.x, minY = b.y, maxX = b.x + b.w, maxY = b.y + b.h;
		const dx = x2 - x1, dy = y2 - y1;
		let t0 = 0, t1 = 1;
		/** @type {Array<[number, number]>} */
		const checks = [
			[-dx, x1 - minX],
			[ dx, maxX - x1],
			[-dy, y1 - minY],
			[ dy, maxY - y1]
		];
		for (const [p, q] of checks) {
			if (p === 0) {
				if (q < 0) return false; // parallel and outside this slab
			} else {
				const r = q / p;
				if (p < 0) {
					if (r > t1) return false;
					if (r > t0) t0 = r;
				} else {
					if (r < t0) return false;
					if (r < t1) t1 = r;
				}
			}
		}
		return true;
	}

	/**
	 * True when the line (x1,y1)→(x2,y2) passes through any of the given text
	 * boxes, skipping boxes whose id is in excludeIds (so a connection never counts
	 * its own endpoint segments as obstacles).
	 * A box is skipped when its segment, section, or column id is in excludeIds —
	 * so a connection never counts the text of its OWN two endpoint elements as an
	 * obstacle (otherwise a line aimed at an element's centre would always "hit"
	 * that element's own text).
	 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
	 * @param {Array<{ segId?: string, secId?: string, colId?: string, x: number, y: number, w: number, h: number }>} boxes
	 * @param {Array<string|null>} excludeIds
	 * @returns {boolean}
	 */
	function lineIntersectsAnyBox(x1, y1, x2, y2, boxes, excludeIds) {
		for (const b of boxes) {
			if ((b.segId && excludeIds.includes(b.segId)) ||
				(b.secId && excludeIds.includes(b.secId)) ||
				(b.colId && excludeIds.includes(b.colId))) continue;
			if (lineIntersectsBox(x1, y1, x2, y2, b)) return true;
		}
		return false;
	}


	/**
	 * Choose a section endpoint's edge (top or bottom).  The default is the edge
	 * with the SHORTEST line to the opposite endpoint; we only switch to the far
	 * edge when the short-edge line would pass through passage text AND the far
	 * edge's line would NOT.  If both (or neither) cross text, the short edge wins.
	 * @param {DOMRect} rect — the section's client rect
	 * @param {DOMRect} svgRect
	 * @param {number} oppX — opposite endpoint target point, SVG coords
	 * @param {number} oppY — opposite endpoint target point, SVG coords
	 * @param {Array<{ id?: string, x: number, y: number, w: number, h: number }>} boxes
	 * @param {Array<string|null>} excludeIds — own endpoint segment ids
	 * @returns {'top'|'bottom'}
	 */
	function decideSectionEdge(rect, svgRect, oppX, oppY, boxes, excludeIds) {
		const cy = (rect.top + rect.height / 2 - svgRect.top) / scale;
		const shortEdge = /** @type {'top'|'bottom'} */ (oppY <= cy ? 'top' : 'bottom');
		const farEdge   = /** @type {'top'|'bottom'} */ (shortEdge === 'top' ? 'bottom' : 'top');

		const aShort = edgeAnchorPoint(rect, shortEdge, svgRect);
		if (!lineIntersectsAnyBox(aShort.x, aShort.y, oppX, oppY, boxes, excludeIds)) {
			return shortEdge; // short edge is clear — always prefer it
		}
		const aFar = edgeAnchorPoint(rect, farEdge, svgRect);
		if (lineIntersectsAnyBox(aFar.x, aFar.y, oppX, oppY, boxes, excludeIds)) {
			return shortEdge; // both cross text — keep the shorter line
		}
		return farEdge; // short crosses text but far is clear — flip to avoid text
	}

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

	/**
	 * Evaluate a cubic bezier at parameter t ∈ [0,1].
	 * B(t) = (1−t)³P0 + 3(1−t)²t·C1 + 3(1−t)t²·C2 + t³·P3
	 * Used by the note resolver to slide a note's anchor ALONG its connection line
	 * (so the dot and box always stay attached to a real point on the curve).
	 * @param {number} t
	 * @param {number} x0 @param {number} y0
	 * @param {number} cx1 @param {number} cy1
	 * @param {number} cx2 @param {number} cy2
	 * @param {number} x1 @param {number} y1
	 * @returns {{ x: number, y: number }}
	 */
	function cubicBezierPoint(t, x0, y0, cx1, cy1, cx2, cy2, x1, y1) {
		const u = 1 - t;
		const a = u * u * u;
		const b = 3 * u * u * t;
		const c = 3 * u * t * t;
		const d = t * t * t;
		return {
			x: a * x0 + b * cx1 + c * cx2 + d * x1,
			y: a * y0 + b * cy1 + c * cy2 + d * y1
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

	// ─── Note placement helpers ───────────────────────────────────────────────

	/** Approximate note box dimensions in CSS pixels for collision detection. */
	const NOTE_BOX_W = 200;
	const NOTE_BOX_H = 64;

	/**
	 * Compute the CSS-pixel bounding box for a note given its anchor and placement.
	 * @param {number} anchorXpx
	 * @param {number} anchorYpx
	 * @param {'center'|'right'|'left'|'above'|'below'} placement
	 * @returns {{ x: number, y: number, w: number, h: number }}
	 */
	function noteBoundingBox(anchorXpx, anchorYpx, placement) {
		switch (placement) {
			case 'right': return { x: anchorXpx,              y: anchorYpx - NOTE_BOX_H / 2, w: NOTE_BOX_W, h: NOTE_BOX_H };
			case 'left':  return { x: anchorXpx - NOTE_BOX_W, y: anchorYpx - NOTE_BOX_H / 2, w: NOTE_BOX_W, h: NOTE_BOX_H };
			case 'above': return { x: anchorXpx - NOTE_BOX_W / 2, y: anchorYpx - NOTE_BOX_H, w: NOTE_BOX_W, h: NOTE_BOX_H };
			case 'below': return { x: anchorXpx - NOTE_BOX_W / 2, y: anchorYpx,              w: NOTE_BOX_W, h: NOTE_BOX_H };
			default:      return { x: anchorXpx - NOTE_BOX_W / 2, y: anchorYpx - NOTE_BOX_H / 2, w: NOTE_BOX_W, h: NOTE_BOX_H };
		}
	}

	/**
	 * Return true if box a and box b overlap.
	 * @param {{ x: number, y: number, w: number, h: number }} a
	 * @param {{ x: number, y: number, w: number, h: number }} b
	 * @returns {boolean}
	 */
	function boxesOverlap(a, b) {
		return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
	}

	/**
	 * Return the overlapping AREA (in CSS px²) between box a and box b. 0 when they
	 * do not intersect.  Used to score candidate note placements: the resolver
	 * prefers the placement that overlaps passage text (and other notes) the least.
	 * @param {{ x: number, y: number, w: number, h: number }} a
	 * @param {{ x: number, y: number, w: number, h: number }} b
	 * @returns {number}
	 */
	function overlapArea(a, b) {
		const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
		const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
		if (ix <= 0 || iy <= 0) return 0;
		return ix * iy;
	}

	/**
	 * Collect the bounding boxes of all visible passage segments in the note
	 * coordinate space (CSS px relative to the SVG top-left, divided by scale —
	 * the same transform getAnchorPoint uses).  These are the "passage text"
	 * obstacles the note resolver tries to avoid; the gaps between them (column
	 * gutters, inter-section spacing, margins) are the "white space" the notes
	 * prefer to sit over.
	 *
	 * Hidden segments (zero-width, or compare/hide-mode hidden) are skipped.
	 * Each box is tagged with its segment id plus the ids of its nearest ancestor
	 * section and column, so the section edge resolver can exclude the text that
	 * belongs to a connection's OWN endpoint elements (a line aimed at a section's
	 * centre would otherwise always "hit" that section's own text).
	 * @param {DOMRect} svgRect
	 * @param {number} scl — current zoom scale (CSS px per layout unit)
	 * @returns {Array<{ segId: string|undefined, secId: string|undefined, colId: string|undefined, x: number, y: number, w: number, h: number }>}
	 */
	function collectSegmentBoxes(svgRect, scl) {
		/** @type {Array<{ segId: string|undefined, secId: string|undefined, colId: string|undefined, x: number, y: number, w: number, h: number }>} */
		const boxes = [];
		document.querySelectorAll('.segment[data-segment-id]').forEach(el => {
			const seg = /** @type {HTMLElement} */ (el);
			if (seg.classList.contains('compare-hidden')) return;
			const rect = seg.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const sectionEl = /** @type {HTMLElement|null} */ (seg.closest('[data-section-id]'));
			const columnEl  = /** @type {HTMLElement|null} */ (seg.closest('[data-column-id]'));
			boxes.push({
				segId: seg.dataset.segmentId,
				secId: sectionEl?.dataset.sectionId,
				colId: columnEl?.dataset.columnId,
				x: (rect.left - svgRect.left) / scl,
				y: (rect.top  - svgRect.top)  / scl,
				w: rect.width  / scl,
				h: rect.height / scl
			});
		});
		return boxes;
	}



	/**
	 * Return the CSS transform string for a note placement.
	 * @param {'center'|'right'|'left'|'above'|'below'} placement
	 * @returns {string}
	 */
	function noteTransform(placement) {
		switch (placement) {
			case 'right': return 'translate(0, -50%)';
			case 'left':  return 'translate(-100%, -50%)';
			case 'above': return 'translate(-50%, -100%)';
			case 'below': return 'translate(-50%, 0%)';
			default:      return 'translate(-50%, -50%)';
		}
	}

	/** Priority order tried when resolving note–note collisions (never 'center'). */
	const NOTE_PLACEMENT_ORDER = /** @type {Array<'above'|'below'|'right'|'left'>} */ (
		['above', 'below', 'right', 'left']
	);

	// ─── Note placement resolver ───────────────────────────────────────────────

	/**
	 * Bezier parameters tried when sliding a note's anchor ALONG its connection
	 * line.  0.5 is the true midpoint; the rest fan out symmetrically toward each
	 * endpoint.  The note box stays welded to whichever point is chosen, so the
	 * anchor dot is never separated from the box — it just rides the curve to find
	 * clearer space.  Kept away from the very ends (no 0 or 1) so the note never
	 * sits on top of an endpoint node.  Densely sampled but kept well short of the
	 * ends so a note nudges just far enough to clear text without flinging itself
	 * out to the tip of the curve.
	 */
	const NOTE_T_STEPS = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74];

	/**
	 * The anchor may drift this far from the midpoint (|t − 0.5|) "for free" before
	 * the W_DIST bias kicks in.  A small band lets a note escape a slight text graze
	 * without being yanked back, while still strongly preferring the tidy midpoint.
	 */
	const NOTE_T_FREE_BAND = 0.06;

	/** Tie-break preference: prefer 'above', then 'below', then 'right', then 'left'. */
	const PLACEMENT_PREFERENCE = /** @type {Record<string, number>} */ ({
		above: 0, below: 1, right: 2, left: 3
	});

	// Score weights.  Overlap areas are in CSS px² and dominate; the preference and
	// distance terms are tiny tie-breakers so a fully-clear 'above' at the midpoint
	// wins over an equally-clear spot further along the curve.
	const W_SEGMENT = 1.0;   // overlapping passage text
	const W_NOTE    = 3.0;   // overlapping another note (worse — notes must stay legible)
	const W_BOUNDS  = 2.0;   // clipping off the top/left canvas edge
	const W_DIST    = 5.0;   // bias toward the midpoint (only past the free band)

	/**
	 * Resolve the anchor point + placement of every note so each one prefers to sit
	 * over WHITE SPACE (avoiding passage-segment boxes) and avoids overlapping other
	 * notes — WITHOUT ever detaching the box from its anchor dot.
	 *
	 * For each note we slide the anchor along the connection's own bezier curve
	 * (sampling NOTE_T_STEPS) and, at each sampled point, try the four placements
	 * (above/below/left/right).  Every candidate is scored by how much it overlaps
	 * passage text and other notes, how far it clips the top/left edges, how far the
	 * anchor strayed from the midpoint, and a small placement preference.  The
	 * lowest-scoring candidate wins; its on-curve point becomes noteAnchorX/Y so the
	 * dot and the box move together.
	 *
	 * Notes are resolved in order; each committed note becomes an obstacle for the
	 * ones after it.  Mutates notePlacement / noteAnchorX / noteAnchorY in-place.
	 *
	 * @param {PathEntry[]} notePaths — paths that have a note, in render order
	 * @param {Array<{ x: number, y: number, w: number, h: number }>} segmentBoxes
	 * @param {number} scl — current zoom scale (CSS px per layout unit)
	 */
	function resolveNotePlacements(notePaths, segmentBoxes, scl) {
		const MARGIN = 4 / scl;
		/** @type {Array<{ x: number, y: number, w: number, h: number }>} */
		const placedNoteBoxes = [];

		for (const note of notePaths) {
			let best = /** @type {{ score: number, placement: 'above'|'below'|'right'|'left', ax: number, ay: number } | null} */ (null);

			for (const t of NOTE_T_STEPS) {
				// The on-curve anchor point for this t (the dot will sit exactly here).
				const pt = cubicBezierPoint(
					t, note.x1, note.y1, note.cx1, note.cy1, note.cx2, note.cy2, note.x2, note.y2
				);
				// Distance from the midpoint, with a "free band" near the centre: the
				// anchor can drift up to NOTE_T_FREE_BAND for free, so a note can escape
				// crowded text into nearby white space without the bias dragging it back.
				const tDist = Math.max(0, Math.abs(t - 0.5) - NOTE_T_FREE_BAND);

				for (const placement of NOTE_PLACEMENT_ORDER) {
					const box = noteBoundingBox(pt.x, pt.y, placement);

					// Sum overlap area against passage text and already-placed notes.
					let segOverlap = 0;
					for (const sb of segmentBoxes) segOverlap += overlapArea(box, sb);
					let noteOverlap = 0;
					for (const pb of placedNoteBoxes) noteOverlap += overlapArea(box, pb);

					// Penalise clipping off the top/left edges (bottom/right are fine —
					// the canvas scrolls/extends that way).
					let bounds = 0;
					if (box.x < MARGIN) bounds += (MARGIN - box.x) * box.h;
					if (box.y < MARGIN) bounds += (MARGIN - box.y) * box.w;

					const score =
						segOverlap * W_SEGMENT +
						noteOverlap * W_NOTE +
						bounds * W_BOUNDS +
						tDist * W_DIST * 100 +          // scale tDist (0–0.5) into px-comparable range
						PLACEMENT_PREFERENCE[placement];

					if (best === null || score < best.score) {
						best = { score, placement, ax: pt.x, ay: pt.y };
					}
				}
			}

			if (best) {
				note.notePlacement = best.placement;
				note.noteAnchorX = best.ax;
				note.noteAnchorY = best.ay;
			}
			// Commit this note's final box so later notes treat it as an obstacle.
			placedNoteBoxes.push(
				noteBoundingBox(note.noteAnchorX, note.noteAnchorY, note.notePlacement)
			);
		}
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

	/**
	 * Get the type of the fixed end's element (the end NOT being dragged).
	 * @param {object} conn @param {'from'|'to'} draggedEnd
	 * @returns {ConnType}
	 */
	function getFixedElementType(conn, draggedEnd) {
		const type = draggedEnd === 'from' ? conn?.toType : conn?.fromType;
		return /** @type {ConnType} */ (type || 'segment');
	}

	/**
	 * Resolve the {type, id} for one end of a connection record.
	 * @param {object} conn @param {'from'|'to'} end
	 * @returns {{ type: ConnType, id: string|null }}
	 */
	function getEndRef(conn, end) {
		const type = /** @type {ConnType} */ ((end === 'from' ? conn?.fromType : conn?.toType) || 'segment');
		let id = null;
		if (type === 'segment') id = end === 'from' ? conn?.fromSegmentId : conn?.toSegmentId;
		else if (type === 'section') id = end === 'from' ? conn?.fromSectionId : conn?.toSectionId;
		else id = end === 'from' ? conn?.fromColumnId : conn?.toColumnId;
		return { type, id: id ?? null };
	}

	/**
	 * Returns true if a connection already exists between the two given items
	 * (direction-agnostic). The connection currently being dragged is excluded so
	 * dropping back onto its own current target is still permitted.
	 * @param {ConnType} typeA @param {string|null} idA
	 * @param {ConnType} typeB @param {string|null} idB
	 * @param {string} excludeConnectionId
	 * @returns {boolean}
	 */
	function hasConnectionBetween(typeA, idA, typeB, idB, excludeConnectionId) {
		if (!idA || !idB) return false;
		return connections.some(c => {
			if (c.id === excludeConnectionId) return false;
			const a = getEndRef(c, 'from');
			const b = getEndRef(c, 'to');
			const matchForward = a.type === typeA && a.id === idA && b.type === typeB && b.id === idB;
			const matchReverse = a.type === typeB && a.id === idB && b.type === typeA && b.id === idA;
			return matchForward || matchReverse;
		});
	}

	// ─── Path calculation ─────────────────────────────────────────────────────

	function calculatePaths() {
		if (!svgElement || !connections.length) { paths = []; return; }
		const svgRect = svgElement.getBoundingClientRect();
		if (svgRect.width === 0 && svgRect.height === 0) { paths = []; return; }

		const SAME_COL_PX = 20;

		// Passage text obstacles (used to flip section anchors off the short edge
		// only when the short-edge line would otherwise cut through text).
		const textBoxes = collectSegmentBoxes(svgRect, scale);

		// ── Pass A: resolve each connection's endpoints and chosen edges ──────
		// For every connection we decide which EDGE of each element it anchors to
		// (column=top, section=top/bottom by shortest line, segment=left/right) and
		// register both endpoints into per-edge groups so they can be fanned out.
		/**
		 * @typedef {{ key: string, edge: 'top'|'bottom'|'left'|'right', rect: DOMRect, otherCX: number, otherCY: number }} Endpoint
		 * @type {Array<{ connection: any, fromType: ConnType, toType: ConnType, fromCX: number, toCX: number, sameCol: boolean, fromEdge: 'top'|'bottom'|'left'|'right', toEdge: 'top'|'bottom'|'left'|'right' }>}
		 */
		const resolved = [];
		/** @type {Map<string, Endpoint[]>} key = `${elementId}|${edge}` */
		const groups = new Map();

		for (const connection of connections) {
			const fromType = /** @type {ConnType} */ (connection.fromType || 'segment');
			const toType   = /** @type {ConnType} */ (connection.toType   || 'segment');
			const fromEl = getElementForConnection(connection, 'from');
			const toEl   = getElementForConnection(connection, 'to');
			if (!fromEl || !toEl) continue;
			const fromRect = fromEl.getBoundingClientRect();
			const toRect   = toEl.getBoundingClientRect();
			if (fromRect.width === 0 || toRect.width === 0) continue;

			// Centres of each element — used to pick segment side & section edge.
			const fromCX = (fromRect.left + fromRect.right)  / 2;
			const toCX   = (toRect.left   + toRect.right)    / 2;
			const fromCY = (fromRect.top  + fromRect.bottom) / 2;
			const toCY   = (toRect.top    + toRect.bottom)   / 2;
			const sameCol = Math.abs(fromCX - toCX) < SAME_COL_PX;

			// Segment side selection: exit toward the other element, or right when same column
			const fromSide = /** @type {'left'|'right'} */ (!sameCol && fromCX > toCX ? 'left' : 'right');
			const toSide   = /** @type {'left'|'right'} */ (!sameCol && toCX > fromCX ? 'left' : 'right');

			const fromId = getEndRef(connection, 'from').id;
			const toId   = getEndRef(connection, 'to').id;

			// Opposite element centres in SVG coords — used as the straight-line
			// target when testing whether a section's short edge would cross text.
			const toCXsvg   = (toCX   - svgRect.left) / scale;
			const toCYsvg   = (toCY   - svgRect.top)  / scale;
			const fromCXsvg = (fromCX - svgRect.left) / scale;
			const fromCYsvg = (fromCY - svgRect.top)  / scale;
			const excludeIds = /** @type {Array<string|null>} */ ([fromId, toId]);

			// Which edge each end anchors to.  Sections prefer the SHORTEST edge but
			// flip to the opposite edge when the short side would route through text;
			// columns (top) and segments (left/right) keep their existing behaviour.
			const fromEdge = fromType === 'section'
				? decideSectionEdge(fromRect, svgRect, toCXsvg, toCYsvg, textBoxes, excludeIds)
				: decideEdge(fromType, fromRect, toCY, fromSide);
			const toEdge   = toType === 'section'
				? decideSectionEdge(toRect, svgRect, fromCXsvg, fromCYsvg, textBoxes, excludeIds)
				: decideEdge(toType, toRect, fromCY, toSide);
			const fromGroupKey = `${fromId}|${fromEdge}`;
			const toGroupKey   = `${toId}|${toEdge}`;

			if (!groups.has(fromGroupKey)) groups.set(fromGroupKey, []);
			if (!groups.has(toGroupKey))   groups.set(toGroupKey, []);
			groups.get(fromGroupKey)?.push({ key: `${connection.id}|from`, edge: fromEdge, rect: fromRect, otherCX: toCX,   otherCY: toCY   });
			groups.get(toGroupKey)?.push(  { key: `${connection.id}|to`,   edge: toEdge,   rect: toRect,   otherCX: fromCX, otherCY: fromCY });

			resolved.push({ connection, fromType, toType, fromCX, toCX, sameCol, fromEdge, toEdge });
		}

		// ── Pass B: distribute endpoints evenly along each shared edge ────────
		// Endpoints on the same element edge are sorted by the position of their
		// FAR end (so lines fan out without crossing) then spread symmetrically
		// about the edge centre.  A single endpoint stays exactly at the centre,
		// keeping the common case visually identical to before.  When the edge is
		// too short the spacing compresses so anchors always stay on the edge.
		/** @type {Map<string, { x: number, y: number }>} key = `${connId}|${end}` */
		const anchorMap = new Map();
		for (const members of groups.values()) {
			const horizontal = members[0].edge === 'top' || members[0].edge === 'bottom';
			members.sort((a, b) => {
				const pa = horizontal ? a.otherCX : a.otherCY;
				const pb = horizontal ? b.otherCX : b.otherCY;
				if (pa !== pb) return pa - pb;
				return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; // stable tie-break
			});
			const n = members.length;
			for (let i = 0; i < n; i++) {
				const m = members[i];
				const base = edgeAnchorPoint(m.rect, m.edge, svgRect);
				if (n === 1) { anchorMap.set(m.key, base); continue; }
				const edgeLen = (horizontal ? m.rect.width : m.rect.height) / scale;
				const usable  = Math.max(0, edgeLen - 2 * ANCHOR_EDGE_PAD);
				const spacing = Math.min(ANCHOR_SPACING, usable / (n - 1));
				const offset  = (i - (n - 1) / 2) * spacing;
				anchorMap.set(m.key, horizontal
					? { x: base.x + offset, y: base.y }
					: { x: base.x, y: base.y + offset });
			}
		}

		/** @type {PathEntry[]} */
		const newPaths = [];

		// ── Pass C: build the bezier path for each connection ─────────────────
		for (const r of resolved) {
			const { connection, fromType, toType, fromCX, toCX, sameCol, fromEdge, toEdge } = r;
			const from = anchorMap.get(`${connection.id}|from`);
			const to   = anchorMap.get(`${connection.id}|to`);
			if (!from || !to) continue;

			const fromTop    = fromEdge === 'top';
			const toTop      = toEdge   === 'top';
			const fromBottom = fromEdge === 'bottom';
			const toBottom   = toEdge   === 'bottom';
			const fromSide2  = !fromTop && !fromBottom;  // segment (left/right edge)
			const toSide2    = !toTop   && !toBottom;    // segment (left/right edge)

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

		// ── Initial note placement ──────────────────────────────────────────
		// Default: 'above' the bezier midpoint.
		// Same-column segment loop: the bezier bulges to the right, so place
		// the note to the right of the midpoint instead.
		// The anchor defaults to the bezier midpoint; resolveNotePlacements may
		// slide it along the curve to find white space (keeping box + dot attached).
		/** @type {'center'|'right'|'left'|'above'|'below'} */
		let notePlacement = 'above';

		if (sameCol && fromSide2 && toSide2) {
			// Same-column segment loop — note should sit to the right of the arc.
			notePlacement = 'right';
		}

		newPaths.push({
			id: connection.id,
			d, x1: from.x, y1: from.y, x2: to.x, y2: to.y,
			mx, my, cx1, cy1, cx2, cy2,
			fromType, toType,
			lineStyle: getLineStyle(fromType, toType),
			note: connection.note ?? null,
			notePlacement, noteAnchorX: mx, noteAnchorY: my
		});
	}

	// ── Note placement resolution ───────────────────────────────────────────
	// Each note prefers to sit over WHITE SPACE (avoiding passage-segment boxes)
	// and to not overlap other notes. The resolver scores every candidate
	// placement/offset and commits the best, treating already-placed notes as
	// obstacles for the ones that follow.
	const notePaths = newPaths.filter(p => p.note);
	if (notePaths.length > 0) {
		const segmentBoxes = collectSegmentBoxes(svgRect, scale);
		resolveNotePlacements(notePaths, segmentBoxes, scale);
	}

		paths = newPaths;
	}

	// ─── Drop handle computation ──────────────────────────────────────────────

	/**
	 * Build the list of valid drop targets for the dragged endpoint.
	 *
	 * An item can only have ONE connection to another item, so any element that
	 * already has a connection to the fixed end is excluded — its handle is never
	 * created, which means it can neither be highlighted nor snapped to during the
	 * drag.  The connection currently being dragged is excluded from that check so
	 * dropping back onto its own current target is still permitted.
	 *
	 * @param {string|null} fixedElementId
	 * @param {ConnType} fixedType — type of the fixed (non-dragged) endpoint
	 * @param {string} connectionId — id of the connection being dragged
	 * @returns {Handle[]}
	 */
	function computeDropHandles(fixedElementId, fixedType, connectionId) {
		if (!svgElement) return [];
		const svgRect = svgElement.getBoundingClientRect();
		/** @type {Handle[]} */
		const handles = [];

		// Column: single handle at top-center — no left/right pair needed
		document.querySelectorAll('.column[data-column-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.columnId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'column', id, connectionId)) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const { x, y } = getAnchorPoint(rect, 'column', svgRect);
			handles.push({ elementId: id, type: 'column', side: 'left', x, y });
		});

		// Section: single handle at bottom-center — no left/right pair needed
		document.querySelectorAll('.section[data-section-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.sectionId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'section', id, connectionId)) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			const { x, y } = getAnchorPoint(rect, 'section', svgRect);
			handles.push({ elementId: id, type: 'section', side: 'left', x, y });
		});

		// Segment: two handles — left midpoint and right midpoint
		document.querySelectorAll('[data-segment-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.segmentId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'segment', id, connectionId)) return;
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
		const fixedType = getFixedElementType(conn, end);

		drag = {
			connectionId: path.id,
			end,
			dragEndType,
			dragLineStyle: path.lineStyle,
			fixedType,
			fixedElementId,
			fixedX, fixedY,
			cursorX: dragX, cursorY: dragY,
			activeHandle: null
		};

		dropHandles = computeDropHandles(fixedElementId, fixedType, path.id);
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

		// Commit any open note editor before switching to a connection selection.
		// (stopPropagation prevents handleDocumentClick from doing this automatically.)
		if (noteEditingId) {
			commitNoteEdit();
		} else if (noteSelectedId) {
			noteSelectedId = null;
			noteEditorActive = false;
		}

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
		const target = /** @type {Element} */ (event.target);
		// Only deselect if the click landed inside the analyze content wrapper
		// (i.e. the passage area), not on toolbar buttons or the commentary panel.
		const contentWrapper =
			svgElement?.closest('.analyze-content-wrapper') ??
			svgElement?.closest('.analyze-content');
		if (!contentWrapper || !contentWrapper.contains(target)) return;

		// If a note is open for editing and the click is inside the passage,
		// commit the note (equivalent to NoteEditor's isActive-goes-false path).
		if (noteEditingId) {
			commitNoteEdit();
		} else if (noteSelectedId) {
			noteSelectedId = null;
			noteEditorActive = false;
		}

		if (selectedPathIds.size === 0) return;
		selectedPathIds = new Set();
		setActiveConnection(false, []);
	}

	// Clear local selected state if an external action deselects the connection
	// (e.g. user clicks a segment, which calls setActiveSegment and clears the connection)
	$effect(() => {
		if (!$toolbarState.hasActiveConnection && selectedPathIds.size > 0) {
			selectedPathIds = new Set();
		}
	});

	// Clear note-selected state when the toolbar editor state is cleared externally
	$effect(() => {
		if (!$toolbarState.hasActiveHeadingOrNoteEditor && noteSelectedId) {
			noteSelectedId = null;
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
			if (path.lineStyle === 'dashdot') return !$toolbarState.crossItemConnectionsVisible;
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

	// ── noteEditorActive drives hasActiveHeadingOrNoteEditor via microtask ────
	// $state + $effect mirrors NoteEditor.svelte: setting noteEditorActive=false
	// synchronously in commitNoteEdit schedules the store update as a microtask,
	// so the Delete button's click still sees hasActiveHeadingOrNoteEditor=true.
	$effect(() => {
		setHeadingOrNoteEditorActive(noteEditorActive, noteEditorActive ? 'connection-note' : null);
		return () => setHeadingOrNoteEditorActive(false, null);
	});

	// ── React to external editor-state clearing (e.g. Studies panel click) ──
	// When the toolbar store's hasActiveHeadingOrNoteEditor is set to false by
	// an external caller (StudiesPanel.clearStudyContentState), commit any open
	// note and close the textarea.
	$effect(() => {
		if (!$toolbarState.hasActiveHeadingOrNoteEditor && noteEditingId) {
			commitNoteEdit();
		}
	});

	// ── Mutual exclusion with inline (passage) notes ──────────────────────────
	// If the user clicks an inline note while a connection note is in edit mode,
	// hasActiveSegment becomes true (set by NoteEditor/Segment on click).
	// Commit and close the connection note so only one editor is open at a time.
	$effect(() => {
		if ($toolbarState.hasActiveSegment && noteEditingId) {
			commitNoteEdit();
		}
	});

	/**
	 * Enter edit mode for a connection's note (single click → immediate textarea).
	 * Deactivates everything else in the study so only this note editor is active.
	 * @param {string} connectionId
	 */
	function startNoteEdit(connectionId) {
		const conn = connections.find(c => c.id === connectionId);
		if (!conn) return;

		// If a different connection note is already being edited, save it first.
		if (noteEditingId && noteEditingId !== connectionId) {
			commitNoteEdit();
		}

		noteOriginalValue = conn.note ?? '';
		noteInputValue = conn.note ?? '';
		noteSelectedId = connectionId;
		noteEditingId = connectionId;
		noteEditorActive = true;       // drives setHeadingOrNoteEditorActive via $effect

		// Deactivate everything else in the study
		clearSelectedItem();           // Studies panel: selected → active-only
		setActiveSegment(false, null); // segment + inline note editor
		setActiveSection(false, null); // section
		setActiveColumn(false, null);  // column
		setActiveConnection(false, []); // connection arc selection (selectedPathIds cleared via $effect)
	}

	/**
	 * Commit the current note value and exit edit mode.
	 * noteEditorActive=false is set synchronously; the $effect schedules the store
	 * update as a microtask so the Delete button click still sees the editor active.
	 */
	function commitNoteEdit() {
		if (!noteEditingId) return;
		const id = noteEditingId;
		const text = noteInputValue;
		noteEditingId = null;
		noteEditorActive = false; // $effect schedules store update as microtask
		// Also clear the toolbar store synchronously so reactive effects in the analyze
		// page (which watch isConnectionNoteActive) see the updated value during the
		// SAME Svelte flush — preventing them from clearing activeSegments after the
		// user clicks a heading or inline note while this note was being edited.
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
		noteSelectedId = null;
		noteEditorActive = false;
		noteInputValue = '';
		noteOriginalValue = '';
		if (noteSaveTimeout) { clearTimeout(noteSaveTimeout); noteSaveTimeout = null; }
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
	 * Works whether the note is in edit mode (textarea) or selected display mode.
	 */
	async function handleRemoveConnectionNote() {
		// Determine which connection's note to delete
		const id = noteEditingId ?? noteSelectedId ?? ([...selectedPathIds][0] ?? null);
		if (!id) return;

		// Clear all note state
		noteEditingId = null;
		noteSelectedId = null;
		noteEditorActive = false; // clears toolbar state via $effect
		noteInputValue = '';
		noteOriginalValue = '';
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
		const _crossVis   = $toolbarState.crossItemConnectionsVisible;
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
			resizeObserver = new ResizeObserver(() => scheduleCalculate());
			resizeObserver.observe(contentWrapper);
		}

		scrollContainer = /** @type {HTMLElement|null} */ (svgElement.closest('.analyze-content'));
		if (scrollContainer) {
			scrollContainer.addEventListener('scroll', scheduleCalculate, { passive: true });
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

		// Column/section spacing changes (live drag + modal apply/reset) reflow the
		// passage text, so the note layout must re-evaluate to keep notes over
		// white space. The reposition composables dispatch 'analyze-layout-changed'
		// on each drag mousemove; the spacing modals fire their own set/reset events.
		window.addEventListener('analyze-layout-changed', handleLayoutChanged);
		window.addEventListener('set-section-spacing', handleLayoutChanged);
		window.addEventListener('reset-section-spacing', handleLayoutChanged);
		window.addEventListener('set-column-spacing', handleLayoutChanged);
		window.addEventListener('reset-column-spacing', handleLayoutChanged);
		window.addEventListener('reset-section-position', handleLayoutChanged);

		requestAnimationFrame(calculatePaths);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		scrollContainer?.removeEventListener('scroll', scheduleCalculate);
		contentInner?.removeEventListener('transitionend', handleTransitionEnd);
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		document.removeEventListener('click', handleDocumentClick);
		window.removeEventListener('connection-insert-note', handleInsertConnectionNote);
		window.removeEventListener('connection-remove-note', handleRemoveConnectionNote);
		window.removeEventListener('analyze-layout-changed', handleLayoutChanged);
		window.removeEventListener('set-section-spacing', handleLayoutChanged);
		window.removeEventListener('reset-section-spacing', handleLayoutChanged);
		window.removeEventListener('set-column-spacing', handleLayoutChanged);
		window.removeEventListener('reset-column-spacing', handleLayoutChanged);
		window.removeEventListener('reset-section-position', handleLayoutChanged);
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
	class:connections-layer--hidden={!$toolbarState.columnConnectionsVisible && !$toolbarState.sectionConnectionsVisible && !$toolbarState.segmentConnectionsVisible && !$toolbarState.crossItemConnectionsVisible}
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

		{#snippet endpointNodes(path)}
			<!-- From-end: column=■ square, section=◆ diamond, segment=● circle -->
			{#if path.fromType === 'column'}
				<rect class="connection-node connection-node--square"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					x={path.x1 - 4} y={path.y1 - 4} width="8" height="8"
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.fromType === 'section'}
				<polygon class="connection-node connection-node--diamond"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					points={diamondPoints(path.x1, path.y1)}
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.fromType === 'segment'}
				<circle class="connection-node"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					cx={path.x1} cy={path.y1} r="4"
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					onpointerdown={(e) => startDrag(e, path, 'from')}
					onclick={(e) => e.stopPropagation()}
				/>
			{/if}
			<!-- To-end: column=■ square, section=◆ diamond, segment=● circle -->
			{#if path.toType === 'column'}
				<rect class="connection-node connection-node--square"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					x={path.x2 - 4} y={path.y2 - 4} width="8" height="8"
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					onpointerdown={(e) => startDrag(e, path, 'to')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.toType === 'section'}
				<polygon class="connection-node connection-node--diamond"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					points={diamondPoints(path.x2, path.y2)}
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					onpointerdown={(e) => startDrag(e, path, 'to')}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else if path.toType === 'segment'}
				<circle class="connection-node"
					class:connection-node--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
					class:connection-node--selected={selectedPathIds.has(path.id)}
					class:connection-node--dragging={!!drag && drag.connectionId === path.id}
					cx={path.x2} cy={path.y2} r="4"
					onpointerenter={() => { hoveredPathId = path.id; }}
					onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
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
				class:connection-path--dragging={!!drag && drag.connectionId === path.id}
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

		<!-- Pass 2: non-selected nodes -->
		<!-- Split by SELECTION only (not hover): hovering must never move a node -->
		<!-- between passes, or the pointerdown that starts a drag would be lost.  -->
		{#each visiblePaths as path (path.id)}
			{#if !selectedPathIds.has(path.id)}
				{@render endpointNodes(path)}
			{/if}
		{/each}

		<!-- Pass 3: selected nodes — rendered last so always on top -->
		{#each visiblePaths as path (path.id)}
			{#if selectedPathIds.has(path.id)}
				{@render endpointNodes(path)}
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
			<!-- When snapped to a handle, preview the line style the connection WOULD
			     become (fixed end + snapped target type). Otherwise keep the original. -->
			{@const ghostLineStyle = drag.activeHandle
				? getLineStyle(drag.fixedType, drag.activeHandle.type)
				: drag.dragLineStyle}
			<line
				class="connection-ghost"
				class:connection-ghost--dashed={ghostLineStyle === 'dashed'}
				class:connection-ghost--dotted={ghostLineStyle === 'dotted'}
				class:connection-ghost--dashdot={ghostLineStyle === 'dashdot'}
				x1={drag.fixedX} y1={drag.fixedY} x2={ghostX} y2={ghostY}
			/>

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
	<!-- Note wrappers are rendered before the anchor-dot SVG so that the dots  -->
	<!-- always paint on top of (over) the note boxes (z-axis layering).        -->
	{#if $toolbarState.connectionNotesVisible}
		{#each visiblePaths as path (path.id)}
			{#if path.note || noteEditingId === path.id}
				<!-- Note positioned at the bezier midpoint (SVG units → CSS pixels via scale) -->
				<div
					class="connection-note-wrapper"
					class:connection-note-wrapper--editing={noteEditingId === path.id}
					class:connection-note-wrapper--selected={noteSelectedId === path.id || selectedPathIds.has(path.id)}
					style="left: {path.noteAnchorX}px; top: {path.noteAnchorY}px; transform: {noteTransform(path.notePlacement)};"
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
										onkeydown={handleNoteKeydown}
								use:focusOnMount
								rows="1"
							></textarea>
							<div class="connection-note-char-counter" class:at-limit={noteInputValue.length >= MAX_NOTE_CHARS}>
								{noteInputValue.length} / {MAX_NOTE_CHARS}
							</div>
						</div>
					{:else}
						<!-- Display mode: single click enters edit mode immediately -->
						<div
							class="connection-note-display"
							class:connection-note-display--interactive={hoveredPathId === path.id || selectedPathIds.has(path.id) || noteSelectedId === path.id}
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

	<!-- ── Note anchor dots (top layer) ────────────────────────────────────── -->
	<!-- Rendered AFTER the note wrappers so the dot SVG sits above them in the -->
	<!-- z-stack.  The separate SVG shares the same coordinate space as the     -->
	<!-- main connections-overlay SVG but has a higher z-index.                 -->
	{#if $toolbarState.connectionNotesVisible}
		<svg class="connections-dots-overlay" aria-hidden="true" focusable="false">
			{#each visiblePaths as path (path.id)}
				{#if path.note}
					<circle
						class="connection-note-dot"
						class:connection-note-dot--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
						class:connection-note-dot--selected={selectedPathIds.has(path.id)}
						cx={path.noteAnchorX} cy={path.noteAnchorY} r="4"
					/>
				{/if}
			{/each}
		</svg>
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

	.connection-path--hovered  { stroke: var(--blue); }
	.connection-path--selected { stroke: var(--blue); stroke-width: 2.5; }

	/* While dragging an endpoint, the original arc keeps its line style but
	   renders in a lighter blue. Placed after hovered/selected so it wins. */
	.connection-path--dragging { stroke: var(--blue-light); }

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

	/* Dragged connection's anchors render lighter blue during the drag.
	   Placed after hovered/selected so the lighter blue wins while dragging. */
	.connection-node--dragging {
		fill: var(--blue-light);
		stroke: var(--blue-light);
	}

	.connection-node--ghost {
		fill: var(--blue-light);
		stroke: var(--blue-light);
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
		stroke: var(--blue-light);
		stroke-width: 2;
		stroke-linecap: round;
		pointer-events: none;
	}

	/* Ghost line mirrors the dragged connection's line style. */
	.connection-ghost--dashed  { stroke-dasharray: 6 4; }
	.connection-ghost--dotted  { stroke-dasharray: 2 4; }
	.connection-ghost--dashdot { stroke-dasharray: 6 3 1 3; }

	/* ── Quick Note ── */

	.connection-note-wrapper {
		position: absolute;
		/* transform is set inline via noteTransform() — see template */
		pointer-events: auto;
		z-index: 10;
	}

	/* ── Note anchor dot top-layer SVG ── */
	/* Sits above the HTML note wrappers (z-index > 10) so the dot is always   */
	/* visible on top of the note box it visually anchors.                      */
	.connections-dots-overlay {
		position: absolute;
		top: 0; left: 0;
		width: 100%; height: 100%;
		pointer-events: none;
		overflow: visible;
		z-index: 15;
	}

	/* Note anchor dot — ties the note box to the bezier arc */
	.connection-note-dot {
		fill: var(--gray-400);
		pointer-events: none;
		transition: fill 0.15s;
	}

	/* Turn blue when hovering over the connection's line (matches the line +
	   endpoint node highlight), or when the connection is selected. */
	.connection-note-dot--hovered,
	.connection-note-dot--selected {
		fill: var(--blue);
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
		/* Size to content up to the cap. Without an intrinsic width, an
		   absolutely-positioned box near the right edge of the connections
		   layer (as happens in Compare/Focus mode) collapses to the few px
		   of available space and the text wraps into a 1-char-wide strip. */
		width: max-content;
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
