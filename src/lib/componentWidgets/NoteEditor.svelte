<script>
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import Textarea from '$lib/componentElements/Textarea.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	let { 
		noteValue = null,
		segmentId = '',
		isInputMode = $bindable(false),
		isActive = false
	} = $props();

	// Input state
	let inputValue = $state('');
	let optimisticValue = $state(undefined); // undefined = use noteValue, null = deleted, string = optimistic value
	
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
	 * Handle save note with optimistic UI
	 */
	async function handleSave() {

		// Set optimistic value FIRST for smooth crossfade
		optimisticValue = inputValue.trim() || null;
		
		// Exit input mode immediately (triggers crossfade)
		isInputMode = false;
		const savedValue = inputValue;
		inputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/note', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					noteText: savedValue.trim() || null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticValue = undefined;
			} else {
				const error = await response.json();
				console.error('Update note error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				inputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update note'}`);
			}
		} catch (error) {
			console.error('Update note network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			inputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update note'}`);
		}
	}

	/**
	 * Handle cancel note input
	 */
	function handleCancel() {
		isInputMode = false;
		inputValue = '';
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
			} else {
				const error = await response.json();
				console.error('Delete note error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete note'}`);
			}
		} catch (error) {
			console.error('Delete note network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete note'}`);
		}
	}

	/**
	 * Auto-focus input when it appears and select text if editing
	 */
	$effect(() => {
		if (isInputMode) {
			tick().then(() => {
				const inputElement = document.getElementById(inputId);
				if (inputElement && inputElement instanceof HTMLTextAreaElement) {
					inputElement.focus();
					if (inputValue) {
						inputElement.select();
					}
				}
			});
		}
	});

	/**
	 * Pre-fill input value when entering input mode
	 */
	$effect(() => {
		if (isInputMode && !inputValue) {
			inputValue = noteValue || '';
		}
	});

	/**
	 * Cancel input mode when segment becomes inactive
	 */
	$effect(() => {
		if (!isActive && isInputMode) {
			handleCancel();
		}
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
		<div class="note">
			{displayValue}
		</div>
	{/if}
	
	<!-- Toolbar (positioned absolutely) -->
	{#if isInputMode}
		<div class="note-toolbar">
			<IconButton
				iconId="check"
				classes="passage-toolbar"
				title="Save"
				isSquare
				handleClick={handleSave}
			/>
			<IconButton
				iconId="x"
				classes="passage-toolbar"
				title="Cancel"
				isSquare
				handleClick={handleCancel}
			/>
			{#if noteValue}
				<div class="toolbar-divider"></div>
				<IconButton
					iconId="trashcan"
					classes="passage-toolbar"
					title="Delete Note"
					isSquare
					handleClick={handleDelete}
				/>
			{/if}
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
		line-height: 1.5;
		padding: 0.6rem 0.9rem;
		margin: 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-top: 0rem;
		border-color: var(--split-dark);
		background-color: var(--gray-light);
		color: var(--gray-dark);
		white-space: pre-wrap;
		word-wrap: break-word;
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
		padding: 0.6rem 0.9rem;
		margin: 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-top: 0rem;
		border-radius: 0rem;
		background-color: var(--gray-light);
		color: var(--gray-dark);
		border-color: var(--split-dark);
		caret-color: var(--gray-darker);
		width: 100%;
		box-sizing: border-box;
		display: block;
		resize: none;
		min-height: 3.1rem;
	}

	.note-input :global(textarea:focus) {
		outline: none;
		box-shadow: none;
	}

	/* Toolbar */
	.note-toolbar {
		position: absolute;
		right: -3.4rem;
		bottom: 0rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.toolbar-divider {
		width: 100%;
		height: 0.1rem;
		background-color: var(--gray-700);
		margin: 0.3rem 0rem;
	}
</style>
