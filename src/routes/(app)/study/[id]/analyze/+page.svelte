<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState, toggleTextSelection } from '$lib/stores/toolbar.js';

	let { data } = $props();

	// Word selection state
	let hoveredWord = $state(null); // { passageIndex, wordIndex }
	let selectedWord = $state(null); // { passageIndex, wordIndex, position }
	let suppressHoverCaret = $state(null); // { passageIndex, wordIndex } - suppress hover caret after deselection

	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

	/**
	 * Parse HTML text and wrap each word in a span for selection
	 * Preserves existing HTML structure (verse numbers, etc.)
	 * @param {string} htmlText - The HTML text to parse
	 * @param {number} passageIndex - Index of the passage
	 * @returns {string} HTML with words wrapped
	 */
	function wrapWordsInHtml(htmlText, passageIndex) {
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
	 * Handle word hover
	 * Disabled when in browser text selection mode (word selection OFF)
	 */
	function handleWordHover(event) {
		// Don't process word hover when in browser text selection mode
		if (!$toolbarState.textSelectionMode) return;
		
		const target = event.target;
		if (target.classList.contains('selectable-word')) {
			hoveredWord = {
				passageIndex: parseInt(target.dataset.passageIndex),
				wordIndex: parseInt(target.dataset.wordIndex)
			};
		}
	}

	/**
	 * Handle word hover end - also clears hover caret suppression
	 * Disabled when in browser text selection mode (word selection OFF)
	 */
	function handleWordHoverEnd() {
		// Don't process word hover end when in browser text selection mode
		if (!$toolbarState.textSelectionMode) return;
		
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
	 * Only active when word selection mode is ON
	 */
	function handleWordClick(event) {
		// Don't process word selection when button is OFF (browser text selection enabled)
		if (!$toolbarState.textSelectionMode) {
			return;
		}
		
		const target = event.target;
		if (target.classList.contains('selectable-word')) {
			const passageIndex = parseInt(target.dataset.passageIndex);
			const wordIndex = parseInt(target.dataset.wordIndex);
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
	 * Check if a word should show hover state
	 */
	function isWordHovered(passageIndex, wordIndex) {
		return hoveredWord?.passageIndex === passageIndex && hoveredWord?.wordIndex === wordIndex;
	}

	/**
	 * Check if a word is selected
	 */
	function isWordSelected(passageIndex, wordIndex) {
		return selectedWord?.passageIndex === passageIndex && selectedWord?.wordIndex === wordIndex;
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
	});

	/**
	 * Clear word selections when Select button is toggled off
	 */
	$effect(() => {
		// When textSelectionMode becomes false (button OFF), clear all word selections
		if (!$toolbarState.textSelectionMode) {
			selectedWord = null;
			hoveredWord = null;
			suppressHoverCaret = null;
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
	
	// Track natural (unscaled) dimensions of content
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	/**
	 * Measure the natural dimensions of content without transform
	 */
	function measureNaturalDimensions() {
		if (!contentInnerRef) return;

		// Temporarily remove transform to get true dimensions
		const currentTransform = contentInnerRef.style.transform;
		contentInnerRef.style.transform = 'none';
		
		naturalWidth = contentInnerRef.scrollWidth;
		naturalHeight = contentInnerRef.scrollHeight;
		
		// Restore transform
		contentInnerRef.style.transform = currentTransform;
	}

	/**
	 * Reset scroll position when zoom level actually changes
	 */
	$effect(() => {
		const currentZoomLevel = $toolbarState.zoomLevel;
		
		// Only reset if zoom level actually changed
		if (currentZoomLevel !== previousZoomLevel) {
			// Get the actual scroll container (.analyze-content)
			const scrollContainer = contentInnerRef?.parentElement?.parentElement;
			if (scrollContainer) {
				scrollContainer.scrollTo(0, 0);
			}
			
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
	 * Measure natural dimensions immediately when content first loads
	 */
	$effect(() => {
		if (contentInnerRef && data.passagesWithText?.length > 0) {
			// Use requestAnimationFrame to measure after initial render
			// This is faster and more reliable than setTimeout
			requestAnimationFrame(() => {
				measureNaturalDimensions();
				
				// If dimensions are still 0, content might not be fully rendered yet
				// Try one more time with a small delay
				if (naturalWidth === 0 || naturalHeight === 0) {
					requestAnimationFrame(() => {
						measureNaturalDimensions();
					});
				}
			});
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

<div class="container" class:text-selection-enabled={!$toolbarState.textSelectionMode}>
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
		onmouseover={handleWordHover}
		onmouseout={handleWordHoverEnd}
		onclick={handleWordClick}
	>
		<div class="analyze-content-wrapper" style="{wrapperDimensions}">
			<div bind:this={contentInnerRef} class="analyze-content-inner" style="transform: {zoomTransform}; transform-origin: top left;">
				<div class="spacer">&nbsp;</div>
				{#if data.passagesWithText && data.passagesWithText.length > 0}
					{#each data.passagesWithText as passageText, passageIndex}
						<div class="passage">
							{#if passageText.error}
								<div class="error-message">
									<Alert color="red" look="subtle" message={`Error loading ${passageText.reference}`} />
								</div>
							{:else if passageText.text}
								<Heading heading="h3" classes="h5 passage-reference">
									{passageText.reference} [{translationAbbr}]
								</Heading>
								<div class="passage-column">
									<div class="passage-division green">
										<div class="passage-division-header">
											<Heading heading="h4" classes="h3 division-heading">Division Heading</Heading>
										</div>
										<div class="passage-section">
											<div class="passage-section-header">
												<Heading heading="h4" classes="section-heading">Section Heading</Heading>
											</div>
											<div class="passage-segment">
												<div class="passage-segment-header">
													<Heading heading="h4" classes="segment-heading">Segment Heading</Heading>
												</div>
												<div class="passage-text">{@html wrapWordsInHtml(passageText.text, passageIndex)}</div>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				{:else}
					<p class="placeholder-text">No passages available for this study.</p>
				{/if}
				<div class="spacer">&nbsp;</div>
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
		position: absolute;
		top: 0.9rem;
		left: 2.3rem;
		background: var(--white-alpha);
		padding: 0.3rem 0.9rem 0.9rem;
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
		gap: 3.2rem;
		padding: 6.6rem 0.0rem 1.8rem;
		transition: transform 0.2s ease-out;
		width: fit-content;
	}

	.spacer {
		width: 0.1rem;
	}

	.passage {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.passage :global(.passage-reference) {
		margin-bottom: 0.9rem;
	}

	.passage-column {
		width: 28.8rem;
		margin-bottom: 1.8rem;
	}

	.wide-layout .passage-column {
		width: 50.4rem;
	}

	.overview-mode .passage-text {
		display: none;
	}

	.overview-mode .passage-segment-header {
		padding: 0.9rem;
	}

	.passage-division-header {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
		text-align: center;
	}

	.passage-segment {
		border: 0.1rem solid;
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.passage-division-header,
	.passage-section-header {
		border-top: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
	}

	.passage-division-header,
	.passage-section-header {
		padding: 0.9rem;
	}

	.passage-segment-header {
		padding: 0.9rem;
	}

	.passage-division-header :global(.division-heading),
	.passage-section-header :global(.section-heading),
	.passage-segment-header :global(.segment-heading)  {
		margin-bottom: 0.0rem;
		font-style: italic;
	}

	.passage-text {
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.0rem 0.9rem 0.9rem;
		-webkit-user-select: none;
		user-select: none;
	}

	/* Enable text selection when Cmd/Ctrl is held */
	.text-selection-enabled .passage-text {
		-webkit-user-select: text;
		user-select: text;
		cursor: text;
	}

	.text-selection-enabled .passage-text :global(.selectable-word) {
		cursor: text;
	}

	/* Disable word selection hover effects when in text selection mode */
	.text-selection-enabled .passage-text :global(.selectable-word:hover) {
		background-color: transparent !important;
	}

	.text-selection-enabled .passage-text :global(.selectable-word:hover::before) {
		content: none !important;
	}

	/* Word selection styles */
	.passage-text :global(.selectable-word) {
		position: relative;
		cursor: pointer;
		padding: 0.2rem 0.1rem;
		border-radius: 0.2rem;
		transition: background-color 0.15s ease;
	}

	/* Whitespace selection styles - ensure whitespace is selectable in both modes */
	:global(.selectable-space) {
		-webkit-user-select: text !important;
		user-select: text !important;
	}

	/* Hover state - subtle highlight (only when not selected) */
	.passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: rgba(255, 255, 255, 0.1);
	}

	/* Hover state - show caret above word (only when not selected and not suppressed) */
	.passage-text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.8rem;
		top: -1.1rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 0.8;
	}

	/* Selected state - persistent highlight */
	.passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: rgba(255, 255, 255, 0.15);
	}

	/* Selected state - persistent caret (before position) */
	.passage-text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.8rem;
		top: -1.1rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	/* Selected state - persistent caret (after position) */
	.passage-text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		right: -0.8rem;
		top: -1.1rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	/* Color variants for different passage divisions (only when not selected) */
	.passage-division.blue .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--blue-light);
	}

	.passage-division.blue .passage-text :global(.selectable-word:hover::before),
	.passage-division.blue .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--blue-dark);
	}

	.passage-division.blue .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--blue-light);
	}

	.passage-division.red .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--red-light);
	}

	.passage-division.red .passage-text :global(.selectable-word:hover::before),
	.passage-division.red .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--red-dark);
	}

	.passage-division.red .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--red-light);
	}

	.passage-division.orange .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--orange-light);
	}

	.passage-division.orange .passage-text :global(.selectable-word:hover::before),
	.passage-division.orange .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--orange-dark);
	}

	.passage-division.orange .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--orange-light);
	}

	.passage-division.yellow .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--yellow-light);
	}

	.passage-division.yellow .passage-text :global(.selectable-word:hover::before),
	.passage-division.yellow .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--yellow-dark);
	}

	.passage-division.yellow .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--yellow-light);
	}

	.passage-division.green .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--green-light);
	}

	.passage-division.green .passage-text :global(.selectable-word:hover::before),
	.passage-division.green .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--green-dark);
	}

	.passage-division.green .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--green-light);
	}

	.passage-division.aqua .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--aqua-light);
	}

	.passage-division.aqua .passage-text :global(.selectable-word:hover::before),
	.passage-division.aqua .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--aqua-dark);
	}

	.passage-division.aqua .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--aqua-light);
	}

	.passage-division.purple .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--purple-light);
	}

	.passage-division.purple .passage-text :global(.selectable-word:hover::before),
	.passage-division.purple .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--purple-dark);
	}

	.passage-division.purple .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--purple-light);
	}

	.passage-division.pink .passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--pink-light);
	}

	.passage-division.pink .passage-text :global(.selectable-word:hover::before),
	.passage-division.pink .passage-text :global(.selectable-word[data-selected="true"]::before) {
		color: var(--pink-dark);
	}

	.passage-division.pink .passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--pink-light);
	}

	:global(.chapter-verse) {
		font-weight: bold;
		color: var(--blue-500);
	}

	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-verses .passage-text {
		white-space: normal;
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
		padding: 0.9rem;
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

	.passage-division.blue .passage-division-header {
		background-color: var(--blue-darker);
		border-color: var(--blue-darker);
	}

	.passage-division.blue .passage-division-header :global(.division-heading) {
		color: var(--blue-lighter);
	}

	.passage-division.blue .passage-section-header {
		background-color: var(--blue-lighter);
		border-color: var(--blue-dark);
	}

	.passage-division.blue .passage-section-header :global(.section-heading) {
		color: var(--blue-darker);
	}

	.passage-division.blue .passage-segment {
		border-color: var(--blue-dark);
	}

	.passage-division.red .passage-division-header {
		background-color: var(--red-darker);
		border-color: var(--red-darker);
	}

	.passage-division.red .passage-division-header :global(.division-heading) {
		color: var(--red-lighter);
	}

	.passage-division.red .passage-section-header {
		background-color: var(--red-lighter);
		border-color: var(--red-dark);
	}

	.passage-division.red .passage-section-header :global(.section-heading) {
		color: var(--red-darker);
	}

	.passage-division.red .passage-segment {
		border-color: var(--red-dark);
	}

	.passage-division.orange .passage-division-header {
		background-color: var(--orange-darker);
		border-color: var(--orange-darker);
	}

	.passage-division.orange .passage-division-header :global(.division-heading) {
		color: var(--orange-lighter);
	}

	.passage-division.orange .passage-section-header {
		background-color: var(--orange-lighter);
		border-color: var(--orange-dark);
	}

	.passage-division.orange .passage-section-header :global(.section-heading) {
		color: var(--orange-darker);
	}

	.passage-division.orange .passage-segment {
		border-color: var(--orange-dark);
	}

	.passage-division.yellow .passage-division-header {
		background-color: var(--yellow-darker);
		border-color: var(--yellow-darker);
	}

	.passage-division.yellow .passage-division-header :global(.division-heading) {
		color: var(--yellow-lighter);
	}

	.passage-division.yellow .passage-section-header {
		background-color: var(--yellow-lighter);
		border-color: var(--yellow-dark);
	}

	.passage-division.yellow .passage-section-header :global(.section-heading) {
		color: var(--yellow-darker);
	}

	.passage-division.yellow .passage-segment {
		border-color: var(--yellow-dark);
	}

	.passage-division.green .passage-division-header {
		background-color: var(--green-darker);
		border-color: var(--green-darker);
	}

	.passage-division.green .passage-division-header :global(.division-heading) {
		color: var(--green-lighter);
	}

	.passage-division.green .passage-section-header {
		background-color: var(--green-lighter);
		border-color: var(--green-dark);
	}

	.passage-division.green .passage-section-header :global(.section-heading) {
		color: var(--green-darker);
	}

	.passage-division.green .passage-segment {
		border-color: var(--green-dark);
	}

	.passage-division.aqua .passage-division-header {
		background-color: var(--aqua-darker);
		border-color: var(--aqua-darker);
	}

	.passage-division.aqua .passage-division-header :global(.division-heading) {
		color: var(--aqua-lighter);
	}

	.passage-division.aqua .passage-section-header {
		background-color: var(--aqua-lighter);
		border-color: var(--aqua-dark);
	}

	.passage-division.aqua .passage-section-header :global(.section-heading) {
		color: var(--aqua-darker);
	}

	.passage-division.aqua .passage-segment {
		border-color: var(--aqua-dark);
	}

	.passage-division.purple .passage-division-header {
		background-color: var(--purple-darker);
		border-color: var(--purple-darker);
	}

	.passage-division.purple .passage-division-header :global(.division-heading) {
		color: var(--purple-lighter);
	}

	.passage-division.purple .passage-section-header {
		background-color: var(--purple-lighter);
		border-color: var(--purple-dark);
	}

	.passage-division.purple .passage-section-header :global(.section-heading) {
		color: var(--purple-darker);
	}

	.passage-division.purple .passage-segment {
		border-color: var(--purple-dark);
	}

	.passage-division.pink .passage-division-header {
		background-color: var(--pink-darker);
		border-color: var(--pink-darker);
	}

	.passage-division.pink .passage-division-header :global(.division-heading) {
		color: var(--pink-lighter);
	}

	.passage-division.pink .passage-section-header {
		background-color: var(--pink-lighter);
		border-color: var(--pink-dark);
	}

	.passage-division.pink .passage-section-header :global(.section-heading) {
		color: var(--pink-darker);
	}

	.passage-division.pink .passage-segment {
		border-color: var(--pink-dark);
	}

	/* Browser text selection colors - match passage-division colors */
	/* Safari/WebKit - explicitly target word and space spans */
	.passage-division.blue .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.blue .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.blue .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.blue .passage-text::-webkit-selection {
		background-color: var(--blue-light);
		color: var(--gray-100);
	}
	/* Other browsers */
	.passage-division.blue .passage-text :global(.selectable-word)::selection,
	.passage-division.blue .passage-text :global(.selectable-space)::selection,
	.passage-division.blue .passage-text :global(.chapter-verse)::selection,
	.passage-division.blue .passage-text::selection {
		background-color: var(--blue-light);
		color: var(--gray-100);
	}

	.passage-division.red .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.red .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.red .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.red .passage-text::-webkit-selection {
		background-color: var(--red-light);
		color: var(--gray-100);
	}
	.passage-division.red .passage-text :global(.selectable-word)::selection,
	.passage-division.red .passage-text :global(.selectable-space)::selection,
	.passage-division.red .passage-text :global(.chapter-verse)::selection,
	.passage-division.red .passage-text::selection {
		background-color: var(--red-light);
		color: var(--gray-100);
	}

	.passage-division.orange .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.orange .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.orange .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.orange .passage-text::-webkit-selection {
		background-color: var(--orange-light);
		color: var(--gray-100);
	}
	.passage-division.orange .passage-text :global(.selectable-word)::selection,
	.passage-division.orange .passage-text :global(.selectable-space)::selection,
	.passage-division.orange .passage-text :global(.chapter-verse)::selection,
	.passage-division.orange .passage-text::selection {
		background-color: var(--orange-light);
		color: var(--gray-100);
	}

	.passage-division.yellow .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.yellow .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.yellow .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.yellow .passage-text::-webkit-selection {
		background-color: var(--yellow-light);
		color: var(--gray-100);
	}
	.passage-division.yellow .passage-text :global(.selectable-word)::selection,
	.passage-division.yellow .passage-text :global(.selectable-space)::selection,
	.passage-division.yellow .passage-text :global(.chapter-verse)::selection,
	.passage-division.yellow .passage-text::selection {
		background-color: var(--yellow-light);
		color: var(--gray-100);
	}

	.passage-division.green .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.green .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.green .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.green .passage-text::-webkit-selection {
		background-color: var(--green-light);
		color: var(--gray-100);
	}
	.passage-division.green .passage-text :global(.selectable-word)::selection,
	.passage-division.green .passage-text :global(.selectable-space)::selection,
	.passage-division.green .passage-text :global(.chapter-verse)::selection,
	.passage-division.green .passage-text::selection {
		background-color: var(--green-light);
		color: var(--gray-100);
	}

	.passage-division.aqua .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.aqua .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.aqua .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.aqua .passage-text::-webkit-selection {
		background-color: var(--aqua-light);
		color: var(--gray-100);
	}
	.passage-division.aqua .passage-text :global(.selectable-word)::selection,
	.passage-division.aqua .passage-text :global(.selectable-space)::selection,
	.passage-division.aqua .passage-text :global(.chapter-verse)::selection,
	.passage-division.aqua .passage-text::selection {
		background-color: var(--aqua-light);
		color: var(--gray-100);
	}

	.passage-division.purple .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.purple .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.purple .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.purple .passage-text::-webkit-selection {
		background-color: var(--purple-light);
		color: var(--gray-100);
	}
	.passage-division.purple .passage-text :global(.selectable-word)::selection,
	.passage-division.purple .passage-text :global(.selectable-space)::selection,
	.passage-division.purple .passage-text :global(.chapter-verse)::selection,
	.passage-division.purple .passage-text::selection {
		background-color: var(--purple-light);
		color: var(--gray-100);
	}

	.passage-division.pink .passage-text :global(.selectable-word)::-webkit-selection,
	.passage-division.pink .passage-text :global(.selectable-space)::-webkit-selection,
	.passage-division.pink .passage-text :global(.chapter-verse)::-webkit-selection,
	.passage-division.pink .passage-text::-webkit-selection {
		background-color: var(--pink-light);
		color: var(--gray-100);
	}
	.passage-division.pink .passage-text :global(.selectable-word)::selection,
	.passage-division.pink .passage-text :global(.selectable-space)::selection,
	.passage-division.pink .passage-text :global(.chapter-verse)::selection,
	.passage-division.pink .passage-text::selection {
		background-color: var(--pink-light);
		color: var(--gray-100);
	}
</style>
