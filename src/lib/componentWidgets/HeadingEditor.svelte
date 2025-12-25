<script>
	import { tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import Input from '$lib/componentElements/Input.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	let { 
		headingType = 'one', // 'one', 'two', or 'three'
		headingValue = null,
		segmentId = '',
		isInputMode = $bindable(false),
		isActive = false
	} = $props();

	// Input state
	let inputValue = $state('');
	let optimisticValue = $state(undefined); // undefined = use headingValue, null = deleted, string = optimistic value
	
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
	 * Handle save heading with optimistic UI
	 */
	async function handleSave() {
		// Set optimistic value FIRST for smooth crossfade
		optimisticValue = inputValue.trim() || null;
		
		// Exit input mode immediately (triggers crossfade)
		isInputMode = false;
		const savedValue = inputValue;
		inputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: headingType,
					headingText: savedValue.trim() || null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticValue = undefined;
			} else {
				const error = await response.json();
				console.error('Update heading error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				inputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update heading'}`);
			}
		} catch (error) {
			console.error('Update heading network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			inputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update heading'}`);
		}
	}

	/**
	 * Handle cancel heading input
	 */
	function handleCancel() {
		isInputMode = false;
		inputValue = '';
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
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				// Revert optimistic update on error
				optimisticValue = undefined;
				isInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			// Revert optimistic update on error
			optimisticValue = undefined;
			isInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown (Enter to save, Esc to cancel)
	 */
	function handleInputKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSave();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancel();
		}
	}

	/**
	 * Auto-focus input when it appears and select text if editing
	 */
	$effect(() => {
		if (isInputMode) {
			tick().then(() => {
				const inputElement = document.getElementById(inputId);
				if (inputElement && inputElement instanceof HTMLInputElement) {
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
			inputValue = headingValue || '';
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
		<svelte:element this={config.tag} class={config.class}>
			{displayValue}
		</svelte:element>
	{/if}
	
	<!-- Toolbar (positioned absolutely) -->
	{#if isInputMode}
		<div class="heading-toolbar">
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
			{#if headingValue}
				<div class="toolbar-divider"></div>
				<IconButton
					iconId="trashcan"
					classes="passage-toolbar"
					title="Delete Heading"
					isSquare
					handleClick={handleDelete}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Container for heading and toolbar positioning */
	.heading-one-container,
	.heading-two-container,
	.heading-three-container {
		position: relative;
	}

	.heading-three-container {
		margin-bottom: -0.6rem;
	}

	/* Heading One Display */
	.heading-one {
		font-size: 1.6rem;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: var(--white);
		background-color: var(--split-darker);
		border-color: var(--split-darker);
		line-height: 1.5;
	}

	/* Heading One rounded top corners for first segment in split */
	:global(.split .segment:first-child) .heading-one,
	:global(.split .segment:first-child) .heading-one-input {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Heading Two Display */
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
		line-height: 1.5;
	}

	/* Heading Three Display */
	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.9rem 0.9rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--split-dark);
		line-height: 1.5;
	}

	/* No-headings styles (when heading appears at top of segment without prior headings) */
	:global(.segment:first-child .no-headings) .heading-two,
	:global(.segment:first-child .no-headings) .heading-two-input :global(input) {
		border-top: 0.1rem solid !important;
		border-color: var(--split-dark) !important;
		border-top-right-radius: 0.3rem !important;
		border-top-left-radius: 0.3rem !important;
	}

	:global(.segment:first-child .no-headings) .heading-three,
	:global(.segment:first-child .no-headings) .heading-three-input :global(input) {
		border-top: 0.1rem solid !important;
		border-color: var(--split-dark) !important;
		border-top-right-radius: 0.3rem !important;
		border-top-left-radius: 0.3rem !important;
	}

	/* Toolbar */
	.heading-toolbar {
		position: absolute;
		right: -3.4rem;
		top: 0rem;
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
