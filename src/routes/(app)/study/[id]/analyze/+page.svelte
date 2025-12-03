<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import ButtonGrouped from '$lib/componentElements/buttons/ButtonGrouped.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { data } = $props();

	// Word selection state
	let hoveredWord = $state(null); // { passageIndex, wordIndex }
	let selectedWord = $state(null); // { passageIndex, wordIndex, position }
	let suppressHoverCaret = $state(null); // { passageIndex, wordIndex } - suppress hover caret after deselection
	
	// Drag detection state
	let dragStartPos = $state(null); // { x, y } - mouse position on mousedown
	let isDragging = $state(false); // Whether user is dragging (text selection mode)

	// Active segment state
	let activeSegment = $state(null); // { passageIndex, segmentIndex }

	// Toolbar mode state
	let toolbarMode = $state('outline'); // 'outline', 'literary', or 'color'

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
			}
		}
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
				wordIndex: parseInt(target.dataset.wordIndex)
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
		// Don't process word selection when dragging (text selection)
		if (isDragging) {
			// Reset drag state
			dragStartPos = null;
			isDragging = false;
			return;
		}
		
		// Handle segment/split activation based on toolbar mode
		const clickedSegment = event.target.closest('.segment');
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
		
		// Handle word selection
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
				`.selectable-word[data-index="${selectedWord.passageIndex}"][data-word-index="${selectedWord.wordIndex}"]`
			);
			if (selectedElement) {
				selectedElement.setAttribute('data-selected', 'true');
				selectedElement.setAttribute('data-position', selectedWord.position);
			}
		}
		
		// Add data-suppress-hover-caret to the word where hover caret should be suppressed
		if (suppressHoverCaret) {
			const suppressElement = document.querySelector(
				`.selectable-word[data-index="${suppressHoverCaret.passageIndex}"][data-word-index="${suppressHoverCaret.wordIndex}"]`
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
							{:else if passageText.text}
								<h3 class="reference">{passageText.reference} [{translationAbbr}]</h3>
								<div class="container">
									<div class="column">
										<div class="split green">
											<div class="segment">
												<div class="controls">
													<ButtonGrouped
														buttons={[
															{ id: 'outline', iconId: 'outline-section', label: '' },
															{ id: 'literary', iconId: 'literary-chiasim', label: '' },
															{ id: 'color', iconId: 'paintbrush', label: '' }
														]}
														defaultActive='outline'
														onActiveChange={(buttonId) => { toolbarMode = buttonId; }}
														buttonClasses='passage-toolbar'
														isSquare
														isList
													/>
													<DividerHorizontal />
													{#if toolbarMode === 'outline'}
													<div class="button-container outline">
														<div class="button-group">
															<IconButton iconId="split" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="join" classes="passage-toolbar" isSquare></IconButton>
														</div>
														<div class="button-group">
															<IconButton iconId="heading-one" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="heading-two" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="heading-three" classes="passage-toolbar" isSquare></IconButton>
														</div>
														<div class="button-group">
															<IconButton iconId="arrow-up" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="arrow-down" classes="passage-toolbar" isSquare></IconButton>
														</div>
														<div class="button-group">
															<IconButton iconId="outline-disconnect" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="outline-connect" classes="passage-toolbar" isSquare></IconButton>
														</div>
														<div class="button-group">
															<IconButton iconId="column-insert" classes="passage-toolbar" isSquare></IconButton>
															<IconButton iconId="column-remove" classes="passage-toolbar" isSquare></IconButton>
														</div>
													</div>
													{/if}
													{#if toolbarMode === 'literary'}
													<div class="button-container literary">
														<IconButton iconId="literary-chiasim" classes="passage-toolbar" isSquare></IconButton>
														<IconButton iconId="literary-paralell" classes="passage-toolbar" isSquare></IconButton>
														<IconButton iconId="literary-repeat" classes="passage-toolbar" isSquare></IconButton>
														<IconButton iconId="literary-intensify" classes="passage-toolbar" isSquare></IconButton>
													</div>
													{/if}
													{#if toolbarMode === 'color'}
													<div class="button-container color">
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-red" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-orange" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-yellow" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-green" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-aqua" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-blue" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-purple" isSquare></IconButton>
														<IconButton iconId="circle" classes="passage-toolbar icon-fill-pink" isSquare></IconButton>
													</div>
													{/if}
												</div>
												<h4 class="heading-one">Heading One</h4>
												<h5 class="heading-two">Heading Two</h5>
												<h6 class="heading-three">Heading Three</h6>
												<div class="text">{@html wrapWordsInHtml(passageText.text, passageIndex)}</div>
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
		gap: 4.4rem;
		padding: 6.6rem 4.4rem 1.8rem;
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

	.overview-mode .text {
		display: none;
	}

	.split {
		position: relative;
	}

	.split:not(:first-of-type) {
		margin-top: 4.4rem;
	}

	.split .segment:first-child,
	.split .segment:first-child .heading-one {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	.segment {
		position: relative;
	}

	.split:global(.active),
	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--black);
	}

	.controls {
		display: none;
		content: " ";
		width: 3.4rem;
		position: absolute;
		right: -3.4rem;
		top: 0.6rem;
		min-height: calc(100% - 1.2rem);
		overflow: hidden;
	}

	.controls :global(.group-container) {
		margin: 0.0rem;
	}

	.split:global(.active) .controls,
	.segment:global(.active) .controls {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-left: 0.6rem;
	}

	.button-container {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-left: 0.5rem;
		gap: 0.9rem;
	}

	.button-group {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.heading-one {
		font-size: 1.6rem;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: white;
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
	}

	.text {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.9rem;
		-webkit-user-select: text;
		user-select: text;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
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

	/* Whitespace selection styles - ensure whitespace is selectable in both modes */
	:global(.selectable-space) {
		-webkit-user-select: text !important;
		user-select: text !important;
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

	/* Browser text selection colors - match split colors */
	/* Safari/WebKit - explicitly target word and space spans */
	.split.blue .text :global(.selectable-word)::-webkit-selection,
	.split.blue .text :global(.selectable-space)::-webkit-selection,
	.split.blue .text :global(.chapter-verse)::-webkit-selection,
	.split.blue .text::-webkit-selection,
	.split.blue .heading-two::-webkit-selection {
		background-color: var(--blue-light);
		color: var(--gray-100);
	}
	/* Other browsers */
	.split.blue .text :global(.selectable-word)::selection,
	.split.blue .text :global(.selectable-space)::selection,
	.split.blue .text :global(.chapter-verse)::selection,
	.split.blue .text::selection,
	.split.blue .heading-two::selection {
		background-color: var(--blue-light);
		color: var(--gray-100);
	}

	.split.red .text :global(.selectable-word)::-webkit-selection,
	.split.red .text :global(.selectable-space)::-webkit-selection,
	.split.red .text :global(.chapter-verse)::-webkit-selection,
	.split.red .text::-webkit-selection,
	.split.red .heading-two::-webkit-selection {
		background-color: var(--red-light);
		color: var(--gray-100);
	}
	.split.red .text :global(.selectable-word)::selection,
	.split.red .text :global(.selectable-space)::selection,
	.split.red .text :global(.chapter-verse)::selection,
	.split.red .text::selection,
	.split.red .heading-two::selection {
		background-color: var(--red-light);
		color: var(--gray-100);
	}

	.split.orange .text :global(.selectable-word)::-webkit-selection,
	.split.orange .text :global(.selectable-space)::-webkit-selection,
	.split.orange .text :global(.chapter-verse)::-webkit-selection,
	.split.orange .text::-webkit-selection,
	.split.orange .heading-two::-webkit-selection {
		background-color: var(--orange-light);
		color: var(--gray-100);
	}
	.split.orange .text :global(.selectable-word)::selection,
	.split.orange .text :global(.selectable-space)::selection,
	.split.orange .text :global(.chapter-verse)::selection,
	.split.orange .text::selection,
	.split.orange .heading-two::selection {
		background-color: var(--orange-light);
		color: var(--gray-100);
	}

	.split.yellow .text :global(.selectable-word)::-webkit-selection,
	.split.yellow .text :global(.selectable-space)::-webkit-selection,
	.split.yellow .text :global(.chapter-verse)::-webkit-selection,
	.split.yellow .text::-webkit-selection,
	.split.yellow .heading-two::-webkit-selection {
		background-color: var(--yellow-light);
		color: var(--gray-100);
	}
	.split.yellow .text :global(.selectable-word)::selection,
	.split.yellow .text :global(.selectable-space)::selection,
	.split.yellow .text :global(.chapter-verse)::selection,
	.split.yellow .text::selection,
	.split.yellow .heading-two::selection {
		background-color: var(--yellow-light);
		color: var(--gray-100);
	}

	.split.green .text :global(.selectable-word)::-webkit-selection,
	.split.green .text :global(.selectable-space)::-webkit-selection,
	.split.green .text :global(.chapter-verse)::-webkit-selection,
	.split.green .text::-webkit-selection,
	.split.green .heading-two::-webkit-selection {
		background-color: var(--green-light);
		color: var(--gray-100);
	}
	.split.green .text :global(.selectable-word)::selection,
	.split.green .text :global(.selectable-space)::selection,
	.split.green .text :global(.chapter-verse)::selection,
	.split.green .text::selection,
	.split.green .heading-two::selection {
		background-color: var(--green-light);
		color: var(--gray-100);
	}

	.split.aqua .text :global(.selectable-word)::-webkit-selection,
	.split.aqua .text :global(.selectable-space)::-webkit-selection,
	.split.aqua .text :global(.chapter-verse)::-webkit-selection,
	.split.aqua .text::-webkit-selection,
	.split.aqua .heading-two::-webkit-selection {
		background-color: var(--aqua-light);
		color: var(--gray-100);
	}
	.split.aqua .text :global(.selectable-word)::selection,
	.split.aqua .text :global(.selectable-space)::selection,
	.split.aqua .text :global(.chapter-verse)::selection,
	.split.aqua .text::selection,
	.split.aqua .heading-two::selection {
		background-color: var(--aqua-light);
		color: var(--gray-100);
	}

	.split.purple .text :global(.selectable-word)::-webkit-selection,
	.split.purple .text :global(.selectable-space)::-webkit-selection,
	.split.purple .text :global(.chapter-verse)::-webkit-selection,
	.split.purple .text::-webkit-selection,
	.split.purple .heading-two::-webkit-selection {
		background-color: var(--purple-light);
		color: var(--gray-100);
	}
	.split.purple .text :global(.selectable-word)::selection,
	.split.purple .text :global(.selectable-space)::selection,
	.split.purple .text :global(.chapter-verse)::selection,
	.split.purple .text::selection,
	.split.purple .heading-two::selection {
		background-color: var(--purple-light);
		color: var(--gray-100);
	}

	.split.pink .text :global(.selectable-word)::-webkit-selection,
	.split.pink .text :global(.selectable-space)::-webkit-selection,
	.split.pink .text :global(.chapter-verse)::-webkit-selection,
	.split.pink .text::-webkit-selection,
	.split.pink .heading-two::-webkit-selection {
		background-color: var(--pink-light);
		color: var(--gray-100);
	}
	.split.pink .text :global(.selectable-word)::selection,
	.split.pink .text :global(.selectable-space)::selection,
	.split.pink .text :global(.chapter-verse)::selection,
	.split.pink .text::selection,
	.split.pink .heading-two::selection {
		background-color: var(--pink-light);
		color: var(--gray-100);
	}

	/* ============================================================ */
	/* Color variants */
	/* ============================================================ */
	.split.red:global(.active),
	.split.red .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--red-dark);
	}

	.split.red .heading-one {
		background-color: var(--red-darker);
		border-color: var(--red-darker);
	}

	.split.red .heading-two {
		background-color: var(--red-lighter);
		color: var(--red-darker);
	}

	.split.red .heading-two,
	.split.red .heading-three,
	.split.red .text {
		border-color: var(--red-dark);
	}

	/* Word selection color overrides */
	.split.red .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--red-light);
	}

	.split.red .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ad291f' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.red .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--red-light);
	}

	.split.red .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ad291f' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.red .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ad291f' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.orange:global(.active),
	.split.orange .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--orange-dark);
	}
	
	.split.orange .heading-one {
		background-color: var(--orange-darker);
		border-color: var(--orange-darker);
	}

	.split.orange .heading-two {
		background-color: var(--orange-lighter);
		color: var(--orange-darker);
	}

	.split.orange .heading-two,
	.split.orange .heading-three,
	.split.orange .text {
		border-color: var(--orange-dark);
	}

	/* Word selection color overrides */
	.split.orange .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--orange-light);
	}

	.split.orange .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b35900' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.orange .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--orange-light);
	}

	.split.orange .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b35900' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.orange .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b35900' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.yellow:global(.active),
	.split.yellow .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--yellow-dark);
	}
	
	.split.yellow .heading-one {
		background-color: var(--yellow-darker);
		border-color: var(--yellow-darker);
	}

	.split.yellow .heading-two {
		background-color: var(--yellow-lighter);
		color: var(--yellow-darker);
	}

	.split.yellow .heading-two,
	.split.yellow .heading-three,
	.split.yellow .text {
		border-color: var(--yellow-dark);
	}

	/* Word selection color overrides */
	.split.yellow .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--yellow-light);
	}

	.split.yellow .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b39700' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--yellow-light);
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b39700' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.yellow .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23b39700' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.green:global(.active),
	.split.green .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--green-dark);
	}
	
	.split.green .heading-one {
		background-color: var(--green-darker);
		border-color: var(--green-darker);
	}

	.split.green .heading-two {
		background-color: var(--green-lighter);
		color: var(--green-darker);
	}

	.split.green .heading-two,
	.split.green .heading-three,
	.split.green .text {
		border-color: var(--green-dark);
	}

	/* Word selection color overrides */
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

	.split.aqua:global(.active),
	.split.aqua .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--aqua-dark);
	}
	
	.split.aqua .heading-one {
		background-color: var(--aqua-darker);
		border-color: var(--aqua-darker);
	}

	.split.aqua .heading-two {
		background-color: var(--aqua-lighter);
		color: var(--aqua-darker);
	}

	.split.aqua .heading-two,
	.split.aqua .heading-three,
	.split.aqua .text {
		border-color: var(--aqua-dark);
	}

	/* Word selection color overrides */
	.split.aqua .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--aqua-light);
	}

	.split.aqua .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230e8191' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--aqua-light);
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230e8191' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.aqua .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230e8191' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.blue:global(.active),
	.split.blue .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--blue-dark);
	}
	
	.split.blue .heading-one {
		background-color: var(--blue-darker);
		border-color: var(--blue-darker);
	}

	.split.blue .heading-two {
		background-color: var(--blue-lighter);
		color: var(--blue-darker);
	}

	.split.blue .heading-two,
	.split.blue .heading-three,
	.split.blue .text {
		border-color: var(--blue-dark);
	}

	/* Word selection color overrides */
	.split.blue .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--blue-light);
	}

	.split.blue .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059b3' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.blue .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--blue-light);
	}

	.split.blue .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059b3' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.blue .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059b3' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.purple:global(.active),
	.split.purple .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--purple-dark);
	}
	
	.split.purple .heading-one {
		background-color: var(--purple-darker);
		border-color: var(--purple-darker);
	}

	.split.purple .heading-two {
		background-color: var(--purple-lighter);
		color: var(--purple-darker);
	}

	.split.purple .heading-two,
	.split.purple .heading-three,
	.split.purple .text {
		border-color: var(--purple-dark);
	}

	/* Word selection color overrides */
	.split.purple .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--purple-light);
	}

	.split.purple .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2362389e' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.purple .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--purple-light);
	}

	.split.purple .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2362389e' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.purple .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%2362389e' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.pink:global(.active),
	.split.pink .segment:global(.active) {
		box-shadow: 0rem 0rem 0.5rem var(--pink-dark);
	}
	
	.split.pink .heading-one {
		background-color: var(--pink-darker);
		border-color: var(--pink-darker);
	}

	.split.pink .heading-two {
		background-color: var(--pink-lighter);
		color: var(--pink-darker);
	}

	.split.pink .heading-two,
	.split.pink .heading-three,
	.split.pink .text {
		border-color: var(--pink-dark);
	}

	/* Word selection color overrides */
	.split.pink .text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--pink-light);
	}

	.split.pink .text :global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ba276b' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.pink .text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--pink-light);
	}

	.split.pink .text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ba276b' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}

	.split.pink .text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%23ba276b' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
	}
</style>
