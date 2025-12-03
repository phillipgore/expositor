/**
 * Composable for detecting drag vs click interactions
 * Helps differentiate between text selection (drag) and word selection (click)
 */

const DRAG_THRESHOLD = 3; // pixels

/**
 * Create drag detection state and handlers
 * @returns {Object} Drag detection state and handlers
 */
export function useDragDetection() {
	let dragStartPos = $state(null); // { x, y }
	let isDragging = $state(false);

	/**
	 * Handle mouse down - track position for drag detection
	 * @param {MouseEvent} event
	 */
	function handleMouseDown(event) {
		// Only track for left-click
		if (event.button === 0) {
			dragStartPos = { x: event.clientX, y: event.clientY };
			isDragging = false;
		}
	}

	/**
	 * Handle mouse move - detect if user is dragging
	 * @param {MouseEvent} event
	 */
	function handleMouseMove(event) {
		if (dragStartPos) {
			// Calculate distance moved from drag start position
			const distance = Math.sqrt(
				Math.pow(event.clientX - dragStartPos.x, 2) + 
				Math.pow(event.clientY - dragStartPos.y, 2)
			);
			// If moved more than threshold, consider it a drag
			if (distance > DRAG_THRESHOLD) {
				isDragging = true;
			}
		}
	}

	/**
	 * Reset drag state
	 */
	function resetDragState() {
		dragStartPos = null;
		isDragging = false;
	}

	return {
		// State
		get isDragging() { return isDragging; },
		get dragStartPos() { return dragStartPos; },
		
		// Handlers
		handleMouseDown,
		handleMouseMove,
		resetDragState
	};
}
