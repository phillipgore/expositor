/**
 * Browser Support Detection Utilities
 * 
 * Provides functions to detect support for modern CSS features
 * including Popover API and CSS Anchor Positioning.
 */

/**
 * Check if browser supports the Popover API
 * @returns {boolean}
 */
export const hasPopoverSupport = () => {
	if (typeof HTMLElement === 'undefined') return false;
	return 'popover' in HTMLElement.prototype;
};

/**
 * Check if browser supports CSS Anchor Positioning
 * @returns {boolean}
 */
export const hasAnchorSupport = () => {
	if (typeof CSS === 'undefined' || !CSS.supports) return false;
	return CSS.supports('anchor-name: --test');
};

/**
 * Check if polyfill is needed
 * @returns {boolean}
 */
export const needsPolyfill = () => {
	return !hasPopoverSupport() || !hasAnchorSupport();
};

/**
 * Get browser support status object
 * @returns {{hasPopover: boolean, hasAnchor: boolean, needsPolyfill: boolean}}
 */
export const getBrowserSupport = () => {
	return {
		hasPopover: hasPopoverSupport(),
		hasAnchor: hasAnchorSupport(),
		needsPolyfill: needsPolyfill()
	};
};
