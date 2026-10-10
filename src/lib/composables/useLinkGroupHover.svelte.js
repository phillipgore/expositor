import { getGroupId } from '$lib/utils/linkGroups.js';

/**
 * Link Group Hover Composable
 *
 * Linked-hover feedback for the layout drag handles (column spacing, column width,
 * section spacing) — the counterpart of useSegmentResize's handleHandleEnter /
 * handleHandleLeave / isGroupHovered for linked segment heights.
 *
 * Hovering one linked item's handle reveals EVERY member's handle (the page adds a
 * `link-hovered` class via `isGroupHovered`) and shows a "Linked" tooltip on each
 * member's handle. Unlinked items get no extra feedback. While a linked item is
 * dragged, the other members keep their badge (showing the live value) and the
 * badges follow their handles.
 *
 * Must be created during component init (it registers an $effect).
 *
 * @param {Object} options
 * @param {import('$lib/utils/linkGroups.js').LinkGroupKind} options.kind - Which link group to read
 * @param {string} options.handleSelector - Selector for the member's own handle, relative to the member element (e.g. ':scope > .column-resize-handle')
 * @param {() => string|null} options.getActiveId - Id of the item currently being dragged with this handle type, or null when idle
 * @param {() => number|null} options.getDragValue - Live value (CSS px) shown on every member's badge during a linked drag
 * @param {() => string|null} [options.getDragLabel] - Optional live label during a linked drag (defaults to "Linked")
 */
export function useLinkGroupHover({ kind, handleSelector, getActiveId, getDragValue, getDragLabel }) {
	/** @type {string|null} */
	let hoveredGroupId = $state(null);

	/** @type {{ id: string, x: number, y: number, label: string, height: number|null }[]} */
	let hoverTooltips = $state([]);

	function clear() {
		hoveredGroupId = null;
		hoverTooltips = [];
	}

	/**
	 * Measure every visible member's handle and build one badge per member.
	 * @param {string} groupId
	 * @param {number|null} height - Live value to show (during a drag), or null for just "Linked"
	 * @param {string} [label='Linked'] - Badge label (during a width drag this may carry a snap factor, e.g. "Linked 1.5×")
	 */
	function buildTips(groupId, height, label = 'Linked') {
		/** @type {{ id: string, x: number, y: number, label: string, height: number|null }[]} */
		const tips = [];
		document.querySelectorAll(`[${kind.groupAttr}="${groupId}"][${kind.idAttr}]`).forEach((el) => {
			if (el.classList.contains('compare-hidden')) return;
			const memberId = el.getAttribute(kind.idAttr);
			if (!memberId) return;
			const handle = el.querySelector(handleSelector);
			if (!handle) return;
			const r = handle.getBoundingClientRect();
			tips.push({ id: memberId, x: r.left + r.width / 2, y: r.top, label, height });
		});
		return tips;
	}

	// While a LINKED item is dragged, keep a badge on EVERY member — including the
	// dragged one — anchored to each member's handle exactly as on hover, and make the
	// badges follow their handles. The page hides the drag composable's own tooltip for
	// linked drags (`isGroupDragging`) because that one is anchored differently (e.g. the
	// column-spacing tooltip sits at the column's vertical centre), which made the
	// dragged item's badge jump away from its handle. The drag
	// composables dispatch `analyze-layout-changed` on every move; re-measure after the
	// DOM has updated (next frame). Mirrors linked segment heights, where every member
	// shows "Linked: [value]px" during a drag.
	$effect(() => {
		const activeId = getActiveId();
		if (!activeId) {
			// Drag ended (or idle): the pointer has usually left the handle and that
			// leave was ignored mid-drag, so drop the hover state.
			clear();
			return;
		}
		const groupId = getGroupId(kind, activeId);
		if (!groupId) {
			clear();
			return;
		}
		hoveredGroupId = groupId;

		let frame = 0;
		const refresh = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				hoverTooltips = buildTips(groupId, getDragValue(), getDragLabel?.() || 'Linked');
			});
		};
		refresh();
		window.addEventListener('analyze-layout-changed', refresh);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('analyze-layout-changed', refresh);
		};
	});

	/**
	 * Pointer entered an item's handle. For a linked item, reveal every member's
	 * handle and show a "Linked" tooltip above each.
	 * @param {string} id
	 */
	function handleEnter(id) {
		if (getActiveId()) return;
		const groupId = getGroupId(kind, id);
		if (!groupId) {
			clear();
			return;
		}
		hoveredGroupId = groupId;
		hoverTooltips = buildTips(groupId, null);
	}

	/** Pointer left an item's handle. Ignored mid-drag (drag tooltips take over). */
	function handleLeave() {
		if (getActiveId()) return;
		clear();
	}

	/**
	 * Whether an item belongs to the currently hovered link group.
	 * @param {string|null|undefined} groupId
	 * @returns {boolean}
	 */
	function isGroupHovered(groupId) {
		return !!groupId && hoveredGroupId === groupId;
	}

	/**
	 * True while a LINKED item of this kind is being dragged. The page uses this to hide
	 * the drag composable's own tooltip, since every member (the dragged one included)
	 * then gets a handle-anchored badge from here.
	 * @returns {boolean}
	 */
	function isGroupDragging() {
		const activeId = getActiveId();
		return !!activeId && !!getGroupId(kind, activeId);
	}

	return {
		handleEnter,
		handleLeave,
		isGroupHovered,
		isGroupDragging,
		get hoverTooltips() {
			return hoverTooltips;
		}
	};
}
