/**
 * Segment Resize Composable
 *
 * Manages drag-resizing of a segment's height in the Analyze view.
 *
 * Key behaviors:
 *  - Heights are applied as `min-height` (CSS px, pre-zoom) so a segment can never
 *    be smaller than its natural text content and will auto-grow if more text is added.
 *  - All mouse deltas are divided by the current zoom scale so dragging tracks the
 *    cursor 1:1 regardless of zoom.
 *  - While dragging, the projected bottom edge snaps to the top/bottom edges of
 *    segments in OTHER columns (cross-page alignment); a yellow guide line is shown
 *    at the snap position. Dragging past the threshold releases the snap.
 *  - On release, the new height is persisted to the DB via PATCH /api/segments/[id]
 *    and the page data is invalidated so it survives reload.
 *
 * The composable is intended to live at the Analyze page level (it needs to see all
 * `.segment` elements and the zoom scale). Individual `<Segment>` components call
 * `handleResizeStart` from their bottom drag handle.
 *
 * @param {Object} options
 * @param {() => number} options.getScale - Returns the current zoom scale (e.g. 1).
 * @param {() => HTMLElement|null} options.getContainer - Returns the scrollable `.analyze-content` element (used to size the guide line).
 * @param {() => Promise<void>} options.onPersist - Called after a successful save to refresh data (e.g. invalidate('app:studies')).
 * @param {number} [options.snapThreshold=8] - Snap distance in viewport px.
 */
export function useSegmentResize({ getScale, getContainer, onPersist, snapThreshold = 8 }) {
	// Live height overrides during a drag: segmentId -> CSS px (pre-zoom).
	// The page merges this over the persisted height when rendering each Segment.
	/** @type {Record<string, number>} */
	let liveHeights = $state({});

	// The segment currently being resized (null when idle).
	/** @type {string|null} */
	let activeSegmentId = $state(null);


	// Yellow guide line geometry (viewport-fixed). visible=false hides it.
	let guideLine = $state({ visible: false, top: 0, left: 0, width: 0 });

	// Live height tooltip that follows the drag (viewport-fixed). x/y track the
	// horizontal center and current bottom edge of the dragged segment; height is
	// the CSS-px value being applied (and ultimately saved).
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	// Internal (non-reactive) drag bookkeeping.
	let startY = 0; // pointer Y at mousedown (viewport px)
	let draggedTopY = 0; // dragged segment's top edge (viewport px) — fixed during its own resize
	let draggedCenterX = 0; // dragged segment's horizontal center (viewport px) — fixed during resize
	let renderedStartHeight = 0; // dragged segment's rendered height at start (viewport px)
	let naturalContentHeight = 0; // minimum allowed height (CSS px) = natural text height
	let snapCandidates = []; // array of viewport Y values (other columns' segment edges)


	/**
	 * Begin a resize drag for the given segment.
	 * @param {MouseEvent} event
	 * @param {string} segmentId
	 */
	function handleResizeStart(event, segmentId) {
		// Prevent word-selection / caret logic on the page from reacting to this gesture.
		event.preventDefault();
		event.stopPropagation();

		const segmentEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-segment-id="${segmentId}"]`)
		);
		if (!segmentEl) return;


		const scale = getScale() || 1;

		startY = event.clientY;

		const rect = segmentEl.getBoundingClientRect();
		draggedTopY = rect.top;
		draggedCenterX = rect.left + rect.width / 2;
		renderedStartHeight = rect.height;


		// Measure natural (content) height by momentarily clearing the inline min-height.
		const prevMinHeight = segmentEl.style.minHeight;
		segmentEl.style.minHeight = '0px';
		const naturalRendered = segmentEl.getBoundingClientRect().height;
		segmentEl.style.minHeight = prevMinHeight;
		naturalContentHeight = naturalRendered / scale;

		// Collect snap candidates: top & bottom edges (viewport Y) of every segment NOT
		// in the same column as the dragged one. Same-column segments shift as this one
		// grows and never align meaningfully, so they're excluded.
		const ownColumn = segmentEl.closest('.column');
		snapCandidates = [];
		document.querySelectorAll('.segment').forEach((el) => {
			if (el === segmentEl) return;
			if (ownColumn && ownColumn.contains(el)) return;
			// Skip hidden segments (compare/focus mode).
			if (el.classList.contains('compare-hidden')) return;
			const r = el.getBoundingClientRect();
			snapCandidates.push(r.top, r.bottom);
		});

		// Show the live-height tooltip anchored to the segment's current bottom edge.
		dragTooltip = {
			visible: true,
			x: draggedCenterX,
			y: draggedTopY + renderedStartHeight,
			height: Math.round(renderedStartHeight / scale)
		};

		activeSegmentId = segmentId;
		document.body.style.cursor = 'ns-resize';
		document.body.style.userSelect = 'none';
	}


	/**
	 * Handle pointer movement during a resize.
	 * @param {MouseEvent} event
	 */
	function handleResizeMove(event) {
		if (!activeSegmentId) return;

		const scale = getScale() || 1;
		const deltaViewport = event.clientY - startY;
		let newRenderedHeight = renderedStartHeight + deltaViewport;

		// Snap: compare the projected bottom edge against candidate edges.
		const projectedBottomY = draggedTopY + newRenderedHeight;
		let snappedY = null;
		let closest = snapThreshold;
		for (const candidateY of snapCandidates) {
			const dist = Math.abs(projectedBottomY - candidateY);
			if (dist <= closest) {
				closest = dist;
				snappedY = candidateY;
			}
		}

		if (snappedY !== null) {
			newRenderedHeight = snappedY - draggedTopY;
		}

		// Convert to CSS px and enforce the natural-height floor.
		let newContentHeight = newRenderedHeight / scale;
		if (newContentHeight < naturalContentHeight) {
			newContentHeight = naturalContentHeight;
			// If clamped, the snap no longer applies.
			snappedY = null;
		}

		liveHeights = { ...liveHeights, [activeSegmentId]: newContentHeight };

		// Update the live-height tooltip to follow the dragged bottom edge.
		dragTooltip = {
			visible: true,
			x: draggedCenterX,
			y: draggedTopY + newContentHeight * scale,
			height: Math.round(newContentHeight)
		};

		// Position / toggle the guide line.

		if (snappedY !== null) {
			const container = getContainer();
			if (container) {
				const cr = container.getBoundingClientRect();
				guideLine = { visible: true, top: snappedY, left: cr.left, width: cr.width };
			} else {
				guideLine = { visible: true, top: snappedY, left: 0, width: window.innerWidth };
			}
		} else if (guideLine.visible) {
			guideLine = { ...guideLine, visible: false };
		}
	}

	/**
	 * Finish a resize drag: persist the new height and refresh data.
	 */
	async function handleResizeEnd() {
		if (!activeSegmentId) return;

		const segmentId = activeSegmentId;
		const finalHeight = liveHeights[segmentId];

		// Reset interaction state immediately.
		activeSegmentId = null;
		guideLine = { visible: false, top: 0, left: 0, width: 0 };
		dragTooltip = { visible: false, x: 0, y: 0, height: 0 };
		document.body.style.cursor = '';
		document.body.style.userSelect = '';


		if (finalHeight == null) return;

		const rounded = Math.round(finalHeight);

		try {
			await fetch(`/api/segments/${segmentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ height: rounded })
			});
			// Refresh loaded data so the persisted height is the source of truth.
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to save segment height:', error);
		} finally {
			// Clear the live override now that the persisted value matches.
			const { [segmentId]: _drop, ...rest } = liveHeights;
			liveHeights = rest;
		}
	}

	/**
	 * Setup global pointer listeners while a drag is active (use inside an $effect).
	 */
	function setupResizeListeners() {
		if (!activeSegmentId) return;
		window.addEventListener('mousemove', handleResizeMove);
		window.addEventListener('mouseup', handleResizeEnd);
		return () => {
			window.removeEventListener('mousemove', handleResizeMove);
			window.removeEventListener('mouseup', handleResizeEnd);
		};
	}

	/**
	 * Get the live (in-progress) height override for a segment, or null.
	 * @param {string} segmentId
	 * @returns {number|null}
	 */
	function getLiveHeight(segmentId) {
		return liveHeights[segmentId] ?? null;
	}

	return {
		handleResizeStart,
		setupResizeListeners,
		getLiveHeight,
		get activeSegmentId() {
			return activeSegmentId;
		},
		get guideLine() {
			return guideLine;
		},
		get dragTooltip() {
			return dragTooltip;
		}
	};

}
