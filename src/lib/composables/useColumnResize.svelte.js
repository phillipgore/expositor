/**
 * Column Resize Composable
 *
 * Manages drag-resizing of a column's WIDTH in the Analyze view. This is the
 * horizontal counterpart to useSegmentResize (which resizes a segment's height).
 *
 * Key behaviors (mirrors useSegmentResize, but on the X axis):
 *  - Widths are applied as an inline `width` (CSS px, pre-zoom). NULL = the CSS
 *    default width (≈27.8rem, or 49.8rem in wide layout). A minimum readable width
 *    floor is enforced so a column can never be dragged unusably narrow.
 *  - All mouse deltas are divided by the current zoom scale so dragging tracks the
 *    cursor 1:1 regardless of zoom.
 *  - While dragging, the current WIDTH snaps to set multiples of the base (default)
 *    column width — 1.25×, 1.5×, 1.75×, 2×, 3×, 4×. A yellow vertical guide line is
 *    shown at the snapped right edge and the tooltip names the factor (e.g. "1.5×").
 *    There is no snap at 1× (the minimum). Dragging past the threshold releases the snap.

 *  - On release, the new width is persisted to the DB via PATCH
 *    /api/passages/columns/[id] and the page data is invalidated so it survives reload.
 *
 * The composable is intended to live at the Analyze page level (it needs to see all
 * `.column` elements and the zoom scale). Individual column elements call
 * `handleResizeStart` from their right-edge drag handle.
 *
 * @param {Object} options
 * @param {() => number} options.getScale - Returns the current zoom scale (e.g. 1).
 * @param {() => HTMLElement|null} options.getContainer - Returns the scrollable `.analyze-content` element (used to size the guide line).
 * @param {() => Promise<void>} options.onPersist - Called after a successful save to refresh data (e.g. invalidate('app:studies')).
 * @param {number} [options.minWidth=278] - Minimum allowed column width in CSS px (also the 1× base in normal layout).
 * @param {number} [options.snapThreshold=8] - Snap distance in viewport px.
 */

// Base (1×) column widths in CSS px — must match the .column CSS defaults
// (27.8rem normal, 49.8rem wide layout, with 1rem = 10px).
// Exported so the Analyze page can treat the wide base as a MINIMUM width when
// Wide View is on (columns narrower than the wide base get lifted to it, while
// wider per-column overrides are preserved). Keeps a single source of truth.
export const BASE_WIDTH = 278;
export const BASE_WIDTH_WIDE = 498;

// Snap factors (multiples of the base width). 1× is intentionally omitted — it is the
// minimum and gets no snap line. Each target's tooltip label is just the factor (e.g.
// "1.5×", "2×"); template-literal interpolation drops trailing zeros automatically.
// Exported so UIs (e.g. SetColumnWidthModal presets) can offer the exact same stops
// the drag-resize snaps to, keeping a single source of truth.
export const SNAP_FACTORS = [1.25, 1.5, 1.75, 2, 3, 4];


export function useColumnResize({ getScale, getContainer, onPersist, minWidth = 278, snapThreshold = 8 }) {


	// Live width overrides during a drag: columnId -> CSS px (pre-zoom).
	// The page merges this over the persisted width when rendering each column.
	/** @type {Record<string, number>} */
	let liveWidths = $state({});

	// The column currently being resized (null when idle).
	/** @type {string|null} */
	let activeColumnId = $state(null);

	// Yellow guide line geometry (viewport-fixed, VERTICAL). visible=false hides it.
	let guideLine = $state({ visible: false, top: 0, left: 0, height: 0 });

	// Live width tooltip that follows the drag (viewport-fixed). x/y track the
	// column's current right edge and vertical center; `height` carries the CSS-px
	// width being applied (reusing the shared ResizeTooltip's value field); `label`
	// names the snapped multiple (e.g. "Double") or null when not snapped.
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0, label: null });

	// Internal (non-reactive) drag bookkeeping.
	let startX = 0; // pointer X at mousedown (viewport px)
	let draggedLeftX = 0; // dragged column's left edge (viewport px) — fixed during its own resize
	let tooltipY = 0; // fixed viewport Y for the tooltip during the drag
	let renderedStartWidth = 0; // dragged column's rendered width at start (viewport px)
	let baseWidth = BASE_WIDTH; // base (1×) column width in CSS px for the active layout
	let snapWidths = []; // array of { width, multiple } snap targets (CSS px)


	/**
	 * Begin a resize drag for the given column.
	 * @param {MouseEvent} event
	 * @param {string} columnId
	 */
	function handleResizeStart(event, columnId) {
		// Prevent word-selection / column-selection logic on the page from reacting.
		event.preventDefault();
		event.stopPropagation();

		const columnEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!columnEl) return;

		const scale = getScale() || 1;

		startX = event.clientX;

		const rect = columnEl.getBoundingClientRect();
		draggedLeftX = rect.left;
		renderedStartWidth = rect.width;

		// Anchor the tooltip vertically at the TOP of the resize indicator bar so it clears
		// the handle the same way the segment tooltip clears its indicator. The handle is
		// centered at ≈3.3rem from the column top (CSS: top 2.3rem, height 2.0rem) and the
		// indicator bar is 2.4rem tall, so its top edge sits at ≈3.3 − 1.2 = 2.1rem.
		// Scaling by the zoom keeps it locked to the handle at any zoom level.
		tooltipY = rect.top + 2.1 * 10 * scale;

		// Determine the base (1×) width for the active layout, then build the snap
		// targets from SNAP_FACTORS (1.25×–4×). Each target carries its own label.
		const wide = !!columnEl.closest('.wide-layout');
		baseWidth = wide ? BASE_WIDTH_WIDE : BASE_WIDTH;
		snapWidths = SNAP_FACTORS.map((f) => ({ width: baseWidth * f, label: `${f}×` }));


		// Show the live-width tooltip anchored to the column's current right edge.
		dragTooltip = {
			visible: true,
			x: draggedLeftX + renderedStartWidth,
			y: tooltipY,
			height: Math.round(renderedStartWidth / scale),
			label: null
		};


		activeColumnId = columnId;
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Handle pointer movement during a resize.
	 * @param {MouseEvent} event
	 */
	function handleResizeMove(event) {
		if (!activeColumnId) return;

		const scale = getScale() || 1;
		const deltaViewport = event.clientX - startX;
		const newRenderedWidth = renderedStartWidth + deltaViewport;

		// Convert the dragged width to CSS px (pre-zoom).
		let newWidth = newRenderedWidth / scale;

		// Snap: compare the current CSS width against each base-width multiple. The
		// snap threshold is given in viewport px, so convert it to CSS px for the test.
		const snapThresholdCss = snapThreshold / scale;
		let snappedMultiple = null;
		let closest = snapThresholdCss;
		for (const target of snapWidths) {
			const dist = Math.abs(newWidth - target.width);
			if (dist <= closest) {
				closest = dist;
				snappedMultiple = target;
			}
		}

		if (snappedMultiple !== null) {
			newWidth = snappedMultiple.width;
		}

		// Enforce the minimum-width floor (== 1× base).
		if (newWidth < minWidth) {
			newWidth = minWidth;
			// If clamped below the smallest snap target, the snap no longer applies.
			if (!snappedMultiple || snappedMultiple.width > minWidth) snappedMultiple = null;
		}

		liveWidths = { ...liveWidths, [activeColumnId]: newWidth };

		// The snapped factor label (e.g. "1.5×", "2×"); null when not snapped.
		const label = snappedMultiple ? snappedMultiple.label : null;


		// Update the live-width tooltip to follow the dragged right edge.
		dragTooltip = {
			visible: true,
			x: draggedLeftX + newWidth * scale,
			y: tooltipY,
			height: Math.round(newWidth),
			label
		};

		// Position / toggle the vertical guide line at the snapped right edge.
		if (snappedMultiple !== null) {
			const snappedX = draggedLeftX + newWidth * scale;
			const container = getContainer();
			if (container) {
				const cr = container.getBoundingClientRect();
				guideLine = { visible: true, top: cr.top, left: snappedX, height: cr.height };
			} else {
				guideLine = { visible: true, top: 0, left: snappedX, height: window.innerHeight };
			}
		} else if (guideLine.visible) {
			guideLine = { ...guideLine, visible: false };
		}


		// Signal the connection overlay to re-flow Quick Notes live as the column
		// (and the passage text beside it) reflows. The overlay rAF-coalesces these.
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('analyze-layout-changed'));
		}
	}

	/**
	 * Finish a resize drag: persist the new width and refresh data.
	 */
	async function handleResizeEnd() {
		if (!activeColumnId) return;

		const columnId = activeColumnId;
		const finalWidth = liveWidths[columnId];

		// Reset interaction state immediately.
		activeColumnId = null;
		guideLine = { visible: false, top: 0, left: 0, height: 0 };
		dragTooltip = { visible: false, x: 0, y: 0, height: 0, label: null };
		document.body.style.cursor = '';

		document.body.style.userSelect = '';

		if (finalWidth == null) return;

		const rounded = Math.round(finalWidth);

		try {
			await fetch(`/api/passages/columns/${columnId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ width: rounded })
			});
			// Refresh loaded data so the persisted width is the source of truth.
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to save column width:', error);
		} finally {
			// Clear the live override now that the persisted value matches.
			const { [columnId]: _drop, ...rest } = liveWidths;
			liveWidths = rest;
		}
	}

	/**
	 * Setup global pointer listeners while a drag is active (use inside an $effect).
	 */
	function setupResizeListeners() {
		if (!activeColumnId) return;
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
		return () => {
			window.removeEventListener('mousemove', handleResizeMove);
			window.removeEventListener('mouseup', handleResizeEnd);
		};
	}

	/**
	 * Get the live (in-progress) width override for a column, or null.
	 * @param {string} columnId
	 * @returns {number|null}
	 */
	function getLiveWidth(columnId) {
		return liveWidths[columnId] ?? null;
	}

	/**
	 * Measure a column's CURRENT rendered width, in CSS px at scale 1.
	 * @param {string} columnId
	 * @returns {number} Current width in CSS px (0 if not found).
	 */
	function measureCurrentWidth(columnId) {
		const columnEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!columnEl) return 0;
		const scale = getScale() || 1;
		return columnEl.getBoundingClientRect().width / scale;
	}

	/**
	 * Set a uniform WIDTH across one or more columns, persisted via the batch
	 * endpoint, then refresh data once. Values are clamped to the minimum width.
	 * @param {string[]} columnIds
	 * @param {number} width - Desired width in CSS px.
	 */
	async function setWidth(columnIds, width) {
		if (!Array.isArray(columnIds) || columnIds.length === 0) return;

		const clamped = Math.max(Math.round(minWidth), Math.round(width));

		// Drop any live overrides for these columns.
		let next = liveWidths;
		let changed = false;
		for (const id of columnIds) {
			if (id in next) {
				const { [id]: _drop, ...rest } = next;
				next = rest;
				changed = true;
			}
		}
		if (changed) liveWidths = next;

		try {
			await fetch('/api/passages/columns/batch-width', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: columnIds, width: clamped })
			});
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to set column widths:', error);
		}
	}

	/**
	 * Reset the width of one or more columns back to the default (width = null),
	 * then refresh data once.
	 * @param {string[]} columnIds
	 */
	async function resetWidth(columnIds) {
		if (!Array.isArray(columnIds) || columnIds.length === 0) return;

		// Drop any live overrides for these columns.
		let next = liveWidths;
		let changed = false;
		for (const id of columnIds) {
			if (id in next) {
				const { [id]: _drop, ...rest } = next;
				next = rest;
				changed = true;
			}
		}
		if (changed) liveWidths = next;

		try {
			await fetch('/api/passages/columns/batch-width', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: columnIds, width: null })
			});
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to reset column widths:', error);
		}
	}

	return {
		handleResizeStart,
		setupResizeListeners,
		getLiveWidth,
		measureCurrentWidth,
		setWidth,
		resetWidth,
		minWidth,

		get activeColumnId() {
			return activeColumnId;
		},
		get guideLine() {
			return guideLine;
		},
		get dragTooltip() {
			return dragTooltip;
		}
	};
}
