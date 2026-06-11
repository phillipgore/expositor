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
 * `handleRepositionStart` from their left-border drag handle (the handle sits on the
 * column's left edge — the side of the gap it adjusts).
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
	// column's LEFT edge (where the handle sits); y stays at the handle's viewport-centered Y.
	// `height` is the CSS-px TOTAL spacing to the column's left (default + offset).
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	// Internal (non-reactive) drag bookkeeping.
	let startX = 0; // pointer X at mousedown (viewport px)
	let startEdgeX = 0; // dragged column's LEFT edge (viewport px) at drag start — the
	// handle sits on this edge, so the tooltip is anchored here and tracks it during the drag.
	let startMargin = 0; // dragged column's per-side offset (CSS px) at drag start
	let defaultGap = 0; // the default left gap (CSS px) — the tooltip baseline
	let maxMargin = 0; // max allowed per-side offset (CSS px)
	let tooltipY = 0; // fixed viewport Y for the tooltip during the drag
	let activeIsCross = false; // whether the active drag spans a passage divider

	/**
	 * Classify a column for spacing purposes and locate the element whose RIGHT edge
	 * forms the left side of this column's adjustable gap.
	 *
	 *  - 'within': a normal non-first column. Its gap is measured to the previous
	 *    column in the same passage; the stored offset is applied as a single
	 *    margin-left on this column (total gap = default + offset, capped at maxGap).
	 *  - 'cross': the FIRST column of a passage OTHER than the first passage. Its gap
	 *    spans the passage divider. The stored offset is a PER-SIDE amount X applied
	 *    symmetrically to BOTH the divider (margin-left X) and this column
	 *    (margin-left X), so the divider stays centered. Total gap = default + 2X,
	 *    capped at maxGap. The gap is measured to the previous passage's LAST column.
	 *  - null: the study's very first column (first column of the first passage). It
	 *    has no adjustable gap and never gets a handle.
	 *
	 * @param {HTMLElement} colEl
	 * @returns {{ isCross: boolean, prevRightEl: HTMLElement } | null}
	 */
	function classifyColumn(colEl) {
		const prevCol = /** @type {HTMLElement|null} */ (colEl.previousElementSibling);
		if (prevCol && prevCol.classList.contains('column')) {
			return { isCross: false, prevRightEl: prevCol };
		}
		// First column in its passage — adjustable only if a previous passage exists.
		const passageEl = colEl.closest('.passage');
		const prevDivider = /** @type {HTMLElement|null} */ (passageEl?.previousElementSibling ?? null);
		if (!prevDivider) return null; // study's first column
		const prevPassage = /** @type {HTMLElement|null} */ (prevDivider.previousElementSibling);
		if (!prevPassage) return null;
		const prevCols = prevPassage.querySelectorAll('.column');
		const lastCol = /** @type {HTMLElement|null} */ (prevCols[prevCols.length - 1] ?? null);
		if (!lastCol) return null;
		return { isCross: true, prevRightEl: lastCol };
	}

	/**
	 * Get the passage divider element that sits immediately to the LEFT of a
	 * cross-passage column (i.e. the divider before this column's passage), or null.
	 * @param {HTMLElement} colEl
	 * @returns {HTMLElement|null}
	 */
	function getLeftDivider(colEl) {
		const passageEl = colEl.closest('.passage');
		const prevDivider = /** @type {HTMLElement|null} */ (passageEl?.previousElementSibling ?? null);
		if (prevDivider && prevDivider.classList.contains('passage-divider')) return prevDivider;
		return null;
	}


	/**
	 * Measure a column's DEFAULT left gap (the gap with no reposition offset), in CSS
	 * px at scale 1.
	 *  - within-passage column: the container's flex gap (≈39px) to the previous column.
	 *  - cross-passage column: the TOTAL gap across the divider to the previous passage's
	 *    last column with both per-side offsets zeroed (≈78px).
	 *  - study's first column: 0 (no adjustable gap).
	 * @param {string} columnId
	 * @returns {number} Default left gap in CSS px (0 if not found / first column).
	 */
	function measureDefaultGap(columnId) {
		const colEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!colEl) return 0;

		const info = classifyColumn(colEl);
		if (!info) return 0;

		const scale = getScale() || 1;

		// Temporarily zero this column's offset so margin-left collapses to 0. For a
		// cross-passage column, also zero the left divider's margin so both per-side
		// offsets are removed, leaving the pure default total gap.
		const divider = info.isCross ? getLeftDivider(colEl) : null;
		const prevColVar = colEl.style.getPropertyValue('--column-offset');
		const prevDivVar = divider?.style.getPropertyValue('--divider-offset');
		colEl.style.setProperty('--column-offset', '0px');
		if (divider) divider.style.setProperty('--divider-offset', '0px');

		const colRect = colEl.getBoundingClientRect();
		const prevRect = info.prevRightEl.getBoundingClientRect();

		// Restore the previous inline values (empty string removes the inline override).
		if (prevColVar) colEl.style.setProperty('--column-offset', prevColVar);
		else colEl.style.removeProperty('--column-offset');
		if (divider) {
			if (prevDivVar) divider.style.setProperty('--divider-offset', prevDivVar);
			else divider.style.removeProperty('--divider-offset');
		}

		return (colRect.left - prevRect.right) / scale;
	}

	/**
	 * Measure a column's CURRENT total left gap (rendered), in CSS px at scale 1.
	 * Equals the live distance between this column's left edge and the right edge of
	 * the element forming the left side of its gap (previous column, or — across a
	 * divider — the previous passage's last column).
	 * @param {string} columnId
	 * @returns {number} Current total left gap in CSS px (0 if not found / first column).
	 */
	function measureCurrentGap(columnId) {
		const colEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-column-id="${columnId}"]`)
		);
		if (!colEl) return 0;

		const info = classifyColumn(colEl);
		if (!info) return 0;

		const scale = getScale() || 1;
		const colRect = colEl.getBoundingClientRect();
		const prevRect = info.prevRightEl.getBoundingClientRect();
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

		// Only the study's very first column is non-adjustable; every other column
		// (including the first column of later passages, across a divider) can move.
		const info = classifyColumn(colEl);
		if (!info) return;
		activeIsCross = info.isCross;

		const scale = getScale() || 1;

		startX = event.clientX;

		const rect = colEl.getBoundingClientRect();
		startEdgeX = rect.left;

		// Current applied per-side offset (CSS px). For both modes this is the column's
		// own margin-left (for cross columns the divider mirrors the same value).
		const computedMargin = parseFloat(getComputedStyle(colEl).marginLeft) || 0;
		startMargin = computedMargin / scale;

		// Default gap (floor baseline for the tooltip) and the derived max per-side
		// offset. For cross columns the per-side ceiling is half the remaining range
		// because BOTH sides grow by the same amount (total = default + 2X).
		defaultGap = measureDefaultGap(columnId);
		maxMargin = activeIsCross
			? Math.max(0, (maxGap - defaultGap) / 2)
			: Math.max(0, maxGap - defaultGap);


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
			x: startEdgeX,
			y: tooltipY,
			height: Math.round(defaultGap + (activeIsCross ? 2 * startMargin : startMargin))
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

		// Number of sides that grow with the per-side offset: 1 for a within-passage
		// column (only its own left margin), 2 for a cross-passage column (the divider
		// AND the column both shift, so the column's right edge moves by 2X). Dividing
		// the cursor delta by this factor keeps the grabbed right edge tracking the
		// cursor 1:1 in both modes.
		const sides = activeIsCross ? 2 : 1;

		// Convert the horizontal movement to a per-side offset (CSS px) and clamp:
		// floor at 0 (can't be tighter than default), ceiling at maxMargin (total gap
		// capped at maxGap; for cross columns maxMargin is already the per-side half).
		let newMargin = startMargin + deltaViewport / (scale * sides);
		if (newMargin < 0) newMargin = 0;
		if (newMargin > maxMargin) newMargin = maxMargin;

		liveOffsets = { ...liveOffsets, [activeColumnId]: newMargin };

		// Update the live-gap tooltip to follow the dragged LEFT edge (where the handle
		// sits) and report the new TOTAL spacing to the column's left (default + sides·
		// offset). The left edge shifts right by the same amount as the right edge —
		// (newMargin − startMargin) × scale × sides — because the column width is fixed.
		dragTooltip = {
			visible: true,
			x: startEdgeX + (newMargin - startMargin) * scale * sides,
			y: tooltipY,
			height: Math.round(defaultGap + sides * newMargin)
		};

		// Signal the connection overlay to re-flow Quick Notes live as the column
		// (and the passage text beside it) reflows. The overlay rAF-coalesces these.
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('analyze-layout-changed'));
		}
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
					if (!colEl) return null;
					const info = classifyColumn(colEl);
					// Skip the study's first column — it has no adjustable left gap.
					if (!info) return null;

					// Convert the requested TOTAL gap into the stored PER-SIDE offset.
					// Within-passage: offset = total − default (one side).
					// Cross-passage: offset = (total − default) / 2 (applied to both sides).
					const colDefault = measureDefaultGap(columnId);
					const sides = info.isCross ? 2 : 1;
					const maxOffset = Math.max(0, (maxGap - colDefault) / sides);
					const offset = Math.min(
						maxOffset,
						Math.max(0, Math.round((totalGap - colDefault) / sides))
					);
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
