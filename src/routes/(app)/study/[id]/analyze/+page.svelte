<script>
	import { invalidate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Segment from '$lib/componentWidgets/Segment.svelte';
	import ToolbarColumn from '$lib/componentWidgets/ToolbarColumn.svelte';
	import ToolbarSection from '$lib/componentWidgets/ToolbarSection.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState, setWordSelection, setActiveSegment, setActiveSection, setCanInsertColumn, setActiveColumn, setMultiSelectMode } from '$lib/stores/toolbar.js';

	let { data } = $props();

	/**
	 * Compare two word IDs to determine their order (client-side version)
	 * Word ID format: BOOK-CHAPTER-VERSE-WORD (e.g., "JN-001-001-005")
	 * @param {string} wordId1 - First word ID
	 * @param {string} wordId2 - Second word ID
	 * @returns {number} Negative if wordId1 < wordId2, 0 if equal, positive if wordId1 > wordId2
	 */
	function compareWordIds(wordId1, wordId2) {
		if (!wordId1 || !wordId2) return 0;
		
		const parts1 = wordId1.split('-');
		const parts2 = wordId2.split('-');
		
		// Compare chapter, verse, and word number (indices 1, 2, 3)
		for (let i = 1; i < 4; i++) {
			const num1 = parseInt(parts1[i], 10);
			const num2 = parseInt(parts2[i], 10);
			const diff = num1 - num2;
			if (diff !== 0) return diff;
		}
		
		return 0;
	}

	// Word selection state
	let hoveredWord = $state(null); // { passageIndex, wordId }
	let selectedWord = $state(null); // { passageIndex, wordId, position }
	let suppressHoverCaret = $state(null); // { passageIndex, wordId } - suppress hover caret after deselection
	
	// Drag detection state
	let dragStartPos = $state(null); // { x, y } - mouse position on mousedown
	let isDragging = $state(false); // Whether user is dragging (text selection mode)
	let dragJustCompleted = $state(false); // Flag to prevent click processing after drag

	// Click debouncing for separating single clicks from double/triple clicks
	let clickTimeout = $state(null); // Timeout ID for delayed single-click processing

	// Command key detection for multi-select mode
	let isCommandKeyHeld = $state(false);

	// Multi-selection state (replaces single selection)
	let activeSegments = $state([]); // Array of { passageIndex, segmentIndex, segmentId, generation }
	let activeColumns = $state([]); // Array of columnId strings
	let activeSections = $state([]); // Array of sectionId strings
	let segmentClickGeneration = $state(0); // Increments on every segment click to force toolbar remount

	// Compare mode state
	let isCompareMode = $state(false);
	let originalComparisonSelection = $state({ columns: [], sections: [], segments: [] });
	let compareActiveColumns = $state([]);
	let compareActiveSections = $state([]);
	let compareActiveSegments = $state([]);
	let visibleColumnIds = $state(new Set());
	let visibleSectionIds = $state(new Set());
	let visibleSegmentIds = $state(new Set());

	// Derived state: Check if we're in multi-select mode (more than 1 item selected)
	let isInMultiSelectMode = $derived.by(() => {
		// Use compare-mode selections if in compare mode, otherwise use normal selections
		const selections = isCompareMode
			? { columns: compareActiveColumns, sections: compareActiveSections, segments: compareActiveSegments }
			: { columns: activeColumns, sections: activeSections, segments: activeSegments };
		
		const totalSelected = selections.columns.length + selections.sections.length + selections.segments.length;
		return totalSelected > 1;
	});

	// Sync word selection state to toolbar store
	$effect(() => {
		setWordSelection(selectedWord !== null);
	});

	// Sync active segment state to toolbar store
	// Only set hasActiveSegment to true when neither column nor section mode is active
	$effect(() => {
		if (activeSegments.length > 0 && activeColumns.length === 0 && activeSections.length === 0) {
			// Only set active segment in store when in pure segment mode (not column/section mode)
			// Use the first active segment for toolbar state
			const firstSegment = activeSegments[0];
			
			// Look up segment data to pass heading/note status
			const segmentElement = document.querySelector(`[data-segment-id="${firstSegment.segmentId}"]`);
			let hasHeadingOne = false;
			let hasHeadingTwo = false;
			let hasHeadingThree = false;
			let hasNote = false;
			
			if (segmentElement) {
				// Check for heading elements in the DOM
				hasHeadingOne = !!segmentElement.querySelector('.heading-one, .heading-one-input');
				hasHeadingTwo = !!segmentElement.querySelector('.heading-two, .heading-two-input');
				hasHeadingThree = !!segmentElement.querySelector('.heading-three, .heading-three-input');
				hasNote = !!segmentElement.querySelector('.note, .note-input');
			}
			
			setActiveSegment(true, firstSegment.segmentId, {
				hasHeadingOne,
				hasHeadingTwo,
				hasHeadingThree,
				hasNote
			});
		} else {
			setActiveSegment(false, null);
		}
	});

	// Sync active column state to toolbar store
	$effect(() => {
		if (activeColumns.length > 0) {
			// Use the first active column for toolbar state
			setActiveColumn(true, activeColumns[0]);
		} else {
			setActiveColumn(false, null);
		}
	});

	// Sync active section state to toolbar store
	// Set to true when column OR section is active (for color menu)
	$effect(() => {
		const hasActiveSection = activeColumns.length > 0 || activeSections.length > 0;
		if (hasActiveSection) {
			// Get section ID from the active column or section
			let sectionId = null;
			if (activeSections.length > 0) {
				sectionId = activeSections[0];
			} else if (activeColumns.length > 0) {
				// Get section ID from column element
				const columnElement = document.querySelector(`[data-column-id="${activeColumns[0]}"]`);
				const sectionElement = columnElement?.querySelector('.section');
				sectionId = sectionElement?.dataset?.sectionId || null;
			}
			setActiveSection(true, sectionId);
		} else {
			setActiveSection(false, null);
		}
	});

	// Sync multi-select mode to toolbar store (enables Compare button when 2+ items selected)
	$effect(() => {
		setMultiSelectMode(isInMultiSelectMode);
	});

	// Clear active segments and word selection when overview mode is enabled
	$effect(() => {
		if ($toolbarState.overviewMode) {
			activeSegments = [];
			activeColumns = [];
			activeSections = [];
			selectedWord = null;
			suppressHoverCaret = null;
		}
	});

	// Compare mode toggle logic
	$effect(() => {
		console.log('🔍 [COMPARE EFFECT] Running - comparisonsVisible:', $toolbarState.comparisonsVisible, 'isCompareMode:', isCompareMode);
		
		if ($toolbarState.comparisonsVisible && !isCompareMode) {
			// ENTERING COMPARE MODE
			console.log('🔄 ENTERING COMPARE MODE');
			console.log('📦 Active state before saving:', {
				columns: activeColumns,
				sections: activeSections,
				segments: activeSegments.map(s => s.segmentId)
			});
			
			// 1. Save original selection
			originalComparisonSelection = {
				columns: [...activeColumns],
				sections: [...activeSections],
				segments: [...activeSegments]
			};
			
			console.log('💾 Saved originalComparisonSelection:', {
				columns: originalComparisonSelection.columns,
				sections: originalComparisonSelection.sections,
				segments: originalComparisonSelection.segments.map(s => s.segmentId)
			});
			
			// 2. Calculate visible items
			const visible = calculateVisibleItems(originalComparisonSelection);
			console.log('🔍 calculateVisibleItems returned:', {
				columns: Array.from(visible.columns),
				sections: Array.from(visible.sections),
				segments: Array.from(visible.segments)
			});
			
			// Create new Set instances to trigger Svelte reactivity
			visibleColumnIds = new Set(visible.columns);
			visibleSectionIds = new Set(visible.sections);
			visibleSegmentIds = new Set(visible.segments);
			
			console.log('✅ Final visible Sets:', {
				columnIds: Array.from(visibleColumnIds),
				sectionIds: Array.from(visibleSectionIds),
				segmentIds: Array.from(visibleSegmentIds)
			});
			
			// 3. Clear word selections
			selectedWord = null;
			suppressHoverCaret = null;
			
			// 4. Clear visual selection (but keep original stored)
			activeColumns = [];
			activeSections = [];
			activeSegments = [];
			
			// 5. Initialize compare-mode selections (empty)
			compareActiveColumns = [];
			compareActiveSections = [];
			compareActiveSegments = [];
			
			// 6. Mark we're in compare mode
			isCompareMode = true;
			
		} else if (!$toolbarState.comparisonsVisible && isCompareMode) {
			// EXITING COMPARE MODE
			console.log('🔄 EXITING COMPARE MODE');
			
			// 1. Clear compare-mode selections
			compareActiveColumns = [];
			compareActiveSections = [];
			compareActiveSegments = [];
			
			// 2. Clear visibility filters (show all)
			visibleColumnIds = new Set();
			visibleSectionIds = new Set();
			visibleSegmentIds = new Set();
			
			// 3. Restore original selection
			activeColumns = [...originalComparisonSelection.columns];
			activeSections = [...originalComparisonSelection.sections];
			activeSegments = [...originalComparisonSelection.segments];
			
			// 4. Clear original selection storage
			originalComparisonSelection = { columns: [], sections: [], segments: [] };
			
			// 5. Mark we're out of compare mode
			isCompareMode = false;
		}
	});

	// Apply dynamic classes for first/last visible elements in compare mode
	$effect(() => {
		// Force reactivity by reading from the Sets
		const _cols = Array.from(visibleColumnIds);
		const _secs = Array.from(visibleSectionIds);
		const _segs = Array.from(visibleSegmentIds);
		
		// Wait for DOM to update before applying classes
		tick().then(() => {
			// Clear all compare position classes first
			document.querySelectorAll('.compare-first-segment, .compare-last-segment, .compare-first-section').forEach(el => {
				el.classList.remove('compare-first-segment', 'compare-last-segment', 'compare-first-section');
			});
			
			// Only apply classes when in compare mode
			if (!isCompareMode) return;
			
			// Process each column
			document.querySelectorAll('.column').forEach(column => {
				// Skip hidden columns
				if (column.classList.contains('compare-hidden')) return;
				
				// Get all visible sections in this column
				const visibleSections = Array.from(column.querySelectorAll('.section')).filter(
					section => !section.classList.contains('compare-hidden')
				);
				
				// Mark first visible section
				if (visibleSections.length > 0) {
					visibleSections[0].classList.add('compare-first-section');
				}
				
				// Process each visible section
				visibleSections.forEach(section => {
					// Get all visible segments in this section
					const visibleSegments = Array.from(section.querySelectorAll('.segment')).filter(
						segment => !segment.classList.contains('compare-hidden')
					);
					
					// Mark first and last visible segments
					if (visibleSegments.length > 0) {
						visibleSegments[0].classList.add('compare-first-segment');
						visibleSegments[visibleSegments.length - 1].classList.add('compare-last-segment');
					}
				});
			});
		});
	});

	// Console logger for multi-select state tracking
	$effect(() => {
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('📊 MULTI-SELECT STATE TRACKER');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log(`📦 Columns (${activeColumns.length}):`, activeColumns.length > 0 ? activeColumns : '(none)');
		console.log(`📄 Sections (${activeSections.length}):`, activeSections.length > 0 ? activeSections : '(none)');
		console.log(`✂️  Segments (${activeSegments.length}):`, activeSegments.length > 0 ? activeSegments.map(s => s.segmentId) : '(none)');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	});

	// Validate Insert Column availability based on word selection
	$effect(() => {
		if (!selectedWord || !data.passagesWithText || data.passagesWithText.length === 0) {
			setCanInsertColumn(false);
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !passageText.structure || !passageText.structure.columns) {
			setCanInsertColumn(false);
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			const wordElement = document.querySelector(
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
			);
			
			if (wordElement) {
				// Find next word sibling in the DOM
				let nextElement = wordElement.nextElementSibling;
				while (nextElement) {
					if (nextElement.classList.contains('selectable-word')) {
						insertionWordId = nextElement.dataset.wordId;
						break;
					}
					nextElement = nextElement.nextElementSibling;
				}
			}
		}

		if (!insertionWordId) {
			// No valid insertion point (e.g., after last word)
			setCanInsertColumn(false);
			return;
		}

		// Check if insertion point is at the beginning of a column
		const columns = passageText.structure.columns;
		for (const column of columns) {
			if (column.startingWordId === insertionWordId) {
				// Cannot insert at column start
				setCanInsertColumn(false);
				return;
			}
		}

		// Valid insertion point
		setCanInsertColumn(true);
	});

	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
		
		// Listen for insert column event from MenuStructure
		const handleInsertColumnEvent = () => {
			handleInsertColumn();
		};
		
		// Listen for insert section event from MenuStructure
		const handleInsertSectionEvent = () => {
			handleInsertSection();
		};
		
		// Listen for insert segment event from MenuStructure
		const handleInsertSegmentEvent = () => {
			handleInsertSegment();
		};
		
		// Listen for insert heading one event from MenuStructure
		const handleInsertHeadingOneFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-one', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for insert heading two event from MenuStructure
		const handleInsertHeadingTwoFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-two', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for insert heading three event from MenuStructure
		const handleInsertHeadingThreeFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-three', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for insert note event from MenuStructure
		const handleInsertNoteFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-note', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for select-column event from ToolbarStructure
		const handleSelectColumnEvent = (event) => {
			const { columnId } = event.detail;
			
			// Use hierarchical selection handler
			const newState = handleSelection('column', columnId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		// Listen for deselect-column event from ToolbarStructure
		const handleDeselectColumnEvent = (event) => {
			const { columnId } = event.detail;
			
			// Use hierarchical selection handler (same as select - it toggles)
			const newState = handleSelection('column', columnId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		// Listen for select-section event from ToolbarStructure
		const handleSelectSectionEvent = (event) => {
			const { sectionId } = event.detail;
			
			// Use hierarchical selection handler
			const newState = handleSelection('section', sectionId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		// Listen for deselect-section event from ToolbarStructure
		const handleDeselectSectionEvent = (event) => {
			const { sectionId } = event.detail;
			
			// Use hierarchical selection handler (same as select - it toggles)
			const newState = handleSelection('section', sectionId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		window.addEventListener('insert-column', handleInsertColumnEvent);
		window.addEventListener('insert-section', handleInsertSectionEvent);
		window.addEventListener('insert-segment', handleInsertSegmentEvent);
		window.addEventListener('insert-heading-one-from-menu', handleInsertHeadingOneFromMenuEvent);
		window.addEventListener('insert-heading-two-from-menu', handleInsertHeadingTwoFromMenuEvent);
		window.addEventListener('insert-heading-three-from-menu', handleInsertHeadingThreeFromMenuEvent);
		window.addEventListener('insert-note-from-menu', handleInsertNoteFromMenuEvent);
		window.addEventListener('select-column', handleSelectColumnEvent);
		window.addEventListener('deselect-column', handleDeselectColumnEvent);
		window.addEventListener('select-section', handleSelectSectionEvent);
		window.addEventListener('deselect-section', handleDeselectSectionEvent);
		
		return () => {
			window.removeEventListener('insert-column', handleInsertColumnEvent);
			window.removeEventListener('insert-section', handleInsertSectionEvent);
			window.removeEventListener('insert-segment', handleInsertSegmentEvent);
			window.removeEventListener('insert-heading-one-from-menu', handleInsertHeadingOneFromMenuEvent);
			window.removeEventListener('insert-heading-two-from-menu', handleInsertHeadingTwoFromMenuEvent);
			window.removeEventListener('insert-heading-three-from-menu', handleInsertHeadingThreeFromMenuEvent);
			window.removeEventListener('insert-note-from-menu', handleInsertNoteFromMenuEvent);
			window.removeEventListener('select-column', handleSelectColumnEvent);
			window.removeEventListener('deselect-column', handleDeselectColumnEvent);
			window.removeEventListener('select-section', handleSelectSectionEvent);
			window.removeEventListener('deselect-section', handleDeselectSectionEvent);
		};
	});

	/**
	 * Handle Insert Column button click
	 */
	async function handleInsertColumn() {
		console.log('handleInsertColumn called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent elements
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find parent structural elements
		const segmentElement = wordElement.closest('.segment');
		const sectionElement = wordElement.closest('.section');
		const columnElement = wordElement.closest('.column');
		
		if (!segmentElement || !sectionElement || !columnElement) {
			console.log('Parent structural elements not found');
			return;
		}
		
		// Extract IDs from data attributes
		const columnId = columnElement.dataset.columnId;
		const sectionId = sectionElement.dataset.sectionId;
		const segmentId = segmentElement.dataset.segmentId;
		
		if (!columnId || !sectionId || !segmentId) {
			console.log('Missing structural IDs');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting column at:', insertionWordId, 'in column:', columnId, 'section:', sectionId, 'segment:', segmentId);

		try {
			const response = await fetch('/api/passages/columns/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					columnId: columnId,
					sectionId: sectionId,
					segmentId: segmentId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Column inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert column error response:', error);
				alert(`Error: ${error.error || 'Failed to insert column'}`);
			}
		} catch (error) {
			console.error('Insert column network error:', error);
			alert(`Error: ${error.message || 'Failed to insert column'}`);
		}
	}

	/**
	 * Handle Insert Section button click (formerly Split)
	 */
	async function handleInsertSection() {
		console.log('handleInsertSection called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent elements
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find parent structural elements
		const segmentElement = wordElement.closest('.segment');
		const sectionElement = wordElement.closest('.section');
		const columnElement = wordElement.closest('.column');
		
		if (!segmentElement || !sectionElement || !columnElement) {
			console.log('Parent structural elements not found');
			return;
		}
		
		// Extract IDs from data attributes
		const columnId = columnElement.dataset.columnId;
		const sectionId = sectionElement.dataset.sectionId;
		const segmentId = segmentElement.dataset.segmentId;
		
		if (!columnId || !sectionId || !segmentId) {
			console.log('Missing structural IDs');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting section at:', insertionWordId, 'in column:', columnId, 'section:', sectionId, 'segment:', segmentId);

		try {
			const response = await fetch('/api/passages/sections/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					columnId: columnId,
					sectionId: sectionId,
					segmentId: segmentId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Section inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert section error response:', error);
				alert(`Error: ${error.error || 'Failed to insert section'}`);
			}
		} catch (error) {
			console.error('Insert section network error:', error);
			alert(`Error: ${error.message || 'Failed to insert section'}`);
		}
	}

	/**
	 * Handle Insert Segment button click
	 */
	async function handleInsertSegment() {
		console.log('handleInsertSegment called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent section
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find the parent section element
		const sectionElement = wordElement.closest('.section');
		if (!sectionElement) {
			console.log('No parent section found');
			return;
		}
		
		// Extract section ID from the data attribute
		const sectionId = sectionElement.dataset.sectionId;
		if (!sectionId) {
			console.log('No section ID found on element');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting segment at:', insertionWordId, 'in section:', sectionId, 'for passage:', passageText.structure.passageId);

		try {
			const response = await fetch('/api/passages/segments/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					sectionId: sectionId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Segment inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert segment error response:', error);
				alert(`Error: ${error.error || 'Failed to insert segment'}`);
			}
		} catch (error) {
			console.error('Insert segment network error:', error);
			alert(`Error: ${error.message || 'Failed to insert segment'}`);
		}
	}

	/**
	 * Generate a letter suffix for verse subdivisions
	 * @param {number} index - Occurrence index (0 = 'a', 1 = 'b', etc.)
	 * @returns {string} Letter suffix ('a', 'b', ..., 'z', 'aa', 'bb', etc.)
	 */
	function generateVerseSuffix(index) {
		if (index < 26) {
			return String.fromCharCode(97 + index); // a-z
		}
		// After 'z', use 'aa', 'bb', 'cc', etc.
		const letter = String.fromCharCode(97 + (index % 26));
		const repeatCount = Math.floor(index / 26) + 1;
		return letter.repeat(repeatCount);
	}

	/**
	 * Check if a segment is in a column
	 * @param {Object} column - Column object
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {boolean} True if segment is in column
	 */
	function isSegmentInColumn(column, segmentId) {
		return column.sections.some(section => 
			section.segments.some(segment => segment.id === segmentId)
		);
	}

	/**
	 * Check if a segment is in a section
	 * @param {Object} section - Section object
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {boolean} True if segment is in section
	 */
	function isSegmentInSection(section, segmentId) {
		return section.segments.some(segment => segment.id === segmentId);
	}

	// ============================================================
	// COMPARE MODE HELPER FUNCTIONS
	// ============================================================

	/**
	 * Calculate which columns, sections, and segments should be visible in compare mode
	 * based on the original selection. Respects hierarchical containment rules.
	 * 
	 * Key behavior:
	 * - Selected segments → Show ONLY those segments (+ parent section/column as containers)
	 * - Selected sections → Show section + ALL its segments (+ parent column as container)
	 * - Selected columns → Show column + ALL its sections + ALL their segments
	 * 
	 * @param {Object} selection - Original selection { columns: [], sections: [], segments: [] }
	 * @returns {Object} Visible items { columns: Set, sections: Set, segments: Set }
	 */
	function calculateVisibleItems(selection) {
		const columns = new Set();
		const sections = new Set();
		const segments = new Set();
		
		// Add selected segments and their parent sections/columns (but NOT sibling segments)
		selection.segments.forEach(seg => {
			segments.add(seg.segmentId);
			const sectionId = getSectionIdFromSegmentId(seg.segmentId);
			const columnId = getColumnIdFromSegmentId(seg.segmentId);
			if (sectionId) sections.add(sectionId);
			if (columnId) columns.add(columnId);
		});
		
		// Add selected sections, their parent columns, and ALL their segments
		selection.sections.forEach(sectionId => {
			sections.add(sectionId);
			const columnId = getColumnIdFromSectionId(sectionId);
			if (columnId) columns.add(columnId);
			// Add all segments in this section
			getAllSegmentIdsInSection(sectionId).forEach(segId => segments.add(segId));
		});
		
		// Add selected columns and ALL their sections and segments
		selection.columns.forEach(columnId => {
			columns.add(columnId);
			// Add all sections in this column
			getAllSectionIdsInColumn(columnId).forEach(secId => sections.add(secId));
			// Add all segments in this column
			getAllSegmentIdsInColumn(columnId).forEach(segId => segments.add(segId));
		});
		
		return { columns, sections, segments };
	}

	// ============================================================
	// HIERARCHICAL SELECTION HELPER FUNCTIONS
	// ============================================================

	/**
	 * Get the column ID that contains a given section ID
	 * @param {string} sectionId - Section ID to search for
	 * @returns {string|null} Column ID or null if not found
	 */
	function getColumnIdFromSectionId(sectionId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				if (column.sections.some(section => section.id === sectionId)) {
					return column.id;
				}
			}
		}
		return null;
	}

	/**
	 * Get the column ID that contains a given segment ID
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {string|null} Column ID or null if not found
	 */
	function getColumnIdFromSegmentId(segmentId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					if (section.segments.some(segment => segment.id === segmentId)) {
						return column.id;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Get the section ID that contains a given segment ID
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {string|null} Section ID or null if not found
	 */
	function getSectionIdFromSegmentId(segmentId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					if (section.segments.some(segment => segment.id === segmentId)) {
						return section.id;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Get all section IDs in a given column
	 * @param {string} columnId - Column ID
	 * @returns {string[]} Array of section IDs
	 */
	function getAllSectionIdsInColumn(columnId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			const column = passageText.structure.columns.find(col => col.id === columnId);
			if (column) {
				return column.sections.map(section => section.id);
			}
		}
		return [];
	}

	/**
	 * Get all segment IDs in a given section
	 * @param {string} sectionId - Section ID
	 * @returns {string[]} Array of segment IDs
	 */
	function getAllSegmentIdsInSection(sectionId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				const section = column.sections.find(sec => sec.id === sectionId);
				if (section) {
					return section.segments.map(segment => segment.id);
				}
			}
		}
		return [];
	}

	/**
	 * Get all segment IDs in a given column (across all its sections)
	 * @param {string} columnId - Column ID
	 * @returns {string[]} Array of segment IDs
	 */
	function getAllSegmentIdsInColumn(columnId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			const column = passageText.structure.columns.find(col => col.id === columnId);
			if (column) {
				const segmentIds = [];
				for (const section of column.sections) {
					segmentIds.push(...section.segments.map(segment => segment.id));
				}
				return segmentIds;
			}
		}
		return [];
	}

	// ============================================================
	// HIERARCHICAL SELECTION HANDLER
	// ============================================================

	/**
	 * Handle hierarchical selection logic for columns, sections, and segments
	 * Implements all 7 scenarios from the Multi-Select Scenarios document
	 * Works with both normal and compare mode selections
	 * @param {string} type - Type of item: 'column', 'section', or 'segment'
	 * @param {string} id - ID of the item being selected
	 * @param {Object} segmentData - Additional data for segment selection (passageIndex, segmentIndex, generation)
	 * @returns {Object} New state: { columns: [], sections: [], segments: [] }
	 */
	function handleSelection(type, id, segmentData = null) {
		console.log(`[SELECTION] Handling ${type} selection:`, id, 'Compare mode:', isCompareMode);
		
		// Use compare-mode selections if in compare mode
		const currentColumns = isCompareMode ? compareActiveColumns : activeColumns;
		const currentSections = isCompareMode ? compareActiveSections : activeSections;
		const currentSegments = isCompareMode ? compareActiveSegments : activeSegments;
		
		console.log('[SELECTION] Current state - Columns:', currentColumns, 'Sections:', currentSections, 'Segments:', currentSegments.map(s => s.segmentId));
		
		let newColumns = [...currentColumns];
		let newSections = [...currentSections];
		let newSegments = [...currentSegments];
		
		// SCENARIO ROUTING
		if (type === 'column') {
			// Check if this column is already selected (toggle/deselect)
			if (newColumns.includes(id)) {
				console.log('[SELECTION] Column already selected - removing');
				newColumns = newColumns.filter(c => c !== id);
			} else {
				// Column not selected - add it
				// Remove any sections that are in this column
				const sectionsInColumn = getAllSectionIdsInColumn(id);
				newSections = newSections.filter(s => !sectionsInColumn.includes(s));
				
				// Remove any segments that are in this column
				const segmentsInColumn = getAllSegmentIdsInColumn(id);
				newSegments = newSegments.filter(seg => !segmentsInColumn.includes(seg.segmentId));
				
				newColumns.push(id);
				console.log('[SELECTION] Added column, removed its sections/segments');
			}
		}
		else if (type === 'section') {
			const parentColumnId = getColumnIdFromSectionId(id);
			
			// Check if this section is already selected (toggle/deselect)
			if (newSections.includes(id)) {
				console.log('[SELECTION] Section already selected - removing');
				newSections = newSections.filter(s => s !== id);
			} else {
				// Section not selected - add it
				// If parent column is selected, remove it
				if (parentColumnId && newColumns.includes(parentColumnId)) {
					newColumns = newColumns.filter(c => c !== parentColumnId);
					console.log('[SELECTION] Removed parent column');
				}
				
				// Remove any segments that are in this section
				const segmentsInSection = getAllSegmentIdsInSection(id);
				newSegments = newSegments.filter(seg => !segmentsInSection.includes(seg.segmentId));
				
				newSections.push(id);
				console.log('[SELECTION] Added section, removed its segments');
			}
		}
		else if (type === 'segment') {
			// Check if this segment is already selected (toggle/deselect)
			if (newSegments.some(seg => seg.segmentId === id)) {
				console.log('[SELECTION] Segment already selected - removing');
				newSegments = newSegments.filter(seg => seg.segmentId !== id);
			} else {
				// Segment not selected - add it
				const parentSectionId = getSectionIdFromSegmentId(id);
				const parentColumnId = getColumnIdFromSegmentId(id);
				
				// If parent section is selected, remove it
				if (parentSectionId && newSections.includes(parentSectionId)) {
					newSections = newSections.filter(s => s !== parentSectionId);
					console.log('[SELECTION] Removed parent section');
				}
				
				// If parent column is selected, remove it
				if (parentColumnId && newColumns.includes(parentColumnId)) {
					newColumns = newColumns.filter(c => c !== parentColumnId);
					console.log('[SELECTION] Removed parent column');
				}
				
				// Add the segment
				if (segmentData) {
				newSegments.push({
					passageIndex: segmentData.passageIndex,
					segmentIndex: segmentData.segmentIndex,
					segmentId: id,
					activateSection: false,
					generation: segmentData.generation
				});
			} else {
				// Fallback if segmentData not provided
				newSegments.push({
					passageIndex: 0,
					segmentIndex: 0,
					segmentId: id,
					activateSection: false,
					generation: segmentClickGeneration
				});
			}
			console.log('[SELECTION] Added segment');
			}
		}
		
		console.log('[SELECTION] New state - Columns:', newColumns, 'Sections:', newSections, 'Segments:', newSegments.map(s => s.segmentId));
		
		return {
			columns: newColumns,
			sections: newSections,
			segments: newSegments
		};
	}

	/**
	 * Build a map of verses to their segment counts (pre-scan)
	 * Counts how many segments contain words from each verse
	 * @param {Array} allSegments - All segments for a passage
	 * @returns {Object} Map of verseId -> count
	 */
	function buildVerseSectionMap(allSegments) {
		const verseSectionMap = {};
		
		// Scan all segments and count how many segments each verse appears in
		for (const segment of allSegments) {
			const wordId = segment.startingWordId;
			if (!wordId) continue;
			
			// Extract verse ID from word ID (format: BOOK-CHAPTER-VERSE-WORD)
			const parts = wordId.split('-');
			if (parts.length >= 4) {
				const verseId = parts.slice(0, 3).join('-'); // BOOK-CHAPTER-VERSE
				
				// Count how many segments start with words from this verse
				verseSectionMap[verseId] = (verseSectionMap[verseId] || 0) + 1;
			}
		}
		
		return verseSectionMap;
	}

	/**
	 * Extract text segment from full passage HTML based on word boundaries
	 * Properly handles nested verse structure with chapter-verse notations
	 * @param {string} fullHtml - The full passage HTML text
	 * @param {string} startWordId - Starting word ID (e.g., 'ac-01-01-001')
	 * @param {string|null} endWordId - Ending word ID (null = extract to end)
	 * @param {number} passageIndex - Index of the passage
	 * @param {Object} verseSectionMap - Map of verseId -> occurrence count
	 * @param {Object} verseOccurrences - Tracker for current verse occurrences
	 * @returns {string} Extracted HTML
	 */
	function extractSegmentText(fullHtml, startWordId, endWordId, passageIndex, verseSectionMap, verseOccurrences) {
		if (!fullHtml) return '';
		
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = fullHtml;
		
		// Get all words in the passage
		const allWords = tempDiv.querySelectorAll('.word[data-word-id]');
		let capturing = false;
		const capturedHTML = [];
		let currentVerseId = null;
		let verseBuffer = []; // Buffer to collect elements within a verse
		
		for (let i = 0; i < allWords.length; i++) {
			const word = allWords[i];
			const wordId = word.dataset.wordId;
			
			// Start capturing when we reach the start word
			if (wordId === startWordId) {
				capturing = true;
			}
			
			// Stop capturing when we reach the end word (BEFORE capturing it)
			if (endWordId && wordId === endWordId) {
				// Flush any remaining verse buffer
				if (verseBuffer.length > 0) {
					// Check if first element is a chapter-verse span
					const firstElement = verseBuffer[0];
					if (firstElement.includes('class="chapter-verse"')) {
						// First element is chapter-verse, rest are words
						// No space between chapter-verse and first word to avoid leading space when hidden
						const chapterVerse = verseBuffer[0];
						const words = verseBuffer.slice(1);
						capturedHTML.push(chapterVerse + words.join(' '));
					} else {
						// No chapter-verse, just join words with spaces
						capturedHTML.push(verseBuffer.join(' '));
					}
					verseBuffer = [];
				}
				break;
			}
			
			if (capturing) {
				// Find the parent verse span (if any)
				const verseSpan = word.closest('.verse');
				const verseId = verseSpan?.dataset?.verseId || null;
				
			// Check if we're starting a new verse
			if (verseId !== currentVerseId) {
				// Flush previous verse buffer
				if (verseBuffer.length > 0) {
					// Check if first element is a chapter-verse span
					const firstElement = verseBuffer[0];
					if (firstElement.includes('class="chapter-verse"')) {
						// First element is chapter-verse, rest are words
						// No space between chapter-verse and first word to avoid leading space when hidden
						const chapterVerse = verseBuffer[0];
						const words = verseBuffer.slice(1);
						capturedHTML.push(chapterVerse + words.join(' '));
					} else {
						// No chapter-verse, just join words with spaces
						capturedHTML.push(verseBuffer.join(' '));
					}
					verseBuffer = [];
				}
					
					currentVerseId = verseId;
					
					// If this word is in a verse, capture the chapter-verse notation
					if (verseSpan && verseId) {
						const chapterVerseSpan = verseSpan.querySelector('.chapter-verse');
						if (chapterVerseSpan) {
							// Extract chapter and verse numbers
							const chapterVerseText = chapterVerseSpan.textContent || '';
							
							// Determine if we need a suffix
							const isSection = verseSectionMap && verseSectionMap[verseId] > 1;
							
							if (isSection) {
								// Initialize counter for this verse if we haven't seen it yet
								if (verseOccurrences[verseId] === undefined) {
									verseOccurrences[verseId] = 0;
								}
								
								// Get current counter value (this is which occurrence we're on)
								const currentIndex = verseOccurrences[verseId];
								
								// Generate suffix using current index
								const suffix = generateVerseSuffix(currentIndex);
								
								// Increment counter for next occurrence
								verseOccurrences[verseId] = currentIndex + 1;
								
								verseBuffer.push(`<span class="chapter-verse">${chapterVerseText}${suffix}</span>`);
							} else {
								// Verse not section - use original without suffix
								verseBuffer.push(chapterVerseSpan.outerHTML);
							}
						}
					}
				}
				
				// Clone the word and add selection attributes
				const wordClone = word.cloneNode(true);
				wordClone.classList.add('selectable-word');
				wordClone.dataset.passageIndex = String(passageIndex);
				
				verseBuffer.push(wordClone.outerHTML);
			}
		}
		
		// Flush any remaining verse buffer
		if (verseBuffer.length > 0) {
			// Check if first element is a chapter-verse span
			const firstElement = verseBuffer[0];
			if (firstElement.includes('class="chapter-verse"')) {
				// First element is chapter-verse, rest are words
				// No space between chapter-verse and first word to avoid leading space when hidden
				const chapterVerse = verseBuffer[0];
				const words = verseBuffer.slice(1);
				capturedHTML.push(chapterVerse + words.join(' '));
			} else {
				// No chapter-verse, just join words with spaces
				capturedHTML.push(verseBuffer.join(' '));
			}
		}
		
		return capturedHTML.join(' ');
	}

	/**
	 * Handle mouse down - track position for drag detection
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
	 */
	function handleMouseMove(event) {
		if (dragStartPos) {
			// Calculate distance moved from drag start position
			const distance = Math.sqrt(
				Math.pow(event.clientX - dragStartPos.x, 2) + 
				Math.pow(event.clientY - dragStartPos.y, 2)
			);
			// If moved more than 3px, consider it a drag
			if (distance > 3) {
				// Check if drag is happening inside an input/textarea
				const isInInput = event.target.closest('input, textarea');
				
				isDragging = true;
				dragJustCompleted = true; // Mark that a drag occurred
				// Clear custom selections immediately when drag is detected
				selectedWord = null;
				suppressHoverCaret = null;
				
				// Only clear active segments if NOT dragging in an input
				if (!isInInput) {
					activeSegments = [];
					activeColumns = [];
					activeSections = [];
				}
			}
		}
	}

	/**
	 * Handle mouse up - reset drag state
	 */
	function handleMouseUp() {
		// Reset drag state
		dragStartPos = null;
		isDragging = false;
	}

	/**
	 * Handle word hover
	 * Disabled when dragging
	 */
	function handleWordHover(event) {
		// Don't process word hover when dragging
		if (isDragging) return;
		
		const target = event.target;
		if (target.classList.contains('selectable-word')) {
			hoveredWord = {
				passageIndex: parseInt(target.dataset.passageIndex),
				wordId: target.dataset.wordId
			};
		}
	}

	/**
	 * Handle word hover end - also clears hover caret suppression
	 */
	function handleWordHoverEnd() {
		
		hoveredWord = null;
		suppressHoverCaret = null; // Clear suppression when mouse leaves
	}

	/**
	 * Handle word click with three-state selection
	 * - Click 1: Caret before word
	 * - Click 2 (same word): Caret after word
	 * - Click 3 (same word): Deselect
	 * - Shift+Click: Jump directly to "after" position
	 * 
	 * Also handles segment activation
	 * 
	 * Only active when not dragging
	 */
	function handleWordClick(event) {
		// Check if browser has an active text selection
		const selection = window.getSelection();
		const hasTextSelection = selection && selection.toString().length > 0;
		
		// If Shift is held AND there's an active text selection, 
		// let browser handle it to extend selection
		if (event.shiftKey && hasTextSelection) {
			console.log('[CLICK] Shift+click with active selection - allowing browser to extend');
			return; // Don't process - let browser extend selection
		}
		
		// Check if a drag just completed - if so, ignore this click
		if (dragJustCompleted) {
			dragJustCompleted = false; // Reset flag
			return;
		}
		
		// Don't process word selection when dragging (text selection)
		if (isDragging) {
			// Reset drag state
			dragStartPos = null;
			isDragging = false;
			return;
		}

		// Don't allow segment/section activation in overview mode
		if ($toolbarState.overviewMode) {
			return;
		}
		
		// Allow native browser double/triple-click behavior
		// detail: 1 = single click, 2 = double-click, 3 = triple-click
		if (event.detail >= 2) {
			// Clear any pending single-click timeout
			if (clickTimeout) {
				clearTimeout(clickTimeout);
				clickTimeout = null;
			}
			// Clear any custom word selections
			selectedWord = null;
			suppressHoverCaret = null;
			// Allow text selection in input fields without deactivating segment
			const isInInput = event.target.closest('input, textarea');
			if (!isInInput) {
				// Only clear active segments if NOT clicking in an input
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
			}
			return; // Let browser handle double/triple-click text selection
		}
		
		// Capture event data before async timeout
		const clickedSegment = event.target.closest('.segment');
		const target = event.target;
		
		// Don't process word selection or segment activation if clicking in an input field
		const isInInput = target.closest('input, textarea');
		if (isInInput) {
			// Reset drag state but don't process further
			dragStartPos = null;
			isDragging = false;
			return;
		}
		
		// Handle segment/section activation IMMEDIATELY (no delay)
		// This makes the toolbar appear instantly without waiting for debounce
		if (clickedSegment) {
			// Find passage and segment indices
			const passageElement = clickedSegment.closest('.passage');
			if (passageElement) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageIndex = allPassages.indexOf(passageElement);
				
				const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
				const segmentIndex = allSegments.indexOf(clickedSegment);
				
				// Capture the segment ID from the DOM
				const segmentId = clickedSegment.dataset.segmentId;
				console.log('[CLICK] Captured segment ID:', segmentId, 'from element:', clickedSegment);
				
				if (passageIndex !== -1 && segmentIndex !== -1 && segmentId) {
					// Increment generation counter to force toolbar remount
					segmentClickGeneration++;
					
					// Check if Command/Ctrl key is held for multi-select mode (directly from event)
					const isMultiSelectMode = event.metaKey || event.ctrlKey;
					
					if (isMultiSelectMode) {
						console.log('[CLICK] Command/Ctrl held - using hierarchical selection');
						// Multi-select mode: use hierarchical selection handler
						const newState = handleSelection('segment', segmentId, {
							passageIndex,
							segmentIndex,
							generation: segmentClickGeneration
						});
						activeColumns = newState.columns;
						activeSections = newState.sections;
						activeSegments = newState.segments;
					} else {
						// Normal mode: replace selection with single segment
						console.log('[CLICK] Normal click - replacing selection');
						// Clear any active column/section selections
						activeColumns = [];
						activeSections = [];
						// Activate the segment with generation
						activeSegments = [{ passageIndex, segmentIndex, segmentId, activateSection: false, generation: segmentClickGeneration }];
					}
				}
			}
		} else {
			// Clicked outside any segment - clear active state (unless Command/Ctrl is held)
			const isMultiSelectMode = event.metaKey || event.ctrlKey;
			if (!isMultiSelectMode) {
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
			}
		}
		
		// Clear any existing timeout to prevent duplicate processing
		if (clickTimeout) {
			clearTimeout(clickTimeout);
			clickTimeout = null;
		}
		
		// Delay word selection processing to allow double/triple-clicks to work
		clickTimeout = setTimeout(() => {
			// Block word selection in compare mode
			if (isCompareMode) {
				console.log('[CLICK] Word selection blocked in compare mode');
				clickTimeout = null;
				return;
			}
			
			// Handle word selection
			if (target.classList.contains('selectable-word')) {
				const passageIndex = parseInt(target.dataset.passageIndex);
				const wordId = target.dataset.wordId;
				
				// Check if clicking the same word
				const isSameWord = selectedWord?.passageIndex === passageIndex && 
				                   selectedWord?.wordId === wordId;
				
				if (isSameWord) {
					// Clicking same word: cycle through states
					if (selectedWord.position === 'before') {
						// Before -> After
						selectedWord = { passageIndex, wordId, position: 'after' };
						suppressHoverCaret = null; // Clear suppression
					} else {
						// After -> Deselect (suppress hover caret until mouse out)
						selectedWord = null;
						suppressHoverCaret = { passageIndex, wordId };
						activeSegments = []; // Also deactivate segments
					}
				} else {
					// Clicking different word: start with "before"
					selectedWord = { passageIndex, wordId, position: 'before' };
					suppressHoverCaret = null; // Clear suppression
				}
			} else {
				// Clear selection when clicking outside of a word
				selectedWord = null;
				suppressHoverCaret = null;
			}
			
			// Clear timeout reference
			clickTimeout = null;
		}, 200); // 200ms delay - enough to detect double/triple clicks
		
		// Reset drag state
		dragStartPos = null;
		isDragging = false;
	}

	/**
	 * Handle global key down events
	 * - ESC: Clear word selections and browser text selections
	 * - Command/Ctrl: Enable multi-select mode
	 */
	function handleKeyDown(event) {
		if (event.key === 'Escape') {
			selectedWord = null;
			hoveredWord = null;
			// Clear browser's text selection
			window.getSelection()?.removeAllRanges();
		}
		
		// Detect Command (Mac) or Ctrl (Windows/Linux) key
		if (event.key === 'Meta' || event.key === 'Control') {
			isCommandKeyHeld = true;
			console.log('[KEY] Command/Ctrl key pressed - multi-select mode enabled');
		}
	}
	
	/**
	 * Handle global key up events
	 * - Command/Ctrl release: Disable multi-select mode
	 */
	function handleKeyUp(event) {
		// Detect Command (Mac) or Ctrl (Windows/Linux) key release
		if (event.key === 'Meta' || event.key === 'Control') {
			isCommandKeyHeld = false;
			console.log('[KEY] Command/Ctrl key released - multi-select mode disabled');
		}
	}

	/**
	 * Update DOM elements with data-selected, data-position, and data-suppress-hover-caret attributes when selection changes
	 */
	$effect(() => {
		// Remove data-selected, data-position, and data-suppress-hover-caret from all words
		const allWords = document.querySelectorAll('.selectable-word');
		allWords.forEach(word => {
			word.removeAttribute('data-selected');
			word.removeAttribute('data-position');
			word.removeAttribute('data-suppress-hover-caret');
		});

		// Add data-selected and data-position to the selected word
		if (selectedWord) {
			const selectedElement = document.querySelector(
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
			);
			if (selectedElement) {
				selectedElement.setAttribute('data-selected', 'true');
				selectedElement.setAttribute('data-position', selectedWord.position);
			}
		}
		
		// Add data-suppress-hover-caret to the word where hover caret should be suppressed
		if (suppressHoverCaret) {
			const suppressElement = document.querySelector(
				`.selectable-word[data-passage-index="${suppressHoverCaret.passageIndex}"][data-word-id="${suppressHoverCaret.wordId}"]`
			);
			if (suppressElement) {
				suppressElement.setAttribute('data-suppress-hover-caret', 'true');
			}
		}
	});

	/**
	 * Update DOM elements with active class when active segment/column/section changes
	 */
	$effect(() => {
		// Remove active class from all segments, sections, and columns
		const allSegments = document.querySelectorAll('.segment');
		allSegments.forEach(segment => {
			segment.classList.remove('active');
		});
		const allSections = document.querySelectorAll('.section');
		allSections.forEach(section => {
			section.classList.remove('active');
		});
		const allColumns = document.querySelectorAll('.column');
		allColumns.forEach(column => {
			column.classList.remove('active');
		});

		// Add active class to all selected columns
		if (activeColumns.length > 0) {
			activeColumns.forEach(columnId => {
				const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
				if (columnElement) {
					columnElement.classList.add('active');
					console.log('[EFFECT] Activated column:', columnId);
				}
			});
		}
		
		// Add active class to all selected sections
		if (activeSections.length > 0) {
			activeSections.forEach(sectionId => {
				const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
				if (sectionElement) {
					sectionElement.classList.add('active');
					console.log('[EFFECT] Activated section:', sectionId);
				}
			});
		}
		
		// Add active class to all selected segments
		if (activeSegments.length > 0) {
			activeSegments.forEach(segment => {
				const segmentElement = document.querySelector(`[data-segment-id="${segment.segmentId}"]`);
				if (segmentElement) {
					if (segment.activateSection) {
						// Activate the section (color mode)
						const sectionElement = segmentElement.closest('.section');
						if (sectionElement) {
							sectionElement.classList.add('active');
						}
					} else {
						// Activate the segment (outline and literary modes)
						segmentElement.classList.add('active');
					}
				}
			});
		}
	});



	// Get translation abbreviation
	let translationAbbr = $derived.by(() => {
		const metadata = getTranslationMetadata(data.study.translation || 'esv');
		return metadata?.abbreviation || data.study.translation?.toUpperCase() || 'ESV';
	});

	/**
	 * Format a passage reference for display
	 * @param {Object} passage
	 * @returns {string}
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}

	// Ref to inner content wrapper for measuring dimensions
	let contentInnerRef = $state(null);
	
	// Track previous zoom level to detect actual changes
	let previousZoomLevel = $state($toolbarState.zoomLevel);

	/**
	 * Maintain center point when zoom level changes
	 */
	$effect(() => {
		const currentZoomLevel = $toolbarState.zoomLevel;
		
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
	});

	/**
	 * Reset scroll position when study changes
	 */
	$effect(() => {
		// Reset scroll to top when study ID changes
		if (data.study?.id) {
			// Get the actual scroll container (.analyze-content)
			const scrollContainer = contentInnerRef?.parentElement?.parentElement;
			if (scrollContainer) {
				scrollContainer.scrollTo(0, 0);
			}
		}
	});

	/**
	 * Determine if header should be visible based on zoom level
	 * @returns {boolean} True if zoom >= 100%
	 */
	let showHeader = $derived.by(() => {
		return $toolbarState.zoomLevel >= 100;
	});

	/**
	 * Get current scale factor
	 * @returns {number} Current scale
	 */
	let currentScale = $derived.by(() => {
		// Convert percentage to decimal (e.g., 150% = 1.5)
		return $toolbarState.zoomLevel / 100;
	});

	/**
	 * Calculate zoom transform based on zoom level
	 * @returns {string} CSS transform value
	 */
	let zoomTransform = $derived.by(() => {
		return `scale(${currentScale})`;
	});

	/**
	 * Calculate wrapper dimensions for scroll area
	 * @returns {string} CSS dimensions for wrapper
	 */
	let wrapperDimensions = $derived.by(() => {
		if (!contentInnerRef) return '';
		
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
	});
</script>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} />

<div class="container">
	<!-- Analyze View Content -->
	<div 
		class="analyze-content" 
		class:hide-notes={!$toolbarState.notesVisible}
		class:hide-verses={!$toolbarState.versesVisible} 
		class:wide-layout={$toolbarState.wideLayout} 
		class:overview-mode={$toolbarState.overviewMode}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseover={handleWordHover}
		onmouseout={handleWordHoverEnd}
		onclick={handleWordClick}
	>
		<div class="analyze-content-wrapper" style="{wrapperDimensions}">
			<div bind:this={contentInnerRef} class="analyze-content-inner" style="transform: {zoomTransform}; transform-origin: top left;">
				{#if showHeader}
					<div class="study-header">
						<Heading heading="h1" classes="h3 heading" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
						{#if data.study.subtitle}
							<Heading heading="h2" classes="h4 subheading" isMuted>{data.study.subtitle}</Heading>
						{/if}
					</div>
				{/if}
				<div class="passage-wrapper">
					{#if data.passagesWithText && data.passagesWithText.length > 0}
						{#each data.passagesWithText as passageText, passageIndex}
							<div class="passage">
								{#if passageText.error}
									<div class="error-message">
										<Alert color="red" look="subtle" message={`Error loading ${passageText.reference}`} />
									</div>
								{:else if passageText.text && passageText.structure}
									<Heading heading="h3" classes="reference">{passageText.reference} [{translationAbbr}]</Heading>
									<div class="passage-container">
										{#if passageText.structure.columns && passageText.structure.columns.length > 0}
											{@const allSegments = passageText.structure.columns.flatMap(col => col.sections.flatMap(section => section.segments))}
											{@const segmentCount = allSegments.length}
											{@const structureKey = `${passageText.structure.passageId}-${segmentCount}`}
											{#key structureKey}
											{@const passageSegmentIndexTracker = { current: 0 }}
											{@const verseSectionMap = buildVerseSectionMap(allSegments)}
											{@const verseOccurrences = Object.keys(verseSectionMap).filter(verseId => verseSectionMap[verseId] >= 2).reduce((acc, verseId) => ({ ...acc, [verseId]: 0 }), {})}
											{#each passageText.structure.columns as column, columnIndex}
												<div class="column" data-column-id="{column.id}" class:compare-hidden={isCompareMode && !visibleColumnIds.has(column.id)}>
													{#if column.sections && column.sections.length > 0}
														{#each column.sections as section, sectionIndex}
															<div class="section {section.color}" data-section-id="{section.id}" class:compare-hidden={isCompareMode && !visibleSectionIds.has(section.id)}>
																{#if section.segments && section.segments.length > 0}
																	{#each section.segments as segment, segmentIndex}
																		{@const domSegmentIndex = passageSegmentIndexTracker.current}
																		{@const _segIncrement = (passageSegmentIndexTracker.current++, null)}
																		{@const nextSegment = section.segments[segmentIndex + 1]}
																		{@const nextSection = column.sections[sectionIndex + 1]}
																		{@const nextColumn = passageText.structure.columns[columnIndex + 1]}
																		{@const endWordId = nextSegment?.startingWordId || 
																							nextSection?.segments[0]?.startingWordId || 
																							nextColumn?.sections[0]?.segments[0]?.startingWordId || 
																							null}
																		{@const segmentHtml = extractSegmentText(
																			passageText.text,
																			segment.startingWordId,
																			endWordId,
																			passageIndex,
																			verseSectionMap,
																			verseOccurrences
																		)}
																		<Segment 
																			heading1={segment.headingOne}
																			heading2={segment.headingTwo}
																			heading3={segment.headingThree}
																			note={segment.note}
																			text={segmentHtml}
																			{passageIndex}
																			isActive={activeSegments.some(s => s.passageIndex === passageIndex && s.segmentIndex === domSegmentIndex)}
																			segmentId={segment.id}
																			generation={activeSegments.find(s => s.passageIndex === passageIndex && s.segmentIndex === domSegmentIndex)?.generation || 0}
																			isCompareHidden={isCompareMode && !visibleSegmentIds.has(segment.id)}
																		/>
																	{/each}
																{/if}
																
															<!-- Section toolbar: Command+any selection shows all, Single-select shows for active columns in that column -->
															{#if (isCommandKeyHeld && (activeColumns.length > 0 || activeSections.length > 0 || activeSegments.length > 0))
															     || (!isInMultiSelectMode && ((activeSegments.length > 0 && activeSegments.some(seg => isSegmentInColumn(column, seg.segmentId))) || activeSections.some(sId => getColumnIdFromSectionId(sId) === column.id) || activeColumns.includes(column.id)))}
																<ToolbarSection 
																	sectionId={section.id}
																	isActive={activeSections.includes(section.id)}
																/>
															{/if}
															</div>
														{/each}
													{/if}

													<!-- Column toolbar: Command+any selection shows all, Single-select shows for active columns in that column -->
													{#if (isCommandKeyHeld && (activeColumns.length > 0 || activeSections.length > 0 || activeSegments.length > 0))
													     || (!isInMultiSelectMode && ((activeSegments.length > 0 && activeSegments.some(seg => isSegmentInColumn(column, seg.segmentId))) || activeSections.some(sId => getColumnIdFromSectionId(sId) === column.id) || activeColumns.includes(column.id)))}
														<ToolbarColumn 
															columnId={column.id} 
															isActive={activeColumns.includes(column.id)}
														/>
													{/if}
												</div>
											{/each}
											{/key}
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					{:else}
						<p class="placeholder-text">No passages available for this study.</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
			
	<!-- Copyright Notice -->
	<div class="copyright-notice">
		{#if data.study.translation === 'esv'}
			<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.</p>
		{:else if data.study.translation === 'net'}
			<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved.</p>
		{/if}
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		position: relative;
		height: 100%;
	}

	.study-header {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: left;
	}

	.study-header :global(.heading) {
		margin: 0.0rem;
		padding: 0.0rem;
		line-height: 1;
	}

	.study-header :global(.subheading) {
		margin: 0.6rem 0.0rem 0.0rem;
		padding: 0.0rem;
		color: var(--gray-400);
		line-height: 1;
	}

	.placeholder-text {
		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	.analyze-content {
		flex-grow: 1;
		overflow-x: auto;
		overflow-y: auto;
		touch-action: pan-x pan-y pinch-zoom;
	}

	.analyze-content-wrapper {
		/* Wrapper defines the scrollable area size based on scaled dimensions */
		position: relative;
	}

	.analyze-content-inner {
		display: flex;
		flex-direction: column;
		gap: 2.6rem;
		padding: 2.6rem 4.4rem;
		transition: transform 0.2s ease-out;
		width: fit-content;
	}

	/* ============================================================ */
	/* Passage Layout */
	/* ============================================================ */

	.passage-wrapper {
		display: flex;
		gap: 3.9rem;
	}

	.passage {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	:global(h3.reference) {
		font-size: 1.2rem;
		margin-left: 0.2rem;
		margin-top: 0.0rem;
		margin-bottom: 0.9rem;
	}

	.passage-container {
		display: flex;
		align-items: flex-start;
		gap: 3.9rem;
	}

	.column {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 26.8rem;
		margin-bottom: 4.4rem;
		border-radius: 0.3rem;
		padding: 0.2rem;
	}

	.column.active {
		background-color: var(--gray-lighter);
		outline: 0.1rem solid var(--gray-700);
	}

	.wide-layout .column {
		width: 50.4rem;
	}

	.overview-mode :global(.text) {
		display: none;
	}

	.section {
		position: relative;
		/* CSS Custom Properties for color theming */
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
		--section-color: var(--green-dark);
		transition: box-shadow 50ms ease-in-out;
	}

	.section:not(:first-of-type) {
		margin-top: 4.3rem;
	}

	/* Color variant overrides */
	.section.red {
		--section-darker: var(--red-darker);
		--section-dark: var(--red-dark);
		--section-light: var(--red-light);
		--section-lighter: var(--red-lighter);
	}

	.section.orange {
		--section-darker: var(--orange-darker);
		--section-dark: var(--orange-dark);
		--section-light: var(--orange-light);
		--section-lighter: var(--orange-lighter);
	}

	.section.yellow {
		--section-darker: var(--yellow-darker);
		--section-dark: var(--yellow-dark);
		--section-light: var(--yellow-light);
		--section-lighter: var(--yellow-lighter);
	}

	.section.green {
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
	}

	.section.aqua {
		--section-darker: var(--aqua-darker);
		--section-dark: var(--aqua-dark);
		--section-light: var(--aqua-light);
		--section-lighter: var(--aqua-lighter);
	}

	.section.blue {
		--section-darker: var(--blue-darker);
		--section-dark: var(--blue-dark);
		--section-light: var(--blue-light);
		--section-lighter: var(--blue-lighter);
	}

	.section.purple {
		--section-darker: var(--purple-darker);
		--section-dark: var(--purple-dark);
		--section-light: var(--purple-light);
		--section-lighter: var(--purple-lighter);
	}

	.section.pink {
		--section-darker: var(--pink-darker);
		--section-dark: var(--pink-dark);
		--section-light: var(--pink-light);
		--section-lighter: var(--pink-lighter);
	}

	.segment {
		position: relative;
		transition: box-shadow 50ms ease-in-out;
	}

	.section:global(.active),
	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--section-dark);
	}

	.heading-one {
		font-size: 1.4rem;
		text-align: center;
		padding: 0.6rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: var(--section-lighter);
		background-color: var(--section-darker);
		border-color: var(--section-darker);
	}

	.heading-two {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		padding: 0.6rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		background-color: var(--section-lighter);
		color: var(--section-darker);
		border-color: var(--section-dark);
	}

	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.6rem 0.6rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--section-dark);
	}

	.overview-mode :global(.heading-three) {
		padding: 0.9rem;
		border-bottom: 0.1rem solid var(--section-dark);
	}

	.overview-mode :global(.segment:last-of-type .heading-three-container:last-child .heading-three) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.text {
		position: inherit;
		z-index: inherit;
		font-size: 1.1rem;
		line-height: 1.7;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.6rem 0.9rem 0.9rem;
		-webkit-user-select: text;
		user-select: text;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-color: var(--section-dark);
	}

	.segment:first-child .text.no-headings {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	.segment:last-child,
	.segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	:global(.chapter-verse) {
		font-weight: bold;
		color: var(--blue-500);
		padding-right: 0.3rem;
	}

	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-verses .text {
		white-space: normal;
	}

	.hide-notes :global(.note),
	.hide-notes :global(.note-input) {
		display: none;
	}

	/* ============================================================ */
	/* Compare Mode - Hide unselected items */
	/* ============================================================ */
	
	:global(.compare-hidden) {
		display: none !important;
	}

	/* ============================================================ */
	/* Compare Mode - Dynamic positioning classes */
	/* ============================================================ */
	
	/* First visible segment in compare mode */
	:global(.compare-first-segment .text.no-headings) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Last visible segment in compare mode */
	:global(.compare-last-segment),
	:global(.compare-last-segment .text) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* First visible section in compare mode - remove top margin */
	:global(.compare-first-section) {
		margin-top: 0 !important;
	}

	/* First segment with Heading One at top in compare mode */
	:global(.compare-first-segment .heading-one) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* First segment with Heading Two at top in compare mode */
	:global(.compare-first-segment .heading-two) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* First segment with Heading Three at top in compare mode */
	:global(.compare-first-segment:not(.has-heading-one):not(.has-heading-two).has-heading-three .heading-three) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* ============================================================ */
	/* Color-Aware Word Selection Styles */
	/* Uses CSS custom properties from .section for theming */
	/* ============================================================ */

	/* Hover state - color-aware highlight */
	.section :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--section-light);
	}

	/* Selected state - color-aware highlight */
	.section :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--section-light);
	}

	/* Enable text selection when Cmd/Ctrl is held */
	:global(.text-selection-enabled .text) {
		-webkit-user-select: text;
		user-select: text;
		cursor: text;
	}

	:global(.text-selection-enabled .text .selectable-word) {
		cursor: text;
	}

	/* Disable word selection hover effects when in text selection mode */
	:global(.text-selection-enabled .text .selectable-word:hover) {
		background-color: transparent !important;
	}

	:global(.text-selection-enabled .text .selectable-word:hover::before) {
		content: none !important;
	}

	/* Word selection styles */
	:global(.text .selectable-word) {
		position: relative;
		cursor: pointer;
		padding: 0.2rem 0.1rem;
		border-radius: 0.2rem;
	}

	/* Hover state - subtle highlight (only when not selected) */
	:global(.text .selectable-word:hover:not([data-selected])) {
		background-color: rgba(255, 255, 255, 0.1);
	}

	/* Hover state - show caret above word (only when not selected and not suppressed) */
	:global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 0.5;
	}

	/* Selected state - persistent highlight */
	:global(.text .selectable-word[data-selected="true"]) {
		background-color: rgba(255, 255, 255, 0.15);
	}

	/* Selected state - persistent caret (before position) */
	:global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	/* Selected state - persistent caret (after position) */
	:global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		right: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	.error-message {
		padding: 1.8rem;
		background-color: var(--red-900);
		border: 1px solid var(--red-700);
		border-radius: 0.4rem;
		margin-bottom: 1.8rem;
	}

	.error-message p {
		font-size: 1.4rem;
		color: var(--red-300);
		margin: 0;
	}

	.copyright-notice {
		position: absolute;
		text-align: center;
		width: 33.3rem;
		bottom: 0.9rem;
		right: 0.9rem;
		background: var(--white-alpha);
		border-radius: 0.3rem;
		z-index: 100;
	}

	.copyright-notice p {
		font-size: 1.0rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}

</style>
