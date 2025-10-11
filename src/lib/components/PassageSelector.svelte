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
	import bibleData from '$lib/data/bible.json';
	import Button from '$lib/elements/buttons/Button.svelte';
	import IconButton from '$lib/elements/buttons/IconButton.svelte';
	import Fieldset from '$lib/elements/Fieldset.svelte';
	import RadioButtons from '$lib/elements/RadioButtons.svelte';
	import Select from '$lib/elements/Select.svelte';

	// Extract Bible data structure for easy access
	const testamentData = bibleData[0].testamentData;
	const otBookData = testamentData[0].bookData;
	const ntBookData = testamentData[1].bookData;

	/** @type {PassageSelectorProps} */
	let { passages = $bindable(), onPassagesChange } = $props();

	// Drag and drop state tracking
	/** @type {string|null} ID of the passage currently being dragged */
	let draggedPassageId = $state(null);
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

	/**
	 * Generates radio button properties for testament selection (OT/NT).
	 * Creates an array of radio button configurations for Old and New Testament.
	 * 
	 * @param {('OT'|'NT')} selectedTestament - Currently selected testament
	 * @param {string} passageId - Unique passage ID for element IDs
	 * @returns {Array} Array of radio button property objects
	 */
	const getTestaments = (selectedTestament, passageId) => {
		let RadioButtonTestaments = [];

		testamentData.forEach((testatment) => {
			let testamentObject = {};

			testamentObject.id = `${testatment._id}-${passageId}`;
			testamentObject.value = testatment._id;
			testamentObject.text = testatment.title;
			testamentObject.isChecked = testatment._id === selectedTestament;

			RadioButtonTestaments.push(testamentObject);
		});

		return RadioButtonTestaments;
	};

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
			// Set to first book of the selected testament
			const bookData = testament === 'OT' ? otBookData : ntBookData;
			passage.book = bookData[0]._id;
			// Reset chapters when testament changes
			passage.fromChapter = 1;
			passage.toChapter = 1;
			// Reset verses when testament changes
			const fromVerseCount = bookData[0].chapterData[0]['1'];
			const toVerseCount = bookData[0].chapterData[0]['1'];
			passage.fromVerse = 1;
			passage.toVerse = toVerseCount;
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Generates select option properties for book selection.
	 * Returns book options filtered by testament (OT or NT).
	 * 
	 * @param {('OT'|'NT')} testament - Testament to get books from
	 * @param {string} selectedBook - Currently selected book ID
	 * @returns {Array} Array of book option objects
	 */
	const getBooks = (testament, selectedBook) => {
		let books = [];
		let bookData = testament === 'OT' ? otBookData : ntBookData;

		bookData.forEach((book) => {
			let bookObject = {};

			bookObject.id = book._id;
			bookObject.value = book._id;
			bookObject.text = book.title;
			bookObject.isSelected = book._id === selectedBook;

			books.push(bookObject);
		});

		return books;
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
			const bookData = passage.testament === 'OT' ? otBookData : ntBookData;
			const selectedBook = bookData.find((book) => book._id === bookId);
			if (selectedBook) {
				passage.fromChapter = 1;
				passage.toChapter = 1;
				// Reset verses when book changes
				const fromVerseCount = selectedBook.chapterData[0]['1'];
				const toVerseCount = selectedBook.chapterData[0]['1'];
				passage.fromVerse = 1;
				passage.toVerse = toVerseCount;
			}
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Generates select option properties for chapter selection.
	 * Returns chapter options for the specified book, with optional minimum chapter.
	 * 
	 * @param {('OT'|'NT')} testament - Testament the book belongs to
	 * @param {string} bookId - Book ID to get chapters from
	 * @param {number} selectedChapter - Currently selected chapter
	 * @param {number} [minChapter=1] - Minimum chapter number to include
	 * @returns {Array} Array of chapter option objects
	 */
	const getChapters = (testament, bookId, selectedChapter, minChapter = 1) => {
		let chapters = [];
		const bookData = testament === 'OT' ? otBookData : ntBookData;
		const book = bookData.find((b) => b._id === bookId);

		if (book) {
			for (let i = minChapter; i <= book.chapterCount; i++) {
				let chapterObject = {};
				chapterObject.id = i;
				chapterObject.value = i;
				chapterObject.text = i.toString();
				chapterObject.isSelected = i === selectedChapter;
				chapters.push(chapterObject);
			}
		}

		return chapters;
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
				const bookData = passage.testament === 'OT' ? otBookData : ntBookData;
				const book = bookData.find((b) => b._id === passage.book);
				if (book) {
					const fromVerseCount = book.chapterData[0][chapterNum.toString()];
					const toVerseCount = book.chapterData[0][passage.toChapter.toString()];
					passage.fromVerse = 1;
					passage.toVerse = toVerseCount;
				}
			} else {
				passage.toChapter = chapterNum;
				// Reset toVerse when toChapter changes
				const bookData = passage.testament === 'OT' ? otBookData : ntBookData;
				const book = bookData.find((b) => b._id === passage.book);
				if (book) {
					const verseCount = book.chapterData[0][chapterNum.toString()];
					// If chapters are now the same, ensure toVerse is not less than fromVerse
					if (passage.fromChapter === chapterNum && passage.fromVerse > 1) {
						passage.toVerse = Math.max(passage.fromVerse, verseCount);
					} else {
						passage.toVerse = verseCount;
					}
				}
			}
		}
		onPassagesChange?.(passages);
	};

	/**
	 * Generates select option properties for verse selection.
	 * Returns verse options for the specified chapter, with optional minimum verse.
	 * 
	 * @param {('OT'|'NT')} testament - Testament the book belongs to
	 * @param {string} bookId - Book ID to get verses from
	 * @param {number} chapterNum - Chapter number to get verse count from
	 * @param {number} selectedVerse - Currently selected verse
	 * @param {number} [minVerse=1] - Minimum verse number to include
	 * @returns {Array} Array of verse option objects
	 */
	const getVerses = (testament, bookId, chapterNum, selectedVerse, minVerse = 1) => {
		let verses = [];
		const bookData = testament === 'OT' ? otBookData : ntBookData;
		const book = bookData.find((b) => b._id === bookId);

		if (book && book.chapterData[0][chapterNum.toString()]) {
			const verseCount = book.chapterData[0][chapterNum.toString()];
			for (let i = minVerse; i <= verseCount; i++) {
				let verseObject = {};
				verseObject.id = i;
				verseObject.value = i;
				verseObject.text = i.toString();
				verseObject.isSelected = i === selectedVerse;
				verses.push(verseObject);
			}
		}

		return verses;
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
		passages.push({
			id: uuidv4(),
			testament: 'NT',
			book: ntBookData[0]._id,
			fromChapter: 1,
			toChapter: 1,
			fromVerse: 1,
			toVerse: ntBookData[0].chapterData[0]['1']
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

	// Keyboard navigation state for accessibility
	/** @type {string|null} ID of passage being dragged via keyboard */
	let keyboardDraggedPassageId = $state(null);
	/** @type {boolean} Whether keyboard drag mode is active */
	let keyboardMode = $state(false);

	/**
	 * Handles the start of a drag operation.
	 * Sets up drag state and creates a custom drag image.
	 * 
	 * @param {DragEvent} event - The drag start event
	 * @param {string} passageId - ID of the passage being dragged
	 */
	const handleDragStart = (event, passageId) => {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', passageId);

		// Set drag state after a small delay to allow the drag to start
		setTimeout(() => {
			draggedPassageId = passageId;
			isDragging = true;
			dragStarted = true;
			// Initialize drop position to the dragged item's current position
			const draggedIndex = passages.findIndex((p) => p.id === passageId);
			dragPosition = draggedIndex;
			dropIndicatorPosition = draggedIndex;
		}, 0);

		// Create a custom drag image using the entire fieldset wrapper
		const wrapper = event.target.closest('.fieldset-wrapper');
		const fieldset = event.target.closest('fieldset');
		if (wrapper && fieldset) {
			// Create a container for the drag image with extra space for buttons
			const dragContainer = document.createElement('div');
			dragContainer.style.position = 'absolute';
			dragContainer.style.top = '-200.0rem';
			dragContainer.style.left = '-200.orem';
			dragContainer.style.width = (fieldset.offsetWidth + 40) / 10 + 'rem'; // Extra space for buttons
			dragContainer.style.height = (fieldset.offsetHeight + 40) / 10 + 'rem'; // Extra space for buttons
			dragContainer.style.opacity = '0.8';
			dragContainer.style.transform = 'rotate(1deg)';
			dragContainer.style.pointerEvents = 'none';
			dragContainer.style.zIndex = '9999';
			dragContainer.style.overflow = 'visible';
			// dragContainer.style.visibility = 'hidden';

			// Clone the entire wrapper content
			const dragContent = wrapper.cloneNode(true);
			dragContent.style.position = 'relative';
			dragContent.style.margin = '0';
			Array.from(dragContent.children[0].children).forEach((child) => {
				child.style.visibility = 'hidden';
			});
			// dragContent.children[0].style.visibility = 'hidden';

			dragContainer.appendChild(dragContent);
			document.body.appendChild(dragContainer);

			// Set the drag image with proper offset accounting for padding
			const rect = fieldset.getBoundingClientRect();
			const offsetX = event.clientX - rect.left + 20; // Add padding offset
			const offsetY = event.clientY - rect.top + 20; // Add padding offset
			event.dataTransfer.setDragImage(dragContainer, offsetX, offsetY);

			// Remove the temporary drag image after a short delay
			setTimeout(() => {
				if (document.body.contains(dragContainer)) {
					document.body.removeChild(dragContainer);
				}
			}, 0);
		}
	};

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

	// Calculate drop position based on mouse position
	const calculateDropPosition = (event, passageId) => {
		if (!draggedPassageId || draggedPassageId === passageId) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const mouseY = event.clientY;
		const elementMiddle = rect.top + rect.height / 2;

		const currentIndex = passages.findIndex((p) => p.id === passageId);

		// Simple logic: if cursor is above middle, drop above; if below middle, drop below
		if (mouseY < elementMiddle) {
			// Cursor is above middle - drop area should appear above this PassageSelector
			dragPosition = currentIndex;
			dropIndicatorPosition = currentIndex;
		} else {
			// Cursor is below middle - drop area should appear below this PassageSelector
			dragPosition = currentIndex + 1;
			dropIndicatorPosition = currentIndex + 1;
		}
	};

	const handleDragOver = (event, passageId) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';

		if (draggedPassageId && draggedPassageId !== passageId) {
			calculateDropPosition(event, passageId);
			// Clear the old drag-over styling
			dragOverPassageId = null;
		}
	};

	const handleDragLeave = (event) => {
		// Only clear dragOverPassageId if we're leaving the entire fieldset area
		if (!event.currentTarget.contains(event.relatedTarget)) {
			dragOverPassageId = null;
		}
	};

	const handleDrop = (event, targetPassageId) => {
		event.preventDefault();

		if (draggedPassageId && dragPosition >= 0) {
			const draggedIndex = passages.findIndex((p) => p.id === draggedPassageId);

			if (draggedIndex !== -1) {
				// Create a new array with reordered passages
				const newPassages = [...passages];
				const [draggedPassage] = newPassages.splice(draggedIndex, 1);

				// Adjust position if needed after removal
				let insertPosition = dragPosition;
				if (draggedIndex < dragPosition) {
					insertPosition = dragPosition - 1;
				}

				newPassages.splice(insertPosition, 0, draggedPassage);

				passages = newPassages;
				onPassagesChange?.(passages);
			}
		}

		// Reset drag state
		draggedPassageId = null;
		dragOverPassageId = null;
		isDragging = false;
		dragStarted = false;
		dragPosition = -1;
		dropIndicatorPosition = -1;
	};

	const handleDragEnd = (event) => {
		// Remove dragging class from all fieldsets
		const draggedElement = event.target.closest('fieldset');
		if (draggedElement) {
			draggedElement.classList.remove('dragging');
		}

		// Reset drag state
		draggedPassageId = null;
		dragOverPassageId = null;
		isDragging = false;
		dragStarted = false;
		dragPosition = -1;
		dropIndicatorPosition = -1;
	};

	// Shared drop handler for the snippet
	const handleDropOperation = (event) => {
		event.preventDefault();
		if (draggedPassageId && dragPosition >= 0) {
			const draggedIndex = passages.findIndex((p) => p.id === draggedPassageId);
			if (draggedIndex !== -1) {
				const newPassages = [...passages];
				const [draggedPassage] = newPassages.splice(draggedIndex, 1);
				let insertPosition = dragPosition;
				if (draggedIndex < insertPosition) {
					insertPosition = insertPosition - 1;
				}
				newPassages.splice(insertPosition, 0, draggedPassage);
				passages = newPassages;
				onPassagesChange?.(passages);
			}
		}
		// Reset drag state
		draggedPassageId = null;
		dragOverPassageId = null;
		isDragging = false;
		dragStarted = false;
		dragPosition = -1;
		dropIndicatorPosition = -1;
	};
</script>

{#snippet DropAreaPlaceholder(
	position,
	isEndPosition,
	passages,
	draggedPassageId,
	dragPosition,
	onDrop
)}
	<div
		class="drop-area-placeholder"
		role="button"
		aria-label="Drop zone for position {position + 1}"
		aria-describedby="drop-instructions-{position}"
		tabindex="0"
		ondragover={(event) => {
			event.preventDefault();
			event.dataTransfer.dropEffect = 'move';
		}}
		ondrop={onDrop}
	>
		<div id="drop-instructions-{position}" class="sr-only">
			{#if isEndPosition}
				Drop zone for inserting passage at position {position + 1}. Release the dragged passage here
				to place it at the end of the list.
			{:else}
				Drop zone for inserting passage at position {position + 1}. Release the dragged passage here
				to place it at this position.
			{/if}
		</div>
		<div class="drop-area-content">
			<div class="drop-line"></div>
			<div class="drop-text">Drop here</div>
		</div>
	</div>
{/snippet}

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
				{@render DropAreaPlaceholder(
					index,
					false,
					passages,
					draggedPassageId,
					dragPosition,
					handleDropOperation
				)}
			{/if}

			<!-- Only show the passage if it's not being dragged -->
			{#if !dragStarted || draggedPassageId !== passage.id}
				<div
					class="fieldset-wrapper"
					role="listitem"
					aria-label="Passage {index + 1}"
					aria-describedby={passages.length > 1 ? `drag-instructions-${passage.id}` : undefined}
					ondragover={(event) => handleDragOver(event, passage.id)}
					ondragleave={handleDragLeave}
					ondrop={(event) => handleDrop(event, passage.id)}
				>
					<Fieldset>
						{#if passages.length > 1}
							<div id="drag-instructions-{passage.id}" class="sr-only">
								Use the drag handle to reorder this passage. Press space or enter to grab, arrow
								keys to move, space or enter to drop.
							</div>
							<div
								class="btn-draggable"
								in:fade={{ duration: 100 }}
								out:fade={{ duration: 100 }}
								draggable="true"
								role="button"
								tabindex="0"
								aria-label="Drag handle for passage {index + 1}"
								aria-describedby="drag-instructions-{passage.id}"
								aria-grabbed={draggedPassageId === passage.id ||
								keyboardDraggedPassageId === passage.id
									? 'true'
									: 'false'}
								ondragstart={(event) => handleDragStart(event, passage.id)}
								ondragend={handleDragEnd}
								onkeydown={(event) => handleKeyDown(event, passage.id)}
							>
								<IconButton classes="system-gray" iconId="draggable" isRound></IconButton>
							</div>
							<div class="btn-delete" in:fade={{ duration: 100 }} out:fade={{ duration: 100 }}>
								<IconButton
									classes="system-red"
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
								handleChange={(event) => updateTestament(passage.id, event.currentTarget.value)}
								isInline
							></RadioButtons>
						</div>
						<div class="book">
							<Select
								id="{passage.testament}-{passage.id}"
								name="{passage.testament}-{passage.id}"
								optionProperties={getBooks(passage.testament, passage.book)}
								selectedValue={passage.book}
								handleChange={(event) => updateBook(passage.id, event.currentTarget.value)}
								isFullWidth
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
										handleChange={(event) =>
											updateChapters(passage.id, event.currentTarget.value, true)}
										isFullWidth
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
										handleChange={(event) =>
											updateVerses(passage.id, event.currentTarget.value, true)}
										isFullWidth
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
										handleChange={(event) =>
											updateChapters(passage.id, event.currentTarget.value, false)}
										isFullWidth
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
										handleChange={(event) =>
											updateVerses(passage.id, event.currentTarget.value, false)}
										isFullWidth
									></Select>
								</div>
							</div>
						</div>
					</Fieldset>
				</div>
			{/if}
		{/each}

		<!-- Drop area at the end -->
		{#if isDragging && dropIndicatorPosition === passages.length}
			{@render DropAreaPlaceholder(
				passages.length,
				true,
				passages,
				draggedPassageId,
				dragPosition,
				handleDropOperation
			)}
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
		background-color: rgba(0, 123, 255, 0.05);
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
</style>
