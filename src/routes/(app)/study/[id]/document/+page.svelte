<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount } from 'svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { setStudyContentLoading, studyContentLoading } from '$lib/stores/loading.js';


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

<div class="container">
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
					<div class="passage-section">
						<h2 class="passage-reference">{passageText.reference}</h2>
						<div class="passage-text">{@html passageText.text}</div>
					</div>
				{/if}
			{/each}
			
			<!-- Copyright Notice -->
			<div class="copyright-notice">
				{#if data.study.translation === 'esv'}
					<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.</p>
				{:else if data.study.translation === 'net'}
					<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved.</p>
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

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: 3.6rem;
	}

	.study-header {
		max-width: 60rem;
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
		max-width: 60rem;
		width: 100%;
		margin-top: 2.7rem;
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

	.copyright-notice {
		margin-top: 4.5rem;
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
</style>
