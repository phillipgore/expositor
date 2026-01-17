<script>
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import Input from '$lib/componentElements/Input.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import { toolbarState, setActiveSegment } from '$lib/stores/toolbar.js';

	let { 
		headingType = 'one', // 'one', 'two', or 'three'
		headingValue = null,
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
	let optimisticValue = $state(undefined); // undefined = use headingValue, null = deleted, string = optimistic value
	let saveTimeout = $state(null);
	let hasInitialized = $state(false); // Track if input has been initialized for this edit session
	
	// Track previous prop values to detect real changes
	let previousSegmentId = $state(segmentId);
	let previousHeadingValue = $state(headingValue);
	
	// Slide animation logic
	let shouldSlideIn = $derived(!headingValue);
	let shouldSlideOut = $derived(
		(!headingValue && optimisticValue === undefined) || // Cancel with no heading
		(optimisticValue === null) // Delete
	);

	// Computed display value
	let displayValue = $derived(optimisticValue !== undefined ? optimisticValue : headingValue);

	// Heading type configuration
	const headingConfig = {
		one: { 
			tag: 'h4', 
			class: 'heading-one',
			inputClass: 'heading-one-input',
			eventName: 'insert-heading-one'
		},
		two: { 
			tag: 'h5', 
			class: 'heading-two',
			inputClass: 'heading-two-input',
			eventName: 'insert-heading-two'
		},
		three: { 
			tag: 'h6', 
			class: 'heading-three',
			inputClass: 'heading-three-input',
			eventName: 'insert-heading-three'
		}
	};

	const config = $derived(headingConfig[headingType]);
	const inputId = $derived(`heading-${headingType}-input-${segmentId}`);

	/**
	 * Auto-save heading to database (debounced)
	 */
	async function autoSaveHeading(text) {
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: headingType,
					headingText: text.trim() || null
				})
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('Auto-save heading error:', error);
				alert(`Error: ${error.error || 'Failed to auto-save heading'}`);
			}
			// Note: We don't call invalidate() here to avoid constant data reloads
			// The local state is already updated via inputValue binding
		} catch (error) {
			console.error('Auto-save heading network error:', error);
			alert(`Error: ${error.message || 'Failed to auto-save heading'}`);
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
				autoSaveHeading(valueToSave);
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
		if (savedValue !== (headingValue || '')) {
			await autoSaveHeading(savedValue);
			
			// Reload when heading status changes (added OR removed)
			// This updates CSS classes in Segment.svelte which depend on props
			if (Boolean(newValue) !== Boolean(headingValue)) {
				await invalidate('app:studies');
				
				// Update toolbar state to reflect new heading status
				const updatedOptions = {
					hasHeadingOne: headingType === 'one' ? Boolean(newValue) : $toolbarState.activeSegmentHasHeadingOne,
					hasHeadingTwo: headingType === 'two' ? Boolean(newValue) : $toolbarState.activeSegmentHasHeadingTwo,
					hasHeadingThree: headingType === 'three' ? Boolean(newValue) : $toolbarState.activeSegmentHasHeadingThree,
					hasNote: $toolbarState.activeSegmentHasNote
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
			autoSaveHeading(originalValue);
		}

		// Exit input mode
		isInputMode = false;
		inputValue = '';
		originalValue = '';
	}

	/**
	 * Handle delete heading with optimistic UI
	 */
	async function handleDelete() {
		// Set optimistic to null (deleted state) FIRST
		optimisticValue = null;
		
		// Exit input mode immediately
		isInputMode = false;
		inputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: headingType,
					headingText: null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticValue = undefined;
				
				// Update toolbar state immediately to reflect heading removal
				const updatedOptions = {
					hasHeadingOne: headingType === 'one' ? false : $toolbarState.activeSegmentHasHeadingOne,
					hasHeadingTwo: headingType === 'two' ? false : $toolbarState.activeSegmentHasHeadingTwo,
					hasHeadingThree: headingType === 'three' ? false : $toolbarState.activeSegmentHasHeadingThree,
					hasNote: $toolbarState.activeSegmentHasNote
				};
				setActiveSegment(true, segmentId, updatedOptions);
				
				// Dispatch success event
				window.dispatchEvent(new CustomEvent(`remove-heading-${headingType}-success`));
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				// Dispatch failure event
				window.dispatchEvent(new CustomEvent(`remove-heading-${headingType}-failure`));
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			// Dispatch failure event
			window.dispatchEvent(new CustomEvent(`remove-heading-${headingType}-failure`));
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown (Enter to commit, Esc to cancel)
	 */
	function handleInputKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitChanges();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelChanges();
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
		if (segmentId !== previousSegmentId || headingValue !== previousHeadingValue) {
			// Clear optimistic value only when not editing
			if (!isInputMode && optimisticValue !== undefined) {
				optimisticValue = undefined;
			}
			// Update tracked values
			previousSegmentId = segmentId;
			previousHeadingValue = headingValue;
		}
	});

	/**
	 * Handle heading click to enter edit mode
	 * Activates segment if not already active
	 */
	async function handleHeadingClick() {
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
			
			// Wait for input to render, then focus after a small delay
			await tick();
			
			// Use setTimeout to ensure toolbar transitions complete before focusing
			setTimeout(() => {
				const inputElement = document.getElementById(inputId);
				if (inputElement && inputElement instanceof HTMLInputElement) {
					inputElement.focus();
					// Set hasInitialized AFTER focus to prevent reactive effects from interfering
					hasInitialized = true;
				}
			}, 200);
		}
	}

	/**
	 * Handle remove heading event from menu
	 */
	function handleRemoveHeading(event) {
		if (event.detail?.segmentId === segmentId) {
			handleDelete();
		}
	}

	/**
	 * Listen for remove heading events
	 */
	$effect(() => {
		const eventName = `remove-heading-${headingType}`;
		window.addEventListener(eventName, handleRemoveHeading);
		
		return () => {
			window.removeEventListener(eventName, handleRemoveHeading);
		};
	});
</script>

<div class="{config.class}-container">
	{#if isInputMode}
		<Input
			id={inputId}
			name="{headingType}-heading-input"
			classes={config.inputClass}
			bind:value={inputValue}
			onkeydown={handleInputKeyDown}
		/>
	{:else if displayValue}
		<svelte:element 
			this={config.tag} 
			class={config.class}
			class:clickable={isActive}
			onclick={handleHeadingClick}
			role="button"
			tabindex={isActive ? 0 : -1}
		>
			{displayValue}
		</svelte:element>
	{/if}
</div>

<style>
	/* Container for heading and toolbar positioning */
	.heading-one-container,
	.heading-two-container,
	.heading-three-container {
		position: relative;
	}

	/* Heading One Display */
	.heading-one {
		font-size: 1.4rem;
		font-weight: 700;
		text-align: center;
		padding: 0.6rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: var(--white);
		background-color: var(--section-darker);
		border-color: var(--section-darker);
		line-height: 1.5;
		transition: border 0.2s ease-in-out;
		cursor: pointer;
	}

	.heading-one:hover {
		border-bottom: 0.1rem dashed var(--section-lighter);
	}

	/* Heading Two Display */
	.heading-two {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		font-weight: 700;
		padding: 0.6rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		background-color: var(--section-lighter);
		color: var(--section-darker);
		border-color: var(--section-dark);
		line-height: 1.5;
		transition: border 0.2s ease-in-out;
		cursor: pointer;
	}

	.heading-two:hover {
		border-bottom: 0.1rem dashed var(--section-dark);
	}

	/* Heading Three Display */
	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.6rem 0.6rem 0.1rem;
		border-right: 0.1rem solid var(--section-dark);
		border-left: 0.1rem solid var(--section-dark);
		line-height: 1.5;
		border-bottom: none;
		cursor: pointer;
		color: var(--gray-200);
	}

	.heading-three:hover {
		border-bottom: 0.1rem dashed var(--section-dark);
		padding: 0.4rem 0.6rem 0.3rem;
		margin-bottom: -0.1rem;
	}

	/* Heading One rounded top corners for first segment in section */
	:global(.section .segment:first-child) .heading-one,
	:global(.section .segment:first-child) .heading-one-input {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}
</style>
