<script>
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import Textarea from '$lib/componentElements/Textarea.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import { toolbarState, setActiveSegment } from '$lib/stores/toolbar.js';

	let { 
		noteValue = null,
		segmentId = '',
		isInputMode = $bindable(false),
		isActive = false,
		hasHeadingOne = false,
		hasHeadingTwo = false,
		hasHeadingThree = false,
		hasNote = false
	} = $props();

	// Input state
	let inputValue = $state('');
	let originalValue = $state(''); // Track original value for Escape key
	let optimisticValue = $state(undefined); // undefined = use noteValue, null = deleted, string = optimistic value
	let saveTimeout = $state(null);
	let hasInitialized = $state(false); // Track if input has been initialized for this edit session
	
	// Track previous prop values to detect real changes
	let previousSegmentId = $state(segmentId);
	let previousNoteValue = $state(noteValue);
	
	// Slide animation logic
	let shouldSlideIn = $derived(!noteValue);
	let shouldSlideOut = $derived(
		(!noteValue && optimisticValue === undefined) || // Cancel with no note
		(optimisticValue === null) // Delete
	);

	// Computed display value
	let displayValue = $derived(optimisticValue !== undefined ? optimisticValue : noteValue);

	const inputId = $derived(`note-input-${segmentId}`);

	/**
	 * Auto-save note to database (debounced)
	 */
	async function autoSaveNote(text) {
		try {
			const response = await fetch('/api/passages/segments/note', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					noteText: text.trim() || null
				})
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('Auto-save note error:', error);
				alert(`Error: ${error.error || 'Failed to auto-save note'}`);
			}
			// Note: We don't call invalidate() here to avoid constant data reloads
			// The local state is already updated via inputValue binding
		} catch (error) {
			console.error('Auto-save note network error:', error);
			alert(`Error: ${error.message || 'Failed to auto-save note'}`);
		}
	}

	/**
	 * Handle input changes with debounced auto-save
	 */
	function handleInputChange() {
		// Clear existing timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Capture current value AND segment ID for saving
		// This prevents race condition if user switches segments before save fires
		const valueToSave = inputValue;
		const segmentIdToSave = segmentId;

		// Save after 1 second of inactivity
		saveTimeout = setTimeout(() => {
			// Use captured segment ID to prevent saving to wrong segment
			if (segmentIdToSave === segmentId) {
				autoSaveNote(valueToSave);
			}
		}, 1000);
	}

	/**
	 * Commit changes immediately and exit edit mode
	 */
	async function commitChanges() {
		// Clear any pending auto-save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		// Set optimistic value FIRST so it displays immediately
		const newValue = inputValue.trim() || null;
		optimisticValue = newValue;

		// Exit input mode
		isInputMode = false;
		const savedValue = inputValue;
		inputValue = '';
		originalValue = '';

		// Save if value changed
		if (savedValue !== (noteValue || '')) {
			await autoSaveNote(savedValue);
			
			// Reload when note status changes (added OR removed)
			// This updates CSS classes in Segment.svelte which depend on props
			if (Boolean(newValue) !== Boolean(noteValue)) {
				await invalidate('app:studies');
				
				// Update toolbar state to reflect new note status
				const updatedOptions = {
					hasHeadingOne: $toolbarState.activeSegmentHasHeadingOne,
					hasHeadingTwo: $toolbarState.activeSegmentHasHeadingTwo,
					hasHeadingThree: $toolbarState.activeSegmentHasHeadingThree,
					hasNote: Boolean(newValue)
				};
				setActiveSegment(true, segmentId, updatedOptions);
			}
		}
	}

	/**
	 * Cancel and revert to original value
	 */
	function cancelChanges() {
		// Clear any pending auto-save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		// Revert to original value if it was changed
		if (inputValue !== originalValue) {
			// Restore original value in database
			autoSaveNote(originalValue);
		}

		// Exit input mode
		isInputMode = false;
		inputValue = '';
		originalValue = '';
	}

	/**
	 * Handle delete note with optimistic UI
	 */
	async function handleDelete() {
		// Set optimistic to null (deleted state) FIRST
		optimisticValue = null;
		
		// Exit input mode immediately
		isInputMode = false;
		inputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/note', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					noteText: null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticValue = undefined;
				
				// Update toolbar state immediately to reflect note removal
				const updatedOptions = {
					hasHeadingOne: $toolbarState.activeSegmentHasHeadingOne,
					hasHeadingTwo: $toolbarState.activeSegmentHasHeadingTwo,
					hasHeadingThree: $toolbarState.activeSegmentHasHeadingThree,
					hasNote: false
				};
				setActiveSegment(true, segmentId, updatedOptions);
				
				// Dispatch success event
				window.dispatchEvent(new CustomEvent('remove-note-success'));
			} else {
				const error = await response.json();
				console.error('Delete note error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				// Dispatch failure event
				window.dispatchEvent(new CustomEvent('remove-note-failure'));
				alert(`Error: ${error.error || 'Failed to delete note'}`);
			}
		} catch (error) {
			console.error('Delete note network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			// Dispatch failure event
			window.dispatchEvent(new CustomEvent('remove-note-failure'));
			alert(`Error: ${error.message || 'Failed to delete note'}`);
		}
	}


	/**
	 * Reset hasInitialized when exiting input mode
	 */
	$effect(() => {
		if (!isInputMode) {
			hasInitialized = false;
		}
	});

	/**
	 * Watch inputValue changes reactively to trigger auto-save
	 * This works with Svelte's bind:value without conflicting event listeners
	 */
	$effect(() => {
		if (isInputMode && hasInitialized && inputValue !== originalValue) {
			// Update optimistic value immediately for visual feedback
			optimisticValue = inputValue.trim() || null;
			
			// Trigger debounced save
			handleInputChange();
		}
	});

	/**
	 * Commit changes when segment becomes inactive
	 */
	$effect(() => {
		if (!isActive && isInputMode) {
			commitChanges();
		}
	});

	/**
	 * Clear optimistic value only when props actually change
	 * This prevents stale values from other segments while preserving optimistic updates
	 */
	$effect(() => {
		// Check if segment or value changed from props
		if (segmentId !== previousSegmentId || noteValue !== previousNoteValue) {
			// Clear optimistic value only when not editing
			if (!isInputMode && optimisticValue !== undefined) {
				optimisticValue = undefined;
			}
			// Update tracked values
			previousSegmentId = segmentId;
			previousNoteValue = noteValue;
		}
	});

	/**
	 * Handle textarea keydown (Enter to commit, Esc to cancel)
	 */
	function handleKeyDown(event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			commitChanges();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelChanges();
		}
	}

	/**
	 * Handle note click to enter edit mode
	 * Activates segment if not already active
	 */
	async function handleNoteClick() {
		// Activate segment if not already active
		if (!isActive) {
			const options = {
				hasHeadingOne,
				hasHeadingTwo,
				hasHeadingThree,
				hasNote
			};
			setActiveSegment(true, segmentId, options);
			await tick();
		}
		
		// Enter edit mode
		if (!isInputMode) {
			// Set values and enter input mode
			inputValue = displayValue || '';
			originalValue = displayValue || '';
			isInputMode = true;
			
			// Wait for textarea to render, then focus after a small delay
			await tick();
			
			// Use setTimeout to ensure toolbar transitions complete before focusing
			setTimeout(() => {
				const inputElement = document.getElementById(inputId);
				if (inputElement && inputElement instanceof HTMLTextAreaElement) {
					inputElement.focus();
					// Attach keydown handler for Enter/Escape
					inputElement.addEventListener('keydown', handleKeyDown);
					// Set hasInitialized AFTER focus to prevent reactive effects from interfering
					hasInitialized = true;
				}
			}, 200);
		}
	}

	/**
	 * Handle remove note event from menu
	 */
	function handleRemoveNote(event) {
		if (event.detail?.segmentId === segmentId) {
			handleDelete();
		}
	}

	/**
	 * Listen for remove note events
	 */
	$effect(() => {
		window.addEventListener('remove-note', handleRemoveNote);
		
		return () => {
			window.removeEventListener('remove-note', handleRemoveNote);
		};
	});
</script>

<div class="note-container">
	{#if isInputMode}
		<div class="note-input">
			<Textarea
				id={inputId}
				name="note-input"
				bind:value={inputValue}
				rows={1}
				autoGrow={true}
			/>
		</div>
	{:else if displayValue}
		<div 
			class="note"
			class:clickable={isActive}
			onclick={handleNoteClick}
			role="button"
			tabindex={isActive ? 0 : -1}
		>
			{displayValue}
		</div>
	{/if}
</div>

<style>
	/* Container for note and toolbar positioning */
	.note-container {
		position: relative;
	}

	/* Note Display */
	.note {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 700;
		line-height: 1.6;
		padding: 0.6rem;
		margin: 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-top: 0rem;
		border-color: var(--section-dark);
		background-color: var(--gray-light);
		color: var(--gray-dark);
		white-space: pre-wrap;
		word-wrap: break-word;
		cursor: pointer;
	}

	.note:hover {
		border-top: 0.1rem dashed var(--gray);
		margin-top: -0.1rem;
	}

	/* Note Input */
	.note-input {
		position: relative;
		font-size: 1.2rem;
		padding: 0rem;
		margin: 0.0rem;
	}

	.note-input :global(textarea) {
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 700;
		line-height: 1.5;
		padding: 0.6rem;
		margin: 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-top: 0rem;
		border-radius: 0rem;
		background-color: var(--gray-light);
		color: var(--gray-dark);
		border-color: var(--section-dark);
		caret-color: var(--gray-darker);
		width: 100%;
		box-sizing: border-box;
		display: block;
		resize: none;
		min-height: 3.1rem;
		border-top: 0.1rem dashed var(--gray);
	}

	.note-input :global(textarea:focus) {
		outline: none;
		box-shadow: none;
	}
</style>
