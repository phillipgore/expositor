import { writable } from 'svelte/store';

/**
 * # Tooltip Store
 * 
 * Global state management for tooltip system.
 * Manages tooltip visibility, content, and positioning.
 */

const tooltipState = writable({
	isVisible: false,
	content: '',
	targetElement: null,
	placement: 'auto',
	offset: 8,
	allowHtml: false
});

/**
 * Show tooltip with specified options
 * @param {Object} options - Tooltip options
 * @param {string} options.content - Tooltip content text
 * @param {HTMLElement} options.targetElement - Element to anchor tooltip to
 * @param {string} [options.placement='auto'] - Preferred placement (top, bottom, left, right, auto)
 * @param {number} [options.offset=8] - Distance from target element in pixels
 * @param {boolean} [options.allowHtml=false] - Allow HTML in content
 */
export function show({ content, targetElement, placement = 'auto', offset = 8, allowHtml = false }) {
	tooltipState.set({
		isVisible: true,
		content,
		targetElement,
		placement,
		offset,
		allowHtml
	});
}

/**
 * Hide tooltip
 */
export function hide() {
	tooltipState.update(state => ({ ...state, isVisible: false }));
}

/**
 * Export the store itself for component subscriptions
 */
export default tooltipState;
