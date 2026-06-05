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
// Extra vertical lift (viewport px) applied to the reposition tooltip's anchor so the
// label clears the three-dot grab handle that sits just above the section's top edge.
const TOOLTIP_ANCHOR_LIFT = 8;


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

	// Live gap tooltip that follows the drag (viewport-fixed). x/y track the horizontal
	// center and current top edge of the dragged section; gap is the CSS-px total spacing
	// above the section (and ultimately what determines the saved offset). Mirrors the
	// segment-resize tooltip via the shared ResizeTooltip component.
	let dragTooltip = $state({ visible: false, x: 0, y: 0, height: 0 });

	// Internal (non-reactive) drag bookkeeping.
	let startY = 0; // pointer Y at mousedown (viewport px)
	let startTopY = 0; // dragged section's top edge (viewport px) at drag start
	let startMargin = 0; // dragged section's margin-top (CSS px) at drag start
	let defaultMargin = 0; // the floor: section's default margin-top (CSS px)
	let draggedCenterX = 0; // dragged section's horizontal center (viewport px) — fixed during drag
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
		draggedCenterX = rect.left + rect.width / 2;


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

		// Show the live-gap tooltip anchored to the section's current top edge. It reports
		// the TOTAL spacing above the section (default + offset), matching what the user
		// would enter in the Set Section Spacing modal.
		dragTooltip = {
			visible: true,
			x: draggedCenterX,
			// Lift the anchor above the three-dot grab handle (which sits ~12px above the
			// section's top edge) so the tooltip doesn't overlap it.
			y: startTopY - TOOLTIP_ANCHOR_LIFT,
			height: Math.round(startMargin)
		};


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

		// Update the live-gap tooltip to follow the dragged top edge and report the new
		// total spacing above the section (CSS px).
		dragTooltip = {
			visible: true,
			x: draggedCenterX,
			// Keep the same lift as on drag start so the label stays clear of the grab handle.
			y: startTopY + (newMargin - startMargin) * scale - TOOLTIP_ANCHOR_LIFT,
			height: Math.round(newMargin)
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
	 * Finish a reposition drag: persist the new offset and refresh data.
	 */
	async function handleRepositionEnd() {
		if (!activeSectionId) return;

		const sectionId = activeSectionId;
		const finalOffset = liveOffsets[sectionId];

		// Reset interaction state immediately.
		activeSectionId = null;
		guideLine = { visible: false, top: 0, left: 0, width: 0 };
		dragTooltip = { visible: false, x: 0, y: 0, height: 0 };
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

	/**
	 * Measure a section's DEFAULT vertical gap (margin-top with no reposition offset),
	 * in CSS px at scale 1. This is the floor: first section = 0, others ≈ 43px.
	 * @param {string} sectionId
	 * @returns {number} Default gap in CSS px (0 if the section can't be found).
	 */
	function measureDefaultGap(sectionId) {
		const sectionEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-section-id="${sectionId}"]`)
		);
		if (!sectionEl) return 0;

		const scale = getScale() || 1;
		// Temporarily zero the reposition offset so margin-top collapses to its default.
		const prevVar = sectionEl.style.getPropertyValue('--reposition-offset');
		sectionEl.style.setProperty('--reposition-offset', '0px');
		const measured = parseFloat(getComputedStyle(sectionEl).marginTop) || 0;
		// Restore the previous inline value (empty string removes the inline override).
		if (prevVar) sectionEl.style.setProperty('--reposition-offset', prevVar);
		else sectionEl.style.removeProperty('--reposition-offset');

		return measured / scale;
	}

	/**
	 * Measure a section's CURRENT total vertical gap (rendered margin-top), in CSS px at
	 * scale 1. Equals defaultGap + current offset (persisted or live).
	 * @param {string} sectionId
	 * @returns {number} Current total gap in CSS px (0 if not found).
	 */
	function measureCurrentGap(sectionId) {
		const sectionEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-section-id="${sectionId}"]`)
		);
		if (!sectionEl) return 0;
		const scale = getScale() || 1;
		const measured = parseFloat(getComputedStyle(sectionEl).marginTop) || 0;
		return measured / scale;
	}

	/**
	 * Set a uniform TOTAL vertical gap across one or more sections. The total is converted
	 * per-section into the stored EXTRA offset (offset = max(0, total − sectionDefault)),
	 * persisted via PATCH, then data is refreshed once.
	 * @param {string[]} sectionIds
	 * @param {number} totalGap - Desired total gap in CSS px.
	 */
	async function setSpacing(sectionIds, totalGap) {
		if (!Array.isArray(sectionIds) || sectionIds.length === 0) return;

		try {
			await Promise.all(
				sectionIds.map((sectionId) => {
					const defaultGap = measureDefaultGap(sectionId);
					const offset = Math.max(0, Math.round(totalGap - defaultGap));
					const toPersist = offset <= 0 ? null : offset;

					// Drop any live override for this section.
					if (sectionId in liveOffsets) {
						const { [sectionId]: _drop, ...rest } = liveOffsets;
						liveOffsets = rest;
					}

					return fetch(`/api/passages/sections/${sectionId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ topOffset: toPersist })
					});
				})
			);
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to set section spacing:', error);
		}
	}

	/**
	 * Reset the vertical spacing of one or more sections back to their defaults
	 * (topOffset = null), then refresh data once.
	 * @param {string[]} sectionIds
	 */
	async function resetSpacing(sectionIds) {
		if (!Array.isArray(sectionIds) || sectionIds.length === 0) return;

		try {
			await Promise.all(
				sectionIds.map((sectionId) => {
					if (sectionId in liveOffsets) {
						const { [sectionId]: _drop, ...rest } = liveOffsets;
						liveOffsets = rest;
					}
					return fetch(`/api/passages/sections/${sectionId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ topOffset: null })
					});
				})
			);
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to reset section spacing:', error);
		}
	}

	return {
		handleRepositionStart,
		setupRepositionListeners,
		getLiveOffset,
		resetPosition,
		measureDefaultGap,
		measureCurrentGap,
		setSpacing,
		resetSpacing,


		get activeSectionId() {
			return activeSectionId;
		},
		get guideLine() {
			return guideLine;
		},
		get dragTooltip() {
			return dragTooltip;
		}
	};
}

