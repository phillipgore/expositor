/**
 * Composable for managing zoom and scroll behavior
 * Handles zoom transformations and maintains center point during zoom changes
 */

/**
 * Create zoom control state and handlers
 * @param {Object} options - Configuration options
 * @param {Function} options.getZoomLevel - Function that returns current zoom level (percentage)
 * @param {Function} options.getContentElement - Function that returns the content element ref
 * @returns {Object} Zoom control utilities
 */
export function useZoomControl(options) {
	const { getZoomLevel, getContentElement } = options;
	
	// Track previous zoom level to detect actual changes
	let previousZoomLevel = $state(null);

	/**
	 * Maintain center point when zoom level changes
	 * Should be called in an $effect when zoom level changes
	 */
	function maintainCenterOnZoom() {
		const currentZoomLevel = getZoomLevel();
		const contentInnerRef = getContentElement();
		
		// Only adjust if zoom level actually changed and we have a previous zoom level
		if (currentZoomLevel !== previousZoomLevel && previousZoomLevel !== null) {
			// Get the actual scroll container (.analyze-content)
			const scrollContainer = contentInnerRef?.parentElement?.parentElement;
			if (scrollContainer) {
				// Get current viewport state
				const viewportWidth = scrollContainer.clientWidth;
				const viewportHeight = scrollContainer.clientHeight;
				const scrollLeft = scrollContainer.scrollLeft;
				const scrollTop = scrollContainer.scrollTop;
				
				// Calculate center point in content coordinates (at old scale)
				const centerX = scrollLeft + viewportWidth / 2;
				const centerY = scrollTop + viewportHeight / 2;
				
				// Calculate scale ratio
				const oldScale = previousZoomLevel / 100;
				const newScale = currentZoomLevel / 100;
				const scaleRatio = newScale / oldScale;
				
				// Calculate where the center point is now (at new scale)
				const newCenterX = centerX * scaleRatio;
				const newCenterY = centerY * scaleRatio;
				
				// Set scroll to keep center point centered
				const newScrollLeft = newCenterX - viewportWidth / 2;
				const newScrollTop = newCenterY - viewportHeight / 2;
				
				scrollContainer.scrollTo(newScrollLeft, newScrollTop);
			}
			
			previousZoomLevel = currentZoomLevel;
		} else if (previousZoomLevel === null) {
			// First time initialization - just update the previous zoom level
			previousZoomLevel = currentZoomLevel;
		}
	}

	/**
	 * Reset scroll position to top
	 */
	function resetScrollPosition() {
		const contentInnerRef = getContentElement();
		const scrollContainer = contentInnerRef?.parentElement?.parentElement;
		if (scrollContainer) {
			scrollContainer.scrollTo(0, 0);
		}
	}

	/**
	 * Calculate current scale factor
	 * @returns {number} Current scale (e.g., 1.5 for 150%)
	 */
	function getCurrentScale() {
		return getZoomLevel() / 100;
	}

	/**
	 * Calculate zoom transform CSS value
	 * @returns {string} CSS transform value
	 */
	function getZoomTransform() {
		return `scale(${getCurrentScale()})`;
	}

	/**
	 * Calculate wrapper dimensions for scroll area
	 * @returns {string} CSS dimensions for wrapper
	 */
	function getWrapperDimensions() {
		const contentInnerRef = getContentElement();
		if (!contentInnerRef) return '';
		
		const currentScale = getCurrentScale();
		
		// Get actual content dimensions
		const currentTransform = contentInnerRef.style.transform;
		contentInnerRef.style.transform = 'none';
		const width = contentInnerRef.scrollWidth;
		const height = contentInnerRef.scrollHeight;
		contentInnerRef.style.transform = currentTransform;
		
		if (width === 0 || height === 0) return '';
		
		// Apply scale to dimensions
		const scaledWidth = width * currentScale;
		const scaledHeight = height * currentScale;
		
		return `width: ${scaledWidth}px; height: ${scaledHeight}px;`;
	}

	/**
	 * Determine if header should be visible based on zoom level
	 * @returns {boolean} True if zoom >= 100%
	 */
	function shouldShowHeader() {
		return getZoomLevel() >= 100;
	}

	return {
		// Handlers
		maintainCenterOnZoom,
		resetScrollPosition,
		
		// Utilities
		getCurrentScale,
		getZoomTransform,
		getWrapperDimensions,
		shouldShowHeader
	};
}
