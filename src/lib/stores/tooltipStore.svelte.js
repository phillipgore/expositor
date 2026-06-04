import { writable, get } from 'svelte/store';

/**
 * # Tooltip Store
 *
 * Global state management for tooltip system.
 * Manages tooltip visibility, content, positioning, and "pinned" state.
 *
 * Pinning: a tooltip can be "pinned" open (e.g. by clicking a glossary badge)
 * so it stays visible — and becomes interactive so its text can be selected and
 * copied — until it is explicitly closed by clicking elsewhere. While a tooltip
 * is pinned, transient hover `show`/`hide` calls are ignored so they don't
 * disturb the pinned content.
 */

const tooltipState = writable({
	isVisible: false,
	content: '',
	targetElement: null,
	placement: 'auto',
	offset: 0,
	allowHtml: false,
	isPinned: false
});

/**
 * Show tooltip with specified options (transient / hover behavior).
 * Ignored while a tooltip is currently pinned.
 * @param {Object} options - Tooltip options
 * @param {string} options.content - Tooltip content text
 * @param {HTMLElement} options.targetElement - Element to anchor tooltip to
 * @param {string} [options.placement='auto'] - Preferred placement (top, bottom, left, right, auto)
 * @param {number} [options.offset=0] - Distance from target element in pixels
 * @param {boolean} [options.allowHtml=false] - Allow HTML in content
 */
export function show({ content, targetElement, placement = 'auto', offset = 0, allowHtml = false }) {
	// Don't let a transient hover override a pinned tooltip.
	if (get(tooltipState).isPinned) return;

	tooltipState.set({
		isVisible: true,
		content,
		targetElement,
		placement,
		offset,
		allowHtml,
		isPinned: false
	});
}

/**
 * Hide tooltip (transient / hover behavior).
 * No-op while a tooltip is pinned — use {@link unpin} to close a pinned tooltip.
 */
export function hide() {
	tooltipState.update((state) => (state.isPinned ? state : { ...state, isVisible: false }));
}

/**
 * Pin a tooltip open. It stays visible and becomes interactive (selectable)
 * until {@link unpin} is called. Same options as {@link show}.
 * @param {Object} options - Tooltip options (see {@link show})
 */
export function pin({ content, targetElement, placement = 'auto', offset = 0, allowHtml = false }) {
	tooltipState.set({
		isVisible: true,
		content,
		targetElement,
		placement,
		offset,
		allowHtml,
		isPinned: true
	});
}

/**
 * Close a pinned tooltip (and hide it).
 */
export function unpin() {
	tooltipState.update((state) => ({ ...state, isVisible: false, isPinned: false }));
}

/**
 * Export the store itself for component subscriptions
 */
export default tooltipState;
