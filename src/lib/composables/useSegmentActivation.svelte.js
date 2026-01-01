/**
 * Composable for managing segment/section activation state
 * Handles click events to determine which segment or section should be active
 */

/**
 * Create segment activation state and handlers
 * @returns {Object} Segment activation state and handlers
 */
export function useSegmentActivation() {
	let activeSegment = $state(null); // { passageIndex, segmentIndex, activateSection }

	/**
	 * Handle click to activate segment or section
	 * @param {MouseEvent} event - The click event
	 * @param {string} toolbarMode - Current toolbar mode ('outline', 'literary', or 'color')
	 */
	function handleSegmentClick(event, toolbarMode) {
		// Handle segment/section activation based on toolbar mode
		const target = /** @type {HTMLElement} */ (event.target);
		const clickedSegment = target?.closest('.segment');
		if (clickedSegment) {
			// Find passage and segment indices
			const passageElement = clickedSegment.closest('.passage');
			if (passageElement) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageIndex = allPassages.indexOf(passageElement);
				
				const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
				const segmentIndex = allSegments.indexOf(clickedSegment);
				
				if (passageIndex !== -1 && segmentIndex !== -1) {
					// In 'color' mode, activate the section instead of the segment
					if (toolbarMode === 'color') {
						// Find the section (parent of segment)
						const sectionElement = clickedSegment.closest('.section');
						if (sectionElement) {
							// Store segment index but mark as section activation
							activeSegment = { passageIndex, segmentIndex, activateSection: true };
						}
					} else {
						// In 'outline' and 'literary' modes, activate the segment
						activeSegment = { passageIndex, segmentIndex, activateSection: false };
					}
				}
			}
		} else {
			// Clicked outside any segment - clear active state
			activeSegment = null;
		}
	}

	/**
	 * Clear active segment/section
	 */
	function clearActiveSegment() {
		activeSegment = null;
	}

	/**
	 * Update DOM elements with active class
	 * Should be called in an $effect
	 */
	function updateActiveClasses() {
		// Remove active class from all segments and sections
		const allSegments = document.querySelectorAll('.segment');
		allSegments.forEach(segment => {
			segment.classList.remove('active');
		});
		const allSections = document.querySelectorAll('.section');
		allSections.forEach(section => {
			section.classList.remove('active');
		});

		// Add active class to the selected segment or section
		if (activeSegment) {
			const allPassages = Array.from(document.querySelectorAll('.passage'));
			const passageElement = allPassages[activeSegment.passageIndex];
			if (passageElement) {
				if (activeSegment.activateSection) {
					// Activate the section (color mode)
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const sectionElement = segmentElement.closest('.section');
						if (sectionElement) {
							sectionElement.classList.add('active');
						}
					}
				} else {
					// Activate the segment (outline and literary modes)
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						segmentElement.classList.add('active');
					}
				}
			}
		}
	}

	return {
		// State
		get activeSegment() { return activeSegment; },
		
		// Handlers
		handleSegmentClick,
		clearActiveSegment,
		updateActiveClasses
	};
}
