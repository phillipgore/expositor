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
	let draggedGroups = $state([]);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let currentMouseX = $state(0);
	let currentMouseY = $state(0);
	let dropTargetGroupId = $state(null);
	const DRAG_THRESHOLD = 5; // pixels to move before initiating drag
	
	// Focus management
	let focusedElementBeforeDrag = null;
	
	// Auto-scroll state
	let autoScrollAnimationId = null;
	let autoScrollSpeed = $state(0);
	let autoScrollDirection = $state(0);
	const AUTO_SCROLL_EDGE_SIZE = 50; // pixels from edge to trigger auto-scroll
	const AUTO_SCROLL_MAX_SPEED = 20; // max pixels per frame

	/**
	 * Check if groupA is an ancestor of groupB
	 */
	function isAncestor(groupAId, groupBId, allGroups) {
		let currentId = groupBId;
		while (currentId) {
			const current = allGroups.find(g => g.id === currentId);
			if (!current) break;
			if (current.parentGroupId === groupAId) return true;
			currentId = current.parentGroupId;
		}
		return false;
	}

	/**
	 * Remove child groups when parent is in selection
	 */
	function removeRedundantChildren(groups, allGroups) {
		return groups.filter(group => {
			// Check if any other selected group is an ancestor
			return !groups.some(otherGroup => 
				otherGroup.id !== group.id && 
				isAncestor(otherGroup.id, group.id, allGroups)
			);
		});
	}

	/**
	 * Handle mousedown on a study item
	 */
	function handleStudyMouseDown(event, study, isStudySelected, getSelectedStudiesCallback) {
		// Only handle left click
		if (event.button !== 0) return;
		
		// Prevent browser's default drag behavior
		event.preventDefault();
		
		// Store currently focused element before drag starts
		focusedElementBeforeDrag = document.activeElement;
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		
		// Clear any group drags
		draggedGroups = [];
		
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
	 * Handle mousedown on a group item
	 */
	function handleGroupMouseDown(event, group, isGroupSelected, getSelectedItemsCallback, allGroups) {
		// Only handle left click
		if (event.button !== 0) return;
		
		// Prevent browser's default drag behavior
		event.preventDefault();
		
		// Store currently focused element before drag starts
		focusedElementBeforeDrag = document.activeElement;
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		
		// Prepare drag list based on selection
		if (isGroupSelected) {
			const selectedItems = getSelectedItemsCallback();
			draggedGroups = selectedItems.filter(i => i.type === 'group').map(i => i.data);
			draggedStudies = selectedItems.filter(i => i.type === 'study').map(i => i.data);
			
			// Remove child groups if parent is selected
			draggedGroups = removeRedundantChildren(draggedGroups, allGroups);
		} else {
			draggedGroups = [group];
			draggedStudies = [];
		}
		
		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle document mousemove - check if drag threshold exceeded
	 */
	function handleDocumentMouseMove(event) {
		if (draggedStudies.length === 0 && draggedGroups.length === 0) return;
		
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
		// Get the topmost element at cursor position
		const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
		
		if (!elementAtPoint) {
			dropTargetGroupId = null;
			return;
		}
		
		// Find the closest group-section ancestor
		const groupSection = elementAtPoint.closest('.group-section[data-group-id]');
		
		if (groupSection) {
			dropTargetGroupId = groupSection.getAttribute('data-group-id');
		} else {
			dropTargetGroupId = null;
		}
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
	 * Check if moving groups would create circular nesting (client-side check)
	 */
	async function wouldCreateCircularNesting(groupIds, targetGroupId) {
		// Check if any dragged group is an ancestor of target
		for (const groupId of groupIds) {
			if (groupId === targetGroupId) return true;
			
			// Check via API
			try {
				const response = await fetch(`/api/groups/${groupId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ checkCircular: targetGroupId })
				});
				if (!response.ok) return true;
			} catch (error) {
				console.error('Error checking circular nesting:', error);
				return true; // Err on the side of caution
			}
		}
		return false;
	}

	/**
	 * Move multiple groups to a parent group
	 */
	async function moveGroupsToParent(groupIds, parentGroupId) {
		try {
			await Promise.all(
				groupIds.map(groupId =>
					fetch(`/api/groups/${groupId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ parentGroupId })
					})
				)
			);

			// Reload data
			if (invalidateCallback) {
				await invalidateCallback();
			}
		} catch (error) {
			console.error('Error moving groups:', error);
			alert('Failed to move groups. They may create circular nesting.');
		}
	}

	/**
	 * Handle document mouseup - finalize drop
	 */
	async function handleDocumentMouseUp(event, clearSelectionCallback) {
		stopAutoScroll();
		
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (draggedStudies.length === 0 && draggedGroups.length === 0) return;
		
		if (isDragging) {
			event.preventDefault();
			
			// Handle group drops
			if (draggedGroups.length > 0 && dropTargetGroupId !== null) {
				// Check if any dragged group is the target (can't drop on self)
				const droppingOnSelf = draggedGroups.some(g => g.id === dropTargetGroupId);
				
				if (!droppingOnSelf) {
					// The API will validate circular nesting
					await moveGroupsToParent(draggedGroups.map(g => g.id), dropTargetGroupId);
				}
			} else if (draggedGroups.length > 0) {
				// Dropped outside - ungroup (set parentGroupId to null)
				const panel = document.querySelector('.studies-panel');
				if (panel) {
					const rect = panel.getBoundingClientRect();
					const isInPanel = 
						event.clientX >= rect.left &&
						event.clientX <= rect.right &&
						event.clientY >= rect.top &&
						event.clientY <= rect.bottom;
					
					if (isInPanel) {
						await moveGroupsToParent(draggedGroups.map(g => g.id), null);
					}
				}
			}
			
			// Handle study drops
			if (draggedStudies.length > 0 && dropTargetGroupId !== null) {
				await moveStudiesToGroup(draggedStudies.map(s => s.id), dropTargetGroupId);
			} else if (draggedStudies.length > 0) {
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
			
			// Restore focus to the element that had it before drag
			if (focusedElementBeforeDrag && document.body.contains(focusedElementBeforeDrag)) {
				// Small delay to allow DOM updates
				setTimeout(() => {
					if (focusedElementBeforeDrag && typeof focusedElementBeforeDrag.focus === 'function') {
						focusedElementBeforeDrag.focus();
					}
				}, 50);
			}
		}
		
		// Reset drag state
		isDragging = false;
		draggedStudies = [];
		draggedGroups = [];
		dropTargetGroupId = null;
		dragStartX = 0;
		dragStartY = 0;
		currentMouseX = 0;
		currentMouseY = 0;
		focusedElementBeforeDrag = null;
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
		get draggedGroups() { return draggedGroups; },
		get currentMouseX() { return currentMouseX; },
		get currentMouseY() { return currentMouseY; },
		get dropTargetGroupId() { return dropTargetGroupId; },
		
		// Functions
		handleStudyMouseDown,
		handleGroupMouseDown,
		handleDocumentMouseUp,
		isStudyBeingDragged
	};
}
