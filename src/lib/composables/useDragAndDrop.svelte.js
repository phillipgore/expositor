/**
 * Drag and Drop Composable
 * 
 * Manages drag-and-drop state and logic for moving studies between groups.
 * Includes auto-scrolling, drop zone detection, and API integration.
 *
 * ## Dropping a study on a series (SERIES_PLAN Q17, phase 3)
 *
 * A series row is a drop target as well as a group row, but it is NOT handled here: the drop only
 * *proposes* the add, via `onDropOnSeries`. §4's invariant table makes a gap, an overlap or a
 * different book WARN rather than refuse, and a warning has to be read before it is accepted — so the
 * gesture opens the confirm dialog, which dry-runs through the same planner that performs the add.
 * Writing straight from the mouseup would ship those warnings silently, which is the one thing §4
 * asks this feature not to do.
 *
 * @param {Function} invalidateCallback - Callback to reload data after moves
 * @param {Function} [onDropOnSeries] - Called with (study, seriesId) when a standalone study is
 *   dropped on a series row. Proposes the add; it does not perform it.
 * @returns {Object} Drag and drop state and functions
 */

export function useDragAndDrop(invalidateCallback, onDropOnSeries = null) {
	let isDragging = $state(false);
	let draggedStudies = $state([]);
	let draggedGroups = $state([]);
	/**
	 * Series being dragged — filing a SERIES into a group (§4: a series occupies one Finder slot
	 * the way a study does, and `studySeries.groupId` is the column that records where).
	 *
	 * Its own array rather than a flag on `draggedStudies`, because the two take different
	 * endpoints (`/api/series/[id]` vs `/api/studies/[id]`) and mean different things on an
	 * ungrouping drop. Conflating them is how a series ends up PATCHed as a study, which would
	 * silently do nothing: that handler does not know the id.
	 *
	 * ⚠️ A series PART is never in here — parts are not draggable at all. See
	 * `handleStudyMouseDown`.
	 */
	let draggedSeries = $state([]);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let currentMouseX = $state(0);
	let currentMouseY = $state(0);
	let dropTargetGroupId = $state(null);
	let dropTargetSeriesId = $state(null);
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

		// ⚠️ BEFORE the part guard below, not after it.
		//
		// This suppresses the browser's native drag AND, as a side effect, the focus a mousedown
		// would otherwise give the button — which is the only reason a clicked study does not draw
		// `.study-item:focus`'s outline. Returning early for a part therefore skipped it, and parts
		// alone grew a blue outline on click that no other Finder row has. (`StudySeries` documents
		// the same coupling on its own row for the same reason.)
		//
		// Keyboard focus is unaffected: preventDefault suppresses only the pointer's focus, so
		// Tab still focuses the row and still shows the outline — which is the one case where it
		// is the only indication of where you are.
		event.preventDefault();

		// ⚠️ A SERIES PART IS NOT DRAGGABLE. Refused here, at the source, rather than by dropping
		// the mousedown wire at the one call site that renders parts — because a part reaches this
		// function two ways: directly from `StudySeries`, and as a member of a MULTI-SELECTION
		// dragged by its selected sibling. A guard at the call site would only close the first.
		//
		// Why it must not move: a part's place is `study.seriesOrder`, and that order is the
		// series (§4 — "a flat ordered sequence", re-derived from nothing). Dropping a part into a
		// group would have to answer what the series does about the hole, and §4 already answers
		// it for deletion — a series that drops to one part DISSOLVES — so the drop is not a
		// placement change at all; it is a membership change wearing a placement gesture.
		//
		// The operations that legitimately remove a part all exist and all state their
		// consequences first: Delete Part (`describePartDeletion`), Join Parts, and re-editing the
		// study's extent through the review page. A silent drag is the one route that would not.
		if (study?.seriesId) {
			return;
		}

		// Store currently focused element before drag starts
		focusedElementBeforeDrag = document.activeElement;
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		
		// Clear any group or series drags
		draggedGroups = [];
		draggedSeries = [];
		
		// Prepare drag list based on selection
		if (isStudySelected) {
			// Parts filtered OUT of the selection, not merely refused as the grab handle. A user
			// may select a standalone study and a part together — nothing stops that — and
			// dragging by the standalone one would otherwise carry the part along into a group,
			// which is the exact move the guard above refuses when the part is grabbed directly.
			// The rest of the selection still moves; only the parts stay put.
			draggedStudies = getSelectedStudiesCallback().filter((s) => !s?.seriesId);
		} else {
			// Only drag this study
			draggedStudies = [study];
		}

		// Every candidate may have just been filtered away, leaving a drag of nothing that would
		// still register listeners and still draw a ghost from `draggedStudies[0]` — undefined.
		if (draggedStudies.length === 0) return;

		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle mousedown on a series row.
	 *
	 * A series is FILED like a study: §4 gives it one Finder slot of its own and
	 * `studySeries.groupId` records which group holds it. The "Move to…" menu command could
	 * already do this; the drag gesture could not, so the two disagreed about whether a series was
	 * a movable thing.
	 *
	 * ⚠️ Single-series drags only, and never mixed with a study or group selection. A series drop
	 * PATCHes `/api/series/[id]`, a study drop PATCHes `/api/studies/[id]`, and a mixed drag would
	 * have to fan out to both — the multi-select path for studies exists because they share one
	 * endpoint and one meaning. Dragging a selected series takes just that series rather than
	 * silently moving its neighbours through the wrong handler.
	 */
	function handleSeriesMouseDown(event, series) {
		if (event.button !== 0) return;

		event.preventDefault();

		focusedElementBeforeDrag = document.activeElement;

		dragStartX = event.clientX;
		dragStartY = event.clientY;

		draggedStudies = [];
		draggedGroups = [];
		draggedSeries = [series];

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
		if (draggedStudies.length === 0 && draggedGroups.length === 0 && draggedSeries.length === 0)
			return;
		
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
			dropTargetSeriesId = null;
			return;
		}
		
		// A series row is a drop target only for a gesture that could legally be an "add to series":
		// exactly one study, not already a part, and no groups in the drag. Highlighting a target that
		// would refuse on mouseup is the dead-affordance §11 forbids for the reorder handle, and the
		// same reasoning applies to a drop zone.
		const seriesSection = canProposeSeriesAdd()
			? elementAtPoint.closest('.series-section[data-series-id]')
			: null;
		dropTargetSeriesId = seriesSection?.getAttribute('data-series-id') ?? null;

		// Find the closest group-section ancestor. Suppressed while over a series so a series filed
		// inside a group does not light up both rows and leave the user guessing which one takes the drop.
		const groupSection = dropTargetSeriesId
			? null
			: elementAtPoint.closest('.group-section[data-group-id]');
		
		if (groupSection) {
			dropTargetGroupId = groupSection.getAttribute('data-group-id');
		} else {
			dropTargetGroupId = null;
		}
	}

	/**
	 * Whether the current drag could become an "add to series".
	 *
	 * Mirrors the menu command's own conditions (Q17): a study already in a series would have to answer
	 * what happens to the series it leaves — §4 dissolves a series that drops to one part — which the
	 * endpoint deliberately does not do. Multi-select is excluded because the endpoint takes one
	 * `studyId`, so a three-study drop would silently add one.
	 */
	function canProposeSeriesAdd() {
		return (
			draggedGroups.length === 0 &&
			// A SERIES is not added to a series — §4 forbids nesting (Q14), so a series row being
			// dragged must not light up other series rows as targets on the way past.
			draggedSeries.length === 0 &&
			draggedStudies.length === 1 &&
			!draggedStudies[0]?.seriesId
		);
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
	 * Was the drop inside the Finder panel at all?
	 *
	 * A drop on empty panel space means "file this at the top level"; a drop outside the panel
	 * means nothing happened and must leave placement alone — otherwise releasing over the study
	 * canvas silently ungroups whatever was being dragged.
	 *
	 * Extracted because the group and study branches below each inlined this, and the series
	 * branch would have made three copies of one rectangle test.
	 */
	function isWithinPanel(event) {
		const panel = document.querySelector('.studies-panel');
		if (!panel) return false;
		const rect = panel.getBoundingClientRect();
		return (
			event.clientX >= rect.left &&
			event.clientX <= rect.right &&
			event.clientY >= rect.top &&
			event.clientY <= rect.bottom
		);
	}

	/**
	 * Move a series into a group, or to the top level with a null.
	 *
	 * ⚠️ `/api/series/[id]`, NOT `/api/studies/[id]`. A series id means nothing to the study
	 * handler, which would find no row and report success — a move that silently does nothing,
	 * which is the failure this gesture existed to fix in the "Move to…" command (see that
	 * handler's `groupId` branch). The endpoint validates that the destination group belongs to
	 * this user.
	 */
	async function moveSeriesToGroup(seriesId, groupId) {
		try {
			const targetGroupId = groupId === 'ungrouped' ? null : groupId;

			const response = await fetch(`/api/series/${seriesId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ groupId: targetGroupId })
			});

			if (!response.ok) {
				console.error('Error moving series:', await response.text());
				return;
			}

			if (invalidateCallback) {
				await invalidateCallback();
			}
		} catch (error) {
			console.error('Error moving series:', error);
		}
	}

	/**
	 * Handle document mouseup - finalize drop
	 */
	async function handleDocumentMouseUp(event, clearSelectionCallback) {
		stopAutoScroll();
		
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (draggedStudies.length === 0 && draggedGroups.length === 0 && draggedSeries.length === 0)
			return;
		
		if (isDragging) {
			event.preventDefault();

			// A SERIES drop files the series, and nothing else. Handled before the study and group
			// branches and returning early, for the same reason the series-add branch below does:
			// the coordinates under the cursor belong to a group section whenever the destination
			// is a group, and falling through would run the study branch against a series id.
			if (draggedSeries.length > 0) {
				const seriesId = draggedSeries[0].id;
				const targetGroupId = dropTargetGroupId;

				if (targetGroupId !== null) {
					await moveSeriesToGroup(seriesId, targetGroupId);
				} else if (isWithinPanel(event)) {
					// Dropped on empty panel space — file it back at the top level, matching what
					// the same gesture does for a group and for a study.
					await moveSeriesToGroup(seriesId, null);
				}

				if (clearSelectionCallback) clearSelectionCallback();
				resetDragState();
				return;
			}

			// A drop on a series row proposes an add and nothing else — no group move, no ungrouping.
			// Returning early matters: the same coordinates sit inside a group section whenever the
			// series is filed in one, and falling through would ALSO reparent the study.
			if (dropTargetSeriesId !== null && canProposeSeriesAdd()) {
				const study = draggedStudies[0];
				const seriesId = dropTargetSeriesId;
				resetDragState();
				onDropOnSeries?.(study, seriesId);
				return;
			}
			
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
				if (isWithinPanel(event)) {
					await moveGroupsToParent(draggedGroups.map(g => g.id), null);
				}
			}
			
			// Handle study drops
			if (draggedStudies.length > 0 && dropTargetGroupId !== null) {
				await moveStudiesToGroup(draggedStudies.map(s => s.id), dropTargetGroupId);
			} else if (draggedStudies.length > 0) {
				// Check if dropped within panel
				if (isWithinPanel(event)) {
					// Ungroup the studies
					await moveStudiesToGroup(draggedStudies.map(s => s.id), null);
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
		
		resetDragState();
	}

	/**
	 * Clear every piece of drag state.
	 *
	 * Extracted because the series-drop path returns early and must not leave a ghost following the
	 * cursor while the confirm dialog is open — one exit that forgets a field is exactly how that
	 * happens.
	 */
	function resetDragState() {
		isDragging = false;
		draggedStudies = [];
		draggedGroups = [];
		draggedSeries = [];
		dropTargetGroupId = null;
		dropTargetSeriesId = null;
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
		get draggedSeries() { return draggedSeries; },
		get currentMouseX() { return currentMouseX; },
		get currentMouseY() { return currentMouseY; },
		get dropTargetGroupId() { return dropTargetGroupId; },
		get dropTargetSeriesId() { return dropTargetSeriesId; },
		
		// Functions
		handleStudyMouseDown,
		handleGroupMouseDown,
		handleSeriesMouseDown,
		handleDocumentMouseUp,
		isStudyBeingDragged
	};
}
