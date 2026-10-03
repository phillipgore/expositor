<script>
	/**
	 * ConnectionsOverlay Component
	 *
	 * Renders SVG bezier curves between connected structural elements.
	 * Each end of a connection can be a different type (cross-type connections).
	 *
	 * Visual language:
	 *   Column   → ■ square endpoints,  solid line      ──────
	 *   Section  → ◆ diamond endpoints, solid line      ──────
	 *   Segment  → ● circle endpoints,  solid line      ──────
	 *   Mixed    → solid line                           ──────
	 *
	 * All connection lines render solid; the differing endpoint shapes and
	 * anchor points remain the distinguishing visual language between types.
	 *
	 * Anchor points:
	 *   Column  → top edge; slides horizontally toward the opposite endpoint
	 *   Section → top or bottom edge; slides horizontally toward the opposite endpoint
	 *   Segment → left or right side edge, 1/2 of the way down (vertically)
	 *
	 * Column/Section anchors are no longer locked to the element's horizontal
	 * centre: each one slides along its edge toward the opposite endpoint so the
	 * connecting line is as short as possible.  Multiple connections sharing one
	 * edge fan out just enough (ANCHOR_SPACING) to keep their endpoint nodes from
	 * overlapping, each clustering around its own ideal (shortest-line) position.
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
	import { toolbarState, setActiveConnection, setHeadingOrNoteEditorActive, clearHeadingOrNoteEditorActiveKey, setToolbarState, clearSelectedItem, setActiveSegment, setActiveSection, setActiveColumn, showConnectionsForTypes } from '$lib/stores/toolbar.js';
	import { QUICK_NOTE_MAX_CHARS } from '$lib/constants/notes.js';
	import { endpointOf, stubLabel } from '$lib/utils/connectionStubs.js';
	import { routeCorner } from '$lib/utils/cornerRouting.js';



	// `seriesParts` and `structureOwnership` are supplied only for a part of a series, and only exist to
	// label edge stubs (§8 (c), phase 3). A standalone study passes neither and behaves exactly as before.
	let {
		connections = [],
		scale: scaleProp = 1,
		seriesParts = null,
		structureOwnership = null
	} = $props();

	/**
	 * Edge stubs for connections whose other endpoint lives in a different part.
	 * @type {Array<{ id: string, x1: number, y1: number, x2: number, y2: number, d: string, label: string, direction: 'forward'|'backward', lineStyle: string }>}
	 */
	let stubs = $state([]);

	/** Length (layout units) of a stub's tail, and the gap it leaves at the canvas edge. */
	const STUB_LENGTH = 26;

	/**
	 * Describe the stub for a connection with one endpoint off this page, or null if it is not a
	 * cross-part link at all.
	 *
	 * Returns null — meaning "draw nothing" — for the two cases that look identical in the DOM but mean
	 * different things: an endpoint absent because content is still streaming, and a row whose absent
	 * endpoint belongs to no part we know of. Neither is a continuation, and a marker claiming otherwise
	 * would be a confident false statement of the kind §8 warns about.
	 *
	 * @param {any} connection
	 * @param {'from'|'to'} presentEnd
	 * @returns {{ label: string, direction: 'forward'|'backward' }|null}
	 */
	function describeStub(connection, presentEnd) {
		if (!seriesParts || !structureOwnership) return null;

		const absentEnd = presentEnd === 'from' ? 'to' : 'from';
		const absent = endpointOf(connection, absentEnd);
		if (!absent.id) return null;

		const otherPartId = structureOwnership[absent.id];
		if (!otherPartId) return null;

		const here = seriesParts.findIndex((part) => part.id === connection.studyId);
		const there = seriesParts.findIndex((part) => part.id === otherPartId);
		if (there === -1) return null;

		return {
			label: stubLabel({ orderedParts: seriesParts, partId: otherPartId }),
			// Compared by position in `seriesOrder`, which is what prev/next follows (§7) — never by the
			// ranges, since §4 forbids re-deriving the user's arrangement from canonical order.
			direction: here !== -1 && there < here ? 'backward' : 'forward'
		};
	}

	/**
	 * Temporary scale override used ONLY during image/PDF export.
	 *
	 * The export utility (exportAnalyze.js) strips the on-screen zoom transform
	 * from `.analyze-content-inner` so the FULL study is captured at natural size
	 * (effective scale = 1).  All of our path math divides client-rect distances
	 * by `scale`, so while the transform is removed we must measure with scale = 1
	 * — otherwise every coordinate is divided by the stale on-screen zoom (e.g.
	 * 0.5) and anchors/notes scatter while lines fly off-canvas.  When null, the
	 * live `scaleProp` (the real zoom) is used.
	 * @type {number|null}
	 */
	let exportScaleOverride = $state(/** @type {number|null} */ (null));

	/**
	 * Effective scale used by every measurement/render below.  Equals the live
	 * zoom normally, or 1 while an export capture is in progress.
	 */
	let scale = $derived(exportScaleOverride ?? scaleProp);

	/** @type {SVGSVGElement | null} */
	let svgElement = $state(null);


	/**
	 * @typedef {'segment'|'section'|'column'} ConnType
	 * @typedef {'solid'|'dashed'|'dotted'|'dashdot'} LineStyle
	 * @typedef {'curved'|'straight'|'cornered'} LineRoute
	 * @typedef {'gray'|'mixed'|'red'|'orange'|'yellow'|'green'|'aqua'|'blue'|'purple'|'pink'} LineColor
	 * @typedef {{ a: { x: number, y: number }, b: { x: number, y: number }, axis: 'x'|'y'|'xy' }} CornerRun
	 *   Where a cornered route's shaping handle starts (the handle itself moves freely).
	 * @typedef {{ x: number, y: number, baseX: number, baseY: number, axis: 'x'|'y'|'xy'|null }} ShapeHandle
	 * @typedef {{ route: LineRoute, routeShift: number, bendAlong: number|null, bendPerp: number|null, bendShift: number, chord: { x1: number, y1: number, x2: number, y2: number }, shapeHandle: ShapeHandle|null, lineColor: LineColor, fromColor: string|null, toColor: string|null, id: string, d: string, x1: number, y1: number, x2: number, y2: number, mx: number, my: number, cx1: number, cy1: number, cx2: number, cy2: number, fromType: ConnType, toType: ConnType, fromEdge: 'top'|'bottom'|'left'|'right', toEdge: 'top'|'bottom'|'left'|'right', lineStyle: LineStyle, note: string|null, notePlacement: 'center'|'right'|'left'|'above'|'below', noteAnchorSide: 'top'|'right'|'bottom'|'left', noteAnchorT: number, noteAnchorX: number, noteAnchorY: number, noteOffset: number, noteLead: number, noteCardX: number, noteCardY: number, handleCorner: 'tl'|'tr'|'bl'|'br', fromSlide: { axis: 'x'|'y', lo: number, hi: number }|null, toSlide: { axis: 'x'|'y', lo: number, hi: number }|null }} PathEntry




	 * @typedef {'top'|'bottom'|'left'|'right'} AnchorEdge
	 * @typedef {{ elementId: string, type: ConnType, edge: AnchorEdge, x1: number, y1: number, x2: number, y2: number }} DropSide
	 *   An allowed side of an element (layout units) a dragged connection point can snap onto.
	 * @typedef {{ elementId: string, type: ConnType, edge: AnchorEdge, pos: number, x: number, y: number }} DropSpot
	 *   The snapped drop point: a side plus the fraction `pos` (0…1) along it.
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
	 *   activeHandle: DropSpot|null
	 * } | null}
	 */
	let drag = $state(null);

	/** Allowed sides a dragged connection point can snap onto (computed at drag start). @type {DropSide[]} */
	let dropHandles = $state([]);

	/** ID of the path currently under the pointer (for hover highlight). */
	let hoveredPathId = $state(/** @type {string|null} */ (null));

	/** IDs of the currently selected connection paths (supports multi-select). */
	let selectedPathIds = $state(/** @type {Set<string>} */ (new Set()));

	/**
	 * ID of a connection that should be selected as soon as it appears in the
	 * computed paths.  Set when a "select-connection" event arrives (e.g. right
	 * after inserting a connection) but the new connection's path hasn't been
	 * measured yet — the $effect below claims it once calculatePaths() produces it.
	 */
	let pendingSelectId = $state(/** @type {string|null} */ (null));


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

	/** Maximum characters allowed in a connection note (shared; also enforced server-side on merge). */
	const MAX_NOTE_CHARS = QUICK_NOTE_MAX_CHARS;

	/** Reference to the note textarea for auto-grow. @type {HTMLTextAreaElement|null} */
	let noteTextareaRef = $state(null);

	// ─── Note placement (drag) state ──────────────────────────────────────────

	/**
	 * Live placement overrides applied DURING a note drag, keyed by connection id.
	 * Each entry holds the in-progress anchor parameter `t` (0..1 along the curve),
	 * the card `side` it attaches to, and the perpendicular `offset` (CSS px).
	 * calculatePaths() merges these over the persisted values so the dot/card track
	 * the cursor smoothly; on release the final values are PATCHed and the override
	 * is dropped once the persisted data refreshes.
	 * @type {Record<string, { t: number|null, side: ('top'|'right'|'bottom'|'left')|null, offset: number|null, lead?: number|null }>}
	 */
	let notePlacementOverrides = $state({});

	/**
	 * Live line-route overrides (Connect menu → Curved/Straight/Cornered Connection),
	 * keyed by connection id. Applied immediately for an instant redraw and dropped
	 * once the PATCH + invalidate lands the persisted `lineRoute`.
	 * @type {Record<string, LineRoute>}
	 */
	let routeOverrides = $state({});

	/**
	 * Live shaping-handle overrides during a drag, keyed by connection id. `route`
	 * is set when the drag changes the route (straight → curved). Dropped once the
	 * PATCH + invalidate lands the persisted bend.
	 * @type {Record<string, { along: number|null, perp: number|null, route?: LineRoute }>}
	 */
	let bendOverrides = $state({});

	/**
	 * Live line-color overrides (Color menu → a color, Gray or Mixed), keyed by connection
	 * id. Applied instantly, dropped once the PATCH + invalidate lands.
	 * @type {Record<string, LineColor>}
	 */
	let colorOverrides = $state({});

	/**
	 * Active shaping-handle drag, or null when idle. Positions are in layout
	 * units; the drag moves `base` by the pointer delta (never snaps to cursor).
	 * @type {{ id: string, startX: number, startY: number, baseX: number, baseY: number, route: LineRoute, axis: 'x'|'y'|'xy'|null, startShift: number, chord: { x1: number, y1: number, x2: number, y2: number } } | null}
	 */
	let shapeDrag = $state(null);

	/** True once the active shaping drag has passed NOTE_DRAG_THRESHOLD. */
	let shapeDidDrag = $state(false);


	/**
	 * Active note-placement drag, or null when idle.
	 *   mode 'dot'  → dragging the anchor dot ALONG the connection curve (sets t)
	 *   mode 'card' → sliding the card along its attached edge (sets offset)
	 * @type {{ id: string, mode: 'dot'|'card', startX: number, startY: number, startAnchorX?: number, startAnchorY?: number, startOffset: number, startLead: number, placement: ('center'|'right'|'left'|'above'|'below'), side: ('top'|'right'|'bottom'|'left') } | null}
	 */
	let notePlacementDrag = $state(null);


	/**
	 * True once the active placement drag has moved past DRAG_THRESHOLD px. A card
	 * pointerdown doubles as a click-to-edit trigger, so we only commit/persist a
	 * slide — and suppress the subsequent click→edit — once the pointer has
	 * actually moved. Reset at the start of every placement drag.
	 */
	let notePlacementDidDrag = $state(false);

	/** Pixels the pointer must travel before a card pointerdown becomes a slide. */
	const NOTE_DRAG_THRESHOLD = 4;

	/**
	 * Minimum lead gap (layout units) before a leader line is drawn between the
	 * anchor dot and the card. Below this the card is close enough that a connector
	 * would just clutter the dot, so we skip it.
	 */
	const NOTE_LEADER_MIN = 6;


	/**
	 * Set on the pointerup that ends a note-placement interaction (dot or card) so
	 * the document `click` that immediately follows doesn't deselect the connection
	 * we just selected/activated by grabbing the anchor. Consumed (and cleared) by
	 * handleDocumentClick.
	 */
	let suppressNextDocumentClick = $state(false);


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

	/**
	 * Export coordination (image / PDF capture).
	 *
	 * exportAnalyze.js strips the zoom transform from `.analyze-content-inner` so
	 * the FULL study is captured at natural size, then dispatches these window
	 * events around the snapshot:
	 *
	 *   'analyze-export-prepare' → force the overlay to recompute with scale = 1
	 *      (matching the now-untransformed DOM) so every anchor, line and note dot
	 *      lands on its true natural-size coordinate INSTEAD of being divided by
	 *      the stale on-screen zoom.  We recompute synchronously here (not via the
	 *      rAF coalescer) so the paths are in the DOM the moment the util's own
	 *      rAF fires and html-to-image snapshots.
	 *
	 *   'analyze-export-cleanup' → drop the override and recompute for the
	 *      restored on-screen zoom.
	 */
	/**
	 * Inline color overrides applied to the SVG shapes during export so their
	 * resting (gray) colors survive the html-to-image snapshot. Kept so cleanup
	 * can remove exactly what it added. @type {SVGElement[]}
	 */
	let exportColorEls = /** @type {SVGElement[]} */ ([]);
	/** Colored lines: only stroke-width is pinned for export (their inline stroke is Svelte-managed). */
	let exportWidthOnlyEls = /** @type {SVGElement[]} */ ([]);

	/**
	 * Overlay SVGs we pinned with an explicit viewBox/width/height during export.
	 * Tracked so cleanup can restore them to their live width:100%/height:100%
	 * (no viewBox) state. @type {SVGElement[]}
	 */
	let exportViewBoxEls = /** @type {SVGElement[]} */ ([]);

	/**
	 * Pin both overlay SVGs to an explicit pixel `width`/`height` + matching
	 * `viewBox` so html-to-image maps their user units 1:1 to CSS px from the
	 * top-left origin during capture.
	 *
	 * Why: the two sibling overlay SVGs (.connections-overlay for lines/nodes and
	 * .connections-dots-overlay for note dots) both use width:100%/height:100% and
	 * NO viewBox. html-to-image clones each SVG and, lacking an explicit intrinsic
	 * size + coordinate system, can resolve their user-unit origin inconsistently —
	 * so the note dots (and the plain HTML note cards) land correctly while the
	 * lines and endpoint nodes are shifted, even though every coordinate comes from
	 * the SAME paths array in the SAME space. Giving both SVGs `viewBox="0 0 W H"`
	 * with width=W/height=H (W,H = natural content size) makes their user units map
	 * exactly to the layout pixels the HTML cards already use, so lines, nodes,
	 * dots and cards all align. cleanup() removes these so the live overlay returns
	 * to its responsive width:100%/height:100% (no viewBox).
	 */
	function applyExportViewBox() {
		if (!svgElement) return;
		const layer = svgElement.closest('.connections-layer');
		if (!layer) return;
		// Natural content size: the layer is width:100%/height:100% of the now
		// untransformed .analyze-content-inner, so its rect IS the natural size.
		const rect = layer.getBoundingClientRect();
		const w = Math.round(rect.width);
		const h = Math.round(rect.height);
		if (w === 0 || h === 0) return;

		/** @type {SVGElement[]} */
		const pinned = [];
		layer.querySelectorAll('.connections-overlay, .connections-dots-overlay').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			svg.setAttribute('width', String(w));
			svg.setAttribute('height', String(h));
			svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
			pinned.push(svg);
		});
		exportViewBoxEls = pinned;
	}

	/** Restore both overlay SVGs to their live responsive (no-viewBox) state. */
	function clearExportViewBox() {
		for (const el of exportViewBoxEls) {
			el.removeAttribute('width');
			el.removeAttribute('height');
			el.removeAttribute('viewBox');
		}
		exportViewBoxEls = [];
	}



	/**
	 * Bake resolved theme colors as inline `style` onto every overlay SVG shape.
	 *
	 * html-to-image clones the DOM to serialize it, and CSS custom properties
	 * (var(--gray-300), …) used in the component's SCOPED stylesheet are NOT
	 * carried onto the cloned SVG presentation attributes. The browser then falls
	 * back to each property's SVG initial value — fill = black, stroke = none — so
	 * in the capture the endpoint nodes/dots turn solid black and the connection
	 * lines (fill:none + variable stroke) vanish entirely.
	 *
	 * Resolving the variables to concrete hsl() strings and writing them as inline
	 * styles (which DO survive the clone, and outrank the scoped CSS) fixes both.
	 * We bake the RESTING appearance — solid gray lines and gray nodes — since the
	 * export is a static snapshot; hover/selection highlight colors are intentionally
	 * not carried over. cleanup() removes every inline style we set.
	 */
	function applyExportColors() {
		if (!svgElement) return;
		const root = getComputedStyle(document.documentElement);
		const c = (name, fallback) => (root.getPropertyValue(name).trim() || fallback);
		const lineColor = c('--gray-300', '#545251');
		const nodeFill  = c('--gray-600', '#94908d');
		const nodeStroke = c('--gray-300', '#545251');
		const dotFill   = c('--gray-400', '#716e6c');

		const layer = svgElement.closest('.connections-layer');
		if (!layer) return;

		/** @type {SVGElement[]} */
		const touched = [];
		// Connection lines: solid gray stroke, no fill. Mixed lines keep their
		// gradient stroke (concrete stop colors survive the clone) — only the
		// width/fill are pinned for them.
		layer.querySelectorAll('.connection-path').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			if (svg.classList.contains('connection-path--colored')) {
				// Keep the Svelte-managed inline gradient stroke; cleanup must not
				// strip it, so pin only the width and track it separately.
				svg.style.setProperty('stroke-width', '2');
				exportWidthOnlyEls.push(svg);
				return;
			}
			svg.style.setProperty('stroke', lineColor);
			svg.style.setProperty('stroke-width', '2');
			svg.style.setProperty('fill', 'none');
			touched.push(svg);
		});
		// Endpoint nodes (square / diamond / circle): gray fill + lighter stroke.
		layer.querySelectorAll('.connection-node').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			// Colored-line nodes already carry their end color inline; keep it.
			if (svg.classList.contains('connection-node--colored')) return;
			svg.style.setProperty('fill', nodeFill);
			svg.style.setProperty('stroke', nodeStroke);
			touched.push(svg);
		});
		// Note anchor dots: gray fill.
		layer.querySelectorAll('.connection-note-dot').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			svg.style.setProperty('fill', dotFill);
			touched.push(svg);
		});
		// Invisible helper geometry (the large grab-target circle behind each note
		// dot, and the fat line hit-targets) get their invisibility ONLY from
		// scoped CSS (fill:transparent / stroke:transparent) with no SVG attribute.
		// html-to-image drops those scoped values on clone, so they'd otherwise
		// fall back to the SVG defaults (fill:black) and paint as big black discs
		// over the real anchors. Force them transparent inline so they stay unseen.
		layer.querySelectorAll('.connection-note-dot-target').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			svg.style.setProperty('fill', 'transparent');
			svg.style.setProperty('stroke', 'none');
			touched.push(svg);
		});
		layer.querySelectorAll('.connection-hit-target').forEach((el) => {
			const svg = /** @type {SVGElement} */ (el);
			svg.style.setProperty('fill', 'none');
			svg.style.setProperty('stroke', 'transparent');
			touched.push(svg);
		});
		exportColorEls = touched;


	}

	/** Remove every inline color override applied by applyExportColors(). */
	function clearExportColors() {
		for (const el of exportColorEls) {
			const s = /** @type {SVGElement} */ (el).style;
			s.removeProperty('stroke');
			s.removeProperty('stroke-width');
			s.removeProperty('fill');
		}
		exportColorEls = [];
		for (const el of exportWidthOnlyEls) /** @type {SVGElement} */ (el).style.removeProperty('stroke-width');
		exportWidthOnlyEls = [];
	}

	const handleExportPrepare = () => {
		exportScaleOverride = 1;
		calculatePaths();
		// Pin both overlay SVGs to an explicit size + viewBox so html-to-image's
		// foreignObject rasterizer maps their user units 1:1 (lines/nodes/dots all
		// align). Done here (after the scale=1 recompute, while the DOM is at
		// natural size) so the layer rect we read is the natural content size.
		applyExportViewBox();
		// Bake colors AFTER the recompute so the freshly-rendered shapes are styled.
		requestAnimationFrame(() => applyExportColors());
	};

	const handleExportCleanup = () => {
		clearExportColors();
		clearExportViewBox();
		exportScaleOverride = null;
		calculatePaths();
	};




	// ─── Coordinate helpers ────────────────────────────────────────────────────


	function toSvgCoords(clientX, clientY) {
		if (!svgElement) return { x: 0, y: 0 };
		const r = svgElement.getBoundingClientRect();
		return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
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
	 * Sides a connection point may sit on, per element type. Each type keeps its
	 * own side(s) so nested elements sharing a border never compete for a drop.
	 * Mirrored server-side (connections PATCH validation).
	 * @type {Record<ConnType, AnchorEdge[]>}
	 */
	const ALLOWED_ANCHOR_EDGES = {
		column: ['top'],
		section: ['top', 'bottom'],
		segment: ['left', 'right']
	};

	/**
	 * The user-placed spot for one end, if any and still valid for its type.
	 * @param {any} connection
	 * @param {'from'|'to'} end
	 * @param {ConnType} type
	 * @returns {{ edge: AnchorEdge, pos: number } | null}
	 */
	function placedAnchor(connection, end, type) {
		const edge = end === 'from' ? connection.fromAnchorEdge : connection.toAnchorEdge;
		const pos  = end === 'from' ? connection.fromAnchorPos  : connection.toAnchorPos;
		if (edge == null || pos == null) return null;
		if (!ALLOWED_ANCHOR_EDGES[type]?.includes(edge)) return null;
		return { edge, pos: Math.min(1, Math.max(0, pos)) };
	}

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
	 * Rect to use when anchoring a COLUMN connection end.
	 *
	 * A column box has no fixed height — it wraps its sections via flex.  When the
	 * user pushes the FIRST section down (its reposition offset becomes margin-top),
	 * that margin lives INSIDE the column box, so the column's own top edge stays put
	 * and an empty gap opens above the section header.  Anchoring to the column box
	 * top would leave the square endpoint floating in that gap.
	 *
	 * To keep the column anchor glued to the visible header, we keep the column's
	 * horizontal extent (left / right / width — so the slide range still spans the
	 * column) but take the TOP from the first VISIBLE section.  Falls back to the
	 * column's own rect when it has no visible section.  Re-measured every frame, so
	 * it tracks both a live section drag and a persisted offset.
	 * @param {Element} columnEl
	 * @returns {DOMRect}
	 */
	function columnAnchorRect(columnEl) {
		const colRect = columnEl.getBoundingClientRect();
		const sections = columnEl.querySelectorAll('.section[data-section-id]');
		for (const sec of sections) {
			if (sec.classList.contains('compare-hidden')) continue;
			const r = sec.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue; // skip hidden sections
			// Synthesize: column's horizontal bounds + first visible section's top.
			return /** @type {DOMRect} */ ({
				left:   colRect.left,
				right:  colRect.right,
				width:  colRect.width,
				top:    r.top,
				bottom: colRect.bottom,
				height: colRect.bottom - r.top,
				x:      colRect.left,
				y:      r.top,
				toJSON() { return this; }
			});
		}
		return colRect;
	}


	/**
	 * Distribute a set of anchor points along a one-dimensional edge span so that:
	 *   • each anchor sits as close as possible to its IDEAL coordinate (the spot
	 *     directly across from its opposite endpoint → shortest connecting line),
	 *   • adjacent anchors stay at least ANCHOR_SPACING apart so their endpoint
	 *     nodes never overlap, and
	 *   • every anchor stays inside the usable span [lo, hi].
	 *
	 * `ideals` MUST already be sorted ascending (callers sort members by the far
	 * end's position).  Returns the resolved coordinates in the same order.
	 *
	 * When the ideals are already far enough apart, each one lands exactly on its
	 * ideal — so a single connection (or well-separated ones) gets the shortest
	 * possible line.  When they crowd together, a forward "push-right" pass opens
	 * the minimum gap, then the cluster is shifted back inside [lo, hi].
	 * @param {number[]} ideals — desired coordinates, ascending
	 * @param {number} lo — minimum allowed coordinate
	 * @param {number} hi — maximum allowed coordinate
	 * @returns {number[]}
	 */
	function distributeAlongEdge(ideals, lo, hi) {
		const n = ideals.length;
		if (n === 0) return [];
		if (n === 1) return [Math.min(hi, Math.max(lo, ideals[0]))];

		const usable  = Math.max(0, hi - lo);
		const spacing = Math.min(ANCHOR_SPACING, usable / (n - 1));

		// Start at each clamped ideal, then push later anchors right to open gaps.
		const pos = ideals.map(v => Math.min(hi, Math.max(lo, v)));
		for (let i = 1; i < n; i++) {
			if (pos[i] < pos[i - 1] + spacing) pos[i] = pos[i - 1] + spacing;
		}
		// If the last anchor overran the right bound, slide the whole cluster left.
		const overflow = pos[n - 1] - hi;
		if (overflow > 0) for (let i = 0; i < n; i++) pos[i] -= overflow;
		// Guarantee the left bound (safe: (n−1)·spacing ≤ usable, so the cluster fits).
		if (pos[0] < lo) {
			const shift = lo - pos[0];
			for (let i = 0; i < n; i++) pos[i] += shift;
		}
		return pos;
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

	// ─── Line routes (curved / straight / cornered) ───────────────────────────
	//
	// Every route shares the SAME anchors (Pass A/B pick edges and slide positions
	// identically), so only the drawing between the two anchors differs:
	//   curved   → the historic cubic bezier (cx1..cy2 control points)
	//   straight → one straight segment anchor-to-anchor
	//   cornered → orthogonal polyline that leaves each edge perpendicular to it,
	//              with small rounded bends (CORNER_RADIUS)
	// Non-curved routes are described by a polyline (routePoints) so the note dot,
	// dot dragging and Pass E work on them through the polyline helpers below.

	/** Lateral offset (layout units) beyond which a curved line is guaranteed a visible bend. */
	const CURVE_MIN_LATERAL = 8;
	/** Minimum perpendicular-exit bias for an offset curved line (see controlHandle). */
	const CURVE_MIN_BIAS = 0.9;

	/** Rounded-corner radius (layout units) for cornered routes. */
	const CORNER_RADIUS = 6;
	/** Minimum run (layout units) a cornered route travels straight out of an edge before it may turn back. */
	const CORNER_STUB = 20;
	/** Extra route cost (layout units) for a cornered end that leaves heading
	 *  AWAY from where the line goes (it then has to double round). */
	const CORNER_AWAY_COST = 40;
	/** Extra route cost (layout units) per bend, so simpler routes win. */
	const CORNER_BEND_COST = 10;
	/** Route cost marking a polyline that doubles back on itself (never chosen when avoidable). */
	const CORNER_REVERSAL_COST = 100000;
	/** Below this (layout units) two anchors count as aligned on an axis — a perpendicular sign is ambiguous. */
	const CORNER_ALIGN_EPS = 12;

	/**
	 * Normalise a stored/override route value to a known route.
	 * @param {unknown} value
	 * @returns {LineRoute}
	 */
	function normalizeRoute(value) {
		return value === 'straight' || value === 'cornered' ? value : 'curved';
	}

	/**
	 * Exit direction for a cornered route at one anchor: perpendicular to its edge,
	 * signed toward the opposite anchor (mirrors controlHandle). When the opposite
	 * anchor is (nearly) aligned on that axis, fall back to the edge's outward
	 * direction so e.g. a same-column segment pair loops out to the right.
	 * @param {'top'|'bottom'|'left'|'right'} edge
	 * @param {number} ax @param {number} ay @param {number} ox @param {number} oy
	 * @returns {{ vertical: boolean, sign: number }}
	 */
	function cornerExit(edge, ax, ay, ox, oy) {
		if (edge === 'top' || edge === 'bottom') {
			const dy = oy - ay;
			return { vertical: true, sign: Math.abs(dy) < CORNER_ALIGN_EPS ? (edge === 'top' ? -1 : 1) : Math.sign(dy) };
		}
		const dx = ox - ax;
		return { vertical: false, sign: Math.abs(dx) < CORNER_ALIGN_EPS ? (edge === 'right' ? 1 : -1) : Math.sign(dx) };
	}

	/**
	 * Polyline vertices for a non-curved route. `routeShift` slides the middle run
	 * of a cornered route sideways (set by Pass E to separate overlapping lines).
	 * @param {PathEntry} p
	 * @returns {Array<{ x: number, y: number }>}
	 */
	function routePoints(p) {
		if (p.route !== 'cornered') return [{ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }];
		return cornerShape(p).pts;
	}

	/**
	 * Inset (layout units) kept between a shaping handle and the edge of the study
	 * area, so the handle stays fully visible and grabbable.
	 */
	const SHAPE_HANDLE_BOUNDS_PAD = 12;

	/**
	 * The area a shaping handle may be placed in: the study content box (the
	 * overlay SVG, which spans the whole scrollable study), in layout units. Any
	 * point inside it can be scrolled into view, so a dragged handle can always be
	 * reached again. Null before the overlay has a size.
	 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
	 */
	function shapeHandleBounds() {
		if (!svgElement) return null;
		const r = svgElement.getBoundingClientRect();
		const w = r.width / scale, h = r.height / scale;
		if (w <= 0 || h <= 0) return null;
		const pad = Math.min(SHAPE_HANDLE_BOUNDS_PAD, w / 2, h / 2);
		return { minX: pad, minY: pad, maxX: w - pad, maxY: h - pad };
	}

	/**
	 * Clamp a point (layout units) into the reachable study area.
	 * @param {number} x @param {number} y
	 * @param {{ minX: number, minY: number, maxX: number, maxY: number } | null} bounds
	 * @returns {{ x: number, y: number }}
	 */
	function clampToBounds(x, y, bounds) {
		if (!bounds) return { x, y };
		return {
			x: Math.min(bounds.maxX, Math.max(bounds.minX, x)),
			y: Math.min(bounds.maxY, Math.max(bounds.minY, y))
		};
	}

	/**
	 * The point a curved line is pulled through (its placed handle), in layout
	 * units, kept inside the study area (mirrors Pass C).
	 * @param {PathEntry} p
	 * @returns {{ x: number, y: number }}
	 */
	function curvedPullPoint(p) {
		const c = p.chord ?? { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
		const fr = chordFrame(c);
		const along = (p.bendAlong ?? 0.5) * fr.L;
		const off   = (p.bendPerp ?? 0) * fr.L;
		return clampToBounds(c.x1 + fr.ux * along + fr.nx * off, c.y1 + fr.uy * along + fr.ny * off, shapeHandleBounds());
	}

	/**
	 * The user-placed waypoint of a cornered route, in layout units: `bendAlong`
	 * (along the chord) and `bendPerp` (off it) are fractions of the chord length,
	 * measured from the chord's FROM end.
	 * @param {PathEntry} p
	 * @returns {{ x: number, y: number }}
	 */
	function cornerWaypoint(p) {
		const c = p.chord ?? { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 };
		const fr = chordFrame(c);
		const along = (p.bendAlong ?? 0.5) * fr.L;
		const off   = (p.bendPerp ?? 0) * fr.L;
		// Kept inside the study area so the handle can always be scrolled to (this
		// also brings back a waypoint that was saved off the page before).
		return clampToBounds(c.x1 + fr.ux * along + fr.nx * off, c.y1 + fr.uy * along + fr.ny * off, shapeHandleBounds());
	}

	/**
	 * Passage boxes (sections, layout units) cornered lines route around;
	 * refreshed by calculatePaths.
	 * @type {Array<{ x: number, y: number, w: number, h: number }>}
	 */
	let routeObstacles = [];

	/**
	 * Measure every visible section box (they hold all passage text).
	 * @param {DOMRect} svgRect
	 * @param {number} scl
	 */
	function collectRouteObstacles(svgRect, scl) {
		/** @type {Array<{ x: number, y: number, w: number, h: number }>} */
		const out = [];
		document.querySelectorAll('.section[data-section-id]').forEach(el => {
			if (el.classList.contains('compare-hidden')) return;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			out.push({ x: (r.left - svgRect.left) / scl, y: (r.top - svgRect.top) / scl, w: r.width / scl, h: r.height / scl });
		});
		return out;
	}

	/**
	 * Shortest square route around passage boxes (see utils/cornerRouting.js),
	 * steered by the placed handle (the handle picks the lane). Null when there
	 * is no clear route, so cornerShape falls back to its simple shapes.
	 * @param {PathEntry} p
	 * @returns {{ pts: Array<{ x: number, y: number }>, run: CornerRun } | null}
	 */
	function routeCornerAround(p) {
		const bounds = shapeHandleBounds();
		if (!bounds || !p.fromEdge || !p.toEdge) return null;
		const placed = p.bendAlong != null && p.bendPerp != null;
		const r = routeCorner({
			a: { x: p.x1, y: p.y1 }, b: { x: p.x2, y: p.y2 },
			fromEdge: p.fromEdge, toEdge: p.toEdge,
			obstacles: routeObstacles, bounds,
			handle: placed ? cornerWaypoint(p) : null
		});
		if (!r) return null;
		return { pts: r.pts, run: { a: r.handle, b: r.handle, axis: 'xy' } };
	}

	/**
	 * The simplest square route from one end P to the waypoint W: leave P along
	 * `axis` straight toward W, turn once, arrive at W. Any direction is allowed
	 * — a top-edge point may leave left or right, a side-edge point up or down.
	 * @param {{ x: number, y: number }} P
	 * @param {'x'|'y'} axis — the axis P leaves along
	 * @param {{ x: number, y: number }} w
	 * @returns {Array<{ x: number, y: number }>} P … W
	 */
	function cornerDirectHalf(P, axis, w) {
		return axis === 'x' ? [P, { x: w.x, y: P.y }, w] : [P, { x: P.x, y: w.y }, w];
	}

	/**
	 * Which way an end should leave to reach W: along the axis W mostly lies on
	 * (the user drags the handle to the right of a point → the line comes out to
	 * the right), then the other axis. `ratio` says how clear-cut that is.
	 * @param {{ x: number, y: number }} P
	 * @param {{ x: number, y: number }} w
	 * @returns {{ axes: Array<'x'|'y'>, ratio: number }}
	 */
	function cornerExitPrefs(P, w) {
		const dx = Math.abs(w.x - P.x), dy = Math.abs(w.y - P.y);
		const dom = dx >= dy ? 'x' : 'y';
		return { axes: dom === 'x' ? ['x', 'y'] : ['y', 'x'], ratio: (Math.max(dx, dy) + 1) / (Math.min(dx, dy) + 1) };
	}

	/**
	 * Candidate square routes from one end P to the waypoint W. Like a curved
	 * line, a cornered line may leave P in EITHER direction perpendicular to its
	 * edge — out of the element (top → up) or straight across it (top → down,
	 * the way a curve heads toward a partner below) — then turns to reach W:
	 *   direct — run to W's level, turn once into W (only when W lies far
	 *            enough out in that direction);
	 *   stub   — step a short stub out, run across to W's line, turn into W;
	 *   detour — stub out, sidestep either way, then on to W (reaches a W that
	 *            sits straight behind the end without doubling back).
	 * cornerShape picks the cleanest pair (one per end); `away` marks routes
	 * that leave heading AWAY from W, so — like a curve — the line normally
	 * leaves toward where it's going.
	 * @param {{ x: number, y: number }} P
	 * @param {'top'|'bottom'|'left'|'right'} edge
	 * @param {{ x: number, y: number }} w
	 * @returns {Array<{ pts: Array<{ x: number, y: number }>, away: boolean }>} each pts P … W
	 */
	function cornerHalves(P, edge, w) {
		const vertical = edge === 'top' || edge === 'bottom';
		const outward = edge === 'top' || edge === 'left' ? -1 : 1;
		const stub = CORNER_STUB / 2;
		/** @type {Array<{ pts: Array<{ x: number, y: number }>, away: boolean }>} */
		const out = [];
		for (const s of [outward, -outward]) {
			// Heading away from W? (When W is level with P on this axis, either way
			// is fine, so only the inward direction counts as "away".)
			const toward = vertical ? (w.y - P.y) * s : (w.x - P.x) * s;
			const away = Math.abs(toward) < CORNER_ALIGN_EPS ? s !== outward : toward < 0;
			if (vertical) {
				if ((w.y - P.y) * s >= stub) out.push({ pts: [P, { x: P.x, y: w.y }, w], away });
				const sy = P.y + s * stub;
				out.push({ pts: [P, { x: P.x, y: sy }, { x: w.x, y: sy }, w], away });
				for (const side of [-1, 1]) {
					const ox = P.x + side * CORNER_STUB;
					out.push({ pts: [P, { x: P.x, y: sy }, { x: ox, y: sy }, { x: ox, y: w.y }, w], away });
				}
			} else {
				if ((w.x - P.x) * s >= stub) out.push({ pts: [P, { x: w.x, y: P.y }, w], away });
				const sx = P.x + s * stub;
				out.push({ pts: [P, { x: sx, y: P.y }, { x: sx, y: w.y }, w], away });
				for (const side of [-1, 1]) {
					const oy = P.y + side * CORNER_STUB;
					out.push({ pts: [P, { x: sx, y: P.y }, { x: sx, y: oy }, { x: w.x, y: oy }, w], away });
				}
			}
		}
		return out;
	}

	/**
	 * How badly a square polyline doubles back: each place it reverses straight
	 * back over itself costs a lot; otherwise shorter is better.
	 * @param {Array<{ x: number, y: number }>} pts
	 * @returns {number}
	 */
	function cornerRouteCost(pts) {
		let cost = 0;
		for (let i = 1; i < pts.length; i++) {
			cost += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
			if (i >= 2) {
				const ax = pts[i - 1].x - pts[i - 2].x, ay = pts[i - 1].y - pts[i - 2].y;
				const bx = pts[i].x - pts[i - 1].x, by = pts[i].y - pts[i - 1].y;
				if (Math.abs(ax * by - ay * bx) < 0.01 && ax * bx + ay * by < 0) cost += CORNER_REVERSAL_COST;
			}
		}
		return cost;
	}

	/**
	 * Geometry of a cornered route: its polyline vertices (FROM → TO) plus where
	 * its shaping handle starts (`run`). The handle moves freely: dragging it
	 * places a waypoint the line is routed through (see cornerHalves); until then
	 * the automatic shapes below apply.
	 *
	 * Shapes:
	 *   vertical ↔ vertical exits    → up/down, across, up/down (handle: the across run)
	 *   horizontal ↔ horizontal exits → across, up/down, across (handle: the up/down run)
	 *   mixed (e.g. column ↔ segment) → an "L" (one corner).
	 *   mixed, an end facing away     → a "Z" with a stub out of each end
	 *     (handle: its across run).
	 * @param {PathEntry} p
	 * @returns {{ pts: Array<{ x: number, y: number }>, run: CornerRun | null }}
	 */
	function cornerShape(p) {
		const a = { x: p.x1, y: p.y1 };
		const b = { x: p.x2, y: p.y2 };

		// Obstacle-aware routing (preferred): shortest square route through the
		// clear lanes between passage boxes, steered by the handle.
		const routed = routeCornerAround(p);
		if (routed) return routed;

		// User-placed waypoint: the shaping handle was dragged to a point W (stored
		// relative to the chord, so it survives reflow). Route square from each end
		// THROUGH W: each end leaves heading toward W — in any direction, not
		// just perpendicular to its edge — and turns once to reach W. W may sit anywhere — above, below, left or right of either end.
		if (p.bendAlong != null && p.bendPerp != null) {
			const w = cornerWaypoint(p);
			// 1) Leave each end straight TOWARD the handle, along the axis it mostly
			//    lies on (so dragging the handle right of a point makes the line come
			//    out to the right), turning once at the handle's level. Not limited to
			//    the edge's perpendicular. The end whose direction is clearer keeps it
			//    first; the first combination that doesn't double back wins.
			const fp = cornerExitPrefs(a, w), tp = cornerExitPrefs(b, w);
			const order = fp.ratio >= tp.ratio
				? [[0, 0], [0, 1], [1, 0], [1, 1]]
				: [[0, 0], [1, 0], [0, 1], [1, 1]];
			// Prefer a route that actually TURNS at the handle (so the handle sits on
			// a corner the user can see they're steering); fall back to one that just
			// passes through it.
			/** @type {Array<{ x: number, y: number }> | null} */
			let passThrough = null;
			for (const [i, j] of order) {
				const pts = simplifyPolyline([
					...cornerDirectHalf(a, fp.axes[i], w),
					...cornerDirectHalf(b, tp.axes[j], w).reverse().slice(1)
				]);
				if (cornerRouteCost(pts) >= CORNER_REVERSAL_COST) continue;
				const turnsAtW = pts.some((q, k) => k > 0 && k < pts.length - 1 && Math.abs(q.x - w.x) < 0.5 && Math.abs(q.y - w.y) < 0.5);
				if (turnsAtW) return { pts, run: { a: w, b: w, axis: 'xy' } };
				passThrough ??= pts;
			}
			if (passThrough) return { pts: passThrough, run: { a: w, b: w, axis: 'xy' } };
			// 2) Fallback (rare): the stub / detour routes.
			/** @type {Array<{ x: number, y: number }>} */
			let best = [a, w, b];
			let bestCost = Infinity;
			for (const fh of cornerHalves(a, p.fromEdge, w)) {
				for (const th of cornerHalves(b, p.toEdge, w)) {
					const pts = simplifyPolyline([...fh.pts, ...th.pts.slice().reverse().slice(1)]);
					// Like a curve, each end should leave toward where the line is
					// going: heading away first costs extra, and so does every bend, so
					// the simplest sensible route wins.
					const cost = cornerRouteCost(pts)
						+ (fh.away ? CORNER_AWAY_COST : 0) + (th.away ? CORNER_AWAY_COST : 0)
						+ Math.max(0, pts.length - 2) * CORNER_BEND_COST;
					if (cost < bestCost) { bestCost = cost; best = pts; }
				}
			}
			return { pts: best, run: { a: w, b: w, axis: 'xy' } };
		}
		// Pass E's separation shift plus the user's shaping-handle shift.
		const shift = (p.routeShift || 0) + (p.bendShift || 0);
		const ea = cornerExit(p.fromEdge, a.x, a.y, b.x, b.y);
		const eb = cornerExit(p.toEdge,   b.x, b.y, a.x, a.y);

		if (ea.vertical && eb.vertical) {
			// Up/down, across, up/down. The across run sits midway, unless both ends
			// leave the same way (no room between them) → run past the farther one.
			let ym;
			if (ea.sign !== eb.sign) ym = (a.y + b.y) / 2;
			else ym = ea.sign > 0 ? Math.max(a.y, b.y) + CORNER_STUB : Math.min(a.y, b.y) - CORNER_STUB;
			ym += shift;
			// Keep the run (and its handle) inside the study area.
			ym = clampToBounds(0, ym, shapeHandleBounds()).y;
			const p1 = { x: a.x, y: ym }, p2 = { x: b.x, y: ym };
			return { pts: [a, p1, p2, b], run: { a: p1, b: p2, axis: 'y' } };
		}
		if (!ea.vertical && !eb.vertical) {
			// Across, up/down, across (segment ↔ segment). Same-direction exits loop out.
			let xm;
			if (ea.sign !== eb.sign) xm = (a.x + b.x) / 2;
			else xm = ea.sign > 0 ? Math.max(a.x, b.x) + CORNER_STUB : Math.min(a.x, b.x) - CORNER_STUB;
			xm += shift;
			xm = clampToBounds(xm, 0, shapeHandleBounds()).x;
			const p1 = { x: xm, y: a.y }, p2 = { x: xm, y: b.y };
			return { pts: [a, p1, p2, b], run: { a: p1, b: p2, axis: 'x' } };
		}

		// Mixed: one vertical exit (v), one horizontal exit (h).
		const v  = ea.vertical ? a : b;
		const ev = ea.vertical ? ea : eb;
		const h  = ea.vertical ? b : a;
		const eh = ea.vertical ? eb : ea;
		const vOk = Math.sign(h.y - v.y) === ev.sign;
		const hOk = Math.sign(v.x - h.x) === eh.sign;
		/** @type {Array<{ x: number, y: number }>} */
		let mid;
		/** @type {CornerRun} */
		let run;
		if (vOk && hOk) {
			// "L": leave v vertically, turn once, run level into h. Its handle starts
			// at the middle of the vertical leg; dragging it places a waypoint.
			mid = [{ x: v.x, y: h.y }];
			const m = { x: v.x, y: (v.y + h.y) / 2 };
			run = { a: m, b: m, axis: 'xy' };
		} else {
			// "Z": an end would have to leave against its exit direction, so stub out
			// of each end; the handle slides the across run.
			const vy = clampToBounds(0, v.y + ev.sign * CORNER_STUB + shift, shapeHandleBounds()).y;
			const hx = h.x + eh.sign * CORNER_STUB;
			const p1 = { x: v.x, y: vy }, p2 = { x: hx, y: vy }, p3 = { x: hx, y: h.y };
			mid = [p1, p2, p3];
			run = { a: p1, b: p2, axis: 'y' };
		}
		const pts = [v, ...mid, h];
		return { pts: ea.vertical ? pts : pts.reverse(), run };
	}

	/**
	 * Compute a cubic-bezier control handle for ONE end of a connection.
	 *
	 * The anchor POSITION is fixed by the element type / edge (column = top edge,
	 * section = top/bottom edge, segment = left/right edge) and is never moved by
	 * this function.  What we choose here is only the DIRECTION the line leaves
	 * that anchor — its exit tangent — which is free to point anywhere on the full
	 * 360° around the anchor.  Hard "J"/jag hooks happened because the old code
	 * locked each edge to a single fixed exit direction (column = always straight
	 * down, segment = always straight sideways, …); when the partner endpoint sat
	 * off in another direction the curve had to whip back on itself to reach an
	 * anchor that insisted on the wrong tangent.
	 *
	 * Instead we blend two influences:
	 *   • a component PERPENDICULAR to the anchor's edge (so the line still reads
	 *     as cleanly "attached" to the element), whose sign follows the opposite
	 *     endpoint (it leaves toward, never away from, its partner), and
	 *   • a component aimed straight AT the opposite anchor.
	 * The result always has a positive component toward the partner, so the curve
	 * can never reverse into a hook, while the perpendicular bias keeps the
	 * familiar "exits square from the edge" look.  The handle length scales with
	 * the distance between the two anchors so long lines arc gently and short ones
	 * stay tight.
	 *
	 * @param {'top'|'bottom'|'left'|'right'} edge — this anchor's edge
	 * @param {number} ax @param {number} ay — this anchor point
	 * @param {number} ox @param {number} oy — the OPPOSITE anchor point
	 * @returns {{ cx: number, cy: number }}
	 */
	function controlHandle(edge, ax, ay, ox, oy) {
		const dx = ox - ax;
		const dy = oy - ay;
		const dist = Math.hypot(dx, dy) || 1;
		const ux = dx / dist; // unit vector toward the opposite anchor
		const uy = dy / dist;

		// Edge-perpendicular axis, signed toward the opposite endpoint. When the
		// opposite end sits (nearly) ON the edge line — so the perpendicular sign is
		// ambiguous — fall back to the edge's natural outward direction (top/bottom
		// edges droop downward like before; side edges bow away from the element).
		let nx = 0;
		let ny = 0;
		if (edge === 'top' || edge === 'bottom') {
			ny = Math.abs(uy) < 1e-3 ? 1 : Math.sign(uy);
		} else {
			nx = Math.abs(ux) < 1e-3 ? (edge === 'right' ? 1 : -1) : Math.sign(ux);
		}

		// Blend perpendicular-to-edge attachment with aim-at-partner. The
		// perpendicular component gives the clean "exits square from the edge" look
		// when the partner sits off to the side, but applying it at full strength
		// even when the partner already lies straight out from the edge bows an
		// otherwise-straight line into a gentle S-wave (both ends leave parallel to
		// the edge, then must curve back to meet). Scale the bias by how far the
		// partner deviates from the edge-normal: align = |u · n| is 1 when the
		// opposite anchor is straight ahead (→ bias 0 → control points on the chord
		// → STRAIGHT line) and 0 when it's fully to the side (→ full 0.55 bias →
		// today's smooth square-exit curve).
		const align = Math.abs(ux * nx + uy * ny);
		// A curved line must visibly CURVE whenever its ends are offset. The pure
		// "bias → 0 as the partner lines up" rule above left diagonal lines (e.g.
		// section↔section, whose anchors already slide toward each other) almost
		// perfectly straight. So once the partner sits more than CURVE_MIN_LATERAL
		// off the edge-normal axis, keep at least CURVE_MIN_BIAS of perpendicular
		// exit. Only a genuinely straight-across pair stays straight (no S-wave).
		const lateral = (edge === 'top' || edge === 'bottom') ? Math.abs(dx) : Math.abs(dy);
		const minBias = lateral > CURVE_MIN_LATERAL ? CURVE_MIN_BIAS : 0;
		const BIAS = Math.max(minBias, 0.55 * (1 - align));
		let hx = nx * BIAS + ux * (1 - BIAS);
		let hy = ny * BIAS + uy * (1 - BIAS);

		const hl = Math.hypot(hx, hy) || 1;
		hx /= hl;
		hy /= hl;

		const len = Math.max(20, dist * 0.4);
		return { cx: ax + hx * len, cy: ay + hy * len };
	}


	/**
	 * Drop zero-length and collinear interior vertices so corner rounding and
	 * arc-length sampling only see real bends.
	 * @param {Array<{ x: number, y: number }>} pts
	 * @returns {Array<{ x: number, y: number }>}
	 */
	function simplifyPolyline(pts) {
		/** @type {Array<{ x: number, y: number }>} */
		const out = [];
		for (const pt of pts) {
			const last = out[out.length - 1];
			if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.01) continue;
			out.push(pt);
		}
		for (let i = out.length - 2; i >= 1; i--) {
			const p0 = out[i - 1], p1 = out[i], p2 = out[i + 1];
			const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
			const dot   = (p1.x - p0.x) * (p2.x - p1.x) + (p1.y - p0.y) * (p2.y - p1.y);
			// Only drop vertices that continue straight ahead (not a 180° reversal).
			if (Math.abs(cross) < 0.01 && dot > 0) out.splice(i, 1);
		}
		return out;
	}

	/**
	 * SVG path data for a polyline with rounded interior corners.
	 * @param {Array<{ x: number, y: number }>} pts
	 * @returns {string}
	 */
	function polylineToD(pts) {
		if (pts.length < 2) return '';
		let d = `M ${pts[0].x},${pts[0].y}`;
		for (let i = 1; i < pts.length - 1; i++) {
			const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
			const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
			const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
			const r = Math.min(CORNER_RADIUS, l1 / 2, l2 / 2);
			const ax = p1.x - ((p1.x - p0.x) / l1) * r, ay = p1.y - ((p1.y - p0.y) / l1) * r;
			const bx = p1.x + ((p2.x - p1.x) / l2) * r, by = p1.y + ((p2.y - p1.y) / l2) * r;
			d += ` L ${ax},${ay} Q ${p1.x},${p1.y} ${bx},${by}`;
		}
		const end = pts[pts.length - 1];
		return d + ` L ${end.x},${end.y}`;
	}

	/**
	 * Point at fraction t ∈ [0,1] of a polyline's arc length.
	 * @param {Array<{ x: number, y: number }>} pts
	 * @param {number} t
	 * @returns {{ x: number, y: number }}
	 */
	function polylinePointAt(pts, t) {
		if (pts.length < 2) return { ...pts[0] };
		/** @type {number[]} */
		const lens = [];
		let total = 0;
		for (let i = 1; i < pts.length; i++) {
			const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
			lens.push(l);
			total += l;
		}
		let target = Math.min(1, Math.max(0, t)) * total;
		for (let i = 0; i < lens.length; i++) {
			if (target <= lens[i] || i === lens.length - 1) {
				const f = lens[i] ? Math.min(1, target / lens[i]) : 0;
				return {
					x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
					y: pts[i].y + (pts[i + 1].y - pts[i].y) * f
				};
			}
			target -= lens[i];
		}
		return { ...pts[pts.length - 1] };
	}

	/**
	 * Arc-length fraction t ∈ [0,1] of the polyline point nearest (px, py).
	 * @param {Array<{ x: number, y: number }>} pts
	 * @param {number} px @param {number} py
	 * @returns {number}
	 */
	function nearestTOnPolyline(pts, px, py) {
		let total = 0;
		let bestD = Infinity;
		let bestS = 0;
		for (let i = 1; i < pts.length; i++) {
			const ax = pts[i - 1].x, ay = pts[i - 1].y;
			const vx = pts[i].x - ax, vy = pts[i].y - ay;
			const len2 = vx * vx + vy * vy;
			const len = Math.sqrt(len2);
			const f = len2 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
			const d = (ax + vx * f - px) ** 2 + (ay + vy * f - py) ** 2;
			if (d < bestD) { bestD = d; bestS = total + f * len; }
			total += len;
		}
		return total ? bestS / total : 0.5;
	}

	/**
	 * Point at parameter t on a path, whatever its route. For curved paths t is
	 * the bezier parameter (unchanged behavior); for straight/cornered it is the
	 * arc-length fraction, so noteAnchorT means "how far along the line" for both.
	 * @param {PathEntry} p
	 * @param {number} t
	 * @returns {{ x: number, y: number }}
	 */
	function routePointAt(p, t) {
		if (p.route === 'curved') return cubicBezierPoint(t, p.x1, p.y1, p.cx1, p.cy1, p.cx2, p.cy2, p.x2, p.y2);
		return polylinePointAt(simplifyPolyline(routePoints(p)), t);
	}

	// ─── Shaping handle (user-adjusted line shape) ────────────────────────────
	//
	// A selected connection shows a hollow ring the user drags to reshape it:
	//   curved   → the curve is pulled through the handle point
	//   straight → becomes curved, pulled through the handle point
	//   cornered → the middle run slides sideways (bends stay square)
	// The bend is stored RELATIVE to the anchor-to-anchor chord (bendAlong /
	// bendPerp as fractions of chord length) so it survives reflow and zoom.

	/** Range for a curve's PARAMETER (where along the curve the handle point is
	 *  reached) — keeps the curve leaving/arriving at its connection points.
	 *  The handle point itself is free (see CORNER_* below). */
	const BEND_ALONG_MIN = 0.1;
	const BEND_ALONG_MAX = 0.9;
	/** Handle placement range for curved AND cornered lines (fractions of chord
	 *  length) — wide, so the handle can go well beyond either end; the study-
	 *  area clamp is the practical limit. Mirrored server-side. */
	const CORNER_ALONG_MIN = -3;
	const CORNER_ALONG_MAX = 4;
	const CORNER_PERP_MAX = 3;
	/** Min distance (layout units) kept between the shaping handle and a note dot. */
	const SHAPE_HANDLE_NOTE_CLEARANCE = 14;

	/**
	 * Unit chord frame for a path: direction u (from → to) and its left normal n.
	 * @param {{ x1: number, y1: number, x2: number, y2: number }} c
	 */
	function chordFrame(c) {
		const L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1;
		const ux = (c.x2 - c.x1) / L, uy = (c.y2 - c.y1) / L;
		return { L, ux, uy, nx: -uy, ny: ux };
	}

	/**
	 * The run of a cornered route that its shaping handle moves (see cornerShape):
	 * the centre of its middle run, an L's vertical leg, or the placed waypoint.
	 * @param {PathEntry} p
	 * @returns {CornerRun | null}
	 */
	function cornerMidRun(p) {
		return cornerShape(p).run;
	}

	/**
	 * Where to draw a path's shaping handle. `base` is the point the drag moves
	 * (the curve's pull point / the run's centre); the drawn position may be
	 * nudged along the line to keep clear of the note's anchor dot. Dragging uses
	 * the pointer delta, so the nudge never changes how the drag behaves.
	 * @param {PathEntry} p
	 * @returns {ShapeHandle|null}
	 */
	function computeShapeHandle(p) {
		/** @type {Array<{ x: number, y: number }>} */
		let candidates;
		/** @type {'x'|'y'|'xy'|null} */
		let axis = null;
		if (p.route === 'cornered') {
			const run = cornerMidRun(p);
			if (!run) return null;
			axis = run.axis;
			const at = (/** @type {number} */ f) => ({ x: run.a.x + (run.b.x - run.a.x) * f, y: run.a.y + (run.b.y - run.a.y) * f });
			candidates = [at(0.5), at(0.25), at(0.75)];
		} else if (p.route === 'curved') {
			// A placed handle sits exactly where the user dropped it (the curve
			// passes through it); otherwise at the curve's middle.
			const a = Math.min(BEND_ALONG_MAX, Math.max(BEND_ALONG_MIN, p.bendAlong ?? 0.5));
			const placed = p.bendPerp != null ? curvedPullPoint(p) : null;
			candidates = placed
				? [placed, ...[a - 0.2, a + 0.2].map(t => routePointAt(p, Math.min(0.95, Math.max(0.05, t))))]
				: [a, a - 0.2, a + 0.2].map(t => routePointAt(p, Math.min(0.95, Math.max(0.05, t))));
		} else {
			const at = (/** @type {number} */ f) => ({ x: p.x1 + (p.x2 - p.x1) * f, y: p.y1 + (p.y2 - p.y1) * f });
			candidates = [at(0.5), at(0.3), at(0.7)];
		}
		const base = candidates[0];
		let drawn = base;
		if (p.note) {
			const clear = candidates.find(c => Math.hypot(c.x - p.noteAnchorX, c.y - p.noteAnchorY) >= SHAPE_HANDLE_NOTE_CLEARANCE);
			if (clear) drawn = clear;
		}
		return { x: drawn.x, y: drawn.y, baseX: base.x, baseY: base.y, axis };
	}

	// ─── Line color (gray default · a solid color · 'mixed' fade) ─────────────

	/** The eight named colors (mirrors the section color CHECK); usable as solid line colors. */
	const SECTION_COLORS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'];

	/**
	 * Resolve the color of one connection end as a CONCRETE css color string
	 * (e.g. "hsl(145, 65%, 45%)"), so it also survives export cloning, which drops
	 * CSS variables. Uses the main shade (--green, --red …) of the end's section:
	 *   segment → its section, section → itself, column → its first visible
	 *   section (where the column anchor attaches; see columnAnchorRect).
	 * Falls back to the default line gray when no color can be found.
	 * @param {Element} el — the end's element (from getElementForConnection)
	 * @param {ConnType} type
	 * @returns {string}
	 */
	function endColor(el, type) {
		/** @type {Element|null} */
		let sectionEl = null;
		if (type === 'column') {
			for (const sec of el.querySelectorAll('.section[data-section-id]')) {
				if (sec.classList.contains('compare-hidden')) continue;
				const r = sec.getBoundingClientRect();
				if (r.width === 0 || r.height === 0) continue;
				sectionEl = sec;
				break;
			}
		} else {
			sectionEl = el.closest('.section[data-section-id]') ?? (el.matches('.section') ? el : null);
		}
		const color = sectionEl ? SECTION_COLORS.find(c => sectionEl?.classList.contains(c)) : null;
		return namedColor(color ?? 'gray');
	}

	/**
	 * Concrete css color for a named color (main shade, e.g. --green), or the
	 * default line gray for 'gray' / unknown names.
	 * @param {string} name
	 * @returns {string}
	 */
	function namedColor(name) {
		const root = getComputedStyle(document.documentElement);
		const value = SECTION_COLORS.includes(name) ? root.getPropertyValue(`--${name}`).trim() : '';
		return value || root.getPropertyValue('--gray-300').trim() || '#545251';
	}

	/**
	 * Normalise a stored/override line color to a known value ('gray' default).
	 * @param {unknown} value
	 * @returns {LineColor}
	 */
	function normalizeLineColor(value) {
		return value === 'mixed' || SECTION_COLORS.includes(/** @type {string} */ (value))
			? /** @type {LineColor} */ (value)
			: 'gray';
	}

	/**
	 * True when the line is shown in its interaction color (hover / selection /
	 * endpoint drag). Only the endpoint NODES switch to blue then — the line
	 * itself always keeps its own color (see pathStrokeStyle).
	 * @param {PathEntry} path
	 */
	function isLineHighlighted(path) {
		return selectedPathIds.has(path.id) || hoveredPathId === path.id || (!!drag && drag.connectionId === path.id);
	}

	/**
	 * Inline stroke for a mixed line's path (its gradient), or '' to fall back
	 * to the CSS gray / highlight colors.
	 * @param {PathEntry} path
	 * @returns {string}
	 */
	function pathStrokeStyle(path) {
		// The line keeps its color while hovered/selected (only nodes/handles turn blue).
		if (path.lineColor === 'gray') return '';
		if (path.lineColor !== 'mixed') return `stroke: ${path.fromColor};`;
		return `stroke: url(#connection-gradient-${path.id});`;
	}

	/**
	 * Inline fill for a mixed line's endpoint node: the color of the element that
	 * end connects to. '' falls back to the CSS gray / highlight colors.
	 * @param {PathEntry} path
	 * @param {'from'|'to'} end
	 * @returns {string}
	 */
	function nodeColorStyle(path, end) {
		if (path.lineColor === 'gray' || isLineHighlighted(path)) return '';
		const c = end === 'from' ? path.fromColor : path.toColor;
		return c ? `fill: ${c}; stroke: ${c};` : '';
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

	/**
	 * Human-readable, capitalized label for an anchor type — shown in the hover
	 * tooltip above each endpoint so the user can tell what kind of element an
	 * anchor point attaches to (Column / Section / Segment).
	 * @param {ConnType} type
	 * @returns {string}
	 */
	function anchorLabel(type) {
		if (type === 'column') return 'Column';
		if (type === 'section') return 'Section';
		return 'Segment';
	}

	/**
	 * Decide which side of an anchor point its hover tooltip should sit on so it
	 * stays CLEAR of the connection's Quick Note (card + anchor dot).
	 *
	 *   • Vertical connection end (anchor on a top/bottom edge → Column/Section):
	 *       the line exits vertically, so the tooltip goes to the LEFT or RIGHT.
	 *   • Horizontal connection end (anchor on a left/right edge → Segment):
	 *       the line exits horizontally, so the tooltip goes ABOVE or BELOW.
	 *
	 * Within the required axis we pick the side OPPOSITE the note. When the note
	 * sits on the perpendicular axis (so "opposite" isn't defined on our axis) we
	 * fall back to whichever side points away from the note's anchor dot, keeping
	 * the tooltip off the note even then.
	 * @param {'top'|'bottom'|'left'|'right'} edge — this end's anchor edge
	 * @param {'center'|'right'|'left'|'above'|'below'} notePlacement — where the note card sits
	 * @param {number} anchorX — this anchor point x (SVG/layout units)
	 * @param {number} anchorY — this anchor point y (SVG/layout units)
	 * @param {number} noteX — the note's anchor-dot x
	 * @param {number} noteY — the note's anchor-dot y
	 * @returns {'left'|'right'|'above'|'below'}
	 */
	function anchorTooltipPlacement(edge, notePlacement, anchorX, anchorY, noteX, noteY) {
		const vertical = edge === 'top' || edge === 'bottom';
		if (vertical) {
			// Tooltip must be left or right.
			if (notePlacement === 'right') return 'left';
			if (notePlacement === 'left')  return 'right';
			// Note is above/below/center → steer away from the note dot horizontally.
			return noteX >= anchorX ? 'left' : 'right';
		}
		// Horizontal end: tooltip must be above or below.
		if (notePlacement === 'above') return 'below';
		if (notePlacement === 'below') return 'above';
		// Note is left/right/center → steer away from the note dot vertically.
		return noteY >= anchorY ? 'above' : 'below';
	}

	/**
	 * CSS transform for an anchor tooltip placed on a given side of its anchor
	 * point, keeping the same 0.8rem gap the original (always-above) tooltip used.
	 * @param {'left'|'right'|'above'|'below'} placement
	 * @returns {string}
	 */
	function anchorTooltipTransform(placement) {
		switch (placement) {
			case 'left':  return 'translate(calc(-100% - 0.8rem), -50%)';
			case 'right': return 'translate(0.8rem, -50%)';
			case 'below': return 'translate(-50%, 0.8rem)';
			default:      return 'translate(-50%, calc(-100% - 0.8rem))'; // above
		}
	}


	// ─── Note placement helpers ───────────────────────────────────────────────

	/**
	 * Map the stored anchor SIDE (which edge of the card the dot attaches to) to
	 * the legacy `placement` keyword used by noteTransform()/the dot SVG.  The card
	 * always extends AWAY from the anchored edge:
	 *   side 'top'    → dot on the card's top edge    → card hangs below  → 'below'
	 *   side 'bottom' → dot on the card's bottom edge  → card sits above  → 'above'
	 *   side 'left'   → dot on the card's left edge    → card sits right  → 'right'
	 *   side 'right'  → dot on the card's right edge   → card sits left   → 'left'
	 * @param {'top'|'right'|'bottom'|'left'} side
	 * @returns {'above'|'below'|'right'|'left'}
	 */
	function sideToPlacement(side) {
		switch (side) {
			case 'bottom': return 'above';
			case 'left':   return 'right';
			case 'right':  return 'left';
			default:       return 'below'; // 'top'
		}
	}

	/**
	 * Collect the bounding boxes of all visible passage segments in the note
	 * coordinate space (CSS px relative to the SVG top-left, divided by scale —
	 * the same transform edgeAnchorPoint uses).  These are the "passage text"
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
	 * Return the CSS transform string for a note placement, folding in the
	 * perpendicular slide offset so the box rides ALONG its attachment edge while
	 * the anchor dot (positioned at left/top) stays put:
	 *   above / below → offset shifts the box horizontally (translateX)
	 *   left  / right → offset shifts the box vertically   (translateY)
	 * Offset is in CSS px; it's added to the base percentage translate via calc().
	 * @param {'center'|'right'|'left'|'above'|'below'} placement
	 * @param {number} [offset=0]
	 * @returns {string}
	 */
	function noteTransform(placement, offset = 0) {
		switch (placement) {
			case 'right': return `translate(0, calc(-50% + ${offset}px))`;
			case 'left':  return `translate(-100%, calc(-50% + ${offset}px))`;
			case 'above': return `translate(calc(-50% + ${offset}px), -100%)`;
			case 'below': return `translate(calc(-50% + ${offset}px), 0%)`;
			default:      return 'translate(-50%, -50%)';
		}
	}

	/**
	 * Find the bezier parameter t ∈ [0,1] whose point is closest to (px, py) in
	 * SVG/layout coordinates.  Used while dragging a note's anchor DOT along its
	 * connection line so the dot follows the cursor but stays welded to the curve.
	 * Coarse sample then a short refine pass — plenty accurate for interaction.
	 * @param {PathEntry} path
	 * @param {number} px @param {number} py
	 * @returns {number}
	 */
	function nearestTOnCurve(path, px, py) {
		if (path.route !== 'curved') return nearestTOnPolyline(simplifyPolyline(routePoints(path)), px, py);
		let bestT = 0.5;
		let bestD = Infinity;
		const evalT = (t) => {
			const p = cubicBezierPoint(t, path.x1, path.y1, path.cx1, path.cy1, path.cx2, path.cy2, path.x2, path.y2);
			return (p.x - px) ** 2 + (p.y - py) ** 2;
		};
		for (let i = 0; i <= 40; i++) {
			const t = i / 40;
			const d = evalT(t);
			if (d < bestD) { bestD = d; bestT = t; }
		}
		// Refine around the coarse best.
		let lo = Math.max(0, bestT - 1 / 40);
		let hi = Math.min(1, bestT + 1 / 40);
		for (let i = 0; i < 12; i++) {
			const m1 = lo + (hi - lo) / 3;
			const m2 = hi - (hi - lo) / 3;
			if (evalT(m1) < evalT(m2)) hi = m2; else lo = m1;
		}
		return (lo + hi) / 2;
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
		if (!svgElement || !connections.length) { paths = []; stubs = []; return; }
		const svgRect = svgElement.getBoundingClientRect();
		if (svgRect.width === 0 && svgRect.height === 0) { paths = []; stubs = []; return; }
		// Area shaping handles are kept inside (see shapeHandleBounds).
		const bounds = shapeHandleBounds();

		const SAME_COL_PX = 20;

		// Passage text obstacles (used to flip section anchors off the short edge
		// only when the short-edge line would otherwise cut through text).
		const textBoxes = collectSegmentBoxes(svgRect, scale);
		// Passage boxes cornered lines route around (see routeCornerAround).
		routeObstacles = collectRouteObstacles(svgRect, scale);

		// ── Pass A: resolve each connection's endpoints and chosen edges ──────
		// For every connection we decide which EDGE of each element it anchors to
		// (column=top, section=top/bottom by shortest line, segment=left/right) and
		// register both endpoints into per-edge groups so they can be fanned out.
		/**
		 * @typedef {{ key: string, edge: 'top'|'bottom'|'left'|'right', rect: DOMRect, otherCX: number, otherCY: number, placedPos: number|null }} Endpoint
		 * @type {Array<{ connection: any, fromType: ConnType, toType: ConnType, fromCX: number, toCX: number, sameCol: boolean, fromEdge: 'top'|'bottom'|'left'|'right', toEdge: 'top'|'bottom'|'left'|'right', lineColor: LineColor, fromColor: string|null, toColor: string|null }>}
		 */
		const resolved = [];
		/**
		 * Connections with exactly ONE endpoint on this page — cross-part links preserved by phase 3.
		 * Collected during the resolve pass and turned into edge stubs after it, once the SVG box is known.
		 * @type {Array<{ connection: any, presentEnd: 'from'|'to', el: Element, label: string, direction: 'forward'|'backward' }>}
		 */
		const stubCandidates = [];
		/** @type {Map<string, Endpoint[]>} key = `${elementId}|${edge}` */
		const groups = new Map();

		for (const connection of connections) {
			const fromType = /** @type {ConnType} */ (connection.fromType || 'segment');
			const toType   = /** @type {ConnType} */ (connection.toType   || 'segment');
			const fromEl = getElementForConnection(connection, 'from');
			const toEl   = getElementForConnection(connection, 'to');

			// ── Cross-part connections become edge stubs (§8 strategy (c), phase 3) ──
			//
			// `if (!fromEl || !toEl) continue` used to drop these silently, which was harmless while
			// phase 2 DELETED any connection whose endpoints landed in different parts — there was never
			// such a row to render. Phase 3 preserves them, so exactly one endpoint can now be absent, and
			// dropping it would hide a link the user drew.
			//
			// Whether an endpoint is "present" is decided by the DOM, not by ids from the server: the
			// element is what geometry can actually be measured from, and a segment can be absent because
			// it is in another part OR because content is still streaming. Both cases want the same
			// treatment — draw nothing yet, or draw a stub once we know which — so `stubs` is recomputed
			// on every layout pass along with the arcs.
			if ((fromEl && !toEl) || (toEl && !fromEl)) {
				const presentEnd = fromEl ? 'from' : 'to';
				const stub = describeStub(connection, presentEnd);
				// Only a connection the server has confirmed reaches ANOTHER PART becomes a stub. An
				// endpoint missing because content is still streaming, or because the row is stale, has no
				// resolvable part and is skipped — drawing a marker for it would promise a continuation
				// that does not exist.
				if (stub) {
					stubCandidates.push({
						connection,
						presentEnd,
						el: /** @type {Element} */ (fromEl || toEl),
						label: stub.label,
						direction: stub.direction
					});
				}
				continue;
			}
			if (!fromEl || !toEl) continue;
			// Column ends anchor to the first VISIBLE section's top (not the column box
			// top) so the square endpoint stays glued to the header even when the user
			// pushes the first section down. See columnAnchorRect().
			const fromRect = fromType === 'column' ? columnAnchorRect(fromEl) : fromEl.getBoundingClientRect();
			const toRect   = toType   === 'column' ? columnAnchorRect(toEl)   : toEl.getBoundingClientRect();
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
			// A user-placed point (dragged to a spot) pins its end's side; otherwise
			// the side is chosen automatically as before.
			const fromPlaced = placedAnchor(connection, 'from', fromType);
			const toPlaced   = placedAnchor(connection, 'to',   toType);
			const fromEdge = fromPlaced ? fromPlaced.edge : fromType === 'section'
				? decideSectionEdge(fromRect, svgRect, toCXsvg, toCYsvg, textBoxes, excludeIds)
				: decideEdge(fromType, fromRect, toCY, fromSide);
			const toEdge   = toPlaced ? toPlaced.edge : toType === 'section'
				? decideSectionEdge(toRect, svgRect, fromCXsvg, fromCYsvg, textBoxes, excludeIds)
				: decideEdge(toType, toRect, fromCY, toSide);
			const fromGroupKey = `${fromId}|${fromEdge}`;
			const toGroupKey   = `${toId}|${toEdge}`;

			if (!groups.has(fromGroupKey)) groups.set(fromGroupKey, []);
			if (!groups.has(toGroupKey))   groups.set(toGroupKey, []);
			groups.get(fromGroupKey)?.push({ key: `${connection.id}|from`, edge: fromEdge, rect: fromRect, otherCX: toCX,   otherCY: toCY,   placedPos: fromPlaced?.pos ?? null });
			groups.get(toGroupKey)?.push(  { key: `${connection.id}|to`,   edge: toEdge,   rect: toRect,   otherCX: fromCX, otherCY: fromCY, placedPos: toPlaced?.pos ?? null });

			// Line color (live menu override wins over the stored value):
			//   gray  → default CSS gray (no inline color)
			//   mixed → fade from the FROM end's section color to the TO end's
			//   red…  → one solid color: both stops (and both end nodes) use it
			const lineColor = normalizeLineColor(colorOverrides[connection.id] ?? connection.lineColor);
			const fromColor = lineColor === 'mixed' ? endColor(fromEl, fromType) : lineColor === 'gray' ? null : namedColor(lineColor);
			const toColor   = lineColor === 'mixed' ? endColor(toEl, toType)     : lineColor === 'gray' ? null : namedColor(lineColor);

			resolved.push({ connection, fromType, toType, fromCX, toCX, sameCol, fromEdge, toEdge, lineColor, fromColor, toColor });
		}

		// ── Pass B: slide endpoints toward their opposite end along each edge ──
		// Endpoints on the same element edge are sorted by the position of their
		// FAR end (so lines fan out without crossing).
		//
		// Column / Section (top & bottom edges → HORIZONTAL):
		//   Each anchor slides along the edge toward the x-position of its opposite
		//   endpoint — the spot that yields the SHORTEST connecting line — instead
		//   of being locked to the element's horizontal centre.  distributeAlongEdge
		//   keeps each anchor on its ideal when they're far enough apart, and only
		//   nudges crowded anchors apart by ANCHOR_SPACING so their nodes never
		//   overlap.  A lone connection therefore lands exactly opposite its far end.
		//
		// Segment (left & right edges → VERTICAL):
		//   Unchanged — fan out symmetrically about the side edge's vertical
		//   midpoint (a single segment endpoint stays exactly at the midpoint).
		/** @type {Map<string, { x: number, y: number }>} key = `${connId}|${end}` */
		const anchorMap = new Map();
		// Per-endpoint slide range along its edge — consumed by Pass E so it can
		// separate overlapping lines by sliding endpoints (staying straight, on-edge)
		// before resorting to bending. axis 'x' for top/bottom edges, 'y' for
		// left/right (segment) edges; [lo, hi] are the usable edge bounds in layout
		// units (ANCHOR_EDGE_PAD inset from each corner).
		/** @type {Map<string, { axis: 'x'|'y', lo: number, hi: number }>} key = `${connId}|${end}` */
		const slideMap = new Map();
		for (const members of groups.values()) {
			const horizontal = members[0].edge === 'top' || members[0].edge === 'bottom';
			const rect = members[0].rect; // all members share one element edge → one rect

			// Usable range along the edge (ANCHOR_EDGE_PAD in from each corner).
			const lo = horizontal
				? (rect.left - svgRect.left) / scale + ANCHOR_EDGE_PAD
				: (rect.top  - svgRect.top)  / scale + ANCHOR_EDGE_PAD;
			const hi = horizontal
				? (rect.right  - svgRect.left) / scale - ANCHOR_EDGE_PAD
				: (rect.bottom - svgRect.top)  / scale - ANCHOR_EDGE_PAD;
			// Full edge span (corner to corner) — a placed point's `pos` is a
			// fraction of this, matching the drag snap (findClosestHandle).
			const start = horizontal ? (rect.left - svgRect.left) / scale : (rect.top - svgRect.top) / scale;
			const span  = horizontal ? rect.width / scale : rect.height / scale;

			// Each point's IDEAL spot along the edge:
			//   placed by the user → its saved fraction along the edge
			//   column / section    → opposite the far end (shortest line)
			//   segment             → the side's vertical midpoint
			const mid = (lo + hi) / 2;
			const ideal = (/** @type {Endpoint} */ m) => {
				if (m.placedPos != null) return start + m.placedPos * span;
				return horizontal ? (m.otherCX - svgRect.left) / scale : mid;
			};

			// Order along the edge by ideal spot, then by the far end's position (so
			// lines fan out without crossing), then by key for a stable layout.
			members.sort((a, b) => {
				const ia = ideal(a), ib = ideal(b);
				if (Math.abs(ia - ib) > 0.01) return ia - ib;
				const pa = horizontal ? a.otherCX : a.otherCY;
				const pb = horizontal ? b.otherCX : b.otherCY;
				if (pa !== pb) return pa - pb;
				return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
			});

			// Keep every point on its ideal spot unless two would overlap, in which
			// case nudge them apart by ANCHOR_SPACING (the smallest move needed).
			// Unplaced segment points that share the midpoint spread symmetrically
			// about it, exactly as before.
			const ideals = members.map(ideal);
			const ps = distributeAlongEdge(ideals, lo, hi);
			if (!horizontal) {
				const unplaced = members.map((m, i) => (m.placedPos == null ? i : -1)).filter(i => i >= 0);
				if (unplaced.length === members.length && members.length > 1) {
					const n = members.length;
					const spacing = Math.min(ANCHOR_SPACING, Math.max(0, hi - lo) / (n - 1));
					for (let i = 0; i < n; i++) ps[i] = mid + (i - (n - 1) / 2) * spacing;
				}
			}

			for (let i = 0; i < members.length; i++) {
				const m = members[i];
				const base = edgeAnchorPoint(m.rect, m.edge, svgRect);
				anchorMap.set(m.key, horizontal ? { x: ps[i], y: base.y } : { x: base.x, y: ps[i] });
				// User-placed points stay where they were put: Pass E may not slide
				// them to separate overlapping lines (it bends those lines instead).
				if (m.placedPos == null) slideMap.set(m.key, { axis: horizontal ? 'x' : 'y', lo, hi });
			}
		}



		/** @type {PathEntry[]} */
		const newPaths = [];

		// ── Pass C: build the bezier path for each connection ─────────────────
		for (const r of resolved) {
			const { connection, fromType, toType, sameCol, fromEdge, toEdge, lineColor, fromColor, toColor } = r;

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

			// ── Tangent-aware control points (no hard "J" hooks) ──────────────
			// The anchor POSITIONS (from / to) are fixed by Pass A/B per element
			// type — columns on the top edge, sections on top/bottom, segments on
			// the side.  Only the EXIT DIRECTION of the line at each anchor is free
			// here: controlHandle() points each handle from its anchor toward the
			// opposite endpoint (blended with a light edge-perpendicular bias), so
			// the line always leaves at the best angle on the full 360° around the
			// anchor instead of a single hard-coded direction.  That guarantees a
			// smooth S/C curve — the old per-edge fixed directions are what whipped
			// the line back on itself into a "J" whenever the partner sat off in an
			// unexpected direction.
			const h1 = controlHandle(fromEdge, from.x, from.y, to.x, to.y);
			const h2 = controlHandle(toEdge,   to.x,   to.y,   from.x, from.y);
			let cx1 = h1.cx, cy1 = h1.cy;
			let cx2 = h2.cx, cy2 = h2.cy;
			let d;


		// ── Note placement (user-controlled, persisted) ──────────────────────
		// The note's anchor DOT rides the bezier curve at parameter `noteAnchorT`
		// (0 = from-end … 1 = to-end), and the card attaches to one of the dot's
		// four SIDES (`noteAnchorSide`) so the card extends AWAY from that edge.
		// `noteOffset` slides the card ALONG its attached edge (perpendicular to
		// the dot direction) so it can dodge text without moving the dot.
		//
		// When a connection has never been placed (null fields) we fall back to a
		// sensible default: dot at the midpoint, card 'above' it — or to the right
		// for the same-column segment loop, whose arc bulges rightward.
		//
		// A live drag (notePlacementOverrides) supersedes the persisted values so
		// the card/dot track the cursor smoothly before the PATCH round-trips.
		const override = notePlacementOverrides[connection.id];
		const storedSide = override?.side ?? connection.noteAnchorSide ?? null;
		const storedT    = override?.t    ?? connection.noteAnchorT    ?? null;
		const storedOff  = override?.offset ?? connection.noteOffset   ?? null;
		const storedLead = override?.lead ?? connection.noteLead       ?? null;


		// Resolve the anchor parameter t and the card side INDEPENDENTLY. They are
		// separate, orthogonal controls — the SIDE (above/below/left/right the card
		// sits) and the SLIDE (how far the dot rides along the line, noteAnchorT) — so
		// each falls back to its OWN default when unset. Resolving them together (only
		// honoring the side when BOTH were set) meant resetting one reset the other:
		// e.g. "Reset Quick Note Slide" (noteAnchorT → null) also snapped the user's
		// chosen side back to the default. Decoupled here so a reset of one never
		// disturbs the other.
		/** @type {'top'|'right'|'bottom'|'left'} */
		const anchorSide = storedSide ?? ((sameCol && fromSide2 && toSide2) ? 'right' : 'top');
		const anchorT = storedT ?? 0.5;

		/** @type {'center'|'right'|'left'|'above'|'below'} */
		const notePlacement = sideToPlacement(anchorSide);
		const noteOffset = storedOff ?? 0;
		// Perpendicular "lead": distance the card floats OFF the line, away from the
		// dot along the card's anchored axis. 0 = flush (today's behavior).
		const noteLead = Math.max(0, storedLead ?? 0);


			// ── Separate a noted note from a STRAIGHT VERTICAL line ───────────────
			// Column/Section vertical cases place both control points straight up or
			// down (cx1=from.x, cx2=to.x). When the two endpoints share an x, that
			// "curve" collapses to a perfectly straight vertical line — so a Quick
			// Note's dot and card sit right on top of the line and its anchors with no
			// breathing room. When such a line carries a note, bow the control points
			// sideways (away from the card) so the arc's middle swings clear of the
			// straight anchor-to-anchor path. Segment side-loops already bow via
			// loopOut, so this only targets the vertical (top/bottom) exits.
			// Line route: a live menu override wins over the persisted value. Only the
			// curved route uses the bezier controls; straight/cornered are rebuilt from
			// the same anchors by refreshPathCurve() once the entry exists.
			// A live shaping-handle drag can also override the route (dragging a
			// straight line previews it as curved).
			const bendOv = bendOverrides[connection.id];
			const route = normalizeRoute(bendOv?.route ?? routeOverrides[connection.id] ?? connection.lineRoute);

			const hasNoteForCurve = !!(connection.note ?? null) || noteEditingId === connection.id;
			const verticalish = !(fromSide2 && toSide2); // at least one top/bottom end
			if (route === 'curved' && hasNoteForCurve && verticalish && dx < 8 && dy > dx) {
				// REBUILD the control points as a clean, symmetric arc — exactly like the
				// same-column segment loop — rather than nudging the already-vertical
				// handles sideways (which produced a J-hook because one handle pointed
				// down while the other pointed sideways). Both handles now push equally
				// toward the card with a matching vertical component, so the line bows
				// out as a simple "(" curve. loopOut matches the segment formula.
				const loopOut = Math.max(16, dy * 0.1);
				// Bow TOWARD the card: card left → bow left, otherwise bow right.
				const dir = notePlacement === 'left' ? -1 : 1;
				const vIn = dy * 0.2; // gentle vertical easing toward each anchor
				cx1 = from.x + loopOut * dir;
				cy1 = from.y + (from.y < to.y ? vIn : -vIn);
				cx2 = to.x + loopOut * dir;
				cy2 = to.y + (from.y < to.y ? -vIn : vIn);
			}




			// ── User bend (shaping handle) ───────────────────────────────────
			// Stored relative to the chord: the pull point P sits bendAlong of the
			// way along it and bendPerp × length off it. For curved lines we add the
			// SAME delta D to both control points so the curve passes exactly
			// through P at t = bendAlong: B(t) moves by 3t(1−t)·D, so
			// D = (P − B_auto(t)) / (3t(1−t)). The automatic curve stays the base,
			// so with no bend stored nothing changes. Cornered lines turn bendPerp
			// into a sideways shift of their middle run (see routePoints).
			const bendAlong = bendOv ? bendOv.along : (connection.bendAlong ?? null);
			const bendPerp  = bendOv ? bendOv.perp  : (connection.bendPerp  ?? null);
			const chord = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
			const frame = chordFrame(chord);
			if (route === 'curved' && bendPerp != null) {
				// The curve passes through the handle point P — wherever the user put
				// it (beyond either end, far off to the side), only kept inside the
				// study area so it can always be scrolled to. `t` is just WHERE along
				// the curve P is reached; it stays inside 0.1…0.9 so the curve still
				// leaves and arrives at its connection points.
				const along = bendAlong ?? 0.5;
				const t = Math.min(BEND_ALONG_MAX, Math.max(BEND_ALONG_MIN, along));
				const pull = clampToBounds(
					from.x + frame.ux * along * frame.L + frame.nx * bendPerp * frame.L,
					from.y + frame.uy * along * frame.L + frame.ny * bendPerp * frame.L,
					bounds
				);
				const px = pull.x, py = pull.y;
				const cur = cubicBezierPoint(t, from.x, from.y, cx1, cy1, cx2, cy2, to.x, to.y);
				const k = 3 * t * (1 - t);
				const ddx = (px - cur.x) / k, ddy = (py - cur.y) / k;
				cx1 += ddx; cy1 += ddy; cx2 += ddx; cy2 += ddy;
			}
			// Cornered: with bendAlong + bendPerp the line routes through a waypoint
			// (cornerShape). A bend saved before waypoints (bendPerp only) still slides
			// the middle run sideways, as it used to.
			const bendShift = route === 'cornered' && bendPerp != null && bendAlong == null ? bendPerp * frame.L : 0;

			d = `M ${from.x},${from.y} C ${cx1},${cy1} ${cx2},${cy2} ${to.x},${to.y}`;
			const { mx, my } = cubicBezierMidpoint(from.x, from.y, cx1, cy1, cx2, cy2, to.x, to.y);

		// The on-curve point the dot sits on, computed on the FINAL (possibly bowed)
		// control points so the dot stays welded to the line.
		const anchorPt = cubicBezierPoint(
			anchorT, from.x, from.y, cx1, cy1, cx2, cy2, to.x, to.y
		);

		// The card anchor point: the dot point pushed PERPENDICULAR off the line by
		// `noteLead`, in the direction the card already extends (its placement). The
		// dot stays welded to the curve at anchorPt; a leader line bridges the gap.
		//   below (card under line) → push down   (+y)
		//   above (card over line)  → push up      (−y)
		//   right (card right)      → push right   (+x)
		//   left  (card left)       → push left    (−x)
		let cardX = anchorPt.x;
		let cardY = anchorPt.y;
		switch (notePlacement) {
			case 'below': cardY = anchorPt.y + noteLead; break;
			case 'above': cardY = anchorPt.y - noteLead; break;
			case 'right': cardX = anchorPt.x + noteLead; break;
			case 'left':  cardX = anchorPt.x - noteLead; break;
		}


		/** @type {PathEntry} */
		const entry = {
			route, routeShift: 0,
			// curved: where along the chord the pull point sits · cornered L: how far
			// down (0…1, v→h) the step sits. Unused (null) otherwise.
			bendAlong: route === 'curved' && bendPerp != null ? (bendAlong ?? 0.5)
				: route === 'cornered' ? (bendAlong ?? null) : null,
			bendPerp, bendShift, chord, shapeHandle: null,
			lineColor, fromColor, toColor,
			id: connection.id,
			d, x1: from.x, y1: from.y, x2: to.x, y2: to.y,
			mx, my, cx1, cy1, cx2, cy2,
			fromType, toType, fromEdge, toEdge,
			lineStyle: getLineStyle(fromType, toType),
			note: connection.note ?? null,
			notePlacement, noteAnchorSide: anchorSide, noteAnchorT: anchorT,
			noteAnchorX: anchorPt.x, noteAnchorY: anchorPt.y, noteOffset, noteLead,
			noteCardX: cardX, noteCardY: cardY,
			handleCorner: defaultHandleCorner(anchorSide),
			fromSlide: slideMap.get(`${connection.id}|from`) ?? null,
			toSlide:   slideMap.get(`${connection.id}|to`)   ?? null
		};
		// Straight/cornered: replace the bezier d/midpoint/note anchor with the
		// polyline equivalents (same anchors, same note t semantics: "fraction along").
		if (route !== 'curved') refreshPathCurve(entry);
		newPaths.push(entry);

	}


		// ── Pass E: separate independent lines that run on top of one another ──
		// The per-edge fan-out (Pass A/B) only de-conflicts endpoints that SHARE an
		// element edge. Two UNRELATED connections — e.g. a segment↔segment line
		// across one set of columns and another segment↔segment line across a
		// different set of columns — can still wind up nearly collinear and overlap
		// (likewise for section↔section lines). This pass detects such overlapping
		// runs and bows the involved beziers apart, perpendicular to the shared
		// direction, so they separate into parallel-ish arcs while their endpoints
		// stay welded to their anchors.
		separateOverlappingLines(newPaths);

		// Shaping-handle positions, measured on the FINAL (post-separation) lines.
		for (const p of newPaths) p.shapeHandle = computeShapeHandle(p);

		// ── Pass D: pick a collision-free grab-handle corner per note ─────────
		// Each note's slide handle sits just outside one corner of its card, on the
		// edge OPPOSITE the anchored side (so it never covers the note's own text).
		// Either end of that edge is valid, so when the default corner would land on
		// another connection's anchor point (endpoint node or another note's anchor
		// dot) we flip the handle to the other end of the edge. Falls back to the
		// default when both ends are obstructed ("if practicable").
		// Runs AFTER Pass E so it measures the final (post-separation) anchor points.
		resolveHandleCorners(newPaths, svgRect);

		paths = newPaths;

		// ── Pass F: edge stubs for cross-part connections (§8 (c), phase 3) ────
		//
		// A stub is a short arc from the endpoint that IS on this page, running to a labelled marker at
		// the nearest vertical edge of the canvas. It is NOT an arc to something off-screen: there is no
		// geometry for an element that is not mounted, which is exactly why authoring a cross-part
		// connection remains impossible (Q42). The stub says "this link continues", and the label says
		// where.
		//
		// Direction follows the sequence, not the geometry: a link whose other end is in a LATER part
		// exits right, an earlier part exits left. That makes the stub agree with the prev/next arrows
		// §7 puts in the header, so the marker points the way the user would actually travel.
		stubs = stubCandidates.map((candidate) => {
			const rect = candidate.el.getBoundingClientRect();
			const y = (rect.top + rect.bottom) / 2 - svgRect.top;
			const anchorX =
				candidate.direction === 'backward'
					? rect.left - svgRect.left
					: rect.right - svgRect.left;
			const edgeX = candidate.direction === 'backward' ? STUB_LENGTH : svgRect.width - STUB_LENGTH;

			return {
				id: candidate.connection.id,
				x1: anchorX,
				y1: y,
				x2: edgeX,
				y2: y,
				// A gentle bow so a stub reads as a connection rather than a rule.
				d: `M ${anchorX} ${y} C ${(anchorX + edgeX) / 2} ${y}, ${(anchorX + edgeX) / 2} ${y}, ${edgeX} ${y}`,
				label: candidate.label,
				direction: candidate.direction,
				lineStyle: getLineStyle(
					candidate.connection.fromType || 'segment',
					candidate.connection.toType || 'segment'
				)
			};
		});
	}

	// ─── Pass E helpers: overlapping-line separation ──────────────────────────

	/** Max sine of the angle between two chords for them to count as "parallel". */
	const LINE_PARALLEL_SIN = 0.22;   // ≈ 12.7°
	/** Max average perpendicular gap (layout units) for two parallel runs to count as overlapping. */
	const LINE_OVERLAP_PERP = 7;
	/** Min length (layout units) the two runs must share along their direction. */
	const LINE_OVERLAP_MIN = 14;
	/** Perpendicular spacing (layout units) opened between adjacent overlapping lines. */
	const LINE_SEPARATION = 9;
	/** Endpoints closer than this are treated as SHARED — Pass A/B fan-out already handles those. */
	const LINE_ENDPOINT_EPS = 3;

	/**
	 * Decide whether two connection paths run on top of one another: nearly
	 * parallel (small chord-angle), close together (small perpendicular gap), and
	 * sharing a meaningful length along their common direction. Pairs that share
	 * an endpoint anchor are excluded — the per-edge fan-out already separates
	 * those, and bowing them here would fight that.
	 * @param {PathEntry} a @param {PathEntry} b
	 * @returns {boolean}
	 */
	function pathsOverlap(a, b) {
		// Shared endpoint anchor → leave it to the edge fan-out.
		if (Math.hypot(a.x1 - b.x1, a.y1 - b.y1) < LINE_ENDPOINT_EPS) return false;
		if (Math.hypot(a.x1 - b.x2, a.y1 - b.y2) < LINE_ENDPOINT_EPS) return false;
		if (Math.hypot(a.x2 - b.x1, a.y2 - b.y1) < LINE_ENDPOINT_EPS) return false;
		if (Math.hypot(a.x2 - b.x2, a.y2 - b.y2) < LINE_ENDPOINT_EPS) return false;

		const adx = a.x2 - a.x1, ady = a.y2 - a.y1;
		const bdx = b.x2 - b.x1, bdy = b.y2 - b.y1;
		const alen = Math.hypot(adx, ady) || 1;
		const blen = Math.hypot(bdx, bdy) || 1;
		const aux = adx / alen, auy = ady / alen; // a's unit direction
		const bux = bdx / blen, buy = bdy / blen; // b's unit direction

		// Parallel test (covers both same- and opposite-direction chords): the
		// magnitude of the 2-D cross product of the unit vectors is sin(angle).
		const cross = aux * buy - auy * bux;
		if (Math.abs(cross) > LINE_PARALLEL_SIN) return false;

		// Perpendicular gap: distance of b's two endpoints from a's infinite line
		// (normal to a's direction is (−auy, aux)). Average the two ends.
		const perp1 = Math.abs(-(b.x1 - a.x1) * auy + (b.y1 - a.y1) * aux);
		const perp2 = Math.abs(-(b.x2 - a.x1) * auy + (b.y2 - a.y1) * aux);
		if ((perp1 + perp2) / 2 > LINE_OVERLAP_PERP) return false;

		// Overlap along a's axis: project b's endpoints onto a's direction (a spans
		// [0, alen]) and measure how much the two intervals share.
		const sb1 = (b.x1 - a.x1) * aux + (b.y1 - a.y1) * auy;
		const sb2 = (b.x2 - a.x1) * aux + (b.y2 - a.y1) * auy;
		const lo = Math.min(sb1, sb2), hi = Math.max(sb1, sb2);
		const overlapLen = Math.min(hi, alen) - Math.max(lo, 0);
		return overlapLen >= LINE_OVERLAP_MIN;
	}

	/**
	 * Recompute a path's bezier `d`, midpoint, and (if it has a note) the note
	 * anchor dot + card positions after its control points have been moved, so the
	 * rendered string, the dot welded to the curve, and the card all stay in sync.
	 * @param {PathEntry} p
	 */
	function refreshPathCurve(p) {
		if (p.route === 'curved') {
			p.d = `M ${p.x1},${p.y1} C ${p.cx1},${p.cy1} ${p.cx2},${p.cy2} ${p.x2},${p.y2}`;
			const mid = cubicBezierMidpoint(p.x1, p.y1, p.cx1, p.cy1, p.cx2, p.cy2, p.x2, p.y2);
			p.mx = mid.mx; p.my = mid.my;
		} else {
			const pts = simplifyPolyline(routePoints(p));
			p.d = polylineToD(pts);
			const mid = polylinePointAt(pts, 0.5);
			p.mx = mid.x; p.my = mid.y;
		}

		// Keep the note dot on the (now-bowed) line at its parameter t, then re-derive
		// the card anchor by pushing the dot off the line by noteLead (mirrors Pass C).
		const anchorPt = routePointAt(p, p.noteAnchorT);
		p.noteAnchorX = anchorPt.x;
		p.noteAnchorY = anchorPt.y;
		let cardX = anchorPt.x, cardY = anchorPt.y;
		switch (p.notePlacement) {
			case 'below': cardY = anchorPt.y + p.noteLead; break;
			case 'above': cardY = anchorPt.y - p.noteLead; break;
			case 'right': cardX = anchorPt.x + p.noteLead; break;
			case 'left':  cardX = anchorPt.x - p.noteLead; break;
		}
		p.noteCardX = cardX;
		p.noteCardY = cardY;
	}

	/**
	 * Slide ONE endpoint of a path along its element edge so the endpoint moves as
	 * close as possible to `off` in the separation-normal direction (nx, ny) —
	 * keeping the line straight and the endpoint ON its edge. The endpoint can only
	 * travel along its edge axis (x for top/bottom edges, y for left/right) and is
	 * clamped to the edge's usable [lo, hi] bounds, so it never slides off the edge.
	 *
	 * Returns the perpendicular distance actually achieved (`achievedPerp`, ≤ |off|
	 * after clamping) plus the raw move vector (`ddx`, `ddy`) applied to the
	 * endpoint — the caller shifts the adjacent bezier control point by that same
	 * vector so the curve's exit tangent (and thus its straightness) is preserved.
	 * When the edge runs parallel to the normal (sliding can't move the endpoint
	 * perpendicular at all) nothing moves and achievedPerp is 0, signalling the
	 * caller to bow this end instead.
	 * @param {PathEntry} p
	 * @param {'from'|'to'} end
	 * @param {number} nx @param {number} ny — separation normal (unit)
	 * @param {number} off — desired perpendicular offset along the normal
	 * @returns {{ achievedPerp: number, ddx: number, ddy: number }}
	 */
	function slideEndpointAlongEdge(p, end, nx, ny, off) {
		const slide = end === 'from' ? p.fromSlide : p.toSlide;
		if (!slide) return { achievedPerp: 0, ddx: 0, ddy: 0 };

		// Edge direction unit vector + the endpoint's current coordinate on that axis.
		const sx = slide.axis === 'x' ? 1 : 0;
		const sy = slide.axis === 'y' ? 1 : 0;
		const cur = slide.axis === 'x' ? (end === 'from' ? p.x1 : p.x2)
		                               : (end === 'from' ? p.y1 : p.y2);

		// Perpendicular distance gained per unit of slide along the edge.
		const denom = sx * nx + sy * ny;
		if (Math.abs(denom) < 1e-3) return { achievedPerp: 0, ddx: 0, ddy: 0 };

		// Slide distance needed for `off`, clamped so the endpoint stays on its edge.
		const want = off / denom;
		const a = Math.max(slide.lo - cur, Math.min(slide.hi - cur, want));
		const ddx = sx * a;
		const ddy = sy * a;
		if (end === 'from') { p.x1 += ddx; p.y1 += ddy; }
		else                { p.x2 += ddx; p.y2 += ddy; }
		return { achievedPerp: a * denom, ddx, ddy };
	}

	/**
	 * Pass E: pull apart connection lines that run on top of one another.

	 *
	 * Pass A/B only fans out endpoints that share an element edge. Two independent
	 * connections (different endpoints) can still run nearly collinear — e.g. a
	 * segment↔segment line in one set of columns lying right over a segment↔segment
	 * line in another set, or two section↔section lines at the same height. This
	 * pass groups every set of mutually-overlapping lines (transitively, via union-
	 * find), then bows each group member's bezier control points along the group's
	 * shared normal by an even, centred spacing so the lines separate into
	 * parallel-ish arcs. Endpoints are never moved, so each line stays welded to its
	 * anchors; only the curve between them swings clear.
	 *
	 * The ordering and offsets are derived deterministically (sorted by each line's
	 * current perpendicular position, tie-broken by id) so the result is stable
	 * frame-to-frame and never jitters.
	 * @param {PathEntry[]} list
	 */
	function separateOverlappingLines(list) {
		const n = list.length;
		if (n < 2) return;

		// Union-find over path indices: union any pair that overlaps.
		const parent = Array.from({ length: n }, (_, i) => i);
		/** @param {number} i @returns {number} */
		const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
		/** @param {number} i @param {number} j */
		const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };

		let anyOverlap = false;
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				if (pathsOverlap(list[i], list[j])) { union(i, j); anyOverlap = true; }
			}
		}
		if (!anyOverlap) return;

		// Collect groups of size ≥ 2.
		/** @type {Map<number, number[]>} */
		const groupsById = new Map();
		for (let i = 0; i < n; i++) {
			const root = find(i);
			if (!groupsById.has(root)) groupsById.set(root, []);
			groupsById.get(root)?.push(i);
		}

		for (const members of groupsById.values()) {
			const m = members.length;
			if (m < 2) continue;

			// Shared direction: average the members' unit chords, flipping any that
			// point opposite the first so same- and opposite-drawn lines agree.
			const ref = list[members[0]];
			let refdx = ref.x2 - ref.x1, refdy = ref.y2 - ref.y1;
			const refLen = Math.hypot(refdx, refdy) || 1;
			const rux = refdx / refLen, ruy = refdy / refLen;
			let avgX = 0, avgY = 0;
			for (const idx of members) {
				const p = list[idx];
				const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
				const len = Math.hypot(dx, dy) || 1;
				let ux = dx / len, uy = dy / len;
				if (ux * rux + uy * ruy < 0) { ux = -ux; uy = -uy; }
				avgX += ux; avgY += uy;
			}
			const aLen = Math.hypot(avgX, avgY) || 1;
			const dirX = avgX / aLen, dirY = avgY / aLen;
			// Normal to the shared direction — the axis we separate along.
			const nx = -dirY, ny = dirX;

			// Order members by their current signed perpendicular position (chord
			// midpoint · normal); tie-break by id so the layout is deterministic.
			const sorted = members.slice().sort((ia, ib) => {
				const pa = list[ia], pb = list[ib];
				const ma = ((pa.x1 + pa.x2) / 2) * nx + ((pa.y1 + pa.y2) / 2) * ny;
				const mb = ((pb.x1 + pb.x2) / 2) * nx + ((pb.y1 + pb.y2) / 2) * ny;
				if (ma !== mb) return ma - mb;
				return pa.id < pb.id ? -1 : pa.id > pb.id ? 1 : 0;
			});

			// Separate each member by the even, centred perpendicular offset `off`.
			// PREFERRED: slide BOTH endpoints along their edges so the whole line
			// translates by `off` perpendicular — staying perfectly straight and
			// on-edge (this is what the user wants: lines just move apart, no bowing).
			// Each control point rides along with its endpoint so the exit tangent is
			// preserved. ONLY when an endpoint runs out of edge to slide (clamped) or
			// its edge is parallel to the normal does the leftover offset get applied
			// as a bow of that end's control point — bending strictly as a last resort.
			for (let k = 0; k < sorted.length; k++) {
				const off = (k - (sorted.length - 1) / 2) * LINE_SEPARATION;
				if (off === 0) continue;
				const p = list[sorted[k]];

				// 1) Slide each endpoint along its edge; the matching control point
				//    follows by the same vector so the line stays straight there.
				const f = slideEndpointAlongEdge(p, 'from', nx, ny, off);
				p.cx1 += f.ddx; p.cy1 += f.ddy;
				const t = slideEndpointAlongEdge(p, 'to', nx, ny, off);
				p.cx2 += t.ddx; p.cy2 += t.ddy;

				// 2) Bend only for the residual each end couldn't cover by sliding.
				const fRes = off - f.achievedPerp;
				const tRes = off - t.achievedPerp;
				//    Curved   → bow the bezier control points (historic behavior).
				//    Cornered → shift the middle run sideways so bends stay square.
				//    Straight → never bend; sliding is the only separation it gets.
				if (p.route === 'curved') {
					if (Math.abs(fRes) > 0.5) { p.cx1 += nx * fRes; p.cy1 += ny * fRes; }
					if (Math.abs(tRes) > 0.5) { p.cx2 += nx * tRes; p.cy2 += ny * tRes; }
				} else if (p.route === 'cornered') {
					const res = (fRes + tRes) / 2;
					if (Math.abs(res) > 0.5) {
						// The middle run is horizontal for vertical exits (shift in y) and
						// vertical for side exits (shift in x); project the normal on that axis.
						const verticalExit = p.fromEdge === 'top' || p.fromEdge === 'bottom';
						const axisComp = verticalExit ? ny : nx;
						if (Math.abs(axisComp) > 0.2) p.routeShift += res * Math.sign(axisComp);
					}
				}

				refreshPathCurve(p);
			}

		}
	}


	/**
	 * Default grab-handle corner for a note anchored on a given side (the historic
	 * fixed rule). The card extends AWAY from the anchored side, so the handle hugs
	 * the opposite edge:
	 *   anchor top    (card below)  → bottom-left  corner
	 *   anchor bottom (card above)  → top-left     corner
	 *   anchor left   (card right)  → top-right    corner
	 *   anchor right  (card left)   → top-left     corner
	 * @param {'top'|'right'|'bottom'|'left'} anchorSide
	 * @returns {'tl'|'tr'|'bl'|'br'}
	 */
	function defaultHandleCorner(anchorSide) {
		if (anchorSide === 'top')  return 'bl';
		if (anchorSide === 'left') return 'tr';
		return 'tl'; // bottom / right
	}

	/**
	 * The two grab-handle corners a note MAY use, given its anchored side. Both lie
	 * on the edge opposite the anchored side (so the handle never covers the note
	 * text); the first entry is the historic default. The handle can slide to the
	 * other end of that edge to dodge a nearby anchor point.
	 *   anchor top    → bottom edge → ['bl', 'br']
	 *   anchor bottom → top edge    → ['tl', 'tr']
	 *   anchor left   → right edge  → ['tr', 'br']
	 *   anchor right  → left edge   → ['tl', 'bl']
	 * @param {'top'|'right'|'bottom'|'left'} anchorSide
	 * @returns {Array<'tl'|'tr'|'bl'|'br'>}
	 */
	function candidateHandleCorners(anchorSide) {
		switch (anchorSide) {
			case 'top':    return ['bl', 'br'];
			case 'bottom': return ['tl', 'tr'];
			case 'left':   return ['tr', 'br'];
			default:       return ['tl', 'bl']; // 'right'
		}
	}

	/**
	 * Approximate, in the overlay's layout coordinate space, the centre point a
	 * given grab-handle corner would occupy for a note card. The card box is
	 * reconstructed from the note's anchor point + its placement transform +
	 * slide offset; the handle sits just OUTSIDE the requested corner.
	 * @param {PathEntry} path
	 * @param {'tl'|'tr'|'bl'|'br'} corner
	 * @param {number} cardW — card width in layout units
	 * @param {number} cardH — card height in layout units
	 * @param {number} pad — handle half-extent in layout units (gap outside corner)
	 * @returns {{ x: number, y: number }}
	 */
	function handleCornerPoint(path, corner, cardW, cardH, pad) {
		// Top-left of the card in layout units, derived from the placement transform
		// (mirrors noteTransform()). The card hangs from noteCardX/noteCardY (the dot
		// pushed off the line by noteLead); noteOffset slides it along its edge.
		let cardLeft = path.noteCardX;
		let cardTop  = path.noteCardY;
		switch (path.notePlacement) {
			case 'right': cardLeft = path.noteCardX;             cardTop = path.noteCardY - cardH / 2 + path.noteOffset; break;
			case 'left':  cardLeft = path.noteCardX - cardW;     cardTop = path.noteCardY - cardH / 2 + path.noteOffset; break;
			case 'above': cardLeft = path.noteCardX - cardW / 2 + path.noteOffset; cardTop = path.noteCardY - cardH; break;
			case 'below': cardLeft = path.noteCardX - cardW / 2 + path.noteOffset; cardTop = path.noteCardY;          break;
			default:      cardLeft = path.noteCardX - cardW / 2; cardTop = path.noteCardY - cardH / 2;                 break;
		}

		const left   = corner === 'tl' || corner === 'bl';
		const top     = corner === 'tl' || corner === 'tr';
		return {
			x: left ? cardLeft - pad : cardLeft + cardW + pad,
			y: top  ? cardTop  - pad : cardTop  + cardH + pad
		};
	}

	/**
	 * Choose a grab-handle corner for every note so the handle avoids covering
	 * OTHER connections' anchor points (endpoint nodes) and note anchor dots. The
	 * historic default corner is kept unless it sits within HANDLE_AVOID_RADIUS of
	 * an obstacle and the alternate corner is clear. Measures each card's rendered
	 * size from the DOM (same technique as the slide-offset clamp).
	 * @param {PathEntry[]} list
	 * @param {DOMRect} svgRect
	 */
	function resolveHandleCorners(list, svgRect) {
		// Obstacle points: every endpoint node + every note anchor dot, in layout
		// units (the same space noteAnchorX/Y and x1/y1/x2/y2 already live in).
		/** @type {Array<{ id: string, x: number, y: number }>} */
		const obstacles = [];
		for (const p of list) {
			obstacles.push({ id: p.id, x: p.x1, y: p.y1 });
			obstacles.push({ id: p.id, x: p.x2, y: p.y2 });
			if (p.note) obstacles.push({ id: p.id, x: p.noteAnchorX, y: p.noteAnchorY });
		}

		const HANDLE_AVOID_RADIUS = 11; // layout units; ~handle + node half-extents
		const HANDLE_PAD = 4;           // handle centre sits this far outside the corner

		for (const p of list) {
			// Only notes with a rendered card need a handle.
			if (!p.note) continue;

			const cardEl = /** @type {HTMLElement|null} */ (
				document.querySelector(`.connection-note-wrapper[data-note-id="${p.id}"] .connection-note-display`)
			);
			if (!cardEl) continue; // not yet rendered — keep the default
			const cardW = cardEl.offsetWidth;
			const cardH = cardEl.offsetHeight;

			const candidates = candidateHandleCorners(p.noteAnchorSide);

			/**
			 * Smallest distance from a candidate handle position to any OTHER
			 * connection's obstacle point (own points excluded).
			 * @param {'tl'|'tr'|'bl'|'br'} corner
			 * @returns {number}
			 */
			const clearance = (corner) => {
				const pt = handleCornerPoint(p, corner, cardW, cardH, HANDLE_PAD);
				let min = Infinity;
				for (const o of obstacles) {
					if (o.id === p.id) continue;
					const dd = Math.hypot(o.x - pt.x, o.y - pt.y);
					if (dd < min) min = dd;
				}
				return min;
			};

			const [primary, alternate] = candidates;
			// Keep the default unless it's obstructed and the alternate is clearer.
			if (clearance(primary) >= HANDLE_AVOID_RADIUS) {
				p.handleCorner = primary;
			} else if (clearance(alternate) >= HANDLE_AVOID_RADIUS) {
				p.handleCorner = alternate;
			} else {
				// Both crowded — take whichever has more breathing room.
				p.handleCorner = clearance(alternate) > clearance(primary) ? alternate : primary;
			}
		}
	}


	/**
	 * Which card edge carries a note's move handle: the edge OPPOSITE the side the
	 * card is anchored on, i.e. the edge FARTHEST from the connection line. The
	 * note's anchor dot and the line's shaping handle both live on the line, so
	 * the card itself always sits between them and this handle.
	 *   anchor top    (card below the dot) → bottom edge
	 *   anchor bottom (card above the dot) → top edge
	 *   anchor left   (card right of dot)  → right edge
	 *   anchor right  (card left of dot)   → left edge
	 * @param {'top'|'right'|'bottom'|'left'} anchorSide
	 * @returns {'top'|'right'|'bottom'|'left'}
	 */
	function noteHandleEdge(anchorSide) {
		switch (anchorSide) {
			case 'top':    return 'bottom';
			case 'bottom': return 'top';
			case 'left':   return 'right';
			default:       return 'left';
		}
	}



	// ─── Drop handle computation ──────────────────────────────────────────────

	/**
	 * Build the list of ALLOWED SIDES a dragged connection point may snap onto.
	 *
	 * Every element keeps its own side(s) — column: top · section: top & bottom ·
	 * segment: left & right — so nested elements that share a border never
	 * compete for the same side, and the drop is unambiguous. A point can land
	 * anywhere along an allowed side (see snapToDropSide).
	 *
	 * An item can only have ONE connection to another item, so any element that
	 * already has a connection to the fixed end is excluded. The connection being
	 * dragged is excluded from that check, so dropping back onto its own element
	 * (to slide the point along its side) is always allowed.
	 *
	 * @param {string|null} fixedElementId
	 * @param {ConnType} fixedType — type of the fixed (non-dragged) endpoint
	 * @param {string} connectionId — id of the connection being dragged
	 * @returns {DropSide[]}
	 */
	function computeDropHandles(fixedElementId, fixedType, connectionId) {
		if (!svgElement) return [];
		const svgRect = svgElement.getBoundingClientRect();
		/** @type {DropSide[]} */
		const sides = [];

		/**
		 * @param {string} id @param {ConnType} type @param {DOMRect} rect
		 */
		const addSides = (id, type, rect) => {
			const L = (rect.left - svgRect.left) / scale;
			const R = (rect.right - svgRect.left) / scale;
			const T = (rect.top - svgRect.top) / scale;
			const B = (rect.bottom - svgRect.top) / scale;
			for (const edge of ALLOWED_ANCHOR_EDGES[type]) {
				if (edge === 'top')    sides.push({ elementId: id, type, edge, x1: L, y1: T, x2: R, y2: T });
				if (edge === 'bottom') sides.push({ elementId: id, type, edge, x1: L, y1: B, x2: R, y2: B });
				if (edge === 'left')   sides.push({ elementId: id, type, edge, x1: L, y1: T, x2: L, y2: B });
				if (edge === 'right')  sides.push({ elementId: id, type, edge, x1: R, y1: T, x2: R, y2: B });
			}
		};

		document.querySelectorAll('.column[data-column-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.columnId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'column', id, connectionId)) return;
			// Column top = the first visible section's top (see columnAnchorRect).
			const rect = columnAnchorRect(el);
			if (rect.width === 0) return;
			addSides(id, 'column', rect);
		});

		document.querySelectorAll('.section[data-section-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.sectionId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'section', id, connectionId)) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			addSides(id, 'section', rect);
		});

		document.querySelectorAll('[data-segment-id]').forEach(el => {
			const id = /** @type {HTMLElement} */ (el).dataset.segmentId;
			if (!id || id === fixedElementId) return;
			if (hasConnectionBetween(fixedType, fixedElementId, 'segment', id, connectionId)) return;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0) return;
			addSides(id, 'segment', rect);
		});

		return sides;
	}

	/**
	 * Snap the cursor to the nearest point on the nearest allowed side within
	 * SNAP_RADIUS. The spot is kept ANCHOR_EDGE_PAD in from each corner (like the
	 * automatic placement) and reported as a fraction `pos` along the side.
	 * @param {DropSide[]} sides @param {number} cursorX @param {number} cursorY
	 * @returns {DropSpot|null}
	 */
	function findClosestHandle(sides, cursorX, cursorY) {
		/** @type {DropSpot|null} */
		let best = null;
		let bestDist = SNAP_RADIUS;
		for (const s of sides) {
			const horizontal = s.edge === 'top' || s.edge === 'bottom';
			const lo = (horizontal ? s.x1 : s.y1);
			const hi = (horizontal ? s.x2 : s.y2);
			const len = hi - lo;
			if (len <= 0) continue;
			const pad = Math.min(ANCHOR_EDGE_PAD, len / 2);
			const along = Math.min(hi - pad, Math.max(lo + pad, horizontal ? cursorX : cursorY));
			const x = horizontal ? along : s.x1;
			const y = horizontal ? s.y1 : along;
			const dist = Math.hypot(x - cursorX, y - cursorY);
			if (dist < bestDist) {
				bestDist = dist;
				best = { elementId: s.elementId, type: s.type, edge: s.edge, pos: (along - lo) / len, x, y };
			}
		}
		return best;
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
			// Only update the dragged end — PATCH handler preserves the fixed end.
			// The end lands on (or stays on) the snapped element AND remembers the
			// exact spot along its side, so the point stays where it was dropped.
			/** @type {Record<string, string|number>} */
			const body = {};
			const pos = Math.round(activeHandle.pos * 1000) / 1000;

			if (end === 'from') {
				body.fromType = activeHandle.type;
				if (activeHandle.type === 'segment') body.fromSegmentId = activeHandle.elementId;
				else if (activeHandle.type === 'section') body.fromSectionId = activeHandle.elementId;
				else body.fromColumnId = activeHandle.elementId;
				body.fromAnchorEdge = activeHandle.edge;
				body.fromAnchorPos = pos;
			} else {
				body.toType = activeHandle.type;
				if (activeHandle.type === 'segment') body.toSegmentId = activeHandle.elementId;
				else if (activeHandle.type === 'section') body.toSectionId = activeHandle.elementId;
				else body.toColumnId = activeHandle.elementId;
				body.toAnchorEdge = activeHandle.edge;
				body.toAnchorPos = pos;
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
		// Count how many of the selected connections have a note so the multi-select
		// note-placement actions (Side/Slide/Position/Offset) can enable when ANY do.
		const noteCount = ids.reduce(
			(n, id) => n + (connections.find(c => c.id === id)?.note ? 1 : 0),
			0
		);
		setActiveConnection(ids.length > 0, ids, hasNote, noteCount);
	}

	/**
	 * Select every CURRENTLY VISIBLE connection (Structure → "Select All
	 * Connections"). Only visiblePaths are selected, so connections hidden by a
	 * per-type visibility toggle are intentionally left out — selecting lines the
	 * user can't see would be confusing. Mirrors handlePathClick's note bookkeeping.
	 */
	function handleSelectAllConnections() {
		// Commit/clear any open or selected note first, matching handlePathClick.
		if (noteEditingId) {
			commitNoteEdit();
		} else if (noteSelectedId) {
			noteSelectedId = null;
			noteEditorActive = false;
		}

		const ids = visiblePaths.map(p => p.id);
		selectedPathIds = new Set(ids);

		// hasNote only applies to a single selection; noteCount enables the
		// multi-select note-placement actions when ANY selected connection has a note.
		const hasNote = ids.length === 1
			? !!(connections.find(c => c.id === ids[0])?.note)
			: false;
		const noteCount = ids.reduce(
			(n, id) => n + (connections.find(c => c.id === id)?.note ? 1 : 0),
			0
		);
		setActiveConnection(ids.length > 0, ids, hasNote, noteCount);
	}

	/**
	 * Select a single connection by id, replacing any current selection. Used to
	 * auto-select a freshly inserted connection so the user can act on it right
	 * away. Mirrors handlePathClick's bookkeeping for a single selection.
	 * @param {string} id
	 */
	function selectConnectionById(id) {
		// Commit/clear any open or selected note first, matching handlePathClick.
		if (noteEditingId) {
			commitNoteEdit();
		} else if (noteSelectedId) {
			noteSelectedId = null;
			noteEditorActive = false;
		}

		selectedPathIds = new Set([id]);
		const hasNote = !!(connections.find(c => c.id === id)?.note);
		setActiveConnection(true, [id], hasNote, hasNote ? 1 : 0);
	}

	/**
	 * Handle the "select-connection" window event (dispatched right after a
	 * connection is inserted). If the connection's path has already been computed
	 * we select it immediately; otherwise we stash the id in pendingSelectId so the
	 * $effect below claims it once calculatePaths() produces the new path (the data
	 * invalidation that adds the connection is asynchronous).
	 * @param {CustomEvent<{ id: string }>} event
	 */
	function handleSelectConnection(event) {
		const id = event.detail?.id;
		if (!id) return;
		if (paths.some(p => p.id === id)) {
			selectConnectionById(id);
			pendingSelectId = null;
		} else {
			pendingSelectId = id;
		}
	}

	// Claim a pending auto-select once its path appears (after the post-insert data
	// refresh recomputes paths). Clears the pending id only when it resolves so the
	// request survives intermediate recomputes until the new path exists.
	$effect(() => {
		if (!pendingSelectId) return;
		if (paths.some(p => p.id === pendingSelectId)) {
			selectConnectionById(pendingSelectId);
			pendingSelectId = null;
		}
	});

	/**
	 * Deselect all connections when clicking within the passage content area


	 * but not on a connection path.  Clicks on the toolbar, commentary panel, or
	 * other UI chrome are ignored so the selection is preserved.
	 * @param {MouseEvent} event
	 */
	function handleDocumentClick(event) {
		// A note placement drag (slide along the line / slide the card) just ended;
		// swallow the click it generated so we keep the connection we activated by
		// grabbing the anchor selected.
		if (suppressNextDocumentClick) {
			suppressNextDocumentClick = false;
			return;
		}

		const target = /** @type {Element} */ (event.target);
		// Only deselect if the click landed inside the analyze scroll container,
		// not on toolbar buttons or the commentary panel. Scope to `.analyze-content`
		// (the full-height scroll container) — matching where columns/sections/segments
		// deselect — so clicking the empty area below the passage also clears the
		// connection selection. Using the inner `.analyze-content-wrapper` here would
		// miss that empty region and leave the connection selected.
		const contentWrapper = svgElement?.closest('.analyze-content');
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
		if (noteEditorActive) {
			setHeadingOrNoteEditorActive(true, 'connection-note', 'connection-note');
			return () => clearHeadingOrNoteEditorActiveKey('connection-note');
		}
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

		// Make sure the connection-visibility toggle that governs this connection's
		// type is on. A connection note is only rendered along its VISIBLE path
		// (see visiblePaths); if the connection's type toggle was off the note editor
		// would never appear even though Connection Quick Notes is enabled.
		showConnectionsForTypes(conn.fromType, conn.toType);


		// Deactivate everything else in the study
		clearSelectedItem();           // Studies panel: selected → active-only
		setActiveSegment(false, null); // segment + inline note editor
		setActiveSection(false, null); // section
		setActiveColumn(false, null);  // column

		// Keep THIS connection selected while its Quick Note is being edited, so the
		// arc stays highlighted and the selection persists through the edit session.
		selectedPathIds = new Set([connectionId]);
		setActiveConnection(true, [connectionId], !!conn.note);
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

	// ─── Note placement drag (slide along line + slide card along edge) ───────

	/**
	 * Persist a note's placement (anchor parameter t, attached side, slide offset)
	 * and refresh the loaded data so the values survive a reload.
	 * @param {string} connectionId
	 * @param {{ t?: number, side?: 'top'|'right'|'bottom'|'left', offset?: number, lead?: number }} placement
	 */
	async function saveNotePlacement(connectionId, placement) {
		try {
			/** @type {Record<string, number|string>} */
			const body = {};
			if (placement.t !== undefined)      body.noteAnchorT = placement.t;
			if (placement.side !== undefined)   body.noteAnchorSide = placement.side;
			if (placement.offset !== undefined) body.noteOffset = placement.offset;
			if (placement.lead !== undefined)   body.noteLead = placement.lead;

			const response = await fetch(`/api/segments/connections/${connectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (response.ok) {
				await invalidate('app:studies');
			} else {
				console.error('Connection note placement save error:', await response.json());
			}
		} catch (err) {
			console.error('Connection note placement save network error:', err);
		}
	}

	/**
	 * Begin sliding a note ALONG its connection line. Started from the three-dot
	 * line-slide handle on the card's far edge (the anchor dot itself is a marker
	 * only). The dot rides the line — its start point moved by the pointer delta,
	 * snapped to the nearest point on the line — and the card stays welded to it.
	 * @param {PointerEvent} event
	 * @param {PathEntry} path
	 */
	function startNoteDotDrag(event, path) {
		event.preventDefault();
		event.stopPropagation();

		// Grabbing the anchor dot selects the connection so its line activates
		// (matches a click on the line itself). Commit any open note editor first.
		if (noteEditingId) {
			commitNoteEdit();
		} else if (noteSelectedId) {
			noteSelectedId = null;
			noteEditorActive = false;
		}
		selectedPathIds = new Set([path.id]);
		setActiveConnection(true, [path.id], !!path.note);

		notePlacementDidDrag = false;
		notePlacementDrag = {
			id: path.id,
			mode: 'dot',
			startX: event.clientX,
			startY: event.clientY,
			startAnchorX: path.noteAnchorX,
			startAnchorY: path.noteAnchorY,
			startOffset: 0,
			startLead: path.noteLead,
			placement: path.notePlacement,
			side: path.noteAnchorSide
		};
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}


	/**
	 * Begin sliding a note's CARD along its attached edge (perpendicular to the dot
	 * direction). The dot stays put on the curve; only the card translates.
	 * @param {PointerEvent} event
	 * @param {PathEntry} path
	 */
	function startNoteCardDrag(event, path) {
		event.preventDefault();
		event.stopPropagation();

		// Grabbing the slide handle selects the connection so its line activates
		// (matches the anchor-dot grab and a click on the line itself).
		if (noteSelectedId && noteSelectedId !== path.id) {
			noteSelectedId = null;
			noteEditorActive = false;
		}
		selectedPathIds = new Set([path.id]);
		setActiveConnection(true, [path.id], !!path.note);

		notePlacementDidDrag = false;
		notePlacementDrag = {
			id: path.id,
			mode: 'card',
			startX: event.clientX,
			startY: event.clientY,
			startOffset: path.noteOffset,
			startLead: path.noteLead,
			placement: path.notePlacement,
			side: path.noteAnchorSide
		};
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}


	/** @param {PointerEvent} event */
	function handleNotePlacementMove(event) {
		if (!notePlacementDrag) return;
		event.preventDefault();
		const drag = notePlacementDrag;
		const path = paths.find(p => p.id === drag.id);
		if (!path) return;

		// Mark a real drag once the pointer travels past the threshold so a click
		// (pointerdown→up with no movement) on the card still enters edit mode.
		if (!notePlacementDidDrag) {
			const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
			if (moved < NOTE_DRAG_THRESHOLD) return;
			notePlacementDidDrag = true;
		}

		if (drag.mode === 'dot') {

			// The drag starts on the card's edge handle, away from the line, so use
			// RELATIVE motion: move the dot's start point by the pointer delta and
			// snap that to the nearest point on the line → new t. No jump on grab.
			const dx = (event.clientX - drag.startX) / scale;
			const dy = (event.clientY - drag.startY) / scale;
			const t = nearestTOnCurve(path, (drag.startAnchorX ?? path.noteAnchorX) + dx, (drag.startAnchorY ?? path.noteAnchorY) + dy);
			notePlacementOverrides = {
				...notePlacementOverrides,
				[drag.id]: { ...(notePlacementOverrides[drag.id] ?? { side: null, offset: null }), t }
			};
		} else {
			// Free 2-D card drag, decomposed into two independent axes:
			//   • ALONG the anchored edge  → `offset` (slides the card sideways; the
			//     dot stays put). Horizontal for top/bottom sides, vertical for
			//     left/right.
			//   • PERPENDICULAR to the edge → `lead` (floats the card OFF the line; a
			//     leader line bridges the gap). Always an unsigned distance growing in
			//     the direction the card already extends (its placement).
			// Both deltas are CSS px ÷ scale so they track the cursor 1:1 at any zoom.
			const horizontal = drag.side === 'top' || drag.side === 'bottom';
			const deltaX = (event.clientX - drag.startX) / (scale || 1);
			const deltaY = (event.clientY - drag.startY) / (scale || 1);

			// Along-edge slide.
			let offset = drag.startOffset + (horizontal ? deltaX : deltaY);

			// Perpendicular lead — signed so dragging TOWARD the line shrinks the gap
			// (and past 0 the card would cross the line; clamp at 0 so it can't).
			let lead = drag.startLead;
			switch (drag.placement) {
				case 'below': lead += deltaY; break;  // card under line → down grows gap
				case 'above': lead -= deltaY; break;  // card over line  → up grows gap
				case 'right': lead += deltaX; break;  // card right      → right grows gap
				case 'left':  lead -= deltaX; break;  // card left       → left grows gap
			}
			lead = Math.max(0, lead);

			// Clamp the along-edge slide so the card never slides off its anchor: the
			// dot sits centered on the attached edge at offset 0, so it can travel at
			// most half the card's length along the slide axis. Measured live (in
			// unscaled layout units, matching `offset`) from the card element.
			const cardEl = /** @type {HTMLElement|null} */ (
				document.querySelector(`.connection-note-wrapper[data-note-id="${drag.id}"] .connection-note-display`)
			);
			if (cardEl) {
				const limit = (horizontal ? cardEl.offsetWidth : cardEl.offsetHeight) / 2;
				offset = Math.max(-limit, Math.min(limit, offset));
			}

			notePlacementOverrides = {
				...notePlacementOverrides,
				[drag.id]: { ...(notePlacementOverrides[drag.id] ?? { t: null, side: null }), offset, lead }
			};
		}
		scheduleCalculate();
	}


	/** @param {PointerEvent} _event */
	async function handleNotePlacementUp(_event) {
		if (!notePlacementDrag) return;
		const drag = notePlacementDrag;
		notePlacementDrag = null;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		// The pointerup is followed by a document `click`; don't let it deselect
		// the connection we activated by grabbing the anchor/handle.
		suppressNextDocumentClick = true;

		const override = notePlacementOverrides[drag.id];
		if (!override) return;

		// Persist whichever value this drag changed (round t/offset for clean data).
		/** @type {{ t?: number, side?: 'top'|'right'|'bottom'|'left', offset?: number, lead?: number }} */
		const placement = {};
		if (drag.mode === 'dot' && override.t != null) {
			placement.t = Math.round(override.t * 1000) / 1000;
			// First placement must also pin the side so the stored row is complete.
			placement.side = drag.side;
		} else if (drag.mode === 'card') {
			// A card drag sets both axes at once: along-edge slide (offset) and the
			// perpendicular gap off the line (lead). Persist whichever moved.
			if (override.offset != null) placement.offset = Math.round(override.offset);
			if (override.lead != null) {
				placement.lead = Math.max(0, Math.round(override.lead));
				// Pin the side so a card placed before any dot drag stores a complete row.
				placement.side = drag.side;
			}
		}


		try {
			await saveNotePlacement(drag.id, placement);
		} finally {
			// Drop the live override now the persisted value is the source of truth.
			const { [drag.id]: _drop, ...rest } = notePlacementOverrides;
			notePlacementOverrides = rest;
		}
	}

	/**
	 * Handle "connection-note-set-side" from the Connect menu: re-attach the
	 * note(s) of EVERY selected connection that has a note to a chosen side of
	 * their anchor dots. The card extends away from that side; each note's offset
	 * resets so it re-centres on its dot. Each note keeps its own anchor-T (slide
	 * along its own line), so a multi-select re-sides them all uniformly without
	 * disturbing where each rides its line.
	 * @param {CustomEvent<{ side: 'top'|'right'|'bottom'|'left' }>} event
	 */
	function handleSetNoteSide(event) {
		const side = event.detail?.side;
		if (!side) return;
		// Apply to every selected connection that actually has a note.
		const ids = [...selectedPathIds].filter(
			id => !!(connections.find(c => c.id === id)?.note)
		);
		if (ids.length === 0) return;

		// Live overrides for an instant visual response across all targets.
		const overrides = { ...notePlacementOverrides };
		for (const id of ids) {
			const path = paths.find(p => p.id === id);
			const t = path?.noteAnchorT ?? 0.5;
			overrides[id] = { t, side, offset: 0 };
		}
		notePlacementOverrides = overrides;
		scheduleCalculate();

		// Persist each, then drop its live override once the stored value lands.
		Promise.all(
			ids.map(id => {
				const path = paths.find(p => p.id === id);
				const t = path?.noteAnchorT ?? 0.5;
				return saveNotePlacement(id, { t: Math.round(t * 1000) / 1000, side, offset: 0 });
			})
		).finally(() => {
			const rest = { ...notePlacementOverrides };
			for (const id of ids) delete rest[id];
			notePlacementOverrides = rest;
		});
	}



	/**
	 * Connect menu → Curved / Straight / Cornered Connection. Applies the chosen route to
	 * EVERY selected connection (like the note-side items), redraws instantly via
	 * routeOverrides, persists each, then drops the overrides once data refreshes.
	 * @param {CustomEvent<{ route: LineRoute }>} event
	 */
	function handleSetRoute(event) {
		const route = normalizeRoute(event.detail?.route);
		const ids = [...selectedPathIds].filter(id => connections.some(c => c.id === id));
		if (ids.length === 0) return;

		const overrides = { ...routeOverrides };
		for (const id of ids) overrides[id] = route;
		routeOverrides = overrides;
		// Picking a route starts it from its automatic shape (the server clears the
		// stored bend too), so preview that by blanking any bend right away.
		const bends = { ...bendOverrides };
		for (const id of ids) bends[id] = { along: null, perp: null };
		bendOverrides = bends;
		scheduleCalculate();

		Promise.all(
			ids.map(async id => {
				try {
					const response = await fetch(`/api/segments/connections/${id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ lineRoute: route })
					});
					if (!response.ok) console.error('Connection line route save error:', await response.json());
				} catch (err) {
					console.error('Connection line route save network error:', err);
				}
			})
		)
			.then(() => invalidate('app:studies'))
			.finally(() => {
				const rest = { ...routeOverrides };
				for (const id of ids) delete rest[id];
				routeOverrides = rest;
				const restBends = { ...bendOverrides };
				for (const id of ids) delete restBends[id];
				bendOverrides = restBends;
				scheduleCalculate();
			});
	}

	/**
	 * Color menu → any color, Gray or Mixed. Applies to EVERY selected
	 * connection, redraws instantly via colorOverrides, persists each, then drops
	 * the overrides.
	 * @param {CustomEvent<{ color: LineColor }>} event
	 */
	function handleSetColor(event) {
		const color = normalizeLineColor(event.detail?.color);
		const ids = [...selectedPathIds].filter(id => connections.some(c => c.id === id));
		if (ids.length === 0) return;

		const overrides = { ...colorOverrides };
		for (const id of ids) overrides[id] = color;
		colorOverrides = overrides;
		scheduleCalculate();

		Promise.all(
			ids.map(async id => {
				try {
					const response = await fetch(`/api/segments/connections/${id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ lineColor: color })
					});
					if (!response.ok) console.error('Connection line color save error:', await response.json());
				} catch (err) {
					console.error('Connection line color save network error:', err);
				}
			})
		)
			.then(() => invalidate('app:studies'))
			.finally(() => {
				const rest = { ...colorOverrides };
				for (const id of ids) delete rest[id];
				colorOverrides = rest;
				scheduleCalculate();
			});
	}

	// ─── Shaping handle drag ─────────────────────────────────────────────────

	/**
	 * Begin dragging a connection's shaping handle.
	 * @param {PointerEvent} event
	 * @param {PathEntry} path
	 */
	function startShapeDrag(event, path) {
		if (!path.shapeHandle) return;
		event.preventDefault();
		event.stopPropagation();
		shapeDidDrag = false;
		shapeDrag = {
			id: path.id,
			startX: event.clientX,
			startY: event.clientY,
			baseX: path.shapeHandle.baseX,
			baseY: path.shapeHandle.baseY,
			route: path.route,
			axis: path.shapeHandle.axis,
			startShift: path.bendShift,
			chord: { ...path.chord }
		};
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Convert the current drag into a bend (relative to the chord at drag start).
	 * @param {NonNullable<typeof shapeDrag>} drag
	 * @param {number} clientX @param {number} clientY
	 * @returns {{ along: number|null, perp: number, route: LineRoute }}
	 */
	function bendFromDrag(drag, clientX, clientY) {
		let dx = (clientX - drag.startX) / scale;
		let dy = (clientY - drag.startY) / scale;
		// The handle can't leave the study area: a point dragged past its edge stops
		// at the edge (so the handle can always be scrolled to and grabbed again).
		if (drag.route !== 'cornered' || drag.axis === 'xy') {
			const c = clampToBounds(drag.baseX + dx, drag.baseY + dy, shapeHandleBounds());
			dx = c.x - drag.baseX;
			dy = c.y - drag.baseY;
		}
		const f = chordFrame(drag.chord);
		if (drag.route === 'cornered') {
			// Cornered: the handle moves freely in 2-D; its new point becomes the
			// waypoint the line is routed through (stored relative to the chord). It
			// may go anywhere — above, below, left or right of either end.
			const px = drag.baseX + dx - drag.chord.x1;
			const py = drag.baseY + dy - drag.chord.y1;
			const along = Math.max(CORNER_ALONG_MIN, Math.min(CORNER_ALONG_MAX, (px * f.ux + py * f.uy) / f.L));
			const perp  = Math.max(-CORNER_PERP_MAX, Math.min(CORNER_PERP_MAX, (px * f.nx + py * f.ny) / f.L));
			return { along, perp, route: 'cornered' };
		}
		// Curved (or straight → curved): the curve passes through the moved point.
		const px = drag.baseX + dx - drag.chord.x1;
		const py = drag.baseY + dy - drag.chord.y1;
		// Free placement: same wide range as cornered (the study-area clamp above
		// is the only real limit).
		const along = Math.max(CORNER_ALONG_MIN, Math.min(CORNER_ALONG_MAX, (px * f.ux + py * f.uy) / f.L));
		const perp  = Math.max(-CORNER_PERP_MAX, Math.min(CORNER_PERP_MAX, (px * f.nx + py * f.ny) / f.L));
		return { along, perp, route: 'curved' };
	}

	/** @param {PointerEvent} event */
	function handleShapeMove(event) {
		if (!shapeDrag) return;
		event.preventDefault();
		if (!shapeDidDrag) {
			if (Math.hypot(event.clientX - shapeDrag.startX, event.clientY - shapeDrag.startY) < NOTE_DRAG_THRESHOLD) return;
			shapeDidDrag = true;
		}
		const b = bendFromDrag(shapeDrag, event.clientX, event.clientY);
		bendOverrides = { ...bendOverrides, [shapeDrag.id]: b };
		scheduleCalculate();
	}

	/** @param {PointerEvent} event */
	async function handleShapeUp(event) {
		if (!shapeDrag) return;
		const drag = shapeDrag;
		shapeDrag = null;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		// Keep the connection selected after releasing the handle.
		suppressNextDocumentClick = true;
		if (!shapeDidDrag) return;

		const b = bendFromDrag(drag, event.clientX, event.clientY);
		/** @type {Record<string, unknown>} */
		const body = {
			bendAlong: b.along === null ? null : Math.round(b.along * 1000) / 1000,
			bendPerp: Math.round(b.perp * 1000) / 1000
		};
		// Straight → curved: switch the route in the same request (the server
		// clears the bend on a route change unless the request also sets one).
		if (drag.route !== b.route) body.lineRoute = b.route;
		await saveConnectionShape([drag.id], body);
	}

	/**
	 * PATCH a shape change for each id, refresh, then drop live overrides.
	 * @param {string[]} ids
	 * @param {Record<string, unknown>} body
	 */
	async function saveConnectionShape(ids, body) {
		await Promise.all(ids.map(async id => {
			try {
				const response = await fetch(`/api/segments/connections/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!response.ok) console.error('Connection shape save error:', await response.json());
			} catch (err) {
				console.error('Connection shape save network error:', err);
			}
		}));
		await invalidate('app:studies');
		const rest = { ...bendOverrides };
		for (const id of ids) delete rest[id];
		bendOverrides = rest;
		scheduleCalculate();
	}

	/**
	 * Connect menu → Reset Connection Points: send the selected connections'
	 * user-placed ends back to automatic placement.
	 */
	async function handleResetPoints() {
		const ids = [...selectedPathIds].filter(id => {
			const c = connections.find(x => x.id === id);
			return c && (c.fromAnchorEdge != null || c.toAnchorEdge != null);
		});
		if (ids.length === 0) return;
		await Promise.all(ids.map(async id => {
			try {
				const response = await fetch(`/api/segments/connections/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ fromAnchorEdge: null, fromAnchorPos: null, toAnchorEdge: null, toAnchorPos: null })
				});
				if (!response.ok) console.error('Connection points reset error:', await response.json());
			} catch (err) {
				console.error('Connection points reset network error:', err);
			}
		}));
		await invalidate('app:studies');
	}

	/** Connect menu → Reset Connection Shape: back to the automatic shape. */
	function handleResetShape() {
		const ids = [...selectedPathIds].filter(id => {
			const c = connections.find(x => x.id === id);
			return c && (c.bendPerp != null || c.bendAlong != null);
		});
		if (ids.length === 0) return;
		const overrides = { ...bendOverrides };
		for (const id of ids) overrides[id] = { along: null, perp: null };
		bendOverrides = overrides;
		scheduleCalculate();
		saveConnectionShape(ids, { bendAlong: null, bendPerp: null });
	}

	// Tell the Connect menu whether any selected connection has a manual bend
	// (enables "Reset Connection Shape").
	$effect(() => {
		const has = [...selectedPathIds].some(id => {
			const c = connections.find(x => x.id === id);
			return !!c && (c.bendPerp != null || c.bendAlong != null);
		});
		if ($toolbarState.activeConnectionHasBend !== has) setToolbarState('activeConnectionHasBend', has);
		// …and whether any has a user-placed connection point ("Reset Connection Points").
		const placed = [...selectedPathIds].some(id => {
			const c = connections.find(x => x.id === id);
			return !!c && (c.fromAnchorEdge != null || c.toAnchorEdge != null);
		});
		if ($toolbarState.activeConnectionHasPlacedPoints !== placed) setToolbarState('activeConnectionHasPlacedPoints', placed);
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
		// References (scripture refs) and Notations (verse numbers) add/remove inline
		// content, which changes segment heights and positions. Their toggles must
		// re-run calculatePaths() or the anchor fan-out is left measuring stale
		// geometry — leaving lines/anchors stacked on top of one another.
		const _references = $toolbarState.referencesVisible;
		const _verses     = $toolbarState.versesVisible;
		const _chapters   = $toolbarState.chaptersVisible;
		// Recompute AFTER the browser has reflowed the toggled content. A single rAF
		// can fire before the ref/verse/paragraph reflow has settled, so the fan-out
		// distribution measures the in-between frame and lines pile up. A double rAF
		// guarantees we measure the final geometry. Same timing weakness is what let
		// a resize occasionally leave lines overlapping.
		requestAnimationFrame(() => requestAnimationFrame(calculatePaths));
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
		// NOTE: We intentionally do NOT recompute paths on scroll. The SVG overlay
		// lives INSIDE the scrolling content (.connections-container is absolutely
		// positioned within .analyze-content-inner), so it scrolls together with the
		// segments. Every path coordinate is computed relative to the SVG's own rect,
		// so a scroll leaves all segment-relative positions unchanged and calculatePaths()
		// would produce the identical result. On large studies that recompute measured
		// every segment's bounding box on every scroll frame — a major main-thread stall
		// that made Safari fall behind repainting newly-revealed text. The remaining
		// triggers (resize, zoom transitionend, layout-changed, spacing drags) cover
		// every case where geometry actually changes. scrollContainer is still retained
		// for the document-click deselect scoping below.


		// Re-calculate paths after the zoom CSS transition finishes so anchor points
		// and connection lines land at their correct positions rather than staying at
		// the intermediate mid-transition coordinates.
		contentInner = /** @type {HTMLElement|null} */ (svgElement.closest('.analyze-content-inner'));
		if (contentInner) {
			contentInner.addEventListener('transitionend', handleTransitionEnd, { passive: true });
		}

		window.addEventListener('pointermove', handlePointerMove, { passive: false });
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointermove', handleNotePlacementMove, { passive: false });
		window.addEventListener('pointerup', handleNotePlacementUp);
		document.addEventListener('click', handleDocumentClick);
		window.addEventListener('connection-insert-note', handleInsertConnectionNote);
		window.addEventListener('connection-remove-note', handleRemoveConnectionNote);
		window.addEventListener('connection-note-set-side', /** @type {EventListener} */ (handleSetNoteSide));
		window.addEventListener('connection-set-route', /** @type {EventListener} */ (handleSetRoute));
		window.addEventListener('connection-reset-shape', handleResetShape);
		window.addEventListener('connection-reset-points', handleResetPoints);
		window.addEventListener('connection-set-color', /** @type {EventListener} */ (handleSetColor));
		window.addEventListener('pointermove', handleShapeMove, { passive: false });
		window.addEventListener('pointerup', handleShapeUp);
		// Structure → "Select All Connections": select every currently visible line.
		window.addEventListener('select-all-connections', handleSelectAllConnections);
		// Auto-select a freshly inserted connection (dispatched by the analyze page).
		window.addEventListener('select-connection', /** @type {EventListener} */ (handleSelectConnection));



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

		// Export capture coordination (image / PDF). See handleExportPrepare/Cleanup.
		window.addEventListener('analyze-export-prepare', handleExportPrepare);
		window.addEventListener('analyze-export-cleanup', handleExportCleanup);

		requestAnimationFrame(calculatePaths);
	});


	onDestroy(() => {
		resizeObserver?.disconnect();
		scrollContainer?.removeEventListener('scroll', scheduleCalculate);
		contentInner?.removeEventListener('transitionend', handleTransitionEnd);
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		window.removeEventListener('pointermove', handleNotePlacementMove);
		window.removeEventListener('pointerup', handleNotePlacementUp);
		document.removeEventListener('click', handleDocumentClick);
		window.removeEventListener('connection-insert-note', handleInsertConnectionNote);
		window.removeEventListener('connection-remove-note', handleRemoveConnectionNote);
		window.removeEventListener('connection-note-set-side', /** @type {EventListener} */ (handleSetNoteSide));
		window.removeEventListener('connection-set-route', /** @type {EventListener} */ (handleSetRoute));
		window.removeEventListener('connection-reset-shape', handleResetShape);
		window.removeEventListener('connection-reset-points', handleResetPoints);
		window.removeEventListener('connection-set-color', /** @type {EventListener} */ (handleSetColor));
		window.removeEventListener('pointermove', handleShapeMove);
		window.removeEventListener('pointerup', handleShapeUp);
		window.removeEventListener('select-all-connections', handleSelectAllConnections);
		window.removeEventListener('select-connection', /** @type {EventListener} */ (handleSelectConnection));
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
					style={nodeColorStyle(path, 'from')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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
					style={nodeColorStyle(path, 'from')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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
					style={nodeColorStyle(path, 'from')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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
					style={nodeColorStyle(path, 'to')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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
					style={nodeColorStyle(path, 'to')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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
					style={nodeColorStyle(path, 'to')}
					class:connection-node--colored={path.lineColor !== 'gray'}
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

		<!--
			Edge stubs for cross-part connections (§8 strategy (c), phase 3).

			Drawn FIRST so they sit beneath every real arc and endpoint node: a stub is context, not a
			thing to interact with. Deliberately inert — no hit-target, no drag handle, no click — because
			its far end is not on this page, so every gesture a real connection offers would have nothing
			to act on. The label is a plain <title>, which gives it a tooltip and a screen-reader name
			without inventing a control.
		-->
		{#each stubs as stub (stub.id)}
			<g class="connection-stub" class:connection-stub--backward={stub.direction === 'backward'}>
				<title>{stub.label}</title>
				<path
					class="connection-stub-path"
					class:connection-path--dashed={stub.lineStyle === 'dashed'}
					class:connection-path--dotted={stub.lineStyle === 'dotted'}
					class:connection-path--dashdot={stub.lineStyle === 'dashdot'}
					d={stub.d}
					fill="none"
				/>
				<!-- A small open chevron at the canvas edge, pointing the way the user would travel to
				     reach the other end (§7's prev/next direction). -->
				<path
					class="connection-stub-arrow"
					d={stub.direction === 'backward'
						? `M ${stub.x2 + 6} ${stub.y2 - 5} L ${stub.x2} ${stub.y2} L ${stub.x2 + 6} ${stub.y2 + 5}`
						: `M ${stub.x2 - 6} ${stub.y2 - 5} L ${stub.x2} ${stub.y2} L ${stub.x2 - 6} ${stub.y2 + 5}`}
					fill="none"
				/>
			</g>
		{/each}

		<!-- Mixed-color lines: a linear gradient per line running from its FROM
		     anchor to its TO anchor (userSpaceOnUse, so it follows the line's actual
		     endpoints for every route). Stops are concrete colors so export clones
		     keep them. -->
		<defs>
			{#each visiblePaths as path (path.id)}
				{#if path.lineColor === 'mixed'}
					<linearGradient
						id="connection-gradient-{path.id}"
						gradientUnits="userSpaceOnUse"
						x1={path.x1} y1={path.y1}
						x2={path.x2 === path.x1 && path.y2 === path.y1 ? path.x2 + 0.01 : path.x2} y2={path.y2}
					>
						<stop offset="0%" stop-color={path.fromColor} />
						<stop offset="100%" stop-color={path.toColor} />
					</linearGradient>
				{/if}
			{/each}
		</defs>

		<!-- Pass 1: lines + hit-targets -->
		{#each visiblePaths as path (path.id)}
			<path
				style={pathStrokeStyle(path)}
				class="connection-path"
				class:connection-path--colored={path.lineColor !== 'gray'}
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

		<!-- Pass 4: shaping handles — a hollow ring on each SELECTED line. Drag to
		     bend a curved/straight line or slide a cornered line's middle run.
		     Hidden during export and while an endpoint is being rerouted. -->
		{#if exportScaleOverride === null && !drag}
			{#each visiblePaths as path (path.id)}
				{#if selectedPathIds.has(path.id) && path.shapeHandle}
					<circle
						class="connection-shape-handle-target"
						cx={path.shapeHandle.x} cy={path.shapeHandle.y} r="9"
						class:connection-shape-handle-target--xy={path.route === 'cornered'}
						onpointerdown={(e) => startShapeDrag(e, path)}
						onclick={(e) => e.stopPropagation()}
					/>
					<circle
						class="connection-shape-handle"
						class:connection-shape-handle--dragging={shapeDrag?.id === path.id}
						cx={path.shapeHandle.x} cy={path.shapeHandle.y} r="4.5"
					/>
				{/if}
			{/each}
		{/if}


		<!-- ── Drop handles (shown only while dragging) ── -->
		{#if drag}
			<!-- Allowed sides: every side a point may land on (column: top · section:
			     top/bottom · segment: left/right) is drawn faintly; the side the
			     cursor snaps to is emphasised. The point can land anywhere along it. -->
			{#each dropHandles as side (`${side.elementId}-${side.edge}`)}
				{@const isActive = !!drag.activeHandle &&
					drag.activeHandle.elementId === side.elementId &&
					drag.activeHandle.edge === side.edge}
				<line class="drop-side"
					class:drop-side--active={isActive}
					x1={side.x1} y1={side.y1} x2={side.x2} y2={side.y2}
				/>
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
					data-note-id={path.id}
					class:connection-note-wrapper--editing={noteEditingId === path.id}
					class:connection-note-wrapper--selected={noteSelectedId === path.id || selectedPathIds.has(path.id)}
					style="left: {path.noteCardX}px; top: {path.noteCardY}px; transform: {noteTransform(path.notePlacement, path.noteOffset)};"

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
						{@const slideHorizontal = path.noteAnchorSide === 'top' || path.noteAnchorSide === 'bottom'}
						<!-- The grab handle hugs a card corner on the edge OPPOSITE the
						     anchored side (the edge the card extends toward), just outside
						     the card so it never covers the note text. Which END of that
						     edge it uses is chosen per-frame by resolveHandleCorners() so
						     the handle slides clear of other connections' anchor points and
						     note dots when practicable (see path.handleCorner). -->
						{@const handleCorner = path.handleCorner}
						<!-- Display mode: click the card body to edit. A dedicated

						     three-dot grab handle (like the section/column handles)
						     slides the card along its anchored edge. -->
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
						<!-- Slide handle: three dots in an L that wraps a card corner
						     from the OUTSIDE (vertex on the diagonal, legs running along
						     the two adjacent edges). Shown on hover/selection. -->
						<div
							class="connection-note-handle connection-note-handle--corner-{handleCorner}"
							class:connection-note-handle--visible={hoveredPathId === path.id || selectedPathIds.has(path.id) || noteSelectedId === path.id}
							class:connection-note-handle--sliding={notePlacementDrag?.id === path.id && notePlacementDrag?.mode === 'card'}
							onpointerdown={(e) => startNoteCardDrag(e, path)}
							role="separator"
							aria-label="Slide connection note"
							aria-orientation={slideHorizontal ? 'vertical' : 'horizontal'}
						>
							<span class="connection-note-handle-dot"></span>
							<span class="connection-note-handle-dot"></span>
							<span class="connection-note-handle-dot"></span>
						</div>
						{@const slideEdge = noteHandleEdge(path.noteAnchorSide)}
						{@const slideRow = slideEdge === 'top' || slideEdge === 'bottom'}
						<!-- Line-slide handle: three dots centred on the card edge FARTHEST from
						     the line. Dragging it slides the note ALONG the connection line
						     (noteAnchorT), replacing the old drag on the anchor dot, which now
						     only marks where the note attaches. Same dot style as the corner
						     handle; row on top/bottom edges, stacked on left/right. -->
						<div
							class="connection-note-slide-handle connection-note-slide-handle--{slideEdge}"
							class:connection-note-handle--visible={hoveredPathId === path.id || selectedPathIds.has(path.id) || noteSelectedId === path.id}
							class:connection-note-handle--sliding={notePlacementDrag?.id === path.id && notePlacementDrag?.mode === 'dot'}
							class:connection-note-slide-handle--column={!slideRow}
							onpointerdown={(e) => startNoteDotDrag(e, path)}
							onclick={(e) => e.stopPropagation()}
							role="separator"
							aria-label="Slide connection note along line"
							aria-orientation={slideRow ? 'horizontal' : 'vertical'}
						>
							<span class="connection-note-handle-dot"></span>
							<span class="connection-note-handle-dot"></span>
							<span class="connection-note-handle-dot"></span>
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
				{#if path.note && path.noteLead > NOTE_LEADER_MIN}
					<!-- Leader line bridging the dot (on the line) and the card when the
					     card has been floated OFF the line by noteLead. Drawn first so the
					     dot/card paint over its endpoints. -->
					<line
						class="connection-note-leader"
						class:connection-note-leader--active={hoveredPathId === path.id || selectedPathIds.has(path.id)}
						x1={path.noteAnchorX} y1={path.noteAnchorY}
						x2={path.noteCardX} y2={path.noteCardY}
					/>
				{/if}
			{/each}
			{#each visiblePaths as path (path.id)}
				{#if path.note}
					<!-- Larger transparent hit-target so the small dot is easy to grab -->
					<circle
						class="connection-note-dot-target"
						cx={path.noteAnchorX} cy={path.noteAnchorY} r="9"
						onpointerenter={() => { hoveredPathId = path.id; }}
						onpointerleave={() => { if (hoveredPathId === path.id) hoveredPathId = null; }}
					/>
					<circle
						class="connection-note-dot"
						class:connection-note-dot--hovered={hoveredPathId === path.id && !selectedPathIds.has(path.id)}
						class:connection-note-dot--selected={selectedPathIds.has(path.id)}
						class:connection-note-dot--dragging={notePlacementDrag?.id === path.id && notePlacementDrag?.mode === 'dot'}
						cx={path.noteAnchorX} cy={path.noteAnchorY} r="4"
					/>
				{/if}
			{/each}
		</svg>
	{/if}

	<!-- ── Anchor type tooltips (hover) ────────────────────────────────────── -->
	<!-- When a connection line (or either endpoint) is hovered, show a small    -->
	<!-- black tooltip above each anchor point naming what kind of element it    -->
	<!-- attaches to (Column / Section / Segment). Reuses the ResizeTooltip look.-->
	{#if hoveredPathId}
		{#each visiblePaths as path (path.id)}
			{#if hoveredPathId === path.id}
				{@const fromPlacement = anchorTooltipPlacement(path.fromEdge, path.notePlacement, path.x1, path.y1, path.noteAnchorX, path.noteAnchorY)}
				{@const toPlacement = anchorTooltipPlacement(path.toEdge, path.notePlacement, path.x2, path.y2, path.noteAnchorX, path.noteAnchorY)}
				<div
					class="connection-anchor-tooltip"
					style="left: {path.x1}px; top: {path.y1}px; transform: {anchorTooltipTransform(fromPlacement)};"
				>
					{anchorLabel(path.fromType)}
				</div>
				<div
					class="connection-anchor-tooltip"
					style="left: {path.x2}px; top: {path.y2}px; transform: {anchorTooltipTransform(toPlacement)};"
				>
					{anchorLabel(path.toType)}
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

	/* ── Cross-part edge stubs (§8 strategy (c), phase 3) ──
	   Lighter than a real connection on purpose: the link is real, but only half of it is on this page,
	   and giving it the same weight as a complete arc would overstate what the user can see or act on.
	   Fully inert — `pointer-events: none` on the group, so it can never intercept a gesture meant for
	   the structure underneath. */
	.connection-stub {
		pointer-events: none;
		opacity: 0.55;
	}

	.connection-stub-path {
		stroke: var(--gray-300);
		stroke-width: 2;
		fill: none;
		stroke-linecap: round;
	}

	.connection-stub-arrow {
		stroke: var(--gray-300);
		stroke-width: 2;
		fill: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* All connection lines render solid; the line-style classes are retained
	   only to drive visibility toggles and endpoint shapes (anchor points stay
	   distinct per type). No stroke-dasharray means every line is solid. */

	/* Hover / selection never recolor the LINE — it keeps its own color (gray,
	   a solid color, or a mixed fade). Only the endpoint nodes, note dot and
	   drag-handle dots turn blue. A selected line is drawn a touch thicker. */
	.connection-path--selected { stroke-width: 2.5; }

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

	/* Allowed sides while dragging a connection point: faint guides, with the
	   side the point will land on emphasised in blue. */
	.drop-side {
		stroke: var(--gray-500);
		stroke-width: 2;
		stroke-linecap: round;
		pointer-events: none;
		opacity: 0.25;
		transition: opacity 0.08s, stroke 0.08s;
	}

	.drop-side--active {
		stroke: var(--blue);
		stroke-width: 3;
		opacity: 0.9;
	}

	/* ── Ghost line ── */

	.connection-ghost {
		stroke: var(--blue-light);
		stroke-width: 2;
		stroke-linecap: round;
		pointer-events: none;
	}

	/* Ghost line renders solid, matching the now-solid connection lines.
	   The line-style classes remain on the element for parity but apply no
	   dash pattern. */

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

	/* Leader line — bridges the anchor dot (on the line) and the card when the
	   card has been floated off the line via noteLead. Resting gray, matching the
	   connection line; turns blue on hover/select like the dot + endpoint nodes. */
	.connection-note-leader {
		stroke: var(--gray-400);
		stroke-width: 1.5;
		stroke-linecap: round;
		pointer-events: none;
		transition: stroke 0.15s;
	}

	/* Lines keep their color on hover/selection (only dots turn blue), so the
	   leader line stays gray too; the class is kept as a hook. */
	.connection-note-leader--active {
		stroke: var(--gray-400);
	}

	/* Shaping handle — hollow ring (distinct from the solid note dot) on a
	   selected line; drag it to bend the line. */
	.connection-shape-handle {
		fill: var(--white);
		stroke: var(--blue);
		stroke-width: 1.5;
		pointer-events: none;
	}

	.connection-shape-handle--dragging {
		fill: var(--blue);
	}

	.connection-shape-handle-target {
		fill: transparent;
		pointer-events: all;
		cursor: grab;
	}

	/* A cornered line's handle moves freely (the line reroutes through it). */
	.connection-shape-handle-target--xy {
		cursor: move;
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

	/* While the dot is being dragged along the line it stays blue. */
	.connection-note-dot--dragging {
		fill: var(--blue);
	}

	/* Invisible, larger hover target around the dot so hovering it highlights the
	   connection. The dot is a marker only — the note is slid along the line with
	   the three-dot handle on the card's far edge (.connection-note-slide-handle). */
	.connection-note-dot-target {
		fill: transparent;
		pointer-events: all;
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

	/* ── Note slide handle (L-shaped three-dot corner bracket) ───────────────
	   A grab handle that slides the note card ALONG its anchored edge. Three
	   dots form an "L" that wraps a corner of the card from the OUTSIDE (so it
	   never covers the note text). The base layout is a 2×2 grid whose three
	   dots auto-fill the top-left, top-right and bottom-left cells — an L with
	   its vertex at the top-left. The corner modifiers rotate that L 90° so the
	   vertex lands on whichever card corner sits nearest the anchor dot, and
	   position the bracket just outside that corner. Shown on hover/selection. */
	.connection-note-handle {
		position: absolute;
		display: grid;
		grid-template-columns: repeat(2, 0.6rem);
		grid-template-rows: repeat(2, 0.6rem);
		gap: 0.3rem;
		cursor: grab;
		opacity: 0;
		pointer-events: none;
		transition: opacity 80ms ease-in-out;
		z-index: 1;
	}

	/* Top-left corner: bracket tucks right up against the card's top-left corner. */
	.connection-note-handle--corner-tl {
		right: calc(100% - 0.4rem);
		bottom: calc(100% - 0.4rem);
	}

	/* Top-right corner: against the top-right corner; L rotated so vertex is TR. */
	.connection-note-handle--corner-tr {
		left: calc(100% - 0.4rem);
		bottom: calc(100% - 0.4rem);
		transform: rotate(90deg);
	}

	/* Bottom-left corner: against the bottom-left corner; vertex rotated to BL. */
	.connection-note-handle--corner-bl {
		right: calc(100% - 0.4rem);
		top: calc(100% - 0.4rem);
		transform: rotate(-90deg);
	}

	/* Bottom-right corner: against the bottom-right corner; L rotated 180° so
	   the vertex lands on the card's bottom-right corner. */
	.connection-note-handle--corner-br {
		left: calc(100% - 0.4rem);
		top: calc(100% - 0.4rem);
		transform: rotate(180deg);
	}


	/* Shown on hover/selection, and grabbable only then. */
	.connection-note-handle--visible {
		opacity: 1;
		pointer-events: auto;
	}

	.connection-note-handle--sliding {
		cursor: grabbing;
		opacity: 1;
		pointer-events: auto;
	}

	.connection-note-handle-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background-color: var(--blue);
	}

	/* ── Note line-slide handle (three dots on the card's far edge) ──────────
	   Slides the note ALONG its connection line (replaces dragging the anchor
	   dot). Same dots, spacing, visibility and cursor states as the corner
	   handle above (shares .connection-note-handle-dot / --visible / --sliding);
	   only its shape differs: a straight row centred on the top/bottom edge, or
	   a stacked column centred on the left/right edge. It sits on the edge
	   FARTHEST from the line (see noteHandleEdge), straddling the border so it
	   never covers the note text, the anchor dot, or the line's shaping handle. */
	.connection-note-slide-handle {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		/* Padding enlarges the grab area around the small dots. */
		padding: 0.4rem;
		cursor: grab;
		opacity: 0;
		pointer-events: none;
		transition: opacity 80ms ease-in-out;
		z-index: 1;
	}

	/* Shown on hover/selection and while sliding. These need the compound
	   selector: the base rule above sits AFTER the shared --visible / --sliding
	   rules with equal specificity, so on its own it would win and keep the
	   handle hidden and unclickable. */
	.connection-note-slide-handle.connection-note-handle--visible,
	.connection-note-slide-handle.connection-note-handle--sliding {
		opacity: 1;
		pointer-events: auto;
	}

	.connection-note-slide-handle.connection-note-handle--sliding {
		cursor: grabbing;
	}

	.connection-note-slide-handle--column {
		flex-direction: column;
	}

	/* Pin each dot to EXACTLY the corner handle's dot size (0.6rem): a flex item
	   may otherwise be shrunk/stretched by the flex layout, while the corner
	   bracket's dots sit in fixed 0.6rem grid cells. */
	.connection-note-slide-handle .connection-note-handle-dot {
		flex: 0 0 0.6rem;
	}

	/* Placement: the dots' OUTER edge lines up with the corner bracket's outer
	   edge. The bracket (two 0.6rem cells + 0.3rem gap = 1.5rem) overlaps the
	   card by 0.4rem, so its dots reach 1.1rem beyond the card edge. This strip
	   has 0.4rem padding, so its box sits 1.5rem out (dots at 1.1rem → 0.5rem),
	   i.e. the same band as the bracket's outer row/column of dots. */
	.connection-note-slide-handle--top {
		top: -1.5rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.connection-note-slide-handle--bottom {
		bottom: -1.5rem;
		left: 50%;
		transform: translateX(-50%);
	}

	.connection-note-slide-handle--left {
		left: -1.5rem;
		top: 50%;
		transform: translateY(-50%);
	}

	.connection-note-slide-handle--right {
		right: -1.5rem;
		top: 50%;
		transform: translateY(-50%);
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

	/* ── Anchor type tooltip (hover) ── */
	/* Small black label naming each anchor point's element type. Matches
	   ResizeTooltip's look (var(--gray-200) bg, white text). Positioned in the
	   overlay's scaled coordinate space (same as note wrappers); the per-tooltip
	   `transform` is set inline (see anchorTooltipTransform) so each label sits on
	   the side OPPOSITE the connection's Quick Note — left/right for vertical
	   (column/section) ends, above/below for horizontal (segment) ends. */

	.connection-anchor-tooltip {
		position: absolute;
		padding: 0.3rem 0.6rem;
		border-radius: 0.3rem;
		background-color: var(--gray-200);
		color: var(--white);
		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		z-index: 20;
	}

	/* ── Drop-target outline (applied to DOM elements via JS) ── */

	:global(.connection-drop-target) {
		outline: 2px solid var(--blue-400) !important;
		outline-offset: 2px;
		border-radius: 0.3rem;
	}
</style>
