import { getRenderedScale } from '$lib/utils/zoomScale.js';

/**
 * Segment Reposition Composable
 *
 * Drag-adjustment of a segment's HORIZONTAL position in the Analyze view: the viewer
 * pulls a segment to the RIGHT within its column. The segment keeps its width; its
 * section and column widen to contain it (the page renders that).
 *
 * The persisted value (`leftOffset`) is how far, in CSS px, the segment is pulled
 * right (NULL/0 = flush). The page owns the limit rule — a segment's left edge may come
 * no closer than SEGMENT_POSITION_GAP (36px) to the right edge of the segment above it —
 * and supplies it via `getMaxOffset`.
 *
 * Mirrors useColumnReposition: deltas are divided by the painted zoom scale, the offset
 * is clamped to [0, max], a live tooltip follows the left edge, and on release the value
 * is persisted via PATCH /api/segments/batch-position and page data is invalidated.
 *
 * Snapping (mirrors useColumnResize / useSectionReposition): while dragging, the
 * segment's projected LEFT edge snaps to
 *  1. the left edges of OTHER repositioned segments (any column), and
 *  2. a grid every SNAP_STEP (18) CSS px of offset.
 * Alignment to another segment wins over the grid. A yellow VERTICAL guide line is
 * shown at the snapped edge; moving past the threshold releases the snap.
 *
 * @param {Object} options
 * @param {() => number} options.getScale - Current zoom scale (e.g. 1).
 * @param {(segmentId: string) => number} options.getOffset - Current RENDERED offset (CSS px).
 * @param {(segmentId: string) => number} options.getMaxOffset - Largest allowed offset (CSS px).
 * @param {() => HTMLElement|null} options.getContainer - Scrollable `.analyze-content` element (sizes the guide line).
 * @param {() => Promise<void>} options.onPersist - Called after a save (e.g. invalidate('app:studies')).
 * @param {number} [options.snapThreshold=8] - Snap distance in viewport px.
 */
// Grid step (CSS px of offset) the dragged segment snaps to.
export const SNAP_STEP = 18;

export function useSegmentReposition({ getScale, getOffset, getMaxOffset, getContainer, onPersist, snapThreshold = 8 }) {
	// Live overrides during a drag: segmentId -> px (pre-zoom).
	/** @type {Record<string, number>} */
	let liveOffsets = $state({});

	/** @type {string|null} */
	let activeSegmentId = $state(null);

	// `height` is the offset in CSS px — ResizeTooltip renders it as "Npx".
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	// Yellow vertical guide line geometry (viewport-fixed). visible=false hides it.
	let guideLine = $state({ visible: false, top: 0, left: 0, height: 0 });

	let startX = 0; // pointer X at mousedown (viewport px)
	let startEdgeX = 0; // segment LEFT edge (viewport px) at drag start
	let startOffset = 0; // offset (CSS px) at drag start
	let maxOffset = 0; // max allowed offset (CSS px), fixed for the drag
	let tooltipY = 0; // fixed viewport Y for the tooltip
	let dragScale = 1; // painted zoom scale captured at drag start
	let alignCandidates = []; // viewport X of other repositioned segments' left edges

	/**
	 * Begin a position drag for the given segment.
	 * @param {MouseEvent} event
	 * @param {string} segmentId
	 */
	function handleRepositionStart(event, segmentId) {
		event.preventDefault();
		event.stopPropagation();

		const segEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-segment-id="${segmentId}"]`)
		);
		if (!segEl) return;

		dragScale = getRenderedScale(getScale() || 1);
		startX = event.clientX;
		startOffset = getOffset(segmentId) ?? 0;
		maxOffset = Math.max(0, getMaxOffset(segmentId) ?? 0);

		const rect = segEl.getBoundingClientRect();
		startEdgeX = rect.left;
		// Anchor the tooltip at the TOP of the handle (pinned near the segment top, or
		// centered on short segments) so the label clears the dots. Measured from the
		// handle itself, so it follows the CSS position at any zoom.
		const handleEl = /** @type {HTMLElement|null} */ (event.currentTarget);
		tooltipY = handleEl?.getBoundingClientRect
			? handleEl.getBoundingClientRect().top
			: rect.top + rect.height / 2 - 1.2 * 10 * dragScale;

		dragTooltip = { visible: true, x: startEdgeX, y: tooltipY, height: Math.round(startOffset) };

		// Alignment candidates: left edges of every OTHER visible segment that has been
		// repositioned (the page marks them with data-left-offset).
		alignCandidates = [];
		document.querySelectorAll('.segment[data-left-offset]').forEach((el) => {
			if (el === segEl || el.classList.contains('compare-hidden')) return;
			alignCandidates.push(el.getBoundingClientRect().left);
		});

		activeSegmentId = segmentId;
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}

	/** @param {MouseEvent} event */
	function handleRepositionMove(event) {
		if (!activeSegmentId) return;

		const scale = dragScale;
		const raw = startOffset + (event.clientX - startX) / scale;
		/** @param {number} offset */
		const edgeX = (offset) => startEdgeX + (offset - startOffset) * scale;
		const projectedX = edgeX(raw);

		// 1. Align to another repositioned segment's left edge (takes priority).
		let snapped = null;
		let closest = snapThreshold;
		for (const candidateX of alignCandidates) {
			const dist = Math.abs(projectedX - candidateX);
			if (dist <= closest) {
				closest = dist;
				snapped = raw + (candidateX - projectedX) / scale;
			}
		}

		// 2. Otherwise snap to the 18px offset grid.
		if (snapped === null) {
			const gridOffset = Math.round(raw / SNAP_STEP) * SNAP_STEP;
			if (Math.abs(edgeX(gridOffset) - projectedX) <= snapThreshold) snapped = gridOffset;
		}

		let next = snapped ?? raw;
		if (next < 0) next = 0;
		if (next > maxOffset) next = maxOffset;
		// A clamp moves the edge off the snap target, so the snap no longer applies —
		// except at 0, which is both a clamp and a grid line.
		if (snapped !== null && next !== snapped) snapped = null;

		// Position / toggle the vertical guide line at the snapped left edge.
		if (snapped !== null) {
			const x = edgeX(next);
			const container = getContainer?.();
			if (container) {
				const cr = container.getBoundingClientRect();
				guideLine = { visible: true, top: cr.top, left: x, height: cr.height };
			} else {
				guideLine = { visible: true, top: 0, left: x, height: window.innerHeight };
			}
		} else if (guideLine.visible) {
			guideLine = { ...guideLine, visible: false };
		}

		liveOffsets = { ...liveOffsets, [activeSegmentId]: next };

		dragTooltip = {
			visible: true,
			x: edgeX(next),
			y: tooltipY,
			height: Math.round(next)
		};

		// Let the connection overlay re-flow live (it rAF-coalesces these).
		window.dispatchEvent(new Event('analyze-layout-changed'));
	}

	async function handleRepositionEnd() {
		if (!activeSegmentId) return;

		const segmentId = activeSegmentId;
		const finalOffset = liveOffsets[segmentId];

		activeSegmentId = null;
		dragTooltip = { visible: false, x: 0, y: 0, height: 0 };
		guideLine = { visible: false, top: 0, left: 0, height: 0 };
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		if (finalOffset == null) return;

		const rounded = Math.round(finalOffset);
		try {
			await persist([segmentId], rounded <= 0 ? null : rounded);
		} catch (error) {
			console.error('Failed to save segment position:', error);
		} finally {
			dropLive([segmentId]);
		}
	}

	/** Attach window listeners while a drag is active (use inside an $effect). */
	function setupRepositionListeners() {
		if (!activeSegmentId) return;
		window.addEventListener('mousemove', handleRepositionMove);
		window.addEventListener('mouseup', handleRepositionEnd);
		return () => {
			window.removeEventListener('mousemove', handleRepositionMove);
			window.removeEventListener('mouseup', handleRepositionEnd);
		};
	}

	/**
	 * @param {string[]} segmentIds
	 * @param {number|null} offset
	 */
	async function persist(segmentIds, offset) {
		await fetch('/api/segments/batch-position', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: segmentIds, offset })
		});
		if (onPersist) await onPersist();
	}

	/** @param {string[]} segmentIds */
	function dropLive(segmentIds) {
		const rest = { ...liveOffsets };
		for (const id of segmentIds) delete rest[id];
		liveOffsets = rest;
	}

	/**
	 * Live (in-progress) offset for a segment, or null.
	 * @param {string} segmentId
	 * @returns {number|null}
	 */
	function getLiveOffset(segmentId) {
		return liveOffsets[segmentId] ?? null;
	}

	/**
	 * Set the same offset on one or more segments (Layout → Set Segment Position…).
	 * Each segment's rendered position is still capped by the 36px rule.
	 * @param {string[]} segmentIds
	 * @param {number} offset - CSS px (≥ 0)
	 */
	async function setPosition(segmentIds, offset) {
		if (!Array.isArray(segmentIds) || segmentIds.length === 0) return;
		const rounded = Math.max(0, Math.round(offset));
		try {
			dropLive(segmentIds);
			await persist(segmentIds, rounded === 0 ? null : rounded);
		} catch (error) {
			console.error('Failed to set segment position:', error);
		}
	}

	/**
	 * Return segments flush with their column (Layout → Reset Segment Position).
	 * @param {string[]} segmentIds
	 */
	async function resetPosition(segmentIds) {
		if (!Array.isArray(segmentIds) || segmentIds.length === 0) return;
		try {
			dropLive(segmentIds);
			await persist(segmentIds, null);
		} catch (error) {
			console.error('Failed to reset segment position:', error);
		}
	}

	return {
		handleRepositionStart,
		setupRepositionListeners,
		getLiveOffset,
		setPosition,
		resetPosition,

		get activeSegmentId() {
			return activeSegmentId;
		},
		get dragTooltip() {
			return dragTooltip;
		},
		get guideLine() {
			return guideLine;
		}
	};
}
