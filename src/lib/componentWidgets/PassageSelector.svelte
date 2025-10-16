<script>
	/**
	 * PassageSelector Component
	 * 
	 * Advanced Bible passage selection component with drag-and-drop reordering.
	 * Allows users to select multiple Bible passages with precise control over
	 * testament, book, chapter, and verse ranges.
	 * 
	 * @component
	 */

	/**
	 * @typedef {Object} Passage
	 * @property {string} id - Unique identifier for the passage
	 * @property {'OT'|'NT'} testament - Testament selection (Old or New Testament)
	 * @property {string} book - Book identifier from Bible data
	 * @property {number} fromChapter - Starting chapter number
	 * @property {number} toChapter - Ending chapter number
	 * @property {number} fromVerse - Starting verse number
	 * @property {number} toVerse - Ending verse number
	 */

	/**
	 * @typedef {Object} PassageSelectorProps
	 * @property {Passage[]} passages - Bindable array of passage selections
	 * @property {(passages: Passage[]) => void} [onPassagesChange] - Optional callback when passages change
	 */

	import { fade } from 'svelte/transition';
	import { v4 as uuidv4 } from 'uuid';
	import {
		getTestaments,
		getBooks,
		getChapters,
		getVerses,
		getVerseCount,
		getDefaultPassageValues
	} from '$lib/utils/bibleData.js';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Fieldset from '$lib/componentElements/Fieldset.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import Select from '$lib/componentElements/Select.svelte';

	/** @type {PassageSelectorProps} */
	let { passages = $bindable(), onPassagesChange } = $props();

	// Drag and drop state tracking
	/** @type {string|null} ID of the passage currently being dragged */
	let draggedPassageId = $state(null);
	/** @type {Passage|null} Full passage object currently being dragged */
	let draggedPassage = $state(null);
	/** @type {string|null} ID of the passage being dragged over */
	let dragOverPassageId = $state(null);
	/** @type {boolean} Whether a drag operation is in progress */
	let isDragging = $state(false);
	/** @type {boolean} Whether drag has actually started (prevents flashing) */
	let dragStarted = $state(false);
	/** @type {number} Index where item will be dropped */
	let dragPosition = $state(-1);
	/** @type {number} Position for drop indicator visual */
	let dropIndicatorPosition = $state(-1);
	/** @type {number} Current mouse X position for drag ghost */
	let currentMouseX = $state(0);
	/** @type {number} Current mouse Y position for drag ghost */
	let currentMouseY = $state(0);
	/** @type {number} Starting mouse X position for threshold detection */
	let dragStartX = $state(0);
	/** @type {number} Starting mouse Y position for threshold detection */
	let dragStartY = $state(0);
	/** @type {number} Drag threshold in pixels before drag starts */
	const DRAG_THRESHOLD = 5;

	/**
	 * Updates the testament for a passage and resets dependent values.
	 * When testament changes, resets book to first book of new testament,
	 * and resets all chapter/verse values to defaults.
	 * 
	 * @param {string} passageId - ID of the passage to update
	 * @param {('OT'|'NT')} testament - New testament selection
	 */
	const updateTestament = (passageId, testament) => {
		const passage = passages.find((p) => p.id === passageId);

		if (passage) {
			passage.testament = testament;
			// Get first book of the selected testament
			const books = getBooks(testament, '');
			if (books.length > 0) {
				passage.book = books[0].value;
				// Reset chapters when testament changes
				passage.fromChapter = 1;
				passage.toChapter = 1;
				// Reset verses when testament changes
				const verseCount = getVerseCount(testament, passage.book, 1);
				passage.fromVerse = 1;
				passage.toVerse = verseCount;
			}
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Updates the book for a passage and resets dependent values.
	 * When book changes, resets all chapter and verse values to defaults.
	 * 
	 * @param {string} passageId - ID of the passage to update
	 * @param {string} bookId - New book ID
	 */
	const updateBook = (passageId, bookId) => {
		const passage = passages.find((p) => p.id === passageId);
		if (passage) {
			passage.book = bookId;
			// Reset chapters when book changes
			passage.fromChapter = 1;
			passage.toChapter = 1;
			// Reset verses when book changes
			const verseCount = getVerseCount(passage.testament, bookId, 1);
			passage.fromVerse = 1;
			passage.toVerse = verseCount;
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Updates chapter selection for a passage with automatic validation.
	 * Ensures toChapter is never less than fromChapter and adjusts verses accordingly.
	 * 
	 * @param {string} passageId - ID of the passage to update
	 * @param {string} chapterValue - New chapter value
	 * @param {boolean} [isFromChapter=true] - Whether updating fromChapter (true) or toChapter (false)
	 */
	const updateChapters = (passageId, chapterValue, isFromChapter = true) => {
		const passage = passages.find((p) => p.id === passageId);
		if (passage) {
			const chapterNum = parseInt(chapterValue);
			if (isFromChapter) {
				passage.fromChapter = chapterNum;
				// Ensure toChapter is not less than fromChapter
				if (passage.toChapter < chapterNum) {
					passage.toChapter = chapterNum;
				}
				// Reset verses when fromChapter changes
				const fromVerseCount = getVerseCount(passage.testament, passage.book, chapterNum);
				const toVerseCount = getVerseCount(passage.testament, passage.book, passage.toChapter);
				passage.fromVerse = 1;
				passage.toVerse = toVerseCount;
			} else {
				passage.toChapter = chapterNum;
				// Reset toVerse when toChapter changes
				const verseCount = getVerseCount(passage.testament, passage.book, chapterNum);
				// If chapters are now the same, ensure toVerse is not less than fromVerse
				if (passage.fromChapter === chapterNum && passage.fromVerse > 1) {
					passage.toVerse = Math.max(passage.fromVerse, verseCount);
				} else {
					passage.toVerse = verseCount;
				}
			}
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Updates verse selection for a passage with automatic validation.
	 * When chapters are the same, ensures toVerse is never less than fromVerse.
	 * 
	 * @param {string} passageId - ID of the passage to update
	 * @param {string} verseValue - New verse value
	 * @param {boolean} [isFromVerse=true] - Whether updating fromVerse (true) or toVerse (false)
	 */
	const updateVerses = (passageId, verseValue, isFromVerse = true) => {
		const passage = passages.find((p) => p.id === passageId);
		if (passage) {
			const verseNum = parseInt(verseValue);
			if (isFromVerse) {
				passage.fromVerse = verseNum;
				// If both chapters are the same and toVerse is less than fromVerse, adjust toVerse
				if (passage.fromChapter === passage.toChapter && passage.toVerse < verseNum) {
					passage.toVerse = verseNum;
				}
			} else {
				passage.toVerse = verseNum;
			}
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Adds a new passage to the list with default values.
	 * New passages start with New Testament, Matthew 1:1 to end of chapter.
	 */
	const addPassage = () => {
		const defaultValues = getDefaultPassageValues();
		passages.push({
			id: uuidv4(),
			...defaultValues
		});
		onPassagesChange?.(passages);
	};

	/**
	 * Removes a passage from the list by ID.
	 * 
	 * @param {string} id - ID of the passage to remove
	 */
	const removePassage = (id) => {
		passages = passages.filter((passage) => passage.id !== id);
		onPassagesChange?.(passages);
	};

	/**
	 * Format a passage reference for display
	 * @param {Passage} passage - The passage object to format
	 * @returns {string} Formatted passage reference
	 */
	const formatPassageReference = (passage) => {
		// Get the book name from the available books
		const books = getBooks(passage.testament, passage.book);
		const bookInfo = books.find(b => b.value === passage.book);
		const bookName = bookInfo ? bookInfo.text : passage.book;

		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	};

	// Keyboard navigation state for accessibility
	/** @type {string|null} ID of passage being dragged via keyboard */
	let keyboardDraggedPassageId = $state(null);
	/** @type {boolean} Whether keyboard drag mode is active */
	let keyboardMode = $state(false);

	/**
	 * Handle mousedown on a passage drag handle
	 */
	function handlePassageMouseDown(event, passage) {
		// Only handle left click
		if (event.button !== 0) return;
		
		// Prevent browser's default drag behavior
		event.preventDefault();
		
		// Record starting position
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		currentMouseX = event.clientX;
		currentMouseY = event.clientY;
		draggedPassageId = passage.id;
		draggedPassage = passage;
		
		// Add document listeners
		document.addEventListener('mousemove', handleDocumentMouseMove);
		document.addEventListener('mouseup', handleDocumentMouseUp);
	}

	/**
	 * Handle document mousemove - check if drag threshold exceeded
	 */
	function handleDocumentMouseMove(event) {
		if (!draggedPassageId) return;
		
		currentMouseX = event.clientX;
		currentMouseY = event.clientY;
		
		// Check if we've moved beyond threshold
		const deltaX = Math.abs(currentMouseX - dragStartX);
		const deltaY = Math.abs(currentMouseY - dragStartY);
		
		if (!isDragging && (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD)) {
			isDragging = true;
			dragStarted = true;
			// Initialize drop position to the dragged item's current position
			const draggedIndex = passages.findIndex((p) => p.id === draggedPassageId);
			dragPosition = draggedIndex;
			dropIndicatorPosition = draggedIndex;
		}
		
		// Update drop target if dragging
		if (isDragging) {
			updateDropTarget(event);
		}
	}

	/**
	 * Update which position is the current drop target
	 */
	function updateDropTarget(event) {
		const fieldsetWrappers = document.querySelectorAll('.fieldset-wrapper');
		let newDropPosition = -1;
		
		// Get the dragged item's index to adjust for the missing DOM element
		const draggedIndex = passages.findIndex((p) => p.id === draggedPassageId);
		
		for (let i = 0; i < fieldsetWrappers.length; i++) {
			const wrapper = fieldsetWrappers[i];
			const rect = wrapper.getBoundingClientRect();
			
			if (
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom
			) {
				// Adjust index to account for hidden dragged item
				// If we're at or past the dragged item's position, add 1
				const adjustedIndex = i >= draggedIndex ? i + 1 : i;
				
				// Mouse is over this wrapper - determine if drop above or below
				const mouseY = event.clientY;
				const elementMiddle = rect.top + rect.height / 2;
				
				if (mouseY < elementMiddle) {
					newDropPosition = adjustedIndex;
				} else {
					newDropPosition = adjustedIndex + 1;
				}
				break;
			}
		}
		
		// If no wrapper found, check if we're below all items
		if (newDropPosition === -1 && fieldsetWrappers.length > 0) {
			const lastWrapper = fieldsetWrappers[fieldsetWrappers.length - 1];
			const lastRect = lastWrapper.getBoundingClientRect();
			if (event.clientY > lastRect.bottom) {
				newDropPosition = passages.length;
			}
		}
		
		if (newDropPosition !== -1) {
			dragPosition = newDropPosition;
			dropIndicatorPosition = newDropPosition;
		}
	}

	/**
	 * Handle document mouseup - finalize action
	 */
	function handleDocumentMouseUp(event) {
		// Remove document listeners
		document.removeEventListener('mousemove', handleDocumentMouseMove);
		document.removeEventListener('mouseup', handleDocumentMouseUp);
		
		if (!draggedPassageId) return;
		
		// If we were dragging and have a valid drop position
		if (isDragging && dragPosition >= 0) {
			event.preventDefault();
			
			const draggedIndex = passages.findIndex((p) => p.id === draggedPassageId);
			if (draggedIndex !== -1 && dragPosition !== draggedIndex && dragPosition !== draggedIndex + 1) {
				// Perform the reorder
				const newPassages = [...passages];
				const [movedPassage] = newPassages.splice(draggedIndex, 1);
				
				let insertPosition = dragPosition;
				if (draggedIndex < dragPosition) {
					insertPosition = dragPosition - 1;
				}
				
				newPassages.splice(insertPosition, 0, movedPassage);
				passages = newPassages;
				onPassagesChange?.(passages);
			}
		}
		// else: No drag occurred - this was a click, allow normal behavior
		
		// Reset drag state immediately for instant visual feedback
		isDragging = false;
		dragStarted = false;
		draggedPassageId = null;
		draggedPassage = null;
		dragOverPassageId = null;
		dragPosition = -1;
		dropIndicatorPosition = -1;
		dragStartX = 0;
		dragStartY = 0;
		currentMouseX = 0;
		currentMouseY = 0;
	}

	// Keyboard accessibility for drag and drop
	const handleKeyDown = (event, passageId) => {
		const currentIndex = passages.findIndex((p) => p.id === passageId);

		switch (event.key) {
			case ' ':
			case 'Enter':
				event.preventDefault();
				if (keyboardDraggedPassageId === passageId) {
					// Drop the item
					keyboardDraggedPassageId = null;
					keyboardMode = false;
				} else {
					// Grab the item
					keyboardDraggedPassageId = passageId;
					keyboardMode = true;
				}
				break;
			case 'ArrowUp':
				if (keyboardDraggedPassageId === passageId && currentIndex > 0) {
					event.preventDefault();
					const newPassages = [...passages];
					const [draggedPassage] = newPassages.splice(currentIndex, 1);
					newPassages.splice(currentIndex - 1, 0, draggedPassage);
					passages = newPassages;
					onPassagesChange?.(passages);
				}
				break;
			case 'ArrowDown':
				if (keyboardDraggedPassageId === passageId && currentIndex < passages.length - 1) {
					event.preventDefault();
					const newPassages = [...passages];
					const [draggedPassage] = newPassages.splice(currentIndex, 1);
					newPassages.splice(currentIndex + 1, 0, draggedPassage);
					passages = newPassages;
					onPassagesChange?.(passages);
				}
				break;
			case 'Escape':
				if (keyboardDraggedPassageId === passageId) {
					event.preventDefault();
					keyboardDraggedPassageId = null;
					keyboardMode = false;
				}
				break;
		}
	};

</script>

{#snippet PassageFieldset(passage, index, showControls = true, interactive = true)}
	<Fieldset>
		{#if showControls && passages.length > 1}
			<div id="drag-instructions-{passage.id}" class="sr-only">
				Use the drag handle to reorder this passage. Press space or enter to grab, arrow
				keys to move, space or enter to drop.
			</div>
			<div
				class="btn-draggable"
				in:fade={{ duration: 100 }}
				out:fade={{ duration: 100 }}
				role="button"
				tabindex="0"
				aria-label="Drag handle for passage {index + 1}"
				aria-describedby="drag-instructions-{passage.id}"
				aria-grabbed={draggedPassageId === passage.id ||
				keyboardDraggedPassageId === passage.id
					? 'true'
					: 'false'}
				onmousedown={(event) => handlePassageMouseDown(event, passage)}
				onkeydown={(event) => handleKeyDown(event, passage.id)}
			>
				<IconButton classes="gray" iconId="draggable" isRound></IconButton>
			</div>
			<div class="btn-delete" in:fade={{ duration: 100 }} out:fade={{ duration: 100 }}>
				<IconButton
					classes="red"
					iconId="x"
					handleClick={() => removePassage(passage.id)}
					isRound
				></IconButton>
			</div>
		{/if}
		<div class="testaments">
			<RadioButtons
				RadioButtonProperties={getTestaments(passage.testament, passage.id)}
				name="testaments-{passage.id}"
				handleChange={interactive ? (event) => updateTestament(passage.id, event.currentTarget.value) : undefined}
				isInline
				disabled={!interactive}
			></RadioButtons>
		</div>
		<div class="book">
			<Select
				id="{passage.testament}-{passage.id}"
				name="{passage.testament}-{passage.id}"
				optionProperties={getBooks(passage.testament, passage.book)}
				selectedValue={passage.book}
				handleChange={interactive ? (event) => updateBook(passage.id, event.currentTarget.value) : undefined}
				isFullWidth
				disabled={!interactive}
			></Select>
		</div>
		<div class="chapters-verses">
			<div class="from-chapter-verse">
				<div class="from-chapter">
					<Select
						id="from-{passage.book}-{passage.id}"
						name="from-{passage.book}-{passage.id}"
						optionProperties={getChapters(
							passage.testament,
							passage.book,
							passage.fromChapter
						)}
						selectedValue={passage.fromChapter}
						handleChange={interactive ? (event) =>
							updateChapters(passage.id, event.currentTarget.value, true) : undefined}
						isFullWidth
						disabled={!interactive}
					></Select>
				</div>
				<div class="colon">:</div>
				<div class="from-verse">
					<Select
						id="from-{passage.chapter}-{passage.id}"
						name="from-{passage.chapter}-{passage.id}"
						optionProperties={getVerses(
							passage.testament,
							passage.book,
							passage.fromChapter,
							passage.fromVerse
						)}
						selectedValue={passage.fromVerse}
						handleChange={interactive ? (event) =>
							updateVerses(passage.id, event.currentTarget.value, true) : undefined}
						isFullWidth
						disabled={!interactive}
					></Select>
				</div>
			</div>
			<div>to</div>
			<div class="to-chapter-verse">
				<div class="to-chapter">
					<Select
						id="to-{passage.book}-{passage.id}"
						name="to-{passage.book}-{passage.id}"
						optionProperties={getChapters(
							passage.testament,
							passage.book,
							passage.toChapter,
							passage.fromChapter
						)}
						selectedValue={passage.toChapter}
						handleChange={interactive ? (event) =>
							updateChapters(passage.id, event.currentTarget.value, false) : undefined}
						isFullWidth
						disabled={!interactive}
					></Select>
				</div>
				<div class="colon">:</div>
				<div class="to-verse">
					<Select
						id="to-{passage.chapter}-{passage.id}"
						name="to-{passage.chapter}-{passage.id}"
						optionProperties={getVerses(
							passage.testament,
							passage.book,
							passage.toChapter,
							passage.toVerse,
							passage.fromChapter === passage.toChapter ? passage.fromVerse : 1
						)}
						selectedValue={passage.toVerse}
						handleChange={interactive ? (event) =>
							updateVerses(passage.id, event.currentTarget.value, false) : undefined}
						isFullWidth
						disabled={!interactive}
					></Select>
				</div>
			</div>
		</div>
	</Fieldset>
{/snippet}

<!-- Drag ghost that follows cursor -->
{#if isDragging && draggedPassage}
	<div 
		class="drag-ghost" 
		style="left: {(currentMouseX - 6) / 10}rem; top: {(currentMouseY - 6) / 10}rem;"
	>
		{@render PassageFieldset(draggedPassage, -1, true, true)}
	</div>
{/if}

<div class="reference-container">
	<div class="reference-button">
		<IconButton iconId="plus" handleClick={addPassage} isRound></IconButton>
	</div>
	<div
		class="reference"
		role="list"
		aria-label="Bible passages"
		aria-live="polite"
		aria-relevant="additions removals"
	>
		{#each passages as passage, index (passage.id)}
			<!-- Show drop area at this position if needed -->
			{#if isDragging && dropIndicatorPosition === index}
				<div class="drop-area-placeholder">
					<div class="drop-area-content">
						<div class="drop-line"></div>
						<div class="drop-text">Drop here</div>
					</div>
				</div>
			{/if}

			<!-- Only show the passage if it's not being dragged -->
			{#if !dragStarted || draggedPassageId !== passage.id}
				<div
					class="fieldset-wrapper"
					role="listitem"
					aria-label="Passage {index + 1}"
					aria-describedby={passages.length > 1 ? `drag-instructions-${passage.id}` : undefined}
				>
					{@render PassageFieldset(passage, index, true, true)}
				</div>
			{/if}
		{/each}

		<!-- Drop area at the end -->
		{#if isDragging && dropIndicatorPosition === passages.length}
			<div class="drop-area-placeholder">
				<div class="drop-area-content">
					<div class="drop-line"></div>
					<div class="drop-text">Drop here</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.reference-container {
		display: flex;
	}

	.reference-button {
		padding: 0rem 1.4rem 4.1rem 0rem;
		display: flex;
		align-items: flex-end;
	}

	.reference {
		flex-grow: 1;
	}

	.fieldset-wrapper {
		margin-bottom: 2.7rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		min-height: 12rem;
	}

	.btn-draggable {
		display: inline-block;
		position: absolute;
		top: -0.9rem;
		left: -0.9rem;
		cursor: grab;
		z-index: 10;
		user-select: none;
		-webkit-user-select: none;
		-moz-user-select: none;
		-ms-user-select: none;

		&:active {
			cursor: grabbing;
		}

		&[draggable='true'] {
			cursor: grab;
		}

		&[draggable='true']:active {
			cursor: grabbing;
		}
	}

	.btn-delete {
		display: inline-block;
		position: absolute;
		top: -0.9rem;
		right: -0.9rem;
	}

	.sr-only {
		position: absolute;
		width: 0.1rem;
		height: 0.1rem;
		padding: 0;
		margin: -0.1rem;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.testaments {
		margin-bottom: 0.9rem;
		display: flex;
		justify-content: center;
	}

	.book {
		margin-bottom: 0.9rem;
	}

	.chapters-verses {
		display: flex;
		flex-direction: row;
		gap: 2.1rem;
		align-items: center;

		.from-chapter-verse,
		.to-chapter-verse {
			flex-grow: 1;
			display: flex;
			flex-direction: row;
			gap: 0.3rem;

			.colon {
				display: flex;
				align-items: center;
			}

			.from-chapter,
			.from-verse,
			.to-chapter,
			.to-verse {
				flex-grow: 1;
			}
		}
	}

	/* Drop area placeholder styles */
	.drop-area-placeholder {
		margin-bottom: 2.7rem;
		position: relative;
		min-height: 12rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0.1rem dashed var(--blue);
		border-radius: 0.8rem;
		background-color: var(--blue-lighter);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.drop-area-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.drop-line {
		width: 100%;
		height: 0.2rem;
		background: linear-gradient(90deg, transparent, var(--blue), transparent);
		border-radius: 0.1rem;
		position: relative;

		&::before {
			content: '';
			position: absolute;
			left: 50%;
			top: 50%;
			transform: translate(-50%, -50%);
			width: 0.8rem;
			height: 0.8rem;
			background: var(--blue);
			border-radius: 50%;
		}
	}

	.drop-text {
		position: absolute;
		background: var(--blue);
		color: white;
		padding: 0.4rem 0.8rem;
		border-radius: 1.2rem;
		font-size: 1.2rem;
		font-weight: 500;
		white-space: nowrap;
	}

	/* Drag ghost styles */
	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 9999;
		width: 37.2rem;
		border-radius: 0.6rem;
		box-shadow: 0rem 0.4rem 1.2rem var(--black-alpha);
	}

	.passage-reference {
		font-size: 1.4rem;
		font-weight: 500;
		color: white;
		white-space: nowrap;
	}
</style>
