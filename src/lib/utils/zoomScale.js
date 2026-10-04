/**
 * Zoom-scale measurement helpers for the Analyze view.
 *
 * The Analyze content is zoomed with a CSS `transform: scale(...)` on
 * `.analyze-content-inner`, animated by a short CSS transition. The page's
 * reactive `currentScale` jumps to the TARGET zoom instantly, but for the
 * duration of the transition the element is still painted at an intermediate
 * scale. Any measurement that divides a client-rect size (getBoundingClientRect)
 * by the target scale is therefore wrong mid-transition — which is what made
 * segment heights, column widths and column spacing drift after a zoom change.
 *
 * getRenderedScale() returns the scale that is ACTUALLY painted right now, by
 * comparing the inner's visual width with its (transform-independent) layout
 * width. It is correct before, during and after the transition.
 */

/**
 * Measure the zoom scale currently painted on `.analyze-content-inner`.
 * @param {number} [fallback=1] - Returned when the element is missing or unmeasurable.
 * @param {HTMLElement|null} [el] - Optional explicit element (defaults to the first `.analyze-content-inner`).
 * @returns {number}
 */
export function getRenderedScale(fallback = 1, el = null) {
	if (typeof document === 'undefined') return fallback || 1;
	const inner = el ?? /** @type {HTMLElement|null} */ (document.querySelector('.analyze-content-inner'));
	if (!inner) return fallback || 1;
	const layoutWidth = inner.offsetWidth;
	if (!layoutWidth) return fallback || 1;
	const visualWidth = inner.getBoundingClientRect().width;
	const scale = visualWidth / layoutWidth;
	return Number.isFinite(scale) && scale > 0 ? scale : fallback || 1;
}
