/**
 * Drag and Drop Composable
 * 
 * Manages drag-and-drop state and logic for moving studies between groups.
 * Includes auto-scrolling, drop zone detection, and API integration.
 * 
 * @param {Function} invalidateCallback - Callback to reload data after moves
 * @returns {Object} Drag and drop state and functions
 */

export function useDragAndDrop(invalidateCallback) {
	let isDragging = $state(false);
	let draggedStudies = $state([]);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let currentMouseX = $state(0);
	let currentMouseY = $state(0);
	let dropTargetGroupId = $state(null);
	const DRAG_THRESHOLD = 5; // pixels to move before initiating drag
	
	// Auto-scroll state
	let autoScrollAnimationId = null;
	let autoScrollSpeed = $state(0);
	let autoScrollDirection = $state(0);
	const AUTO_SCROLL_EDGE_SIZE = 50; // pixels from edge to trigger auto-scroll
	const AUTO_SCROLL_MAX_SPEED = 20; // max pixels per frame

	/**
	 * Handle mousedown on a study item
	 */
	function handleStudyMouseDown(event, study, isStudySelected, getSelectedStudiesCallback) {
		// Only handle left click
		if (event.button !== 0) return;
		
		// Prevent browser's default drag behavior
		event.preventDefault();
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		
		// Prepare drag list based on selection
		if (isStudySelected) {
			// Get all selected studies for dragging
			draggedStudies = getSelectedStudiesCallback();
		} else {
			// Only drag this study
			draggedStudies = [study];
		}
		
		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle document mousemove - check if drag threshold exceeded
	 */
	function handleDocumentMouseMove(event) {
		if (draggedStudies.length === 0) return;
		
		currentMouseX = event.clientX;
		currentMouseY = event.clientY;
		
		// Check if we've moved beyond threshold
		const deltaX = Math.abs(currentMouseX - dragStartX);
		const deltaY = Math.abs(currentMouseY - dragStartY);
		
		if (!isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
			isDragging = true;
		}
		
		// Update drop target if dragging
		if (isDragging) {
			updateDropTarget(event);
			handleAutoScroll(event);
		}
	}

	/**
	 * Update which group is the current drop target
	 */
	function updateDropTarget(event) {
		const groupSections = document.querySelectorAll('.group-section[data-group-id]');
		let newDropTarget = null;
		
		for (const section of groupSections) {
			const rect = section.getBoundingClientRect();
			if (
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom
			) {
				newDropTarget = section.getAttribute('data-group-id');
				break;
			}
		}
		
		dropTargetGroupId = newDropTarget;
	}

	/**
	 * Handle auto-scrolling when dragging near edges
	 */
	function handleAutoScroll(event) {
		const scrollable = document.querySelector('.panel-scrollable');
		const header = document.querySelector('.panel-header');
		if (!scrollable) return;
		
		const scrollableRect = scrollable.getBoundingClientRect();
		const mouseY = event.clientY;
		
		// Check if mouse is within the panel horizontally
		if (event.clientX < scrollableRect.left || event.clientX > scrollableRect.right) {
			stopAutoScroll();
			return;
		}
		
		// Check if cursor is in the header area - if so, scroll up
		if (header) {
			const headerRect = header.getBoundingClientRect();
			if (
				event.clientX >= headerRect.left &&
				event.clientX <= headerRect.right &&
				mouseY >= headerRect.top &&
				mouseY <= headerRect.bottom
			) {
				// Cursor is in header - scroll up at moderate speed
				autoScrollDirection = -1;
				autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * 0.7;
				startAutoScroll(scrollable);
				return;
			}
		}
		
		// Calculate distance from top and bottom edges
		const distanceFromTop = mouseY - scrollableRect.top;
		const distanceFromBottom = scrollableRect.bottom - mouseY;
		
		let shouldScroll = false;
		
		if (distanceFromTop < AUTO_SCROLL_EDGE_SIZE && distanceFromTop >= 0) {
			// Near top edge - scroll up
			shouldScroll = true;
			autoScrollDirection = -1;
			autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * (1 - distanceFromTop / AUTO_SCROLL_EDGE_SIZE);
		} else if (distanceFromBottom < AUTO_SCROLL_EDGE_SIZE && distanceFromBottom >= 0) {
			// Near bottom edge - scroll down
			shouldScroll = true;
			autoScrollDirection = 1;
			autoScrollSpeed = AUTO_SCROLL_MAX_SPEED * (1 - distanceFromBottom / AUTO_SCROLL_EDGE_SIZE);
		}
		
		if (shouldScroll) {
			startAutoScroll(scrollable);
		} else {
			stopAutoScroll();
		}
	}

	/**
	 * Start auto-scroll animation
	 */
	function startAutoScroll(scrollable) {
		if (autoScrollAnimationId !== null) return;
		
		function scroll() {
			const currentScroll = scrollable.scrollTop;
			const maxScroll = scrollable.scrollHeight - scrollable.clientHeight;
			
			const newScroll = currentScroll + (autoScrollDirection * autoScrollSpeed);
			
			if (newScroll < 0) {
				scrollable.scrollTop = 0;
			} else if (newScroll > maxScroll) {
				scrollable.scrollTop = maxScroll;
			} else {
				scrollable.scrollTop = newScroll;
			}
			
			autoScrollAnimationId = requestAnimationFrame(scroll);
		}
		
		autoScrollAnimationId = requestAnimationFrame(scroll);
	}

	/**
	 * Stop auto-scroll animation
	 */
	function stopAutoScroll() {
		if (autoScrollAnimationId !== null) {
			cancelAnimationFrame(autoScrollAnimationId);
			autoScrollAnimationId = null;
		}
		autoScrollSpeed = 0;
		autoScrollDirection = 0;
	}

	/**
	 * Handle document mouseup - finalize drop
	 */
	async function handleDocumentMouseUp(event, clearSelectionCallback) {
		stopAutoScroll();
		
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (draggedStudies.length === 0) return;
		
		if (isDragging) {
			event.preventDefault();
			
			if (dropTargetGroupId !== null) {
				// Dropped on a group
				await moveStudiesToGroup(draggedStudies.map(s => s.id), dropTargetGroupId);
			} else {
				// Check if dropped within panel
				const panel = document.querySelector('.studies-panel');
				if (panel) {
					const rect = panel.getBoundingClientRect();
					const isInPanel = 
						event.clientX >= rect.left &&
						event.clientX <= rect.right &&
						event.clientY >= rect.top &&
						event.clientY <= rect.bottom;
					
					if (isInPanel) {
						// Ungroup the studies
						await moveStudiesToGroup(draggedStudies.map(s => s.id), null);
					}
				}
			}
			
			// Clear selection after drop
			if (clearSelectionCallback) {
				clearSelectionCallback();
			}
		}
		
		// Reset drag state
		isDragging = false;
		draggedStudies = [];
		dropTargetGroupId = null;
		dragStartX = 0;
		dragStartY = 0;
		currentMouseX = 0;
		currentMouseY = 0;
	}

	/**
	 * Move multiple studies to a different group
	 */
	async function moveStudiesToGroup(studyIds, groupId) {
		try {
			const targetGroupId = groupId === 'ungrouped' ? null : groupId;
			
			await Promise.all(
				studyIds.map(studyId =>
					fetch(`/api/studies/${studyId}`, {
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ groupId: targetGroupId })
					})
				)
			);

			// Reload data
			if (invalidateCallback) {
				await invalidateCallback();
			}
		} catch (error) {
			console.error('Error moving studies:', error);
		}
	}

	/**
	 * Check if a specific study is being dragged
	 */
	function isStudyBeingDragged(studyId) {
		return isDragging && draggedStudies.some(s => s.id === studyId);
	}

	return {
		// State
		get isDragging() { return isDragging; },
		get draggedStudies() { return draggedStudies; },
		get currentMouseX() { return currentMouseX; },
		get currentMouseY() { return currentMouseY; },
		get dropTargetGroupId() { return dropTargetGroupId; },
		
		// Functions
		handleStudyMouseDown,
		handleDocumentMouseUp,
		isStudyBeingDragged
	};
}
