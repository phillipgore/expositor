/**
 * Panel Resize Composable
 * 
 * Manages resizing of a panel with mouse drag, localStorage persistence,
 * and server synchronization.
 */

/**
 * Create a panel resize manager
 * 
 * @param {number} initialWidth - Initial width of the panel
 * @param {string} storageKey - localStorage key for persisting width
 * @param {string} apiEndpoint - API endpoint for server sync
 * @param {Function} isOpen - Function that returns whether panel is open
 * @param {string} apiPropertyName - Property name to use in API request (optional, defaults to storageKey)
 * @param {string} side - Which side of the screen the panel is on: 'left' or 'right' (default: 'left')
 * @param {number} minWidth - Minimum width in pixels (default: 300)
 * @returns {Object} Resize state and handlers
 */
export function usePanelResize(initialWidth, storageKey, apiEndpoint, isOpen, apiPropertyName = null, side = 'left', minWidth = 300) {
	// Use apiPropertyName if provided, otherwise default to storageKey
	const propertyName = apiPropertyName || storageKey;
	
	// Panel width state (initialized from localStorage or initial value)
	const savedWidth = typeof window !== 'undefined' 
		? localStorage.getItem(storageKey)
		: null;
	let panelWidth = $state(savedWidth ? parseInt(savedWidth) : initialWidth);
	
	// Resize state
	let isResizing = $state(false);
	let startX = 0;
	let startWidth = 0;

	/**
	 * Handle resize start
	 */
	function handleResizeStart(event) {
		if (!isOpen()) return;
		event.preventDefault();
		isResizing = true;
		startX = event.clientX;
		startWidth = panelWidth;
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';
	}

	/**
	 * Handle resize move
	 */
	function handleResizeMove(event) {
		if (!isResizing) return;
		const delta = event.clientX - startX;
		// For right-side panels, invert the delta (drag left = grow, drag right = shrink)
		const newWidth = side === 'right' ? startWidth - delta : startWidth + delta;
		// Min: configurable, Max: 600px or 50% viewport
		panelWidth = Math.max(minWidth, Math.min(600, Math.min(newWidth, window.innerWidth * 0.5)));
	}

	/**
	 * Handle resize end
	 */
	async function handleResizeEnd() {
		if (!isResizing) return;
		isResizing = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
		
		// Save to localStorage immediately
		localStorage.setItem(storageKey, panelWidth.toString());
		
		// Save to database (background)
		try {
			await fetch(apiEndpoint, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [propertyName]: panelWidth })
			});
		} catch (error) {
			console.error('Failed to save panel width:', error);
		}
	}

	/**
	 * Setup global resize listeners (to be used in $effect)
	 */
	function setupResizeListeners() {
		if (isResizing) {
			window.addEventListener('mousemove', handleResizeMove);
			window.addEventListener('mouseup', handleResizeEnd);
			return () => {
				window.removeEventListener('mousemove', handleResizeMove);
				window.removeEventListener('mouseup', handleResizeEnd);
			};
		}
	}

	/**
	 * Get current panel width
	 */
	function getWidth() {
		return panelWidth;
	}

	/**
	 * Check if currently resizing
	 */
	function getIsResizing() {
		return isResizing;
	}

	/**
	 * Adjust width by a specific amount (for keyboard resize)
	 */
	async function adjustWidth(delta) {
		const newWidth = panelWidth + delta;
		// Min: configurable, Max: 600px or 50% viewport
		panelWidth = Math.max(minWidth, Math.min(600, Math.min(newWidth, window.innerWidth * 0.5)));
		
		// Save to localStorage immediately
		localStorage.setItem(storageKey, panelWidth.toString());
		
		// Save to database (background)
		try {
			await fetch(apiEndpoint, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [propertyName]: panelWidth })
			});
		} catch (error) {
			console.error('Failed to save panel width:', error);
		}
	}

	return {
		getWidth,
		getIsResizing,
		handleResizeStart,
		setupResizeListeners,
		adjustWidth
	};
}
