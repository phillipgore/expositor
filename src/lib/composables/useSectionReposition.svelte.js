/**
 * Section Reposition Composable
 *
 * Manages drag-repositioning of a section's VERTICAL position in the Analyze view.
 *
 * Conceptually this adjusts the gap ABOVE a section:
 *  - For the first section in a column, this is the distance from the top of the column.
 *  - For other sections, this is the distance from the previous section.
 *
 * Implementation detail: the value persisted (`topOffset`) is the EXTRA spacing in CSS
 * px ADDED on top of the section's default margin-top. The applied margin-top is
 * `defaultMargin + topOffset`. Because it is additive with a floor at the default, a
 * section can never be pulled tighter than its current default spacing — it can only be
 * pushed down. (NULL/0 = default spacing.)
 *
 * Key behaviors (mirrors useSegmentResize):
 *  - All mouse deltas are divided by the current zoom scale so dragging tracks the
 *    cursor 1:1 regardless of zoom.
 *  - While dragging, the projected TOP edge snaps to the top/bottom edges of sections
 *    and segments in OTHER columns (cross-page alignment); a yellow guide line is shown
 *    at the snap position. Dragging past the threshold releases the snap.
 *  - On release, the new offset is persisted to the DB via PATCH /api/passages/sections/[id]
 *    and the page data is invalidated so it survives reload.
 *
 * The composable is intended to live at the Analyze page level (it needs to see all
 * `.section`/`.segment` elements and the zoom scale). Individual section elements call
 * `handleRepositionStart` from their top drag handle.
 *
 * @param {Object} options
 * @param {() => number} options.getScale - Returns the current zoom scale (e.g. 1).
 * @param {() => HTMLElement|null} options.getContainer - Returns the scrollable `.analyze-content` element (used to size the guide line).
 * @param {() => Promise<void>} options.onPersist - Called after a successful save to refresh data (e.g. invalidate('app:studies')).
 * @param {number} [options.snapThreshold=8] - Snap distance in viewport px.
 */
export function useSectionReposition({ getScale, getContainer, onPersist, snapThreshold = 8 }) {
	// Live offset overrides during a drag: sectionId -> extra px (pre-zoom) beyond default.
	// The page merges this over the persisted topOffset when rendering each section.
	/** @type {Record<string, number>} */
	let liveOffsets = $state({});

	// The section currently being repositioned (null when idle).
	/** @type {string|null} */
	let activeSectionId = $state(null);

	// Yellow guide line geometry (viewport-fixed). visible=false hides it.
	let guideLine = $state({ visible: false, top: 0, left: 0, width: 0 });

	// Internal (non-reactive) drag bookkeeping.
	let startY = 0; // pointer Y at mousedown (viewport px)
	let startTopY = 0; // dragged section's top edge (viewport px) at drag start
	let startMargin = 0; // dragged section's margin-top (CSS px) at drag start
	let defaultMargin = 0; // the floor: section's default margin-top (CSS px)
	let snapCandidates = []; // array of viewport Y values (other columns' section/segment edges)

	/**
	 * Begin a reposition drag for the given section.
	 * @param {MouseEvent} event
	 * @param {string} sectionId
	 */
	function handleRepositionStart(event, sectionId) {
		// Prevent word-selection / section-selection logic on the page from reacting.
		event.preventDefault();
		event.stopPropagation();

		const sectionEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-section-id="${sectionId}"]`)
		);
		if (!sectionEl) return;

		const scale = getScale() || 1;

		startY = event.clientY;

		const rect = sectionEl.getBoundingClientRect();
		startTopY = rect.top;

		// Current applied margin-top (CSS px). Read the inline value if present,
		// otherwise the computed default.
		const computedMargin = parseFloat(getComputedStyle(sectionEl).marginTop) || 0;
		startMargin = computedMargin / scale;

		// Measure the DEFAULT (floor) margin by momentarily clearing any inline override.
		const prevInlineMargin = sectionEl.style.marginTop;
		sectionEl.style.marginTop = '';
		const measuredDefault = parseFloat(getComputedStyle(sectionEl).marginTop) || 0;
		sectionEl.style.marginTop = prevInlineMargin;
		defaultMargin = measuredDefault / scale;

		// Collect snap candidates: top & bottom edges (viewport Y) of every section and
		// segment NOT in the same column as the dragged section. Same-column elements
		// shift together as this section moves and never align meaningfully.
		const ownColumn = sectionEl.closest('.column');
		snapCandidates = [];
		document.querySelectorAll('.section, .segment').forEach((el) => {
			if (el === sectionEl) return;
			if (ownColumn && ownColumn.contains(el)) return;
			// Skip hidden elements (compare/focus mode).
			if (el.classList.contains('compare-hidden')) return;
			const r = el.getBoundingClientRect();
			snapCandidates.push(r.top, r.bottom);
		});

		activeSectionId = sectionId;
		document.body.style.cursor = 'grabbing';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Handle pointer movement during a reposition.
	 * @param {MouseEvent} event
	 */
	function handleRepositionMove(event) {
		if (!activeSectionId) return;

		const scale = getScale() || 1;
		const deltaViewport = event.clientY - startY;

		// Projected top edge of the dragged section in viewport coordinates.
		let projectedTopY = startTopY + deltaViewport;

		// Snap: compare the projected top edge against candidate edges.
		let snappedY = null;
		let closest = snapThreshold;
		for (const candidateY of snapCandidates) {
			const dist = Math.abs(projectedTopY - candidateY);
			if (dist <= closest) {
				closest = dist;
				snappedY = candidateY;
			}
		}

		if (snappedY !== null) {
			projectedTopY = snappedY;
		}

		// Convert the resulting top-edge movement to a margin (CSS px) and enforce the
		// default-margin floor (can't be tighter than the current default spacing).
		let newMargin = startMargin + (projectedTopY - startTopY) / scale;
		if (newMargin < defaultMargin) {
			newMargin = defaultMargin;
			// If clamped to the floor, the snap no longer applies.
			snappedY = null;
		}

		const offset = newMargin - defaultMargin;
		liveOffsets = { ...liveOffsets, [activeSectionId]: offset };

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
	 * Finish a reposition drag: persist the new offset and refresh data.
	 */
	async function handleRepositionEnd() {
		if (!activeSectionId) return;

		const sectionId = activeSectionId;
		const finalOffset = liveOffsets[sectionId];

		// Reset interaction state immediately.
		activeSectionId = null;
		guideLine = { visible: false, top: 0, left: 0, width: 0 };
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		if (finalOffset == null) return;

		// Round; store 0 as null (default spacing) to keep the data clean.
		const rounded = Math.round(finalOffset);
		const toPersist = rounded <= 0 ? null : rounded;

		try {
			await fetch(`/api/passages/sections/${sectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topOffset: toPersist })
			});
			// Refresh loaded data so the persisted value is the source of truth.
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to save section position:', error);
		} finally {
			// Clear the live override now that the persisted value matches.
			const { [sectionId]: _drop, ...rest } = liveOffsets;
			liveOffsets = rest;
		}
	}

	/**
	 * Setup global pointer listeners while a drag is active (use inside an $effect).
	 */
	function setupRepositionListeners() {
		if (!activeSectionId) return;
		window.addEventListener('mousemove', handleRepositionMove);
		window.addEventListener('mouseup', handleRepositionEnd);
		return () => {
			window.removeEventListener('mousemove', handleRepositionMove);
			window.removeEventListener('mouseup', handleRepositionEnd);
		};
	}

	/**
	 * Get the live (in-progress) offset override for a section, or null.
	 * @param {string} sectionId
	 * @returns {number|null}
	 */
	function getLiveOffset(sectionId) {
		return liveOffsets[sectionId] ?? null;
	}

	/**
	 * Reset a section's vertical position back to the default spacing by clearing its
	 * persisted offset (topOffset = null), then refresh data.
	 * @param {string} sectionId
	 */
	async function resetPosition(sectionId) {
		// Drop any live override immediately.
		if (sectionId in liveOffsets) {
			const { [sectionId]: _drop, ...rest } = liveOffsets;
			liveOffsets = rest;
		}
		try {
			await fetch(`/api/passages/sections/${sectionId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ topOffset: null })
			});
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to reset section position:', error);
		}
	}

	return {
		handleRepositionStart,
		setupRepositionListeners,
		getLiveOffset,
		resetPosition,

		get activeSectionId() {
			return activeSectionId;
		},
		get guideLine() {
			return guideLine;
		}
	};
}
