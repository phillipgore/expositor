/**
 * Column Reposition Composable
 *
 * Manages drag-adjustment of a column's HORIZONTAL spacing in the Analyze view.
 *
 * Conceptually this adjusts the gap to the LEFT of a column (the space between it
 * and the previous column):
 *  - The first column in a passage has no left gap to adjust and never gets a handle.
 *  - Every other column can be pushed to the RIGHT, widening the gap on its left.
 *
 * Visually the viewer is "pulling the column to the right", even though under the
 * hood we are only expanding the spacing on its left side.
 *
 * Implementation detail: the value persisted (`leftOffset`) is the EXTRA spacing in
 * CSS px ADDED on top of the column's default left gap. The applied margin-left is
 * `leftOffset` (the default gap is supplied by the container's flex `gap`). Because
 * it is additive with a floor at 0, a column can never be pulled tighter than its
 * default spacing — it can only be pushed right. (NULL/0 = default spacing.)
 *
 * The TOTAL gap (default + offset) is capped at 294px.
 *
 * Key behaviors (mirrors useSectionReposition, but on the X axis):
 *  - All mouse deltas are divided by the current zoom scale so dragging tracks the
 *    cursor 1:1 regardless of zoom.
 *  - A live gap tooltip follows the drag, reporting the TOTAL spacing to the column's
 *    left (default + offset) — matching what the user would enter in the Set Column
 *    Spacing modal.
 *  - On release, the new offset is persisted to the DB via PATCH
 *    /api/passages/columns/[id] and the page data is invalidated so it survives reload.
 *
 * The composable is intended to live at the Analyze page level (it needs to see all
 * `.column` elements and the zoom scale). Individual column elements call
 * `handleRepositionStart` from their right-border drag handle.
 *
 * @param {Object} options
 * @param {() => number} options.getScale - Returns the current zoom scale (e.g. 1).
 * @param {() => Promise<void>} options.onPersist - Called after a successful save to refresh data (e.g. invalidate('app:studies')).
 * @param {number} [options.maxGap=294] - Maximum TOTAL gap (default + offset) in CSS px.
 */
export function useColumnReposition({ getScale, onPersist, maxGap = 294 }) {
	// Live offset overrides during a drag: columnId -> extra px (pre-zoom) beyond default.
	// The page merges this over the persisted leftOffset when rendering each column.
	/** @type {Record<string, number>} */
	let liveOffsets = $state({});

	// The column currently being repositioned (null when idle).
	/** @type {string|null} */
	let activeColumnId = $state(null);

	// Live gap tooltip that follows the drag (viewport-fixed). x tracks the dragged
	// column's right edge (the handle); y stays at the handle's viewport-centered Y.
	// `height` is the CSS-px TOTAL spacing to the column's left (default + offset).
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	// Internal (non-reactive) drag bookkeeping.
	let startX = 0; // pointer X at mousedown (viewport px)
	let startRightX = 0; // dragged column's right edge (viewport px) at drag start
	let startMargin = 0; // dragged column's margin-left (CSS px) at drag start
	let defaultGap = 0; // the default left gap (CSS px) — the tooltip baseline
	let maxMargin = 0; // max allowed margin-left (CSS px) = maxGap − defaultGap
	let tooltipY = 0; // fixed viewport Y for the tooltip during the drag

	/**
	 * Measure a column's DEFAULT left gap (the gap with no reposition offset), in CSS
	 * px at scale 1. This is the container's flex gap (≈39px) for non-first columns,
	 * and 0 for the first column.
	 * @param {string} columnId
	 * @returns {number} Default left gap in CSS px (0 if not found / first column).
	 */
	function measureDefaultGap(columnId) {
		const colEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!colEl) return 0;

		const prevEl = /** @type {HTMLElement|null} */ (colEl.previousElementSibling);
		if (!prevEl || !prevEl.classList.contains('column')) return 0;

		const scale = getScale() || 1;

		// Temporarily zero the reposition offset so margin-left collapses to its default
		// (0), leaving only the container's flex gap between the two columns.
		const prevVar = colEl.style.getPropertyValue('--column-offset');
		colEl.style.setProperty('--column-offset', '0px');
		const colRect = colEl.getBoundingClientRect();
		const prevRect = prevEl.getBoundingClientRect();
		// Restore the previous inline value (empty string removes the inline override).
		if (prevVar) colEl.style.setProperty('--column-offset', prevVar);
		else colEl.style.removeProperty('--column-offset');

		return (colRect.left - prevRect.right) / scale;
	}

	/**
	 * Measure a column's CURRENT total left gap (rendered), in CSS px at scale 1.
	 * Equals defaultGap + current offset (persisted or live).
	 * @param {string} columnId
	 * @returns {number} Current total left gap in CSS px (0 if not found / first column).
	 */
	function measureCurrentGap(columnId) {
		const colEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!colEl) return 0;

		const prevEl = /** @type {HTMLElement|null} */ (colEl.previousElementSibling);
		if (!prevEl || !prevEl.classList.contains('column')) return 0;

		const scale = getScale() || 1;
		const colRect = colEl.getBoundingClientRect();
		const prevRect = prevEl.getBoundingClientRect();
		return (colRect.left - prevRect.right) / scale;
	}

	/**
	 * Begin a reposition drag for the given column.
	 * @param {MouseEvent} event
	 * @param {string} columnId
	 */
	function handleRepositionStart(event, columnId) {
		// Prevent word-selection / column-selection logic on the page from reacting.
		event.preventDefault();
		event.stopPropagation();

		const colEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!colEl) return;

		// First column (no previous column sibling) cannot be repositioned.
		const prevEl = /** @type {HTMLElement|null} */ (colEl.previousElementSibling);
		if (!prevEl || !prevEl.classList.contains('column')) return;

		const scale = getScale() || 1;

		startX = event.clientX;

		const rect = colEl.getBoundingClientRect();
		startRightX = rect.right;

		// Current applied margin-left (CSS px). Read the computed value.
		const computedMargin = parseFloat(getComputedStyle(colEl).marginLeft) || 0;
		startMargin = computedMargin / scale;

		// Default gap (floor baseline for the tooltip) and the derived max margin.
		defaultGap = measureDefaultGap(columnId);
		maxMargin = Math.max(0, maxGap - defaultGap);

		// Anchor the tooltip at the vertical center of the column's currently-visible
		// portion (matches the grab handle, which is viewport-centered).
		tooltipY = rect.top + rect.height / 2;
		const container = colEl.closest('.analyze-content');
		if (container) {
			const cr = container.getBoundingClientRect();
			const visibleTop = Math.max(rect.top, cr.top);
			const visibleBottom = Math.min(rect.bottom, cr.bottom);
			tooltipY = (visibleTop + visibleBottom) / 2;
		}

		dragTooltip = {
			visible: true,
			x: startRightX,
			y: tooltipY,
			height: Math.round(defaultGap + startMargin)
		};

		activeColumnId = columnId;
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Handle pointer movement during a reposition.
	 * @param {MouseEvent} event
	 */
	function handleRepositionMove(event) {
		if (!activeColumnId) return;

		const scale = getScale() || 1;
		const deltaViewport = event.clientX - startX;

		// Convert the horizontal movement to a margin (CSS px) and clamp to the
		// allowed range: floor at 0 (can't be tighter than default), ceiling at
		// maxMargin (total gap capped at maxGap).
		let newMargin = startMargin + deltaViewport / scale;
		if (newMargin < 0) newMargin = 0;
		if (newMargin > maxMargin) newMargin = maxMargin;

		liveOffsets = { ...liveOffsets, [activeColumnId]: newMargin };

		// Update the live-gap tooltip to follow the dragged right edge and report the
		// new total spacing to the column's left (CSS px).
		dragTooltip = {
			visible: true,
			x: startRightX + (newMargin - startMargin) * scale,
			y: tooltipY,
			height: Math.round(defaultGap + newMargin)
		};
	}

	/**
	 * Finish a reposition drag: persist the new offset and refresh data.
	 */
	async function handleRepositionEnd() {
		if (!activeColumnId) return;

		const columnId = activeColumnId;
		const finalOffset = liveOffsets[columnId];

		// Reset interaction state immediately.
		activeColumnId = null;
		dragTooltip = { visible: false, x: 0, y: 0, height: 0 };
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		if (finalOffset == null) return;

		// Round; store 0 as null (default spacing) to keep the data clean.
		const rounded = Math.round(finalOffset);
		const toPersist = rounded <= 0 ? null : rounded;

		try {
			await fetch(`/api/passages/columns/${columnId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ leftOffset: toPersist })
			});
			// Refresh loaded data so the persisted value is the source of truth.
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to save column spacing:', error);
		} finally {
			// Clear the live override now that the persisted value matches.
			const { [columnId]: _drop, ...rest } = liveOffsets;
			liveOffsets = rest;
		}
	}

	/**
	 * Setup global pointer listeners while a drag is active (use inside an $effect).
	 */
	function setupRepositionListeners() {
		if (!activeColumnId) return;
		window.addEventListener('mousemove', handleRepositionMove);
		window.addEventListener('mouseup', handleRepositionEnd);
		return () => {
			window.removeEventListener('mousemove', handleRepositionMove);
			window.removeEventListener('mouseup', handleRepositionEnd);
		};
	}

	/**
	 * Get the live (in-progress) offset override for a column, or null.
	 * @param {string} columnId
	 * @returns {number|null}
	 */
	function getLiveOffset(columnId) {
		return liveOffsets[columnId] ?? null;
	}

	/**
	 * Set a uniform TOTAL left gap across one or more columns. The total is converted
	 * per-column into the stored EXTRA offset (offset = clamp(0, maxOffset, total −
	 * columnDefault)), persisted via PATCH, then data is refreshed once. Columns that
	 * are first in their passage (no left gap) are skipped.
	 * @param {string[]} columnIds
	 * @param {number} totalGap - Desired total left gap in CSS px.
	 */
	async function setSpacing(columnIds, totalGap) {
		if (!Array.isArray(columnIds) || columnIds.length === 0) return;

		try {
			await Promise.all(
				columnIds.map((columnId) => {
					const colEl = /** @type {HTMLElement|null} */ (
						document.querySelector(`[data-column-id="${columnId}"]`)
					);
					const prevEl = /** @type {HTMLElement|null} */ (colEl?.previousElementSibling);
					// Skip first-in-passage columns — they have no adjustable left gap.
					if (!colEl || !prevEl || !prevEl.classList.contains('column')) return null;

					const colDefault = measureDefaultGap(columnId);
					const maxOffset = Math.max(0, maxGap - colDefault);
					const offset = Math.min(maxOffset, Math.max(0, Math.round(totalGap - colDefault)));
					const toPersist = offset <= 0 ? null : offset;

					// Drop any live override for this column.
					if (columnId in liveOffsets) {
						const { [columnId]: _drop, ...rest } = liveOffsets;
						liveOffsets = rest;
					}

					return fetch(`/api/passages/columns/${columnId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ leftOffset: toPersist })
					});
				})
			);
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to set column spacing:', error);
		}
	}

	/**
	 * Reset the horizontal spacing of one or more columns back to their defaults
	 * (leftOffset = null), then refresh data once.
	 * @param {string[]} columnIds
	 */
	async function resetSpacing(columnIds) {
		if (!Array.isArray(columnIds) || columnIds.length === 0) return;

		try {
			await Promise.all(
				columnIds.map((columnId) => {
					if (columnId in liveOffsets) {
						const { [columnId]: _drop, ...rest } = liveOffsets;
						liveOffsets = rest;
					}
					return fetch(`/api/passages/columns/${columnId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ leftOffset: null })
					});
				})
			);
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to reset column spacing:', error);
		}
	}

	return {
		handleRepositionStart,
		setupRepositionListeners,
		getLiveOffset,
		measureDefaultGap,
		measureCurrentGap,
		setSpacing,
		resetSpacing,

		get activeColumnId() {
			return activeColumnId;
		},
		get dragTooltip() {
			return dragTooltip;
		}
	};
}
