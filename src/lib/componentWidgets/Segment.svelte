<script>
	import { onMount } from 'svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';
	import ToolbarPassage from './ToolbarPassage.svelte';
	import HeadingEditor from './HeadingEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';

	let { 
		heading1 = null,
		heading2 = null,
		heading3 = null,
		note = null,
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

	// Track input mode for each heading type and note
	let headingOneInputMode = $state(false);
	let headingTwoInputMode = $state(false);
	let headingThreeInputMode = $state(false);
	let noteInputMode = $state(false);

	// Computed: Check if any heading or note input is active
	let anyHeadingInputActive = $derived(
		headingOneInputMode || headingTwoInputMode || headingThreeInputMode
	);
	
	let anyInputActive = $derived(
		anyHeadingInputActive || noteInputMode
	);

	// Computed: Check if any heading exists or is in input mode
	let hasAnyHeadings = $derived(
		heading1 || heading2 || heading3 || 
		headingOneInputMode || headingTwoInputMode || headingThreeInputMode
	);

	/**
	 * Handle insert-heading-one custom event
	 */
	function handleInsertHeadingOne(event) {
		if (event.detail?.segmentId === segmentId) {
			headingOneInputMode = true;
		}
	}

	/**
	 * Handle insert-heading-two custom event
	 */
	function handleInsertHeadingTwo(event) {
		if (event.detail?.segmentId === segmentId) {
			headingTwoInputMode = true;
		}
	}

	/**
	 * Handle insert-heading-three custom event
	 */
	function handleInsertHeadingThree(event) {
		if (event.detail?.segmentId === segmentId) {
			headingThreeInputMode = true;
		}
	}

	/**
	 * Handle insert-note custom event
	 */
	function handleInsertNote(event) {
		if (event.detail?.segmentId === segmentId) {
			noteInputMode = true;
		}
	}

	// Listen for custom events
	onMount(() => {
		window.addEventListener('insert-heading-one', handleInsertHeadingOne);
		window.addEventListener('insert-heading-two', handleInsertHeadingTwo);
		window.addEventListener('insert-heading-three', handleInsertHeadingThree);
		window.addEventListener('insert-note', handleInsertNote);
		
		return () => {
			window.removeEventListener('insert-heading-one', handleInsertHeadingOne);
			window.removeEventListener('insert-heading-two', handleInsertHeadingTwo);
			window.removeEventListener('insert-heading-three', handleInsertHeadingThree);
			window.removeEventListener('insert-note', handleInsertNote);
		};
	});
</script>

<div class="segment" 
     class:active={isActive} 
     class:has-heading-one={heading1 || headingOneInputMode}
     class:has-heading-two={heading2 || headingTwoInputMode}
     class:has-heading-three={heading3 || headingThreeInputMode}
     class:has-note={(note || noteInputMode) && $toolbarState.notesVisible} 
     data-segment-id="{segmentId}">
	<!-- Hide ToolbarPassage when any input is active -->
	{#if !anyInputActive}
		<ToolbarPassage 
			bind:toolbarMode 
			{isActive} 
			{onInsertColumn}
			{onInsertSplit}
			{onInsertSegment}
			{segmentId}
		/>
	{/if}
	
	<!-- Heading One -->
	<HeadingEditor
		headingType="one"
		headingValue={heading1}
		{segmentId}
		bind:isInputMode={headingOneInputMode}
		{isActive}
	/>
	
	<!-- Heading Two -->
	<HeadingEditor
		headingType="two"
		headingValue={heading2}
		{segmentId}
		bind:isInputMode={headingTwoInputMode}
		{isActive}
	/>
	
	<!-- Heading Three -->
	<HeadingEditor
		headingType="three"
		headingValue={heading3}
		{segmentId}
		bind:isInputMode={headingThreeInputMode}
		{isActive}
	/>
	
	<div class="text" class:no-headings={!hasAnyHeadings}>
		{#if wrapWordsInHtml}
			{@html wrapWordsInHtml(text, passageIndex)}
		{:else}
			{@html text}
		{/if}
	</div>
	
	<!-- Note Editor -->
	<NoteEditor
		noteValue={note}
		{segmentId}
		bind:isInputMode={noteInputMode}
		{isActive}
	/>
</div>

<style>
	.segment {
		position: relative;
	}

	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--split-dark);
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

	/* Remove top padding when segment has heading-three */
	.segment.has-heading-three .text {
		padding-top: 0;
	}

	.segment:last-child,
	.segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Remove bottom border and radius from text when segment has a note */
	.segment.has-note .text {
		border-bottom: 0;
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0;
	}

	/* First/last child styling rules for integration with parent split */
	:global(.split) .segment:first-child:global(.has-heading-one) :global(.heading-one),
	:global(.split) .segment:first-child:global(.has-heading-one) :global(.heading-one-input input) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Heading Two gets top border when it's the first heading */
	:global(.split) .segment:first-child:not(.has-heading-one):global(.has-heading-two) :global(.heading-two),
	:global(.split) .segment:first-child:not(.has-heading-one):global(.has-heading-two) :global(.heading-two-input input) {
		border-top: 0.1rem solid;
		border-color: var(--split-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Heading Three gets top border when it's the first heading */
	:global(.split) .segment:first-child:not(.has-heading-one):not(.has-heading-two):global(.has-heading-three) :global(.heading-three),
	:global(.split) .segment:first-child:not(.has-heading-one):not(.has-heading-two):global(.has-heading-three) :global(.heading-three-input input) {
		border-top: 0.1rem solid;
		border-color: var(--split-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Text gets top border when there are no headings */
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

	/* Add bottom border radius to notes in last segment of split */
	:global(.split) .segment:last-child:global(.has-note) :global(.note),
	:global(.split) .segment:last-child:global(.has-note) :global(.note-input textarea) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	:global(.split) .segment:last-child:global(.has-note) :global(.text),
	:global(.split) .segment:last-child:global(.has-note) :global(.text) {
		border-bottom-right-radius: 0.0rem;
		border-bottom-left-radius: 0.0rem;
	}
</style>
