<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import ToolbarPassage from '$lib/componentWidgets/ToolbarPassage.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState, setWordSelection, setActiveSegment, setActiveSplit, setCanInsertColumn } from '$lib/stores/toolbar.js';

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
	let activeSegment = $state(null); // { passageIndex, segmentIndex }

	// Toolbar mode state
	let toolbarMode = $state('outline'); // 'outline', 'literary', or 'color'

	// Reset toolbar mode to 'outline' when no segment is active
	$effect(() => {
		if (!activeSegment) {
			toolbarMode = 'outline';
		}
	});

	// Switch toolbar mode to 'outline' when a word is selected
	$effect(() => {
		if (selectedWord) {
			toolbarMode = 'outline';
		}
	});

	// Sync word selection state to toolbar store
	$effect(() => {
		setWordSelection(selectedWord !== null);
	});

	// Sync active segment state to toolbar store
	$effect(() => {
		setActiveSegment(activeSegment !== null);
	});

	// Sync active split state to toolbar store (for color mode)
	$effect(() => {
		setActiveSplit(activeSegment?.activateSplit === true);
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
		
		// Listen for insert segment event from MenuStructure
		const handleInsertSegmentEvent = () => {
			handleInsertSegment();
		};
		
		window.addEventListener('insert-segment', handleInsertSegmentEvent);
		
		return () => {
			window.removeEventListener('insert-segment', handleInsertSegmentEvent);
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
		const splitElement = wordElement.closest('.split');
		const columnElement = wordElement.closest('.column');
		
		if (!segmentElement || !splitElement || !columnElement) {
			console.log('Parent structural elements not found');
			return;
		}
		
		// Extract IDs from data attributes
		const columnId = columnElement.dataset.columnId;
		const splitId = splitElement.dataset.splitId;
		const segmentId = segmentElement.dataset.segmentId;
		
		if (!columnId || !splitId || !segmentId) {
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

		console.log('Inserting column at:', insertionWordId, 'in column:', columnId, 'split:', splitId, 'segment:', segmentId);

		try {
			const response = await fetch('/api/passages/columns/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					columnId: columnId,
					splitId: splitId,
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

		// Get the word element to find its parent split
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find the parent split element
		const splitElement = wordElement.closest('.split');
		if (!splitElement) {
			console.log('No parent split found');
			return;
		}
		
		// Extract split ID from the data attribute
		const splitId = splitElement.dataset.splitId;
		if (!splitId) {
			console.log('No split ID found on element');
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

		console.log('Inserting segment at:', insertionWordId, 'in split:', splitId, 'for passage:', passageText.structure.passageId);

		try {
			const response = await fetch('/api/passages/segments/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					splitId: splitId,
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
	 * Extract text segment from full passage HTML based on word boundaries
	 * @param {string} fullHtml - The full passage HTML text
	 * @param {string} startWordId - Starting word ID (e.g., 'ac-01-01-001')
	 * @param {string|null} endWordId - Ending word ID (null = extract to end)
	 * @param {number} passageIndex - Index of the passage
	 * @returns {string} Extracted HTML
	 */
	function extractSegmentText(fullHtml, startWordId, endWordId, passageIndex) {
		if (!fullHtml) return '';
		
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = fullHtml;
		
		const allWords = tempDiv.querySelectorAll('.word[data-word-id]');
		let capturing = false;
		const capturedNodes = [];
		
		for (let i = 0; i < allWords.length; i++) {
			const word = allWords[i];
			
			// Start capturing when we reach the start word
			if (word.dataset.wordId === startWordId) {
				capturing = true;
			}
			
			// Stop capturing when we reach the end word (BEFORE capturing it)
			if (endWordId && word.dataset.wordId === endWordId) {
				break;
			}
			
			if (capturing) {
				// Clone the word and add selection attributes
				// data-word-id is preserved from the original API response (immutable)
				const wordClone = word.cloneNode(true);
				wordClone.classList.add('selectable-word');
				wordClone.dataset.passageIndex = String(passageIndex);
				// Do NOT recount words - data-word-id from API is preserved
				
				capturedNodes.push(wordClone);
				
				// Capture any text/elements between this word and the next
				let next = word.nextSibling;
				const nextWord = allWords[i + 1];
				
				while (next && next !== nextWord) {
					if (next.nodeType === Node.TEXT_NODE || 
					    (next.nodeType === Node.ELEMENT_NODE && next.classList?.contains('chapter-verse'))) {
						capturedNodes.push(next.cloneNode(true));
					}
					next = next.nextSibling;
				}
			}
		}
		
		// Build HTML from captured nodes
		const fragment = document.createDocumentFragment();
		capturedNodes.forEach(node => fragment.appendChild(node));
		
		const container = document.createElement('div');
		container.appendChild(fragment);
		
		return container.innerHTML;
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
				isDragging = true;
				dragJustCompleted = true; // Mark that a drag occurred
				// Clear custom selections immediately when drag is detected
				selectedWord = null;
				suppressHoverCaret = null;
				activeSegment = null;
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

		// Don't allow segment/split activation in overview mode
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
			// Clear active segment/split
			activeSegment = null;
			return; // Let browser handle double/triple-click text selection
		}
		
		// Capture event data before async timeout
		const clickedSegment = event.target.closest('.segment');
		const target = event.target;
		
		// Handle segment/split activation IMMEDIATELY (no delay)
		// This makes the toolbar appear instantly without waiting for debounce
		if (clickedSegment) {
			// Find passage and segment indices
			const passageElement = clickedSegment.closest('.passage');
			if (passageElement) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageIndex = allPassages.indexOf(passageElement);
				
				const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
				const segmentIndex = allSegments.indexOf(clickedSegment);
				
				if (passageIndex !== -1 && segmentIndex !== -1) {
					// In 'color' mode, activate the split instead of the segment
					if (toolbarMode === 'color') {
						// Find the split (parent of segment)
						const splitElement = clickedSegment.closest('.split');
						if (splitElement) {
							// Store segment index but mark as split activation
							activeSegment = { passageIndex, segmentIndex, activateSplit: true };
						}
					} else {
						// In 'outline' and 'literary' modes, activate the segment
						activeSegment = { passageIndex, segmentIndex, activateSplit: false };
					}
				}
			}
		} else {
			// Clicked outside any segment - clear active state
			activeSegment = null;
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
	 * Update DOM elements with active class when active segment changes
	 */
	$effect(() => {
		// Remove active class from all segments and splits
		const allSegments = document.querySelectorAll('.segment');
		allSegments.forEach(segment => {
			segment.classList.remove('active');
		});
		const allSplits = document.querySelectorAll('.split');
		allSplits.forEach(split => {
			split.classList.remove('active');
		});

		// Add active class to the selected segment or split
		if (activeSegment) {
			const allPassages = Array.from(document.querySelectorAll('.passage'));
			const passageElement = allPassages[activeSegment.passageIndex];
			if (passageElement) {
				if (activeSegment.activateSplit) {
					// Activate the split (color mode)
					const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
					const segmentElement = allSegments[activeSegment.segmentIndex];
					if (segmentElement) {
						const splitElement = segmentElement.closest('.split');
						if (splitElement) {
							splitElement.classList.add('active');
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
			<div>
				<Heading heading="h1" classes="h4 heading" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
				{#if data.study.subtitle}
					<Heading heading="h2" classes="h5 subheading" isMuted>{data.study.subtitle}</Heading>
				{/if}
			</div>
		</div>
	{/if}
	
	<!-- Analyze View Content -->
	<div 
		class="analyze-content" 
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
										{@const passageSegmentIndexTracker = { current: 0 }}
										{#each passageText.structure.columns as column, columnIndex}
											<div class="column" data-column-id="{column.id}">
												{#if column.splits && column.splits.length > 0}
													{#each column.splits as split, splitIndex}
														<div class="split {split.color}" data-split-id="{split.id}">
															{#if split.segments && split.segments.length > 0}
																{#each split.segments as segment, segmentIndex}
																	{@const domSegmentIndex = passageSegmentIndexTracker.current}
																	{@const _segIncrement = (passageSegmentIndexTracker.current++, null)}
																	{@const nextSegment = split.segments[segmentIndex + 1]}
																	{@const nextSplit = column.splits[splitIndex + 1]}
																	{@const nextColumn = passageText.structure.columns[columnIndex + 1]}
																	{@const endWordId = nextSegment?.startingWordId || 
																	                    nextSplit?.segments[0]?.startingWordId || 
																	                    nextColumn?.splits[0]?.segments[0]?.startingWordId || 
																	                    null}
																	{@const segmentHtml = extractSegmentText(
																		passageText.text,
																		segment.startingWordId,
																		endWordId,
																		passageIndex
																	)}
																	<div class="segment" data-segment-id="{segment.id}">
																		<ToolbarPassage 
																			bind:toolbarMode={toolbarMode}
																			isActive={activeSegment?.passageIndex === passageIndex && activeSegment?.segmentIndex === domSegmentIndex}
																			onInsertColumn={handleInsertColumn}
																			onInsertSegment={handleInsertSegment}
																		/>
																		
																		{#if segment.headingOne}
																			<h4 class="heading-one">{segment.headingOne}</h4>
																		{/if}
																		{#if segment.headingTwo}
																			<h5 class="heading-two">{segment.headingTwo}</h5>
																		{/if}
																		{#if segment.headingThree}
																			<h6 class="heading-three">{segment.headingThree}</h6>
																		{/if}
																		
																		<div class="text" class:no-headings={!segment.headingOne && !segment.headingTwo && !segment.headingThree}>
																			{@html segmentHtml}
																		</div>
																	</div>
																{/each}
															{/if}
														</div>
													{/each}
												{/if}
											</div>
										{/each}
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
		position: absolute;
		top: 0.9rem;
		left: 3.5rem;
		background: var(--white-alpha);
		padding: 0.0rem 0.9rem;
		border-radius: 0.3rem;
		z-index: 100;
	}

	.study-header :global(.subheading) {
		margin: 0.0rem;
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
		gap: 4.4rem;
		padding: 6.5rem 4.4rem 1.8rem;
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
		margin-top: 0.0rem;
		margin-bottom: 0.9rem;
	}

	.container {
		display: flex;
		gap: 4.4rem;
	}

	.column {
		display: flex;
		flex-direction: column;
		width: 28.8rem;
		margin-bottom: 4.4rem;
		border-radius: 0.3rem;
	}

	.wide-layout .column {
		width: 50.4rem;
	}

	.overview-mode :global(.text) {
		display: none;
	}

	.split {
		position: relative;
		/* CSS Custom Properties for color theming */
		--split-darker: var(--green-darker);
		--split-dark: var(--green-dark);
		--split-light: var(--green-light);
		--split-lighter: var(--green-lighter);
		--split-color: var(--green-dark);
		transition: box-shadow 50ms ease-in-out;
	}

	.split:not(:first-of-type) {
		margin-top: 4.4rem;
	}

	/* Color variant overrides */
	.split.red {
		--split-darker: var(--red-darker);
		--split-dark: var(--red-dark);
		--split-light: var(--red-light);
		--split-lighter: var(--red-lighter);
	}

	.split.orange {
		--split-darker: var(--orange-darker);
		--split-dark: var(--orange-dark);
		--split-light: var(--orange-light);
		--split-lighter: var(--orange-lighter);
	}

	.split.yellow {
		--split-darker: var(--yellow-darker);
		--split-dark: var(--yellow-dark);
		--split-light: var(--yellow-light);
		--split-lighter: var(--yellow-lighter);
	}

	.split.green {
		--split-darker: var(--green-darker);
		--split-dark: var(--green-dark);
		--split-light: var(--green-light);
		--split-lighter: var(--green-lighter);
	}

	.split.aqua {
		--split-darker: var(--aqua-darker);
		--split-dark: var(--aqua-dark);
		--split-light: var(--aqua-light);
		--split-lighter: var(--aqua-lighter);
	}

	.split.blue {
		--split-darker: var(--blue-darker);
		--split-dark: var(--blue-dark);
		--split-light: var(--blue-light);
		--split-lighter: var(--blue-lighter);
	}

	.split.purple {
		--split-darker: var(--purple-darker);
		--split-dark: var(--purple-dark);
		--split-light: var(--purple-light);
		--split-lighter: var(--purple-lighter);
	}

	.split.pink {
		--split-darker: var(--pink-darker);
		--split-dark: var(--pink-dark);
		--split-light: var(--pink-light);
		--split-lighter: var(--pink-lighter);
	}

	.split .segment:first-child,
	.split .segment:first-child .heading-one {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	.segment {
		position: relative;
		transition: box-shadow 50ms ease-in-out;
	}

	.split:global(.active),
	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--split-dark);
	}

	.heading-one {
		font-size: 1.6rem;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: var(--split-lighter);
		background-color: var(--split-darker);
		border-color: var(--split-darker);
	}

	.heading-two {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		padding: 0.9rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		background-color: var(--split-lighter);
		color: var(--split-darker);
		border-color: var(--split-dark);
	}

	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.9rem 0.9rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--split-dark);
	}

	.overview-mode .heading-three {
		padding: 0.9rem;
		border-bottom: 0.1rem solid var(--split-dark);
	}

	.overview-mode .heading-three:last-of-type {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.text {
		position: inherit;
		z-index: inherit;
		font-size: 1.3rem;
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
		border-color: var(--split-dark);
	}

	.segment:first-child .text.no-headings {
		border-top: 0.1rem solid;
		border-color: var(--split-dark);
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
	}

	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-verses .text {
		white-space: normal;
	}

	/* Color-specific word selection styles for green split */
	.split.green .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--green-light);
	}

	.split.green .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.green .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--green-light);
	}

	.split.green .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.green .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%231d6d37' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for red split */
	.split.red .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--red-light);
	}

	.split.red .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.red .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--red-light);
	}

	.split.red .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.red .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for orange split */
	.split.orange .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--orange-light);
	}

	.split.orange .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.orange .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--orange-light);
	}

	.split.orange .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.orange .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D2800' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for yellow split */
	.split.yellow .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--yellow-light);
	}

	.split.yellow .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--yellow-light);
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D4D08' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for aqua split */
	.split.aqua .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--aqua-light);
	}

	.split.aqua .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--aqua-light);
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23084D4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for blue split */
	.split.blue .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--blue-light);
	}

	.split.blue .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.blue .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--blue-light);
	}

	.split.blue .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.blue .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23082A4D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for purple split */
	.split.purple .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--purple-light);
	}

	.split.purple .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.purple .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--purple-light);
	}

	.split.purple .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.purple .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%232A084D' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Color-specific word selection styles for pink split */
	.split.pink .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--pink-light);
	}

	.split.pink .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.pink .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--pink-light);
	}

	.split.pink .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.pink .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%234D0831' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	/* Enable text selection when Cmd/Ctrl is held */
	.text-selection-enabled .text {
		-webkit-user-select: text;
		user-select: text;
		cursor: text;
	}

	.text-selection-enabled .text :global(.selectable-word) {
		cursor: text;
	}

	/* Disable word selection hover effects when in text selection mode */
	.text-selection-enabled .text :global(.selectable-word:hover) {
		background-color: transparent !important;
	}

	.text-selection-enabled .text :global(.selectable-word:hover::before) {
		content: none !important;
	}

	/* Word selection styles */
	.text :global(.selectable-word) {
		position: relative;
		cursor: pointer;
		padding: 0.2rem 0.1rem;
		border-radius: 0.2rem;
	}

	/* Hover state - subtle highlight (only when not selected) */
	.text :global(.selectable-word:hover:not([data-selected])) {
		background-color: rgba(255, 255, 255, 0.1);
	}

	/* Hover state - show caret above word (only when not selected and not suppressed) */
	.text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.8rem;
		top: -1.1rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 0.5;
	}

	/* Selected state - persistent highlight */
	.text :global(.selectable-word[data-selected="true"]) {
		background-color: rgba(255, 255, 255, 0.15);
	}

	/* Selected state - persistent caret (before position) */
	.text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.8rem;
		top: -1.1rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	/* Selected state - persistent caret (after position) */
	.text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		right: -0.8rem;
		top: -1.1rem;
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
