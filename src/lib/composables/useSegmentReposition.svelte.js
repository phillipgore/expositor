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
 * @param {Object} options
 * @param {() => number} options.getScale - Current zoom scale (e.g. 1).
 * @param {(segmentId: string) => number} options.getOffset - Current RENDERED offset (CSS px).
 * @param {(segmentId: string) => number} options.getMaxOffset - Largest allowed offset (CSS px).
 * @param {() => Promise<void>} options.onPersist - Called after a save (e.g. invalidate('app:studies')).
 */
export function useSegmentReposition({ getScale, getOffset, getMaxOffset, onPersist }) {
	// Live overrides during a drag: segmentId -> px (pre-zoom).
	/** @type {Record<string, number>} */
	let liveOffsets = $state({});

	/** @type {string|null} */
	let activeSegmentId = $state(null);

	// `height` is the offset in CSS px — ResizeTooltip renders it as "Npx".
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	let startX = 0; // pointer X at mousedown (viewport px)
	let startEdgeX = 0; // segment LEFT edge (viewport px) at drag start
	let startOffset = 0; // offset (CSS px) at drag start
	let maxOffset = 0; // max allowed offset (CSS px), fixed for the drag
	let tooltipY = 0; // fixed viewport Y for the tooltip
	let dragScale = 1; // painted zoom scale captured at drag start

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
		tooltipY = rect.top + rect.height / 2;

		dragTooltip = { visible: true, x: startEdgeX, y: tooltipY, height: Math.round(startOffset) };

		activeSegmentId = segmentId;
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	/** @param {MouseEvent} event */
	function handleRepositionMove(event) {
		if (!activeSegmentId) return;

		let next = startOffset + (event.clientX - startX) / dragScale;
		if (next < 0) next = 0;
		if (next > maxOffset) next = maxOffset;

		liveOffsets = { ...liveOffsets, [activeSegmentId]: next };

		dragTooltip = {
			visible: true,
			x: startEdgeX + (next - startOffset) * dragScale,
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
		}
	};
}
