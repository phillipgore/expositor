<script>
	import { onMount, tick } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import ToolbarPassage from './ToolbarPassage.svelte';
	import Input from '$lib/componentElements/Input.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	let { 
		heading1 = null,
		heading2 = null,
		heading3 = null,
		text = '',
		passageIndex = 0,
		wrapWordsInHtml = null,
		isActive = false,
		toolbarMode = $bindable('outline'),
		segmentId = '',
		onInsertColumn = () => {},
		onInsertSplit = () => {},
		onInsertSegment = () => {}
	} = $props();

	// Heading input state
	let headingOneInputMode = $state(false);
	let headingOneInputValue = $state('');
	let headingInputRef = $state(null);
	let optimisticHeading = $state(undefined); // undefined = use heading1, null = deleted, string = optimistic value
	
	// Only slide when inserting (no existing heading)
	let shouldSlide = $derived(!heading1);
	// Slide out when: canceling with no heading, or deleting
	let shouldSlideOut = $derived(
		(!heading1 && optimisticHeading === undefined) || // Cancel with no heading
		(optimisticHeading === null) // Delete
	);

	/**
	 * Handle insert-heading-one custom event
	 */
	function handleInsertHeadingOne(event) {
		// Check if this event is for this segment
		if (event.detail?.segmentId === segmentId) {
			// Enter input mode
			headingOneInputMode = true;
			// Pre-fill with existing heading if present
			headingOneInputValue = heading1 || '';
		}
	}

	/**
	 * Handle save heading with optimistic UI
	 */
	async function handleSaveHeading() {
		// Set optimistic heading FIRST for smooth crossfade
		optimisticHeading = headingOneInputValue.trim() || null;
		
		// Exit input mode immediately (triggers crossfade)
		headingOneInputMode = false;
		const savedValue = headingOneInputValue;
		headingOneInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'one',
					headingText: savedValue.trim() || null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticHeading = undefined;
			} else {
				const error = await response.json();
				console.error('Update heading error:', error);
				// Revert optimistic update on error
				optimisticHeading = undefined;
				headingOneInputMode = true;
				headingOneInputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update heading'}`);
			}
		} catch (error) {
			console.error('Update heading network error:', error);
			// Revert optimistic update on error
			optimisticHeading = undefined;
			headingOneInputMode = true;
			headingOneInputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update heading'}`);
		}
	}

	/**
	 * Handle cancel heading input
	 */
	function handleCancelHeading() {
		headingOneInputMode = false;
		headingOneInputValue = '';
	}

	/**
	 * Handle delete heading with optimistic UI
	 */
	async function handleDeleteHeading() {
		// Set optimistic to null (deleted state) FIRST
		optimisticHeading = null;
		
		// Exit input mode immediately
		headingOneInputMode = false;
		headingOneInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'one',
					headingText: null
				})
			});

			if (response.ok) {
				// Refresh data
				await invalidate('app:studies');
				// Clear optimistic state once real data arrives
				optimisticHeading = undefined;
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				// Revert optimistic update on error
				optimisticHeading = undefined;
				headingOneInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			// Revert optimistic update on error
			optimisticHeading = undefined;
			headingOneInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown (Enter to save, Esc to cancel)
	 */
	function handleInputKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSaveHeading();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancelHeading();
		}
	}

	/**
	 * Auto-focus input when it appears and select text if editing
	 */
	$effect(() => {
		if (headingOneInputMode) {
			tick().then(() => {
				const inputElement = document.getElementById(`heading-one-input-${segmentId}`);
				if (inputElement && inputElement instanceof HTMLInputElement) {
					inputElement.focus();
					// If editing existing heading, select all text
					if (headingOneInputValue) {
						inputElement.select();
					}
				}
			});
		}
	});

	// Listen for custom event
	onMount(() => {
		window.addEventListener('insert-heading-one', handleInsertHeadingOne);
		
		return () => {
			window.removeEventListener('insert-heading-one', handleInsertHeadingOne);
		};
	});
</script>

<div class="segment" class:active={isActive} data-segment-id="{segmentId}">
	<!-- Hide ToolbarPassage when heading input is active -->
	{#if !headingOneInputMode}
		<ToolbarPassage 
			bind:toolbarMode 
			{isActive} 
			{onInsertColumn}
			{onInsertSplit}
			{onInsertSegment}
			{segmentId}
		/>
	{/if}
	
	<!-- Heading One: Input or display -->
	<div class="heading-one-container">
		{#if headingOneInputMode}
			<div 
				class="heading-one-input" 
				in:slide="{{ duration: shouldSlide ? 300 : 0 }}"
				out:slide="{{ duration: shouldSlideOut ? 300 : 0 }}"
			>
				<Input
					id="heading-one-input-{segmentId}"
					name="heading-one-input"
					bind:value={headingOneInputValue}
					bind:this={headingInputRef}
					onkeydown={handleInputKeyDown}
				/>
			</div>
		{:else if optimisticHeading !== undefined ? optimisticHeading : heading1}
			<h4 class="heading-one">
				{optimisticHeading !== undefined ? optimisticHeading : heading1}
			</h4>
		{/if}
		
		<!-- Toolbar (positioned absolutely, separate from input) -->
		{#if headingOneInputMode}
			<div class="heading-toolbar">
				<IconButton
					iconId="check"
					classes="passage-toolbar"
					title="Save"
					isSquare
					handleClick={handleSaveHeading}
				/>
				<IconButton
					iconId="x"
					classes="passage-toolbar"
					title="Cancel"
					isSquare
					handleClick={handleCancelHeading}
				/>
				{#if heading1}
					<div class="toolbar-divider"></div>
					<IconButton
						iconId="trashcan"
						classes="passage-toolbar"
						title="Delete Heading"
						isSquare
						handleClick={handleDeleteHeading}
					/>
				{/if}
			</div>
		{/if}
	</div>
	
	{#if heading2}
		<h5 class="heading-two">{heading2}</h5>
	{/if}
	{#if heading3}
		<h6 class="heading-three">{heading3}</h6>
	{/if}
	
	<div class="text" class:no-headings={!headingOneInputMode && !heading1 && !heading2 && !heading3}>
		{#if wrapWordsInHtml}
			{@html wrapWordsInHtml(text, passageIndex)}
		{:else}
			{@html text}
		{/if}
	</div>
</div>

<style>
	.segment {
		position: relative;
	}

	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--split-dark);
	}

	/* Container for heading and toolbar positioning */
	.heading-one-container {
		position: relative;
	}

	.heading-one {
		font-size: 1.6rem;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: white;
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
		border-color: var(--split-dark);
	}

	.segment:last-child,
	.segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Heading One Input - styled to match heading-one exactly */
	.heading-one-input {
		position: relative;
		font-size: 1.6rem;
		font-weight: 700;
		text-align: center;
		padding: 0rem;
		margin: 0.0rem;
	}

	.heading-one-input :global(input) {
		font-size: 1.6rem;
		font-weight: 700;
		text-align: center;
		padding: 0.9rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		border-radius: 0rem;
		color: var(--split-darker);
		background-color: var(--split-lighter);
		border-color: var(--split-darker);
		caret-color: var(--split-darker);
		width: 100%;
		height: auto;
		box-sizing: border-box;
		display: block;
	}

	.heading-one-input :global(input:focus) {
		outline: none;
		box-shadow: none;
	}

	.heading-one-input :global(input::placeholder) {
		color: var(--split-darker);
		opacity: 0.3;
	}

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

	/* First/last child styling rules for integration with parent split */
	:global(.split) .segment:first-child,
	:global(.split) .segment:first-child .heading-one,
	:global(.split) .segment:first-child .heading-one-input :global(input) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	:global(.split) .segment:first-child .text.no-headings {
		border-top: 0.1rem solid;
		border-color: var(--split-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	:global(.split) .segment:last-child,
	:global(.split) .segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}
</style>
