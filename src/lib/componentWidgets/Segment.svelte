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

	// Heading One input state
	let headingOneInputMode = $state(false);
	let headingOneInputValue = $state('');
	let headingOneInputRef = $state(null);
	let optimisticHeadingOne = $state(undefined); // undefined = use heading1, null = deleted, string = optimistic value
	
	// Only slide when inserting (no existing heading)
	let shouldSlideOne = $derived(!heading1);
	// Slide out when: canceling with no heading, or deleting
	let shouldSlideOutOne = $derived(
		(!heading1 && optimisticHeadingOne === undefined) || // Cancel with no heading
		(optimisticHeadingOne === null) // Delete
	);

	// Heading Two input state
	let headingTwoInputMode = $state(false);
	let headingTwoInputValue = $state('');
	let headingTwoInputRef = $state(null);
	let optimisticHeadingTwo = $state(undefined);
	
	let shouldSlideTwo = $derived(!heading2);
	let shouldSlideOutTwo = $derived(
		(!heading2 && optimisticHeadingTwo === undefined) ||
		(optimisticHeadingTwo === null)
	);

	// Heading Three input state
	let headingThreeInputMode = $state(false);
	let headingThreeInputValue = $state('');
	let headingThreeInputRef = $state(null);
	let optimisticHeadingThree = $state(undefined);
	
	let shouldSlideThree = $derived(!heading3);
	let shouldSlideOutThree = $derived(
		(!heading3 && optimisticHeadingThree === undefined) ||
		(optimisticHeadingThree === null)
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
	 * Handle save heading one with optimistic UI
	 */
	async function handleSaveHeadingOne() {
		// Set optimistic heading FIRST for smooth crossfade
		optimisticHeadingOne = headingOneInputValue.trim() || null;
		
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
				optimisticHeadingOne = undefined;
			} else {
				const error = await response.json();
				console.error('Update heading error:', error);
				// Revert optimistic update on error
				optimisticHeadingOne = undefined;
				headingOneInputMode = true;
				headingOneInputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update heading'}`);
			}
		} catch (error) {
			console.error('Update heading network error:', error);
			// Revert optimistic update on error
			optimisticHeadingOne = undefined;
			headingOneInputMode = true;
			headingOneInputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update heading'}`);
		}
	}

	/**
	 * Handle cancel heading one input
	 */
	function handleCancelHeadingOne() {
		headingOneInputMode = false;
		headingOneInputValue = '';
	}

	/**
	 * Handle delete heading one with optimistic UI
	 */
	async function handleDeleteHeadingOne() {
		// Set optimistic to null (deleted state) FIRST
		optimisticHeadingOne = null;
		
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
				optimisticHeadingOne = undefined;
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				// Revert optimistic update on error
				optimisticHeadingOne = undefined;
				headingOneInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			// Revert optimistic update on error
			optimisticHeadingOne = undefined;
			headingOneInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown for heading one (Enter to save, Esc to cancel)
	 */
	function handleInputKeyDownOne(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSaveHeadingOne();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancelHeadingOne();
		}
	}

	/**
	 * Handle insert-heading-two custom event
	 */
	function handleInsertHeadingTwo(event) {
		if (event.detail?.segmentId === segmentId) {
			headingTwoInputMode = true;
			headingTwoInputValue = heading2 || '';
		}
	}

	/**
	 * Handle save heading two with optimistic UI
	 */
	async function handleSaveHeadingTwo() {
		optimisticHeadingTwo = headingTwoInputValue.trim() || null;
		
		headingTwoInputMode = false;
		const savedValue = headingTwoInputValue;
		headingTwoInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'two',
					headingText: savedValue.trim() || null
				})
			});

			if (response.ok) {
				await invalidate('app:studies');
				optimisticHeadingTwo = undefined;
			} else {
				const error = await response.json();
				console.error('Update heading error:', error);
				optimisticHeadingTwo = undefined;
				headingTwoInputMode = true;
				headingTwoInputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update heading'}`);
			}
		} catch (error) {
			console.error('Update heading network error:', error);
			optimisticHeadingTwo = undefined;
			headingTwoInputMode = true;
			headingTwoInputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update heading'}`);
		}
	}

	/**
	 * Handle cancel heading two input
	 */
	function handleCancelHeadingTwo() {
		headingTwoInputMode = false;
		headingTwoInputValue = '';
	}

	/**
	 * Handle delete heading two with optimistic UI
	 */
	async function handleDeleteHeadingTwo() {
		optimisticHeadingTwo = null;
		
		headingTwoInputMode = false;
		headingTwoInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'two',
					headingText: null
				})
			});

			if (response.ok) {
				await invalidate('app:studies');
				optimisticHeadingTwo = undefined;
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				optimisticHeadingTwo = undefined;
				headingTwoInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			optimisticHeadingTwo = undefined;
			headingTwoInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown for heading two
	 */
	function handleInputKeyDownTwo(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSaveHeadingTwo();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancelHeadingTwo();
		}
	}

	/**
	 * Handle insert-heading-three custom event
	 */
	function handleInsertHeadingThree(event) {
		if (event.detail?.segmentId === segmentId) {
			headingThreeInputMode = true;
			headingThreeInputValue = heading3 || '';
		}
	}

	/**
	 * Handle save heading three with optimistic UI
	 */
	async function handleSaveHeadingThree() {
		optimisticHeadingThree = headingThreeInputValue.trim() || null;
		
		headingThreeInputMode = false;
		const savedValue = headingThreeInputValue;
		headingThreeInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'three',
					headingText: savedValue.trim() || null
				})
			});

			if (response.ok) {
				await invalidate('app:studies');
				optimisticHeadingThree = undefined;
			} else {
				const error = await response.json();
				console.error('Update heading error:', error);
				optimisticHeadingThree = undefined;
				headingThreeInputMode = true;
				headingThreeInputValue = savedValue;
				alert(`Error: ${error.error || 'Failed to update heading'}`);
			}
		} catch (error) {
			console.error('Update heading network error:', error);
			optimisticHeadingThree = undefined;
			headingThreeInputMode = true;
			headingThreeInputValue = savedValue;
			alert(`Error: ${error.message || 'Failed to update heading'}`);
		}
	}

	/**
	 * Handle cancel heading three input
	 */
	function handleCancelHeadingThree() {
		headingThreeInputMode = false;
		headingThreeInputValue = '';
	}

	/**
	 * Handle delete heading three with optimistic UI
	 */
	async function handleDeleteHeadingThree() {
		optimisticHeadingThree = null;
		
		headingThreeInputMode = false;
		headingThreeInputValue = '';
		
		try {
			const response = await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					segmentId: segmentId,
					headingType: 'three',
					headingText: null
				})
			});

			if (response.ok) {
				await invalidate('app:studies');
				optimisticHeadingThree = undefined;
			} else {
				const error = await response.json();
				console.error('Delete heading error:', error);
				optimisticHeadingThree = undefined;
				headingThreeInputMode = true;
				alert(`Error: ${error.error || 'Failed to delete heading'}`);
			}
		} catch (error) {
			console.error('Delete heading network error:', error);
			optimisticHeadingThree = undefined;
			headingThreeInputMode = true;
			alert(`Error: ${error.message || 'Failed to delete heading'}`);
		}
	}

	/**
	 * Handle input keydown for heading three
	 */
	function handleInputKeyDownThree(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleSaveHeadingThree();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			handleCancelHeadingThree();
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
					if (headingOneInputValue) {
						inputElement.select();
					}
				}
			});
		}
		
		if (headingTwoInputMode) {
			tick().then(() => {
				const inputElement = document.getElementById(`heading-two-input-${segmentId}`);
				if (inputElement && inputElement instanceof HTMLInputElement) {
					inputElement.focus();
					if (headingTwoInputValue) {
						inputElement.select();
					}
				}
			});
		}
		
		if (headingThreeInputMode) {
			tick().then(() => {
				const inputElement = document.getElementById(`heading-three-input-${segmentId}`);
				if (inputElement && inputElement instanceof HTMLInputElement) {
					inputElement.focus();
					if (headingThreeInputValue) {
						inputElement.select();
					}
				}
			});
		}
	});

	/**
	 * Cancel any active heading edits when segment becomes inactive
	 */
	$effect(() => {
		if (!isActive) {
			// Cancel any active heading edits
			if (headingOneInputMode) {
				handleCancelHeadingOne();
			}
			if (headingTwoInputMode) {
				handleCancelHeadingTwo();
			}
			if (headingThreeInputMode) {
				handleCancelHeadingThree();
			}
		}
	});

	// Listen for custom events
	onMount(() => {
		window.addEventListener('insert-heading-one', handleInsertHeadingOne);
		window.addEventListener('insert-heading-two', handleInsertHeadingTwo);
		window.addEventListener('insert-heading-three', handleInsertHeadingThree);
		
		return () => {
			window.removeEventListener('insert-heading-one', handleInsertHeadingOne);
			window.removeEventListener('insert-heading-two', handleInsertHeadingTwo);
			window.removeEventListener('insert-heading-three', handleInsertHeadingThree);
		};
	});
</script>

<div class="segment" class:active={isActive} data-segment-id="{segmentId}">
	<!-- Hide ToolbarPassage when any heading input is active -->
	{#if !headingOneInputMode && !headingTwoInputMode && !headingThreeInputMode}
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
				in:slide="{{ duration: shouldSlideOne ? 300 : 0 }}"
				out:slide="{{ duration: shouldSlideOutOne ? 300 : 0 }}"
			>
				<Input
					id="heading-one-input-{segmentId}"
					name="heading-one-input"
					bind:value={headingOneInputValue}
					bind:this={headingOneInputRef}
					onkeydown={handleInputKeyDownOne}
				/>
			</div>
		{:else if optimisticHeadingOne !== undefined ? optimisticHeadingOne : heading1}
			<h4 class="heading-one">
				{optimisticHeadingOne !== undefined ? optimisticHeadingOne : heading1}
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
					handleClick={handleSaveHeadingOne}
				/>
				<IconButton
					iconId="x"
					classes="passage-toolbar"
					title="Cancel"
					isSquare
					handleClick={handleCancelHeadingOne}
				/>
				{#if heading1}
					<div class="toolbar-divider"></div>
					<IconButton
						iconId="trashcan"
						classes="passage-toolbar"
						title="Delete Heading"
						isSquare
						handleClick={handleDeleteHeadingOne}
					/>
				{/if}
			</div>
		{/if}
	</div>
	
	<!-- Heading Two: Input or display -->
	<div class="heading-two-container">
		{#if headingTwoInputMode}
			<div 
				class="heading-two-input" 
				class:no-headings={!headingOneInputMode && !heading1}
				in:slide="{{ duration: shouldSlideTwo ? 300 : 0 }}"
				out:slide="{{ duration: shouldSlideOutTwo ? 300 : 0 }}"
			>
				<Input
					id="heading-two-input-{segmentId}"
					name="heading-two-input"
					bind:value={headingTwoInputValue}
					bind:this={headingTwoInputRef}
					onkeydown={handleInputKeyDownTwo}
				/>
			</div>
		{:else if optimisticHeadingTwo !== undefined ? optimisticHeadingTwo : heading2}
			<h5 class="heading-two" class:no-headings={!headingOneInputMode && !heading1}>
				{optimisticHeadingTwo !== undefined ? optimisticHeadingTwo : heading2}
			</h5>
		{/if}
		
		<!-- Toolbar -->
		{#if headingTwoInputMode}
			<div class="heading-toolbar">
				<IconButton
					iconId="check"
					classes="passage-toolbar"
					title="Save"
					isSquare
					handleClick={handleSaveHeadingTwo}
				/>
				<IconButton
					iconId="x"
					classes="passage-toolbar"
					title="Cancel"
					isSquare
					handleClick={handleCancelHeadingTwo}
				/>
				{#if heading2}
					<div class="toolbar-divider"></div>
					<IconButton
						iconId="trashcan"
						classes="passage-toolbar"
						title="Delete Heading"
						isSquare
						handleClick={handleDeleteHeadingTwo}
					/>
				{/if}
			</div>
		{/if}
	</div>
	
	<!-- Heading Three: Input or display -->
	<div class="heading-three-container">
		{#if headingThreeInputMode}
			<div 
				class="heading-three-input" 
				class:no-headings={!headingOneInputMode && !headingTwoInputMode  && !heading1 && !heading2}
				in:slide="{{ duration: shouldSlideThree ? 300 : 0 }}"
				out:slide="{{ duration: shouldSlideOutThree ? 300 : 0 }}"
			>
				<Input
					id="heading-three-input-{segmentId}"
					name="heading-three-input"
					bind:value={headingThreeInputValue}
					bind:this={headingThreeInputRef}
					onkeydown={handleInputKeyDownThree}
				/>
			</div>
		{:else if optimisticHeadingThree !== undefined ? optimisticHeadingThree : heading3}
			<h6 class="heading-three" class:no-headings={!headingOneInputMode && !headingTwoInputMode  && !heading1 && !heading2}>
				{optimisticHeadingThree !== undefined ? optimisticHeadingThree : heading3}
			</h6>
		{/if}
		
		<!-- Toolbar -->
		{#if headingThreeInputMode}
			<div class="heading-toolbar">
				<IconButton
					iconId="check"
					classes="passage-toolbar"
					title="Save"
					isSquare
					handleClick={handleSaveHeadingThree}
				/>
				<IconButton
					iconId="x"
					classes="passage-toolbar"
					title="Cancel"
					isSquare
					handleClick={handleCancelHeadingThree}
				/>
				{#if heading3}
					<div class="toolbar-divider"></div>
					<IconButton
						iconId="trashcan"
						classes="passage-toolbar"
						title="Delete Heading"
						isSquare
						handleClick={handleDeleteHeadingThree}
					/>
				{/if}
			</div>
		{/if}
	</div>
	
	<div class="text" class:no-headings={!headingOneInputMode && !headingTwoInputMode && !headingThreeInputMode && !heading1 && !heading2 && !heading3}>
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
		color: var(--white);
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
		font-size: 1.2rem;
		font-weight: 700;
		margin: 0.0rem 0.0rem -0.6rem;
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
		color: var(--white);
		background-color: var(--split-darker);
		border-color: var(--split-darker);
		caret-color: var(--white);
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

	/* Heading Two Container */
	.heading-two-container {
		position: relative;
	}

	/* Heading Two Input - styled to match heading-two display */
	.heading-two-input {
		position: relative;
		font-size: 1.4rem;
		font-weight: 700;
		padding: 0rem;
		margin: 0.0rem;
	}

	.heading-two-input :global(input) {
		font-size: 1.4rem;
		font-weight: 700;
		padding: 0.9rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-top: 0rem;
		border-radius: 0rem;
		background-color: var(--split-lighter);
		color: var(--split-darker);
		border-color: var(--split-dark);
		caret-color: var(--split-darker);
		width: 100%;
		height: auto;
		box-sizing: border-box;
		display: block;
	}

	.heading-two-input :global(input:focus) {
		outline: none;
		box-shadow: none;
	}

	.heading-two-input :global(input::placeholder) {
		color: var(--split-darker);
		opacity: 0.3;
	}

	/* Heading Three Container */
	.heading-three-container {
		position: relative;
	}

	/* Heading Three Input - styled to match heading-three display */
	.heading-three-input {
		position: relative;
		font-size: 1.4rem;
		font-weight: 700;
		padding: 0rem;
		margin: 0.0rem;
	}

	.heading-three-input :global(input) {
		font-size: 1.2rem;
		font-weight: 700;
		padding: 0.9rem 0.9rem 0.0rem;
		margin: 0.0rem 0.0rem -0.6rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-top: 0rem;
		border-bottom: 0rem;
		border-radius: 0rem;
		background-color: transparent;
		color: var(--gray-100);
		border-color: var(--split-dark);
		caret-color: var(--gray-100);
		width: 100%;
		height: auto;
		box-sizing: border-box;
		display: block;
	}

	.heading-three-input :global(input:focus) {
		outline: none;
		box-shadow: none;
	}

	.heading-three-input :global(input::placeholder) {
		color: var(--gray-100);
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

	.segment:first-child .heading-two.no-headings,
	.segment:first-child .heading-two-input.no-headings :global(input),
	.segment:first-child .heading-three.no-headings,
	.segment:first-child .heading-three-input.no-headings :global(input),
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
