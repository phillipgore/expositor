import * as tooltipStore from '$lib/stores/tooltipStore.svelte.js';

/**
 * # Tooltip Action
 * 
 * Svelte action that adds custom tooltip functionality to any element.
 * Intercepts native `title` attribute and displays custom styled tooltips.
 * 
 * ## Features
 * - Auto-intercepts and removes native title attribute
 * - Configurable delay before showing
 * - Instant hide on mouse leave
 * - Keyboard accessible (shows on focus)
 * - Touch device support
 * - Respects disabled state
 * 
 * ## Usage Examples
 * 
 * Basic (uses title attribute):
 * ```svelte
 * <button title="Click to save" use:tooltip>Save</button>
 * ```
 * 
 * With custom options:
 * ```svelte
 * <button use:tooltip={{ content: "Custom text", placement: "top", delay: 300 }}>
 *   Action
 * </button>
 * ```
 * 
 * With HTML content:
 * ```svelte
 * <button use:tooltip={{ content: "<strong>Bold</strong> text", allowHtml: true }}>
 *   Info
 * </button>
 * ```
 * 
 * @typedef {Object} TooltipOptions
 * @property {string} [content] - Tooltip content (overrides title attribute)
 * @property {string} [placement='auto'] - Preferred placement: top, bottom, left, right, auto
 * @property {number} [delay=1000] - Delay in ms before showing tooltip
 * @property {number} [offset=0] - Distance from target element in pixels
 * @property {boolean} [allowHtml=false] - Allow HTML in tooltip content
 * 
 * @param {HTMLElement} node - Element to attach tooltip to
 * @param {TooltipOptions | string} [options] - Tooltip options or content string
 * @returns {Object} Action object with update and destroy methods
 */
export function tooltip(node, options = {}) {
	// Handle string shorthand: use:tooltip="content"
	if (typeof options === 'string') {
		options = { content: options };
	}

	// Extract and remove native title attribute
	const titleAttr = node.getAttribute('title');
	if (titleAttr) {
		node.removeAttribute('title');
		// Store original title in data attribute for potential restoration
		node.setAttribute('data-original-title', titleAttr);
	}

	// Determine content: explicit content > title attribute
	const content = options.content || titleAttr;
	
	// Don't attach tooltip if no content
	if (!content) {
		console.warn('Tooltip action: No content provided and no title attribute found');
		return { destroy: () => {} };
	}

	// Auto-detect placement for passage toolbar buttons
	const hasPassageToolbarClass = node.classList.contains('passage-toolbar');
	const placement = options.placement || (hasPassageToolbarClass ? 'right' : 'auto');
	const delay = options.delay ?? 1000;
	const offset = options.offset ?? 0;
	const allowHtml = options.allowHtml || false;

	let showTimeoutId;
	let isDisabled = /** @type {any} */ (node).disabled || node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';

	/**
	 * Show tooltip after delay
	 */
	const scheduleShow = () => {
		if (isDisabled) return;
		
		clearTimeout(showTimeoutId);
		showTimeoutId = setTimeout(() => {
			tooltipStore.show({
				content,
				targetElement: node,
				placement,
				offset,
				allowHtml
			});
		}, delay);
	};

	/**
	 * Hide tooltip immediately
	 */
	const hide = () => {
		clearTimeout(showTimeoutId);
		tooltipStore.hide();
	};

	/**
	 * Update disabled state
	 */
	const updateDisabledState = () => {
		isDisabled = /** @type {any} */ (node).disabled || node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';
		if (isDisabled) {
			hide();
		}
	};

	// Mouse events
	node.addEventListener('mouseenter', scheduleShow);
	node.addEventListener('mouseleave', hide);

	// Keyboard events (accessibility)
	node.addEventListener('focus', scheduleShow);
	node.addEventListener('blur', hide);

	// Touch events (mobile)
	node.addEventListener('touchstart', scheduleShow);
	node.addEventListener('touchend', hide);

	// Hide on scroll (better UX)
	const handleScroll = () => hide();
	window.addEventListener('scroll', handleScroll, true);

	// Observe attribute changes to update disabled state
	const observer = new MutationObserver(updateDisabledState);
	observer.observe(node, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });

	return {
		/**
		 * Update tooltip options
		 * @param {TooltipOptions | string} newOptions - New options
		 */
		update(newOptions) {
			if (typeof newOptions === 'string') {
				newOptions = { content: newOptions };
			}
			// Re-initialize with new options
			// For simplicity, just hide current tooltip
			hide();
			// Note: Full re-initialization would require storing/updating all vars
			// This basic implementation just hides the tooltip when options change
		},

		/**
		 * Cleanup on element removal
		 */
		destroy() {
			clearTimeout(showTimeoutId);
			hide();
			
			// Remove event listeners
			node.removeEventListener('mouseenter', scheduleShow);
			node.removeEventListener('mouseleave', hide);
			node.removeEventListener('focus', scheduleShow);
			node.removeEventListener('blur', hide);
			node.removeEventListener('touchstart', scheduleShow);
			node.removeEventListener('touchend', hide);
			window.removeEventListener('scroll', handleScroll, true);
			
			// Disconnect observer
			observer.disconnect();
			
			// Optionally restore original title
			const originalTitle = node.getAttribute('data-original-title');
			if (originalTitle) {
				node.setAttribute('title', originalTitle);
				node.removeAttribute('data-original-title');
			}
		}
	};
}
