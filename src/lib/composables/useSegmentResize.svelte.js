/**
 * Segment Resize Composable
 *
 * Manages drag-resizing of a segment's height in the Analyze view, including
 * LINKED segment heights (see below).
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
 *    (single) or /api/segments/batch-height (linked group) and the page data is
 *    invalidated so it survives reload.
 *
 * Linked heights:
 *  - Segments sharing a `data-height-group-id` are a LINK GROUP. They are always
 *    kept at the height of the tallest member and resize together.
 *  - Resizing any member resizes the whole group; the floor is the tallest natural
 *    (content) height across the group, so no member's text can clip.
 *  - A ResizeObserver watches grouped segments; when any member's natural content
 *    grows (added text/heading/note) the whole group grows to match.
 *  - Hovering one member's handle reveals every member's handle + a "Linked" tooltip;
 *    dragging shows a "Linked: [height]px" tooltip on every member.
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

	// Auto-grow overrides for LINKED groups: segmentId -> CSS px (pre-zoom). Kept in
	// sync by a ResizeObserver so every member matches the tallest member's natural
	// content height. Merged with liveHeights/persisted height when rendering.
	/** @type {Record<string, number>} */
	let groupSyncHeights = $state({});

	// The segment currently being resized (null when idle).
	/** @type {string|null} */
	let activeSegmentId = $state(null);

	// The link group currently being resized together (the active segment's group),
	// or just [activeSegmentId] when the segment isn't linked.
	/** @type {string[]} */
	let activeGroupIds = $state([]);

	// The link group currently hovered (handle hovered). All members reveal their
	// handle + a "Linked" tooltip while this is set.
	/** @type {string|null} */
	let hoveredGroupId = $state(null);

	// Yellow guide line geometry (viewport-fixed). visible=false hides it.
	let guideLine = $state({ visible: false, top: 0, left: 0, width: 0 });

	// Live height tooltips that follow the drag (viewport-fixed). For a single segment
	// there is one entry; for a linked group there is one per member, each anchored to
	// its own bottom edge. Each: { segmentId, x, y, height, label }.
	/** @type {Array<{ segmentId: string, x: number, y: number, height: number, label: string|null }>} */
	let dragTooltips = $state([]);

	// Hover tooltips (no drag in progress): one "Linked" label per group member,
	// anchored to each member's bottom edge. Each: { segmentId, x, y, label }.
	/** @type {Array<{ segmentId: string, x: number, y: number, label: string|null }>} */
	let hoverTooltips = $state([]);

	// Internal (non-reactive) drag bookkeeping.
	let startY = 0; // pointer Y at mousedown (viewport px)
	let renderedStartHeight = 0; // dragged segment's rendered height at start (viewport px)
	let naturalContentHeight = 0; // minimum allowed height (CSS px) = tallest natural text height across the group
	let snapCandidates = []; // array of viewport Y values (other columns' segment edges)
	// Per-member geometry captured at drag start (so each tooltip/guide tracks its own edge).
	/** @type {Array<{ id: string, topY: number, centerX: number }>} */
	let memberGeometry = [];

	// ResizeObserver bookkeeping for auto-grow of linked groups.
	/** @type {ResizeObserver|null} */
	let groupObserver = null;
	let recomputeScheduled = false;
	let suppressObserver = false;

	/**
	 * Resolve the link-group members for a segment from the DOM. Returns the segment's
	 * own id alone when it isn't linked, or all VISIBLE members sharing its
	 * `data-height-group-id`. Compare/focus-hidden members are excluded.
	 * @param {HTMLElement} segmentEl
	 * @returns {string[]}
	 */
	function resolveGroupIds(segmentEl) {
		const groupId = segmentEl.getAttribute('data-height-group-id');
		if (!groupId) {
			const id = segmentEl.getAttribute('data-segment-id');
			return id ? [id] : [];
		}
		const ids = [];
		document
			.querySelectorAll(`[data-height-group-id="${groupId}"]`)
			.forEach((el) => {
				if (el.classList.contains('compare-hidden')) return;
				const id = el.getAttribute('data-segment-id');
				if (id) ids.push(id);
			});
		return ids;
	}

	/**
	 * Begin a resize drag for the given segment (and its link group, if any).
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
		renderedStartHeight = rect.height;

		// Resolve the group (just [segmentId] when unlinked).
		const groupIds = resolveGroupIds(segmentEl);
		activeGroupIds = groupIds;

		// Capture each member's geometry and find the tallest natural (content) height
		// across the group — that's the floor (no member's text may clip).
		memberGeometry = [];
		naturalContentHeight = 0;
		for (const id of groupIds) {
			const el = /** @type {HTMLElement|null} */ (
				document.querySelector(`[data-segment-id="${id}"]`)
			);
			if (!el) continue;
			const r = el.getBoundingClientRect();
			memberGeometry.push({ id, topY: r.top, centerX: r.left + r.width / 2 });

			// Measure natural height by momentarily clearing the inline min-height.
			const prevMinHeight = el.style.minHeight;
			el.style.minHeight = '0px';
			const naturalRendered = el.getBoundingClientRect().height;
			el.style.minHeight = prevMinHeight;
			const natural = naturalRendered / scale;
			if (natural > naturalContentHeight) naturalContentHeight = natural;
		}

		// Collect snap candidates: top & bottom edges (viewport Y) of every segment NOT
		// in the same column as the dragged one, and not a member of the active group.
		const ownColumn = segmentEl.closest('.column');
		const groupSet = new Set(groupIds);
		snapCandidates = [];
		document.querySelectorAll('.segment').forEach((el) => {
			if (el === segmentEl) return;
			if (ownColumn && ownColumn.contains(el)) return;
			const id = el.getAttribute('data-segment-id');
			if (id && groupSet.has(id)) return;
			if (el.classList.contains('compare-hidden')) return;
			const r = el.getBoundingClientRect();
			snapCandidates.push(r.top, r.bottom);
		});

		// Seed the live-height tooltip(s): one per member at its own bottom edge.
		const startContentHeight = Math.round(renderedStartHeight / scale);
		const isLinked = groupIds.length > 1;
		dragTooltips = memberGeometry.map((m) => ({
			segmentId: m.id,
			x: m.centerX,
			y: m.topY + startContentHeight * scale,
			height: startContentHeight,
			label: isLinked ? 'Linked' : null
		}));

		// While dragging, hide any hover tooltips.
		hoverTooltips = [];

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

		// Snap: compare the projected bottom edge (of the dragged member) against candidates.
		const dragged = memberGeometry.find((m) => m.id === activeSegmentId) || memberGeometry[0];
		const draggedTopY = dragged ? dragged.topY : 0;
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

		// Convert to CSS px and enforce the (group) natural-height floor.
		let newContentHeight = newRenderedHeight / scale;
		if (newContentHeight < naturalContentHeight) {
			newContentHeight = naturalContentHeight;
			snappedY = null;
		}

		// Apply the same height to every group member.
		const next = { ...liveHeights };
		for (const id of activeGroupIds) next[id] = newContentHeight;
		liveHeights = next;

		// Update each member's tooltip to follow its own bottom edge.
		const rounded = Math.round(newContentHeight);
		const isLinked = activeGroupIds.length > 1;
		dragTooltips = memberGeometry.map((m) => ({
			segmentId: m.id,
			x: m.centerX,
			y: m.topY + newContentHeight * scale,
			height: rounded,
			label: isLinked ? 'Linked' : null
		}));

		// Position / toggle the guide line (anchored to the dragged member's edge).
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
	 * Finish a resize drag: persist the new height(s) and refresh data.
	 */
	async function handleResizeEnd() {
		if (!activeSegmentId) return;

		const groupIds = [...activeGroupIds];
		const finalHeight = liveHeights[activeSegmentId];

		// Reset interaction state immediately.
		activeSegmentId = null;
		activeGroupIds = [];
		memberGeometry = [];
		guideLine = { visible: false, top: 0, left: 0, width: 0 };
		dragTooltips = [];
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		if (finalHeight == null) return;

		const rounded = Math.round(finalHeight);

		try {
			if (groupIds.length > 1) {
				// Persist uniform height across the whole link group.
				await fetch('/api/segments/batch-height', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ids: groupIds, height: rounded })
				});
			} else {
				await fetch(`/api/segments/${groupIds[0]}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ height: rounded })
				});
			}
			// Refresh loaded data so the persisted height is the source of truth.
			if (onPersist) await onPersist();
		} catch (error) {
			console.error('Failed to save segment height:', error);
		} finally {
			// Clear the live overrides now that the persisted value matches.
			const rest = { ...liveHeights };
			for (const id of groupIds) delete rest[id];
			liveHeights = rest;
			// Drop any stale auto-grow overrides for these segments; the observer will
			// re-seed them from the persisted heights on the next recompute.
			const restSync = { ...groupSyncHeights };
			for (const id of groupIds) delete restSync[id];
			groupSyncHeights = restSync;
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

	// ─── Hover (linked-handle reveal + "Linked" tooltips) ──────────────────────

	/**
	 * Called when the pointer enters a segment's resize handle. For a linked segment
	 * this reveals every member's handle and shows a "Linked" tooltip on each.
	 * @param {string} segmentId
	 */
	function handleHandleEnter(segmentId) {
		if (activeSegmentId) return; // ignore while dragging
		const segmentEl = /** @type {HTMLElement|null} */ (
			document.querySelector(`[data-segment-id="${segmentId}"]`)
		);
		if (!segmentEl) return;
		const groupId = segmentEl.getAttribute('data-height-group-id');
		if (!groupId) {
			hoveredGroupId = null;
			hoverTooltips = [];
			return;
		}
		hoveredGroupId = groupId;
		const scale = getScale() || 1;
		const tips = [];
		document.querySelectorAll(`[data-height-group-id="${groupId}"]`).forEach((el) => {
			if (el.classList.contains('compare-hidden')) return;
			const id = el.getAttribute('data-segment-id');
			if (!id) return;
			const r = el.getBoundingClientRect();
			tips.push({ segmentId: id, x: r.left + r.width / 2, y: r.bottom, label: 'Linked' });
		});
		hoverTooltips = tips;
		// Reposition again on the next frame in case layout settled.
		void scale;
	}

	/**
	 * Called when the pointer leaves a segment's resize handle.
	 */
	function handleHandleLeave() {
		if (activeSegmentId) return; // drag tooltips take over
		hoveredGroupId = null;
		hoverTooltips = [];
	}

	/**
	 * Whether the given segment belongs to the currently hovered link group.
	 * @param {string|null} groupId
	 * @returns {boolean}
	 */
	function isGroupHovered(groupId) {
		return !!groupId && hoveredGroupId === groupId;
	}

	// ─── Auto-grow (ResizeObserver) ────────────────────────────────────────────

	/**
	 * Recompute the tallest NATURAL (content) height for every link group currently
	 * in the DOM and apply it as an auto-grow override to all members, so when any
	 * member grows (added text/heading/note) the whole group grows to match.
	 */
	function recomputeGroupHeights() {
		recomputeScheduled = false;
		if (activeSegmentId) return; // never fight an in-progress drag

		const scale = getScale() || 1;

		// Bucket grouped segment elements by group id.
		/** @type {Map<string, HTMLElement[]>} */
		const groups = new Map();
		document.querySelectorAll('[data-height-group-id]').forEach((el) => {
			const groupId = el.getAttribute('data-height-group-id');
			if (!groupId) return;
			if (el.classList.contains('compare-hidden')) return;
			if (!groups.has(groupId)) groups.set(groupId, []);
			groups.get(groupId)?.push(/** @type {HTMLElement} */ (el));
		});

		// Measuring natural height clears/restores min-height; guard the observer so
		// the layout changes we cause don't trigger an immediate re-entrant recompute.
		suppressObserver = true;

		/** @type {Record<string, number>} */
		const next = { ...groupSyncHeights };
		let changed = false;

		for (const [, els] of groups) {
			let tallest = 0;
			for (const el of els) {
				const prevMinHeight = el.style.minHeight;
				el.style.minHeight = '0px';
				const naturalRendered = el.getBoundingClientRect().height;
				el.style.minHeight = prevMinHeight;
				const natural = naturalRendered / scale;
				if (natural > tallest) tallest = natural;
			}
			const rounded = Math.round(tallest);
			for (const el of els) {
				const id = el.getAttribute('data-segment-id');
				if (!id) continue;
				if (next[id] !== rounded) {
					next[id] = rounded;
					changed = true;
				}
			}
		}

		// Drop overrides for segments no longer grouped.
		for (const id of Object.keys(next)) {
			if (!document.querySelector(`[data-height-group-id][data-segment-id="${id}"]`)) {
				delete next[id];
				changed = true;
			}
		}

		if (changed) groupSyncHeights = next;

		// Release the observer guard after styles settle.
		requestAnimationFrame(() => {
			suppressObserver = false;
		});
	}

	/** Debounced schedule of a group-height recompute. */
	function scheduleRecompute() {
		if (recomputeScheduled || suppressObserver || activeSegmentId) return;
		recomputeScheduled = true;
		requestAnimationFrame(recomputeGroupHeights);
	}

	/**
	 * Start observing linked segments for content-size changes (use inside an $effect
	 * that re-runs when the set of grouped segments changes). Returns a cleanup fn.
	 * @returns {(() => void)|void}
	 */
	function observeGroups() {
		if (typeof ResizeObserver === 'undefined') return;
		const grouped = document.querySelectorAll('[data-height-group-id]');
		if (grouped.length === 0) {
			// Nothing linked: clear any stale overrides.
			if (Object.keys(groupSyncHeights).length > 0) groupSyncHeights = {};
			return;
		}
		groupObserver = new ResizeObserver(() => {
			if (suppressObserver || activeSegmentId) return;
			scheduleRecompute();
		});
		grouped.forEach((el) => groupObserver?.observe(el));
		// Initial pass to seed heights.
		scheduleRecompute();
		return () => {
			groupObserver?.disconnect();
			groupObserver = null;
		};
	}

	/**
	 * Get the live (in-progress drag) height override for a segment, or null.
	 * @param {string} segmentId
	 * @returns {number|null}
	 */
	function getLiveHeight(segmentId) {
		return liveHeights[segmentId] ?? null;
	}

	/**
	 * Get the effective rendered height for a segment, merging (in priority order):
	 * live drag override → auto-grow group sync → persisted height. Returns null when
	 * the segment should use its natural/flexible height.
	 * @param {string} segmentId
	 * @param {number|null} persistedHeight
	 * @returns {number|null}
	 */
	function getEffectiveHeight(segmentId, persistedHeight) {
		const live = liveHeights[segmentId];
		if (live != null) return live;
		const sync = groupSyncHeights[segmentId];
		if (sync != null) {
			// Honor the larger of the synced (tallest natural) and persisted heights.
			return persistedHeight != null ? Math.max(sync, persistedHeight) : sync;
		}
		return persistedHeight ?? null;
	}

	return {
		handleResizeStart,
		setupResizeListeners,
		getLiveHeight,
		getEffectiveHeight,
		handleHandleEnter,
		handleHandleLeave,
		isGroupHovered,
		observeGroups,
		get activeSegmentId() {
			return activeSegmentId;
		},
		get activeGroupIds() {
			return activeGroupIds;
		},
		get hoveredGroupId() {
			return hoveredGroupId;
		},
		get guideLine() {
			return guideLine;
		},
		get dragTooltips() {
			return dragTooltips;
		},
		get hoverTooltips() {
			return hoverTooltips;
		}
	};
}
