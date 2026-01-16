<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Segment from '$lib/componentWidgets/Segment.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState, setWordSelection, setActiveSegment, setActiveSection, setCanInsertColumn, setActiveColumn } from '$lib/stores/toolbar.js';

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

	// Active segment state
	let activeSegment = $state(null); // { passageIndex, segmentIndex, segmentId, generation }
	let segmentClickGeneration = $state(0); // Increments on every segment click to force toolbar remount
	
	// Active column and section state
	let activeColumn = $state(null); // { segmentId } - tracks which column to activate
	let activeSection = $state(null); // { segmentId } - tracks which section to activate

	// Sync word selection state to toolbar store
	$effect(() => {
		setWordSelection(selectedWord !== null);
	});

	// Sync active segment state to toolbar store
	// Only set hasActiveSegment to true when neither column nor section mode is active
	$effect(() => {
		if (activeSegment && activeSegment.segmentId && !activeColumn && !activeSection) {
			// Only set active segment in store when in pure segment mode (not column/section mode)
			console.log('[SYNC] Sending segment ID to store:', activeSegment.segmentId);
			
			// Look up segment data to pass heading/note status
			const segmentElement = document.querySelector(`[data-segment-id="${activeSegment.segmentId}"]`);
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
			
			setActiveSegment(true, activeSegment.segmentId, {
				hasHeadingOne,
				hasHeadingTwo,
				hasHeadingThree,
				hasNote
			});
		} else {
			console.log('[SYNC] Clearing active segment from store');
			setActiveSegment(false, null);
		}
	});

	// Sync active column state to toolbar store
	$effect(() => {
		if (activeColumn && activeColumn.segmentId) {
			// Get the column ID from the DOM
			const segmentElement = document.querySelector(`[data-segment-id="${activeColumn.segmentId}"]`);
			const columnElement = segmentElement?.closest('.column');
			const columnId = columnElement?.dataset?.columnId || null;
			setActiveColumn(true, columnId);
		} else {
			setActiveColumn(false, null);
		}
	});

	// Sync active section state to toolbar store
	$effect(() => {
		if (activeSection && activeSection.segmentId) {
			// Get the section ID from the DOM
			const segmentElement = document.querySelector(`[data-segment-id="${activeSection.segmentId}"]`);
			const sectionElement = segmentElement?.closest('.section');
			const sectionId = sectionElement?.dataset?.sectionId || null;
			setActiveSection(true, sectionId);
		} else {
			setActiveSection(false, null);
		}
	});

	// Sync active section state to toolbar store
	// Set to true when column OR section is active (for color menu)
	$effect(() => {
		const hasActiveSection = activeColumn !== null || activeSection !== null;
		if (hasActiveSection) {
			// Get section ID from whichever is active
			const targetSegmentId = activeSection?.segmentId || activeColumn?.segmentId;
			if (targetSegmentId) {
				const segmentElement = document.querySelector(`[data-segment-id="${targetSegmentId}"]`);
				const sectionElement = segmentElement?.closest('.section');
				const sectionId = sectionElement?.dataset?.sectionId || null;
				setActiveSection(true, sectionId);
			} else {
				setActiveSection(true, null);
			}
		} else {
			setActiveSection(false, null);
		}
	});

	// Clear active segments and word selection when overview mode is enabled
	$effect(() => {
		if ($toolbarState.overviewMode) {
			activeSegment = null;
			selectedWord = null;
			suppressHoverCaret = null;
		}
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
			// Find the active segment and dispatch event with its ID
			if (activeSegment) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageElement = allPassages[activeSegment.passageIndex];
				if (passageElement) {
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const segmentId = segmentElement.dataset.segmentId;
						if (segmentId) {
							window.dispatchEvent(new CustomEvent('insert-heading-one', {
								detail: { segmentId }
							}));
						}
					}
				}
			}
		};
		
		// Listen for insert heading two event from MenuStructure
		const handleInsertHeadingTwoFromMenuEvent = () => {
			// Find the active segment and dispatch event with its ID
			if (activeSegment) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageElement = allPassages[activeSegment.passageIndex];
				if (passageElement) {
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const segmentId = segmentElement.dataset.segmentId;
						if (segmentId) {
							window.dispatchEvent(new CustomEvent('insert-heading-two', {
								detail: { segmentId }
							}));
						}
					}
				}
			}
		};
		
		// Listen for insert heading three event from MenuStructure
		const handleInsertHeadingThreeFromMenuEvent = () => {
			// Find the active segment and dispatch event with its ID
			if (activeSegment) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageElement = allPassages[activeSegment.passageIndex];
				if (passageElement) {
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const segmentId = segmentElement.dataset.segmentId;
						if (segmentId) {
							window.dispatchEvent(new CustomEvent('insert-heading-three', {
								detail: { segmentId }
							}));
						}
					}
				}
			}
		};
		
		// Listen for insert note event from MenuStructure
		const handleInsertNoteFromMenuEvent = () => {
			// Find the active segment and dispatch event with its ID
			if (activeSegment) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageElement = allPassages[activeSegment.passageIndex];
				if (passageElement) {
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const segmentId = segmentElement.dataset.segmentId;
						if (segmentId) {
							window.dispatchEvent(new CustomEvent('insert-note', {
								detail: { segmentId }
							}));
						}
					}
				}
			}
		};
		
		// Listen for select-column event from ToolbarStructure
		const handleSelectColumnEvent = (event) => {
			const { segmentId } = event.detail;
			console.log('[SELECT-COLUMN] Activating column for segment:', segmentId);
			
			// Set activeColumn and clear activeSection (keep activeSegment for toolbar)
			activeColumn = { segmentId };
			activeSection = null;
		};
		
		// Listen for deselect-column event from ToolbarStructure
		const handleDeselectColumnEvent = (event) => {
			const { segmentId } = event.detail;
			console.log('[DESELECT-COLUMN] Reactivating segment:', segmentId);
			
			// Clear activeColumn and reactivate the segment
			activeColumn = null;
			
			// Find the segment element and reactivate it
			const segmentElement = document.querySelector(`[data-segment-id="${segmentId}"]`);
			if (segmentElement) {
				const passageElement = segmentElement.closest('.passage');
				if (passageElement) {
					const allPassages = Array.from(document.querySelectorAll('.passage'));
					const passageIndex = allPassages.indexOf(passageElement);
					
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentIndex = allSegments.indexOf(segmentElement);
					
					if (passageIndex !== -1 && segmentIndex !== -1) {
						activeSegment = { passageIndex, segmentIndex, segmentId, activateSection: false };
					}
				}
			}
		};
		
		// Listen for select-section event from ToolbarStructure
		const handleSelectSectionEvent = (event) => {
			const { segmentId } = event.detail;
			console.log('[SELECT-SECTION] Activating section for segment:', segmentId);
			
			// Set activeSection and clear activeColumn (keep activeSegment for toolbar)
			activeSection = { segmentId };
			activeColumn = null;
		};
		
		// Listen for deselect-section event from ToolbarStructure
		const handleDeselectSectionEvent = (event) => {
			const { segmentId } = event.detail;
			console.log('[DESELECT-SECTION] Reactivating segment:', segmentId);
			
			// Clear activeSection and reactivate the segment
			activeSection = null;
			
			// Find the segment element and reactivate it
			const segmentElement = document.querySelector(`[data-segment-id="${segmentId}"]`);
			if (segmentElement) {
				const passageElement = segmentElement.closest('.passage');
				if (passageElement) {
					const allPassages = Array.from(document.querySelectorAll('.passage'));
					const passageIndex = allPassages.indexOf(passageElement);
					
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentIndex = allSegments.indexOf(segmentElement);
					
					if (passageIndex !== -1 && segmentIndex !== -1) {
						activeSegment = { passageIndex, segmentIndex, segmentId, activateSection: false };
					}
				}
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
				activeSegment = null;
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
				activeSegment = null;
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
				activeSegment = null;
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
				
				// Only clear active segment if NOT dragging in an input
				if (!isInInput) {
					activeSegment = null;
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
				// Only clear active segment if NOT clicking in an input
				activeSegment = null;
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
					// Clear any active column/section selections
					activeColumn = null;
					activeSection = null;
					// Activate the segment with generation
					activeSegment = { passageIndex, segmentIndex, segmentId, activateSection: false, generation: segmentClickGeneration };
				}
			}
		} else {
			// Clicked outside any segment - clear active state
			activeSegment = null;
			activeColumn = null;
			activeSection = null;
		}
		
		// Clear any existing timeout to prevent duplicate processing
		if (clickTimeout) {
			clearTimeout(clickTimeout);
			clickTimeout = null;
		}
		
		// Delay word selection processing to allow double/triple-clicks to work
		clickTimeout = setTimeout(() => {
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
						activeSegment = null; // Also deactivate segment
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
	 */
	function handleKeyDown(event) {
		if (event.key === 'Escape') {
			selectedWord = null;
			hoveredWord = null;
			// Clear browser's text selection
			window.getSelection()?.removeAllRanges();
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

		// Add active class based on current state
		if (activeColumn && activeColumn.segmentId) {
			// Activate the column containing the segment (column mode takes priority)
			const segmentElement = document.querySelector(`[data-segment-id="${activeColumn.segmentId}"]`);
			if (segmentElement) {
				const columnElement = segmentElement.closest('.column');
				if (columnElement) {
					columnElement.classList.add('active');
					console.log('[EFFECT] Activated column for segment:', activeColumn.segmentId);
				}
			}
		} else if (activeSection && activeSection.segmentId) {
			// Activate the section/section containing the segment (section mode takes priority)
			const segmentElement = document.querySelector(`[data-segment-id="${activeSection.segmentId}"]`);
			if (segmentElement) {
				const sectionElement = segmentElement.closest('.section');
				if (sectionElement) {
					sectionElement.classList.add('active');
					console.log('[EFFECT] Activated section for segment:', activeSection.segmentId);
				}
			}
		} else if (activeSegment && activeSegment.segmentId && !activeColumn && !activeSection) {
			// Only activate the segment if neither column nor section mode is active
			const segmentElement = document.querySelector(`[data-segment-id="${activeSegment.segmentId}"]`);
			if (segmentElement) {
				if (activeSegment.activateSection) {
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

<svelte:window on:keydown={handleKeyDown} />

<div class="container">
	{#if showHeader}
		<div class="study-header">
			<Heading heading="h1" classes="h4 heading" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
			{#if data.study.subtitle}
				<Heading heading="h2" classes="h5 subheading" isMuted>{data.study.subtitle}</Heading>
			{/if}
		</div>
	{/if}
	
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
				{#if data.passagesWithText && data.passagesWithText.length > 0}
					{#each data.passagesWithText as passageText, passageIndex}
						<div class="passage">
							{#if passageText.error}
								<div class="error-message">
									<Alert color="red" look="subtle" message={`Error loading ${passageText.reference}`} />
								</div>
							{:else if passageText.text && passageText.structure}
								<h3 class="reference">{passageText.reference} [{translationAbbr}]</h3>
								<div class="container">
									{#if passageText.structure.columns && passageText.structure.columns.length > 0}
										{@const allSegments = passageText.structure.columns.flatMap(col => col.sections.flatMap(section => section.segments))}
										{@const segmentCount = allSegments.length}
										{@const structureKey = `${passageText.structure.passageId}-${segmentCount}`}
										{#key structureKey}
										{@const passageSegmentIndexTracker = { current: 0 }}
										{@const verseSectionMap = buildVerseSectionMap(allSegments)}
										{@const verseOccurrences = Object.keys(verseSectionMap).filter(verseId => verseSectionMap[verseId] >= 2).reduce((acc, verseId) => ({ ...acc, [verseId]: 0 }), {})}
										{#each passageText.structure.columns as column, columnIndex}
											<div class="column" data-column-id="{column.id}">
												{#if column.sections && column.sections.length > 0}
													{#each column.sections as section, sectionIndex}
														<div class="section {section.color}" data-section-id="{section.id}">
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
																		isActive={activeSegment?.passageIndex === passageIndex && activeSegment?.segmentIndex === domSegmentIndex}
																		segmentId={segment.id}
																		generation={activeSegment?.generation || 0}
																	/>
																{/each}
															{/if}
														</div>
													{/each}
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
		position: relative;
		height: 100%;
	}

	.study-header {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: left;
		position: absolute;
		top: 0.9rem;
		left: 4.6rem;
		background: var(--gray-light);
		padding: 0.6rem 2.2rem;
		border-radius: 999em;
		z-index: 100;
		/* min-height: 4.8rem; */
	}

	.study-header :global(.heading) {
		margin: 0.0rem;
		padding: 0.0rem;
		line-height: 1.2;
	}

	.study-header :global(.subheading) {
		margin: 0.0rem;
		padding: 0.0rem;
		line-height: 1.2;
		color: var(--gray-400)
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
		gap: 3.9rem;
		padding: 6.7rem 4.4rem 1.8rem;
		transition: transform 0.2s ease-out;
		width: fit-content;
	}

	/* ============================================================ */
	/* Passage Layout */
	/* ============================================================ */

	.passage {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.reference {
		font-size: 1.2rem;
		margin-left: 0.2rem;
		margin-top: 0.0rem;
		margin-bottom: 0.9rem;
	}

	.container {
		display: flex;
		gap: 3.9rem;
	}

	.column {
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

	.section,
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

	.section:not(:first-of-type),
	.section:not(:first-of-type) {
		margin-top: 4.3rem;
	}

	/* Color variant overrides */
	.section.red,
	.section.red {
		--section-darker: var(--red-darker);
		--section-dark: var(--red-dark);
		--section-light: var(--red-light);
		--section-lighter: var(--red-lighter);
	}

	.section.orange,
	.section.orange {
		--section-darker: var(--orange-darker);
		--section-dark: var(--orange-dark);
		--section-light: var(--orange-light);
		--section-lighter: var(--orange-lighter);
	}

	.section.yellow,
	.section.yellow {
		--section-darker: var(--yellow-darker);
		--section-dark: var(--yellow-dark);
		--section-light: var(--yellow-light);
		--section-lighter: var(--yellow-lighter);
	}

	.section.green,
	.section.green {
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
	}

	.section.aqua,
	.section.aqua {
		--section-darker: var(--aqua-darker);
		--section-dark: var(--aqua-dark);
		--section-light: var(--aqua-light);
		--section-lighter: var(--aqua-lighter);
	}

	.section.blue,
	.section.blue {
		--section-darker: var(--blue-darker);
		--section-dark: var(--blue-dark);
		--section-light: var(--blue-light);
		--section-lighter: var(--blue-lighter);
	}

	.section.purple,
	.section.purple {
		--section-darker: var(--purple-darker);
		--section-dark: var(--purple-dark);
		--section-light: var(--purple-light);
		--section-lighter: var(--purple-lighter);
	}

	.section.pink,
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

	/* Color-specific word selection styles for green section */
	.section.green :global(.text .selectable-word:hover:not([data-selected])),
	.section.green :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--green-light);
	}

	.section.green :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before),
	.section.green :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.green :global(.text .selectable-word[data-selected="true"]),
	.section.green :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--green-light);
	}

	.section.green :global(.text .selectable-word[data-selected="true"][data-position="before"]::before),
	.section.green :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.green :global(.text .selectable-word[data-selected="true"][data-position="after"]::before),
	.section.green :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for red section */
	.section.red :global(.text .selectable-word:hover:not([data-selected])),
	.section.red :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--red-light);
	}

	.section.red :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before),
	.section.red :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.red :global(.text .selectable-word[data-selected="true"]),
	.section.red :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--red-light);
	}

	.section.red :global(.text .selectable-word[data-selected="true"][data-position="before"]::before),
	.section.red :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.red :global(.text .selectable-word[data-selected="true"][data-position="after"]::before),
	.section.red :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for orange section */
	.section.orange :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--orange-light);
	}

	.section.orange :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.orange :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--orange-light);
	}

	.section.orange :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.orange :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for yellow section */
	.section.yellow :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--yellow-light);
	}

	.section.yellow :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.yellow :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--yellow-light);
	}

	.section.yellow :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.yellow :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for aqua section */
	.section.aqua :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--aqua-light);
	}

	.section.aqua :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.aqua :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--aqua-light);
	}

	.section.aqua :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.aqua :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for blue section */
	.section.blue :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--blue-light);
	}

	.section.blue :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.blue :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--blue-light);
	}

	.section.blue :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.blue :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for purple section */
	.section.purple :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--purple-light);
	}

	.section.purple :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.purple :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--purple-light);
	}

	.section.purple :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.purple :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for pink section */
	.section.pink :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--pink-light);
	}

	.section.pink :global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.pink :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--pink-light);
	}

	.section.pink :global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.section.pink :global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
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
