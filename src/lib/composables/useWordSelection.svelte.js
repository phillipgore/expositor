/**
 * Composable for managing word selection state and interactions
 * Handles hover states, click interactions, and word wrapping
 */

/**
 * Parse HTML text and wrap each word in a span for selection
 * Preserves existing HTML structure (verse numbers, etc.)
 * @param {string} htmlText - The HTML text to parse
 * @param {number} passageIndex - Index of the passage
 * @returns {string} HTML with words wrapped
 */
export function wrapWordsInHtml(htmlText, passageIndex) {
	if (!htmlText) return '';
	
	// Create a temporary div to parse HTML
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = htmlText;
	
	let wordIndex = 0;
	
	// Recursive function to process text nodes
	function processNode(node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent;
			if (!text.trim()) return; // Skip empty text nodes
			
			// Split by spaces and wrap each word
			const words = text.split(/(\s+)/);
			const fragment = document.createDocumentFragment();
			
			words.forEach(word => {
				if (word.match(/\s+/)) {
					// Wrap whitespace in span for consistent selection colors
					const spaceSpan = document.createElement('span');
					spaceSpan.className = 'selectable-space';
					spaceSpan.textContent = word;
					fragment.appendChild(spaceSpan);
				} else if (word.trim()) {
					// Wrap word in span
					const span = document.createElement('span');
					span.className = 'selectable-word';
					span.dataset.passageIndex = String(passageIndex);
					span.dataset.wordIndex = String(wordIndex);
					span.textContent = word;
					fragment.appendChild(span);
					wordIndex++;
				}
			});
			
			node.parentNode.replaceChild(fragment, node);
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			// Process child nodes
			Array.from(node.childNodes).forEach(child => processNode(child));
		}
	}
	
	processNode(tempDiv);
	return tempDiv.innerHTML;
}

/**
 * Create word selection state and handlers
 * @returns {Object} Word selection state and handlers
 */
export function useWordSelection() {
	let hoveredWord = $state(null); // { passageIndex, wordIndex }
	let selectedWord = $state(null); // { passageIndex, wordIndex, position }
	let suppressHoverCaret = $state(null); // { passageIndex, wordIndex }

	/**
	 * Handle word hover
	 * @param {MouseEvent} event
	 * @param {boolean} isDragging - Whether user is currently dragging
	 */
	function handleWordHover(event, isDragging = false) {
		// Don't process word hover when dragging
		if (isDragging) return;
		
		const target = /** @type {HTMLElement} */ (event.target);
		if (target?.classList?.contains('selectable-word')) {
			hoveredWord = {
				passageIndex: parseInt(target.dataset.passageIndex || '0'),
				wordIndex: parseInt(target.dataset.wordIndex || '0')
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
	 * @param {MouseEvent} event
	 * @param {boolean} isDragging - Whether user is currently dragging
	 */
	function handleWordClick(event, isDragging = false) {
		// Don't process word selection when dragging (text selection)
		if (isDragging) return;
		
		const target = /** @type {HTMLElement} */ (event.target);
		if (target?.classList?.contains('selectable-word')) {
			const passageIndex = parseInt(target.dataset.passageIndex || '0');
			const wordIndex = parseInt(target.dataset.wordIndex || '0');
			const isShiftKey = event.shiftKey;
			
			// Check if clicking the same word
			const isSameWord = selectedWord?.passageIndex === passageIndex && 
			                   selectedWord?.wordIndex === wordIndex;
			
			if (isShiftKey) {
				// Shift+Click: Jump directly to "after" position
				selectedWord = { passageIndex, wordIndex, position: 'after' };
				suppressHoverCaret = null; // Clear suppression
			} else if (isSameWord) {
				// Clicking same word: cycle through states
				if (selectedWord.position === 'before') {
					// Before -> After
					selectedWord = { passageIndex, wordIndex, position: 'after' };
					suppressHoverCaret = null; // Clear suppression
				} else {
					// After -> Deselect (suppress hover caret until mouse out)
					selectedWord = null;
					suppressHoverCaret = { passageIndex, wordIndex };
				}
			} else {
				// Clicking different word: start with "before"
				selectedWord = { passageIndex, wordIndex, position: 'before' };
				suppressHoverCaret = null; // Clear suppression
			}
		} else {
			// Clear selection when clicking outside of a word
			selectedWord = null;
			suppressHoverCaret = null;
		}
	}

	/**
	 * Clear all word selections
	 */
	function clearSelection() {
		selectedWord = null;
		hoveredWord = null;
	}

	/**
	 * Update DOM elements with data attributes for selection state
	 * Should be called in an $effect
	 */
	function updateWordAttributes() {
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
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-index="${selectedWord.wordIndex}"]`
			);
			if (selectedElement) {
				selectedElement.setAttribute('data-selected', 'true');
				selectedElement.setAttribute('data-position', selectedWord.position);
			}
		}
		
		// Add data-suppress-hover-caret to the word where hover caret should be suppressed
		if (suppressHoverCaret) {
			const suppressElement = document.querySelector(
				`.selectable-word[data-passage-index="${suppressHoverCaret.passageIndex}"][data-word-index="${suppressHoverCaret.wordIndex}"]`
			);
			if (suppressElement) {
				suppressElement.setAttribute('data-suppress-hover-caret', 'true');
			}
		}
	}

	return {
		// State
		get hoveredWord() { return hoveredWord; },
		get selectedWord() { return selectedWord; },
		get suppressHoverCaret() { return suppressHoverCaret; },
		
		// Handlers
		handleWordHover,
		handleWordHoverEnd,
		handleWordClick,
		clearSelection,
		updateWordAttributes
	};
}
