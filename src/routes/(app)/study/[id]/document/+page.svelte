<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount } from 'svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { setStudyContentLoading, studyContentLoading } from '$lib/stores/loading.js';
	import { buildVerseSectionMap, extractSegmentText } from '$lib/utils/passageText.js';


	let { data: rawData } = $props();

	// The heavy passage text/structure is streamed from the server (see
	// +layout.server.js). Resolve it into local state and expose a derived `data`
	// that merges it back in, so all existing `data.passagesWithText` references
	// keep working unchanged — they simply read `undefined` until the stream lands.
	let streamedContent = $state(/** @type {{ passagesWithText: any[], connections: any[] } | null} */ (null));

	$effect(() => {
		// Re-runs whenever a navigation hands us a new streamed promise. Clear the
		// previous study's resolved content immediately and flag the global loader so
		// the single navigation Spinner stays up continuously until the new stream
		// lands (rather than handing off to a separate in-page spinner).
		const promise = rawData.streamed?.content;
		streamedContent = null;
		setStudyContentLoading(true);

		let cancelled = false;
		promise?.then((c) => {
			if (!cancelled) {
				streamedContent = c;
				setStudyContentLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	});

	// Clear the global loading flag if this page is torn down mid-stream (e.g. the
	// user navigates away before the content resolves), so the overlay never sticks.
	onMount(() => () => setStudyContentLoading(false));

	let data = $derived({
		...rawData,
		passagesWithText: streamedContent?.passagesWithText,
		connections: streamedContent?.connections
	});


	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

	// Get translation abbreviation
	let translationAbbr = $derived.by(() => {
		const metadata = getTranslationMetadata(data.study.translation || 'esv');
		return metadata?.abbreviation || data.study.translation?.toUpperCase() || 'ESV';
	});

	/**
	 * Flatten a passage's structure (columns → sections → segments) into a single
	 * ordered list of segments. The loader already returns segments in
	 * startingWordId order, so a straight depth-first walk yields reading order.
	 * @param {Object} passageText - A passagesWithText entry
	 * @returns {Array<{ id: string, startingWordId: string, headingOne: string|null, headingTwo: string|null, headingThree: string|null }>}
	 */
	function flattenSegments(passageText) {
		const cols = passageText?.structure?.columns;
		if (!cols?.length) return [];
		const out = [];
		for (const column of cols) {
			for (const section of column.sections ?? []) {
				for (const segment of section.segments ?? []) {
					out.push(segment);
				}
			}
		}
		return out;
	}

	/**
	 * Build the read-only document rendering for one passage: an ordered list of
	 * blocks, each carrying any authored headings (h3/h4/h5 for Heading One/Two/Three)
	 * plus that segment's sliced HTML text. Headings are interleaved exactly where the
	 * author placed them, mirroring the Analyze view but without the column/section
	 * grid, color bands, scripture-refs, or editing affordances.
	 *
	 * Returns null when the passage has no usable structure, signalling the template to
	 * fall back to rendering the whole passage HTML so text is never lost.
	 * @param {Object} passageText
	 * @returns {Array<{ id: string, headingOne: string|null, headingTwo: string|null, headingThree: string|null, html: string }> | null}
	 */
	function buildDocumentBlocks(passageText) {
		const segments = flattenSegments(passageText);
		if (segments.length === 0 || !passageText.text) return null;

		// Verse-suffix bookkeeping must span the whole passage so a verse split across
		// multiple segments numbers consistently (16a, 16b, …) — same as Analyze.
		const verseSectionMap = buildVerseSectionMap(segments);
		/** @type {Object<string, number>} */
		const verseOccurrences = {};

		return segments.map((segment, i) => {
			// A segment's text runs up to the NEXT segment's first word (exclusive), or
			// to the end of the passage for the final segment.
			const endWordId = segments[i + 1]?.startingWordId ?? null;
			const html = extractSegmentText(
				passageText.text,
				segment.startingWordId,
				endWordId,
				0,
				verseSectionMap,
				verseOccurrences
			);
			return {
				id: segment.id,
				headingOne: segment.headingOne,
				headingTwo: segment.headingTwo,
				headingThree: segment.headingThree,
				html
			};
		});
	}

	/**
	 * Format a passage reference for display
	 * @param {Object} passage
	 * @returns {string}
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}
</script>

<div class="document-gutter">
	<div class="page">
	<div class="study-header">
		<Heading heading="h1" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
		{#if data.study.subtitle}
            <Heading heading="h3" isMuted>{data.study.subtitle}</Heading>
		{/if}
		{#if data.passages && data.passages.length > 0}
			<p class="study-references">
				{#each data.passages as passage, i}
					{formatPassageReference(passage)}{#if i < data.passages.length - 1},&nbsp;{/if}
				{/each}
				<span class="translation-badge" aria-label="Translation: {translationAbbr}">[{translationAbbr}]</span>
			</p>
		{/if}
	</div>
	
	<!-- Document View Content -->
	<!-- While the streamed content resolves, an in-page Spinner covers the wait.
	     This branch is SERVER-RENDERED, so on a fresh load / refresh the spinner is
	     present in the very first paint — before client JS hydrates and before
	     `$navigating`/`studyContentLoading` (which the global NavigationIndicator
	     depends on) exist. That closes the Safari first-load "blank, no spinner"
	     gap. During in-app navigations the global overlay already shows, so we hide
	     this one when `$navigating` is active to avoid two spinners at once. -->
	<div class="document-content">

		{#if streamedContent && data.passagesWithText && data.passagesWithText.length > 0}
			{#each data.passagesWithText as passageText}
				{#if passageText.error}
					<div class="error-message">
						<p>Error loading {passageText.reference}: {passageText.error}</p>
					</div>
				{:else if passageText.text}
					{@const blocks = buildDocumentBlocks(passageText)}
					<div class="passage-section">
						<h2 class="passage-reference">{passageText.reference}</h2>
						{#if blocks}
							<!-- Interleave the author's headings with each segment's sliced text so
							     the reading document reflects the structure built in Analyze. Heading
							     One/Two/Three render as h3/h4/h5 (semantic levels below the passage
							     h2); scripture-refs are intentionally omitted for a clean read. -->
							{#each blocks as block (block.id)}
								{#if block.headingOne}
									<h3 class="doc-heading doc-heading-one">{block.headingOne}</h3>
								{/if}
								{#if block.headingTwo}
									<h4 class="doc-heading doc-heading-two">{block.headingTwo}</h4>
								{/if}
								{#if block.headingThree}
									<h5 class="doc-heading doc-heading-three">{block.headingThree}</h5>
								{/if}
								<div class="passage-text">{@html block.html}</div>
							{/each}
						{:else}
							<!-- Fallback: a passage with no usable structure renders whole, so text
							     is never lost (legacy/edge studies). -->
							<div class="passage-text">{@html passageText.text}</div>
						{/if}
					</div>
				{/if}
			{/each}
			
			<!-- Copyright Notice — required Scripture attribution. Sits at the bottom of the
			     document via margin-top:auto: pinned to the bottom of the viewport for short
			     studies, and flowing below the content for tall ones. -->
			<div class="copyright-notice">
				{#if data.study.translation === 'esv'}
					<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. <a href="https://www.esv.org" target="_blank" rel="noopener noreferrer">www.esv.org</a></p>
				{:else if data.study.translation === 'net'}
					<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved. <a href="https://netbible.org" target="_blank" rel="noopener noreferrer">netbible.org</a></p>
				{/if}
			</div>

		{:else if !streamedContent}
			<!-- Still streaming: show an in-page spinner. Server-rendered so it appears
			     in the first paint on a fresh load (covering the pre-hydration gap that
			     the client-only global overlay can't). Suppressed while `$navigating`
			     OR the global content loader is active, so in-app navigations show only
			     the single global overlay rather than two spinners. -->
			{#if !$navigating && !$studyContentLoading}
				<div class="content-loading">
					<Spinner size="lg" label="Loading study…" />
				</div>
			{/if}
		{:else}
			<p class="placeholder-text">No passages available for this study.</p>
		{/if}

	</div>
	</div>
</div>

<style>
	/* ============================================
	   PAGE LAYOUT — 8.5" × 11" "Google Docs" pages
	   --------------------------------------------
	   The base stylesheet sets font-size: 62.5%, so 1rem = 10px. At the standard
	   print/screen resolution of 96 DPI, 1 inch = 96px = 9.6rem. US Letter is
	   therefore 81.6rem × 105.6rem, and a 1" margin is 9.6rem.

	   Phase 1 (this commit) establishes the visual page shell: a gray "gutter"
	   behind one white Letter-sized page with 1" padding (the margins). True
	   multi-page flow (splitting content across successive .page elements) is a
	   follow-up — for now all content lives in a single page that simply grows
	   taller than 11" when the study is long.
	   ============================================ */

	/* Page geometry — single source of truth for the dimensions/margins so the
	   future paginator and the @media print rules can reference the same values. */
	:root {
		--page-width: 81.6rem;   /* 8.5in × 9.6rem/in */
		--page-height: 105.6rem; /* 11in  × 9.6rem/in */
		--page-margin: 9.6rem;   /* 1in on all sides  */
		--page-gap: 2.4rem;      /* vertical space between stacked pages */
	}

	/* The gutter is the gray surface the pages float on (Google Docs style). It
	   fills the scroll container and centers the page column horizontally. */
	.document-gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--page-gap);
		flex: 1 0 auto;
		padding: var(--page-gap) var(--page-gap) 6rem;
		background-color: var(--gray-900);
	}

	/* A single physical page: fixed Letter width, at least Letter height (grows for
	   long studies until the paginator splits it), white surface, 1" padding for
	   the margins, and a subtle shadow to lift it off the gutter. */
	.page {
		box-sizing: border-box;
		width: var(--page-width);
		min-height: var(--page-height);
		padding: var(--page-margin);
		background-color: var(--white);
		box-shadow: 0 0.1rem 0.6rem var(--black-alpha);
		/* Flex column so the copyright notice (margin-top:auto) is pushed to the
		   bottom margin of the page on short studies. */
		display: flex;
		flex-direction: column;
	}


	.study-header {
		width: 100%;
		text-align: center;
	}


	.study-subtitle {
		font-size: 1.6rem;
		color: var(--gray-300);
		margin-top: 0.6rem;
		line-height: 1.5;
	}

	.study-references {
		font-size: 1.4rem;
		color: var(--gray-400);
		margin-top: 0.0rem;
		margin-bottom: 2.7rem;
	}

	.translation-badge {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 1.4rem;
		color: var(--gray-400);
	}

	.document-content {
		width: 100%;
		margin-top: 2.7rem;
		/* Flex column so the copyright notice (margin-top:auto) is pushed to the bottom
		   margin of the page on short studies while still flowing below the content for
		   tall ones. flex-grow fills the remaining page height. */
		display: flex;
		flex-direction: column;
		flex: 1 0 auto;
	}



	.placeholder-text {
		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	/* Centered in-page loading state shown while streamed content resolves. */
	.content-loading {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 7.2rem 0;
	}

	.passage-section {

		margin-bottom: 3.6rem;
	}

	.passage-reference {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--gray-300);
		margin-bottom: 1.8rem;
		text-align: left;
	}

	.passage-text {
		font-size: 1.6rem;
		line-height: 1.8;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
	}

	/* ============================================
	   DOCUMENT HEADINGS — the author's Heading One/Two/Three (rendered h3/h4/h5)
	   interleaved with the passage text. This is a clean reading layout, so the
	   headings are simple left-aligned type with a clear size/weight hierarchy —
	   NOT the Analyze "banner" look (centered color bands tied to the column grid).
	   The top margin opens space above each heading to separate it from the
	   preceding text; the first heading in a passage loses that gap so it sits
	   directly under the passage reference.
	   ============================================ */
	.doc-heading {
		text-align: left;
		color: var(--gray-100);
		margin: 2.7rem 0 0.9rem;
	}

	.doc-heading:first-child {
		margin-top: 0;
	}

	/* Heading One — the most prominent section heading. */
	.doc-heading-one {
		font-size: 2.0rem;
		font-weight: 700;
		line-height: 1.3;
	}

	/* Heading Two — secondary heading, slightly smaller. */
	.doc-heading-two {
		font-size: 1.7rem;
		font-weight: 700;
		line-height: 1.3;
	}

	/* Heading Three — the finest level: smaller and set apart with weight only. */
	.doc-heading-three {
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--gray-300);
	}

	/* A heading directly followed by its segment text should hug that text. */
	.doc-heading + .passage-text {
		margin-top: 0;
	}

	.error-message {
		padding: 1.8rem;
		background-color: var(--red-900);
		border: 1px solid var(--red-700);
		border-radius: 0.4rem;
		margin-bottom: 1.8rem;
	}

	.error-message p {
		font-size: 1.4rem;
		color: var(--red-300);
		margin: 0;
	}

	/* margin-top:auto consumes the .document-content flex column's spare vertical space,
	   pushing this notice to the very bottom of the viewport on short studies. On tall
	   studies there is no spare space, so it simply follows the content (and scrolls).
	   The top padding/border keep a visible separator above the notice in both cases. */
	.copyright-notice {
		margin-top: auto;
		padding-top: 2.7rem;
		border-top: 1px solid var(--gray-700);
	}


	.copyright-notice p {
		font-size: 1.2rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}


	.copyright-notice a {
		color: var(--gray-500);
		text-decoration: underline;
	}

	/* ============================================
	   PRINT — let the browser's paginator produce the real output.
	   --------------------------------------------
	   On paper there is no gutter or drop shadow: the page IS the sheet. We declare
	   the physical Letter sheet with 1" margins via @page, then strip the on-screen
	   page chrome so content flows directly onto the printed sheets. The browser
	   handles page breaks natively, which is the source of truth for PDF export.
	   ============================================ */
	@media print {
		.document-gutter {
			display: block;
			padding: 0;
			gap: 0;
			background: none;
		}

		.page {
			width: auto;
			min-height: 0;
			padding: 0;        /* margins now come from @page below */
			box-shadow: none;
			background: none;
		}
	}
</style>

<svelte:head>
	<!-- Physical sheet definition for printing/PDF export: US Letter with 1"
	     margins, matching the on-screen 81.6rem × 105.6rem / 9.6rem geometry. -->
	<style>
		@page {
			size: 8.5in 11in;
			margin: 1in;
		}
	</style>
</svelte:head>
