 <script>
	import { onMount } from 'svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';
	import HeadingEditor from './HeadingEditor.svelte';
	import NoteEditor from './NoteEditor.svelte';

	let { 
		heading1 = null,
		heading2 = null,
		heading3 = null,
		heading1Id = null,
		heading2Id = null,
		heading3Id = null,
		heading1Ref = null,
		heading2Ref = null,
		heading3Ref = null,

		segmentRef = null,
		note = null,
		/** The segment's own color (one of SEGMENT_COLORS); drives the --section-* variables below. */
		color = 'blue',
		text = '',
		passageIndex = 0,
		wrapWordsInHtml = null,
		isActive = false,
		segmentId = '',
		generation = 0,
		isCompareHidden = false,
		prevSegmentHasHeading = false,
		nextSegmentHasHeading = false,
		prevVisibleSegmentHasBorderBottom = false,
		prevSegmentHasRef = false,
		isFirstInSection = false,
		isFirstVisibleInSection = false,
		/** Last segment in its section. Used instead of :last-child, since the section
		 *  also renders a reposition handle / toolbar after its segments. */
		isLastInSection = false,
		isVerseSubdivided = false,
		/** Effective min-height in CSS px (persisted height or live drag override). null = flexible. */
		height = null,
		/** Whether the segment is resizable (disabled in overview/compare/focus modes). */
		resizeEnabled = false,
		/** Whether this segment is currently being resized (drives active handle styling). */
		isResizing = false,
		/** Called on mousedown on the resize handle: (event, segmentId) => void */
		onResizeStart = null,
		/** Shared id of this segment's height-link group, or null when not linked. */
		heightGroupId = null,
		/** Whether this segment is a member of the currently HOVERED link group (reveal handle + "Linked" tooltip on all members). */
		linkHovered = false,
		/** Called on pointer enter of the resize handle: (segmentId) => void */
		onHandleEnter = null,
		/** Called on pointer leave of the resize handle: () => void */
		onHandleLeave = null,
		/** How far (CSS px) the segment is pulled right within its column (Analyze only). 0 = flush. */
		leftOffset = 0,
		/** This segment's offset minus the offset of the segment above it in the same section
		 *  (0 = aligned, or first in section). Drives the partial top border below. */
		topShift = 0,
		/** Fixed width (CSS px) to hold while the column is widened for pulled-right segments; null = fill the column. */
		positionWidth = null,
		/** Whether the segment can be pulled right (shows the left-edge drag handle). */
		canReposition = false,
		/** Show the position handle in a DISABLED state (e.g. the only segment in its column):
		 *  visible like a normal handle, but faded, not-allowed cursor, and it never starts a drag. */
		repositionDisabled = false,
		/** Tooltip explaining why the disabled position handle can't be used. */
		repositionDisabledReason = '',
		/** Whether this segment's position is currently being dragged. */
		isRepositioning = false,
		/** Called on mousedown on the position handle: (event, segmentId) => void */
		onRepositionStart = null
	} = $props();

	/** Whether this segment is linked to others (has a height group). */
	let isLinked = $derived(!!heightGroupId);



	// Track input mode for each heading type and note
	let headingOneInputMode = $state(false);
	let headingTwoInputMode = $state(false);
	let headingThreeInputMode = $state(false);
	let noteInputMode = $state(false);

	// Ensure only one heading is in input mode at a time
	$effect(() => {
		if (headingOneInputMode) {
			headingTwoInputMode = false;
			headingThreeInputMode = false;
		}
	});

	$effect(() => {
		if (headingTwoInputMode) {
			headingOneInputMode = false;
			headingThreeInputMode = false;
		}
	});

	$effect(() => {
		if (headingThreeInputMode) {
			headingOneInputMode = false;
			headingTwoInputMode = false;
		}
	});

	// Computed: Check if any heading or note input is active
	let anyHeadingInputActive = $derived(
		headingOneInputMode || headingTwoInputMode || headingThreeInputMode
	);
	
	let anyInputActive = $derived(
		anyHeadingInputActive || noteInputMode
	);

	// Computed: Whether headings should currently be visible (always true in overview mode)
	let effectiveHeadingsVisible = $derived($toolbarState.headingsVisible || $toolbarState.overviewMode);

	// Computed: Check if any heading is visible (exists and visible) or is in input mode
	let hasAnyHeadings = $derived(
		headingOneInputMode || headingTwoInputMode || headingThreeInputMode ||
		(effectiveHeadingsVisible && !!(heading1 || heading2 || heading3))
	);

	// In overview mode, if the previous segment has no heading or note (i.e. it has a
	// no-headings-indicator which has a top border but no bottom border), the current heading
	// element needs its own border-top to provide visual separation.
	//
	// prevVisibleSegmentHasBorderBottom: scans back through segments to find if any preceding
	// segment has a heading or note (both have border-bottom). If true, no border-top needed.
	//
	// Only applies to non-first segments with heading-two or heading-three (heading-one
	// already has border-top as part of its full border declaration).
	let needsFirstHeadingBorderTop = $derived(
		$toolbarState.overviewMode &&
		!isFirstInSection &&
		!prevVisibleSegmentHasBorderBottom &&
		!heading1
	);

	// heading-two gets border-top when it's the topmost heading in the segment
	let needsHeadingTwoBorderTop = $derived(needsFirstHeadingBorderTop && !!heading2);

	// heading-three gets border-top only when it's the ONLY heading (no heading-two above it)
	let needsHeadingThreeBorderTop = $derived(needsFirstHeadingBorderTop && !heading2 && !!heading3);

	// When the heading needs border-top AND this is the first visible element in the section
	// (all prior segments were invisible), also apply rounded top corners to match the
	// first-child visual design.
	let needsHeadingTopBorderRadius = $derived(needsFirstHeadingBorderTop && isFirstVisibleInSection);

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

	/**
	 * Handle clicks on segment to exit heading edit mode
	 */
	function handleSegmentClick() {
		// If any heading is in input mode, cancel it
		if (anyHeadingInputActive) {
			headingOneInputMode = false;
			headingTwoInputMode = false;
			headingThreeInputMode = false;
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

<div class="segment {color}" 
     class:active={isActive} 
     class:has-heading-one={(heading1 && effectiveHeadingsVisible) || headingOneInputMode}
     class:has-heading-two={(heading2 && effectiveHeadingsVisible) || headingTwoInputMode}
     class:has-heading-three={(heading3 && effectiveHeadingsVisible) || headingThreeInputMode}
	     class:has-segment-ref={!$toolbarState.overviewMode && segmentRef && $toolbarState.referencesVisible && (!effectiveHeadingsVisible || (!heading2 && !heading3) || (isVerseSubdivided && !heading3))}
     class:has-note={(note || noteInputMode) && $toolbarState.passageNotesVisible}
     class:has-no-headings-indicator={$toolbarState.overviewMode && !hasAnyHeadings && !((note || noteInputMode) && $toolbarState.passageNotesVisible)}
     class:is-last-in-section={isLastInSection}
     class:compare-hidden={isCompareHidden}
     class:is-resizing={isResizing}
     class:is-repositioning={isRepositioning}
     class:show-layout-controls={resizeEnabled && $toolbarState.layoutControlsVisible}
     class:link-hovered={resizeEnabled && linkHovered}
     style:min-height={height != null ? `${height}px` : null}
     style:margin-left={leftOffset > 0 ? `${leftOffset}px` : null}
     data-left-offset={leftOffset > 0 ? Math.round(leftOffset) : null}
     style:width={positionWidth != null ? `${positionWidth}px` : null}
     data-segment-id="{segmentId}"
     data-height-group-id={heightGroupId || null}>


	
	<!-- Heading One -->
	<HeadingEditor
		headingType="one"
		headingValue={heading1}
		headingId={heading1Id}
		scriptureRef={heading1Ref}
		{segmentId}
		bind:isInputMode={headingOneInputMode}

		{isActive}
		hasHeadingOne={!!heading1}
		hasHeadingTwo={!!heading2}
		hasHeadingThree={!!heading3}
		hasNote={!!note}
	/>
	
	<!-- Heading Two -->
	<HeadingEditor
		headingType="two"
		headingValue={heading2}
		headingId={heading2Id}
		scriptureRef={heading2Ref}

		{segmentId}
		bind:isInputMode={headingTwoInputMode}
		{isActive}
		hasHeadingOne={!!heading1}
		hasHeadingTwo={!!heading2}
		hasHeadingThree={!!heading3}
		hasNote={!!note}
		needsBorderTop={needsHeadingTwoBorderTop}
		needsBorderTopRadius={needsHeadingTopBorderRadius}
	/>
	
	<!-- Heading Three -->
	<HeadingEditor
		headingType="three"
		headingValue={heading3}
		headingId={heading3Id}
		scriptureRef={heading3Ref}

		{segmentId}
		bind:isInputMode={headingThreeInputMode}
		{isActive}
		hasHeadingOne={!!heading1}
		hasHeadingTwo={!!heading2}
		hasHeadingThree={!!heading3}
		hasNote={!!note}
		needsBorderTop={needsHeadingThreeBorderTop}
		needsBorderTopRadius={needsHeadingTopBorderRadius}
	/>
	
	<!-- Segment Reference Placeholder (for segments without headings, non-overview mode only) -->
	<!-- Also shows for segments with heading2/heading3 when headings are hidden (refs would otherwise be invisible) -->
	<!-- Also shows when the starting verse is subdivided across segments (e.g., "Matthew 7:24a") even if a heading is present -->
	{#if !$toolbarState.overviewMode && segmentRef && $toolbarState.referencesVisible && (!effectiveHeadingsVisible || (!heading2 && !heading3) || (isVerseSubdivided && !heading3))}
		<div class="segment-ref-placeholder"
		     style:border-top={(prevSegmentHasHeading || (effectiveHeadingsVisible && !!(heading1 || heading2 || heading3))) ? 'none' : ''}
		     style:border-top-right-radius={(prevSegmentHasHeading || (effectiveHeadingsVisible && !!(heading1 || heading2 || heading3))) ? '0' : ''}
		     style:border-top-left-radius={(prevSegmentHasHeading || (effectiveHeadingsVisible && !!(heading1 || heading2 || heading3))) ? '0' : ''}>
			{segmentRef}
		</div>
	{/if}

	<!-- No Headings Indicator (overview mode only, for segments without headings) -->
	{#if $toolbarState.overviewMode && !hasAnyHeadings && !((note || noteInputMode) && $toolbarState.passageNotesVisible)}
		<div class="no-headings-indicator">
			{#if segmentRef && $toolbarState.referencesVisible}
				<span class="no-headings-ref">{segmentRef}</span>
			{/if}
			<em>No Headings</em>
		</div>
	{/if}
	
	<div class="text" class:no-headings={!hasAnyHeadings} onclick={handleSegmentClick}>
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
		hasHeadingOne={!!heading1}
		hasHeadingTwo={!!heading2}
		hasHeadingThree={!!heading3}
		hasNote={!!note}
	/>

	<!-- Resize handle: a narrow strip over the bottom border. Hovering shows the
	     ns-resize cursor and a centered indicator; mousedown begins a height drag. -->
	{#if resizeEnabled}
		<div
			class="resize-handle"
			role="separator"
			aria-label="Resize segment height"
			aria-orientation="horizontal"
			onmousedown={(e) => onResizeStart?.(e, segmentId)}
			onmouseenter={() => onHandleEnter?.(segmentId)}
			onmouseleave={() => onHandleLeave?.()}
		>
			<span class="resize-indicator"></span>
		</div>

	{/if}

	<!-- Partial top border for a repositioned segment. Segments have no top border of
	     their own: the segment above's bottom border doubles as the divider. When this
	     segment is shifted relative to the one above, part of its top edge is no longer
	     under that border — the overhang on the right (shifted right) or on the left
	     (shifted left). Draw a 1px line over exactly that overhang, overlapping the row
	     the above segment's border sits on, so the divider looks continuous. -->
	<!-- Skipped when a Heading One is shown: it draws its own full border, top included. -->
	{#if topShift !== 0 && !((heading1 && effectiveHeadingsVisible) || headingOneInputMode)}
		<span
			class="top-overhang"
			class:right={topShift > 0}
			style:width="calc({Math.abs(topShift)}px + 0.1rem)"
			aria-hidden="true"
		></span>
	{/if}

	<!-- Position handle: a three-dot grab handle centered on the LEFT border, matching
	     the Column / Section reposition handles. Mousedown begins a drag that pulls the
	     segment right (capped 36px short of the segment above's right edge). -->
	{#if resizeEnabled && (canReposition || repositionDisabled)}
		{@const handleDisabled = !canReposition}
		<div
			class="position-handle"
			class:disabled={handleDisabled}
			role="separator"
			aria-label="Move segment right"
			aria-orientation="vertical"
			aria-disabled={handleDisabled}
			title={handleDisabled ? repositionDisabledReason || null : null}
			onmousedown={(e) => {
				if (handleDisabled) {
					// Swallow the press so it doesn't start a word selection or select the
					// segment, but never begin a position drag.
					e.preventDefault();
					e.stopPropagation();
					return;
				}
				onRepositionStart?.(e, segmentId);
			}}
		>
			<span class="position-indicator">
				<span class="position-dot"></span>
				<span class="position-dot"></span>
				<span class="position-dot"></span>
			</span>
		</div>
	{/if}
</div>


<style>
	.segment {
		position: relative;
		background-color: var(--white);
		/* Column layout so the .text block can flex-grow to fill any extra height
		   created by a user-set min-height, keeping the bottom border at the bottom. */
		display: flex;
		flex-direction: column;
	}

	/* Per-segment color. Color lives on the segment (passage_segment.color), so each
	   segment re-defines the --section-* variables for itself; its borders, headings,
	   notes and the hover caret all inherit them. The parent .section only sets these
	   for its own chrome (glow, reposition dots, section toolbar). */
	.segment.red {
		--section-darker: var(--red-darker);
		--section-dark: var(--red-dark);
		--section-light: var(--red-light);
		--section-lighter: var(--red-lighter);
	}

	.segment.orange {
		--section-darker: var(--orange-darker);
		--section-dark: var(--orange-dark);
		--section-light: var(--orange-light);
		--section-lighter: var(--orange-lighter);
	}

	.segment.yellow {
		--section-darker: var(--yellow-darker);
		--section-dark: var(--yellow-dark);
		--section-light: var(--yellow-light);
		--section-lighter: var(--yellow-lighter);
	}

	.segment.green {
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
	}

	.segment.aqua {
		--section-darker: var(--aqua-darker);
		--section-dark: var(--aqua-dark);
		--section-light: var(--aqua-light);
		--section-lighter: var(--aqua-lighter);
	}

	.segment.blue {
		--section-darker: var(--blue-darker);
		--section-dark: var(--blue-dark);
		--section-light: var(--blue-light);
		--section-lighter: var(--blue-lighter);
	}

	.segment.purple {
		--section-darker: var(--purple-darker);
		--section-dark: var(--purple-dark);
		--section-light: var(--purple-light);
		--section-lighter: var(--purple-lighter);
	}

	.segment.pink {
		--section-darker: var(--pink-darker);
		--section-dark: var(--pink-dark);
		--section-light: var(--pink-light);
		--section-lighter: var(--pink-lighter);
	}

	/* Active glow lives on a pseudo-element, NOT on the segment. Giving the segment
	   `z-index` (its children use `z-index: inherit`) made Safari re-style and re-lay out
	   every word in it on each activation: ~850 ms per click on Matthew 1:1–14:36. The
	   pseudo's own z-index still lifts the glow above neighbouring segments. */
	.segment::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 10;
		pointer-events: none;
		border-radius: inherit;
		box-shadow: 0rem 0rem 0.5rem var(--section-dark);
		opacity: 0;
		transition: opacity 50ms ease-in-out;
	}

	.segment:global(.active)::after {
		opacity: 1;
	}

	.text {
		position: inherit;
		z-index: inherit;
		/* Fill remaining vertical space when the segment has a set min-height. */
		flex: 1 1 auto;
		font-size: 1.2rem;
		line-height: 1.7;
		/* Was `--gray-100`, which isn't defined (the scale starts at 200), so text inherited. */
		color: var(--gray-200);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.6rem;
		-webkit-user-select: text;
		user-select: text;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-color: var(--section-dark);
	}

	/* ============================================================ */
	/* Resize Handle */
	/* ============================================================ */

	/* Narrow hit-zone straddling the bottom border of the segment. Sits above
	   content (z-index) so it captures the drag, but is only ~8px tall so normal
	   word selection in the text body is unaffected. */
	.resize-handle {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -0.4rem;
		height: 0.8rem;
		z-index: 15;
		cursor: ns-resize;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.12s ease-out;
	}

	/* Reveal the indicator on hover or while actively dragging this segment. */
	.resize-handle:hover,
	.segment.is-resizing .resize-handle {
		opacity: 1;
	}

	/* When the "Layout Controls" view toggle is on, reveal the resize handle
	   persistently instead of only on hover. */
	.segment.show-layout-controls .resize-handle {
		opacity: 1;
	}

	/* When any member of this segment's LINK GROUP is hovered, reveal every
	   member's handle so the user sees all linked handles at once. */
	.segment.link-hovered .resize-handle {
		opacity: 1;
	}


	/* ============================================================ */
	/* Position Handle (left border — pull the segment right) */
	/* ============================================================ */

	/* Partial top border over the part of a shifted segment's top edge that the segment
	   above's bottom border doesn't cover. Sits one border-width above the segment
	   (top: -0.1rem) — the same row as that bottom border — and extends one extra
	   border-width to meet the above segment's side border at the corner. */
	.top-overhang {
		position: absolute;
		top: -0.1rem;
		left: 0;
		height: 0.1rem;
		background-color: var(--section-dark);
		z-index: 11;
		pointer-events: none;
	}

	.top-overhang.right {
		left: auto;
		right: 0;
	}

	/* A small grab target on the segment's LEFT border, 3.6rem from the top (matching
	   the column handles) so it stays reachable on very long segments; on segments too
	   short for that it centers instead (min() picks the higher position, so the switch
	   is seamless). Mirrors the Column reposition handle (vertical three-dot indicator,
	   grab cursor, hidden until hovered or Layout Controls is on) but uses the
	   segment's own colors like the Section reposition handle. */
	.position-handle {
		position: absolute;
		top: min(3.6rem, calc(50% - 1rem));
		left: -1.2rem;
		width: 1.4rem;
		height: 2.0rem;
		z-index: 16;
		cursor: grab;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 80ms ease-in-out;
	}

	.position-handle:hover,
	.segment.is-repositioning .position-handle,
	.segment.show-layout-controls .position-handle {
		opacity: 1;
	}

	.segment.is-repositioning .position-handle {
		cursor: grabbing;
	}

	/* Disabled handle (e.g. the column's only segment): appears on hover / Layout Controls
	   exactly like an enabled one, but the dots are faded and the cursor says no. */
	.position-handle.disabled {
		cursor: not-allowed;
	}

	.position-handle.disabled .position-indicator {
		opacity: 0.35;
	}

	/* Exactly three dots in a VERTICAL column, centered over the left border. */
	.position-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}

	/* Each dot uses the segment's light color with a darker 1px border. */
	.position-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background-color: var(--section-light);
		border: 0.1rem solid var(--section-darker);
	}

	/* Centered indicator: a short horizontal bar centered on the border. Uses the
	   section's light color for its fill with a darker 1px section-colored border to
	   match the Column/Section layout-control handles. */
	.resize-indicator {
		width: 2.4rem;
		height: 0.5rem;
		border-radius: 0.3rem;
		background-color: var(--section-light);
		border: 0.1rem solid var(--section-darker);
	}




	/* Remove top padding when segment has heading-three */
	.segment.has-heading-three .text {
		padding-top: 0;
	}

	.segment.is-last-in-section,
	.segment.is-last-in-section .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* First/last child styling rules for integration with parent section */
	:global(.section) .segment:first-child:global(.has-heading-one) :global(.heading-one),
	:global(.section) .segment:first-child:global(.has-heading-one) :global(input.heading-one-input) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Heading Two gets top border when it's the first heading */
	:global(.section) .segment:first-child:not(.has-heading-one):global(.has-heading-two) :global(.heading-two),
	:global(.section) .segment:first-child:not(.has-heading-one):global(.has-heading-two) :global(input.heading-two-input) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Heading Three gets top border when it's the first heading */
	:global(.section) .segment:first-child:not(.has-heading-one):not(.has-heading-two):global(.has-heading-three) :global(.heading-three),
	:global(.section) .segment:first-child:not(.has-heading-one):not(.has-heading-two):global(.has-heading-three) :global(input.heading-three-input) {
		border-top: 0.1rem solid;
		border-top-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Text gets top border when there are no headings */
	:global(.section) .segment:first-child .text.no-headings {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	:global(.section) .segment.is-last-in-section,
	:global(.section) .segment.is-last-in-section .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Add bottom border radius to notes in last segment of section */
	:global(.section) .segment.is-last-in-section:global(.has-note) :global(.note),
	:global(.section) .segment.is-last-in-section:global(.has-note) :global(.note-input textarea) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Remove bottom border and radius from text when segment has a note */
	.segment:global(.has-note) .text,
	.segment.is-last-in-section:global(.has-note) .text {
		border-bottom: 0.0rem;
		border-bottom-right-radius: 0.0rem;
		border-bottom-left-radius: 0.0rem;
	}

	/* Segment Reference Placeholder - matches Heading Three style in overview mode */
	.segment-ref-placeholder {
		position: inherit;
		z-index: inherit;
		font-size: 1.1rem;
		font-weight: 500;
		margin: 0.0rem;
		padding: 0.9rem 0.6rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--section-dark);
		color: var(--gray-300);
	}

	/* Segment reference placeholder gets top border when it's the first element */
	:global(.analyze-content):not(.overview-mode) :global(.section) .segment:first-child .segment-ref-placeholder {
		border-top: 0.1rem solid;
		border-top-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	:global(.analyze-content):not(.overview-mode) :global(.section) .segment:first-child.has-segment-ref .text,
	:global(.analyze-content):not(.overview-mode) :global(.section) .segment.has-segment-ref .text {
		padding-top: 0.4rem;
		border-top: none;
		border-top-right-radius: 0.0rem;
		border-top-left-radius: 0.0rem;
	}

	/* Segment reference placeholder in last segment gets bottom radius (when no note) */
	:global(.analyze-content):not(.overview-mode) :global(.section) .segment.has-segment-ref.is-last-in-section:not(.has-note) .segment-ref-placeholder {
		border-bottom-right-radius: 0.0rem;
		border-bottom-left-radius: 0.0rem;
	}


	/* No Headings Indicator - overview mode only, for segments without headings */
	.no-headings-indicator {
		position: inherit;
		z-index: inherit;
		font-size: 1.1rem;
		margin: 0;
		padding: 0.9rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--section-dark);
		color: var(--gray-400);
	}

	.no-headings-ref {
		font-size: 1.0rem;
		font-weight: 500;
		color: var(--gray-300);
		margin-right: 0.5rem;
	}

	/* No headings indicator gets top border to separate from previous segment */
	:global(.analyze-content.overview-mode) :global(.section) .segment .no-headings-indicator {
		border-top: 0.1rem solid;
		border-top-color: var(--section-dark);
	}

	/* First segment: rounded top corners */
	:global(.analyze-content.overview-mode) :global(.section) .segment:first-child .no-headings-indicator {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Last segment: rounded bottom corners + bottom border */
	:global(.analyze-content.overview-mode) :global(.section) .segment.has-no-headings-indicator.is-last-in-section:not(.has-note) .no-headings-indicator {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
		border-bottom: 0.1rem solid;
		border-bottom-color: var(--section-dark);
	}
</style>
