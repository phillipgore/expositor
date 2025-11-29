<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { data } = $props();

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

	// Ref to inner content wrapper for measuring dimensions
	let contentInnerRef = $state(null);
	
	// Track previous zoom level to detect actual changes
	let previousZoomLevel = $state($toolbarState.zoomLevel);
	
	// Track natural (unscaled) dimensions of content
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	/**
	 * Measure the natural dimensions of content without transform
	 */
	function measureNaturalDimensions() {
		if (!contentInnerRef) return;

		// Temporarily remove transform to get true dimensions
		const currentTransform = contentInnerRef.style.transform;
		contentInnerRef.style.transform = 'none';
		
		naturalWidth = contentInnerRef.scrollWidth;
		naturalHeight = contentInnerRef.scrollHeight;
		
		// Restore transform
		contentInnerRef.style.transform = currentTransform;
	}

	/**
	 * Reset scroll position when zoom level actually changes
	 */
	$effect(() => {
		const currentZoomLevel = $toolbarState.zoomLevel;
		
		// Only reset if zoom level actually changed
		if (currentZoomLevel !== previousZoomLevel) {
			if (contentInnerRef?.parentElement) {
				contentInnerRef.parentElement.scrollTo(0, 0);
			}
			
			previousZoomLevel = currentZoomLevel;
		}
	});

	/**
	 * Measure natural dimensions immediately when content first loads
	 */
	$effect(() => {
		if (contentInnerRef && data.passagesWithText?.length > 0) {
			// Use requestAnimationFrame to measure after initial render
			// This is faster and more reliable than setTimeout
			requestAnimationFrame(() => {
				measureNaturalDimensions();
				
				// If dimensions are still 0, content might not be fully rendered yet
				// Try one more time with a small delay
				if (naturalWidth === 0 || naturalHeight === 0) {
					requestAnimationFrame(() => {
						measureNaturalDimensions();
					});
				}
			});
		}
	});

	/**
	 * Determine if header should be visible based on zoom level
	 * @returns {boolean} True if zoom >= 100%
	 */
	let showHeader = $derived.by(() => {
		return $toolbarState.zoomLevel >= 100;
	});

	/**
	 * Get current scale factor
	 * @returns {number} Current scale
	 */
	let currentScale = $derived.by(() => {
		// Convert percentage to decimal (e.g., 150% = 1.5)
		return $toolbarState.zoomLevel / 100;
	});

	/**
	 * Calculate zoom transform based on zoom level
	 * @returns {string} CSS transform value
	 */
	let zoomTransform = $derived.by(() => {
		return `scale(${currentScale})`;
	});

	/**
	 * Calculate wrapper dimensions for scroll area
	 * @returns {string} CSS dimensions for wrapper
	 */
	let wrapperDimensions = $derived.by(() => {
		if (!contentInnerRef) return '';
		
		// Get actual content dimensions
		const currentTransform = contentInnerRef.style.transform;
		contentInnerRef.style.transform = 'none';
		const width = contentInnerRef.scrollWidth;
		const height = contentInnerRef.scrollHeight;
		contentInnerRef.style.transform = currentTransform;
		
		if (width === 0 || height === 0) return '';
		
		// Apply scale to dimensions
		const scaledWidth = width * currentScale;
		const scaledHeight = height * currentScale;
		
		return `width: ${scaledWidth}px; height: ${scaledHeight}px;`;
	});
</script>

<div class="container">
	{#if showHeader}
		<div class="study-header">
			<div>
				<Heading heading="h1" classes="h4" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
				{#if data.study.subtitle}
					<Heading heading="h2" classes="h5" isMuted>{data.study.subtitle}</Heading>
				{/if}
			</div>
		</div>
	{/if}
	
	<!-- Analyze View Content -->
	<div class="analyze-content" class:hide-verses={!$toolbarState.versesVisible} class:wide-layout={$toolbarState.wideLayout} class:overview-mode={$toolbarState.overviewMode}>
		<div class="analyze-content-wrapper" style="{wrapperDimensions}">
			<div bind:this={contentInnerRef} class="analyze-content-inner" style="transform: {zoomTransform}; transform-origin: top left;">
				<div class="spacer">&nbsp;</div>
			{#if data.passagesWithText && data.passagesWithText.length > 0}
				{#each data.passagesWithText as passageText}
					<div class="passage">
						<div class="passage-container">
							{#if passageText.error}
								<div class="error-message">
									<Alert color="red" look="subtle" message={`Error loading ${passageText.reference}`} />
								</div>
							{:else if passageText.text}
								<Heading heading="h3" classes="h5 passage-refernce">
									{passageText.reference} [{translationAbbr}]
								</Heading>
								<div class="passage-column">
									<div class="passage-pinned blue">
										<div class="passage-pinned-header">
											<Heading heading="h4" classes="h3">Pinned Title</Heading>
										</div>
										<div class="passage-section">
											<div class="passage-section-header">
												<Heading heading="h4">Section Title</Heading>
											</div>
											<div class="passage-division">
												<div class="passage-division-header">
													<Heading heading="h4">Division Title</Heading>
												</div>
												<div class="passage-text">{@html passageText.text}</div>
											</div>
										</div>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{:else}
				<p class="placeholder-text">No passages available for this study.</p>
			{/if}
				<div class="spacer">&nbsp;</div>
			</div>
		</div>
	</div>
			
	<!-- Copyright Notice -->
	<div class="copyright-notice">
		{#if data.study.translation === 'esv'}
			<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.</p>
		{:else if data.study.translation === 'net'}
			<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved.</p>
		{/if}
	</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		position: relative;
		height: 100%;
	}

	.study-header {
		position: absolute;
		top: 0.9rem;
		left: 2.3rem;
		background: var(--white-alpha);
		padding: 0.3rem 0.9rem 0.9rem;
		border-radius: 0.3rem;
		z-index: 100;
	}

	.study-header :global(h2) {
		margin: 0.0rem;
	}

	.placeholder-text {
		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	.analyze-content {
		flex-grow: 1;
		overflow-x: auto;
		overflow-y: auto;
		touch-action: pan-x pan-y pinch-zoom;
	}

	.analyze-content-wrapper {
		/* Wrapper defines the scrollable area size based on scaled dimensions */
		position: relative;
	}

	.analyze-content-inner {
		display: flex;
		gap: 3.2rem;
		padding: 6.6rem 0.0rem 1.8rem;
		transition: transform 0.2s ease-out;
		width: fit-content;
	}

	.spacer {
		width: 0.1rem;
	}

	.passage{
		display: flex;
		flex-direction: column;
		gap: 3.2rem;
		flex-shrink: 0;
	}

	.passage-column {
		width: 28.8rem;
		margin-bottom: 1.8rem;
	}

	.wide-layout .passage-column {
		width: 50.4rem;
	}

	.overview-mode .passage-text {
		display: none;
	}

	.overview-mode .passage-division-header {
		padding: 0.9rem;
	}

	.passage-container :global(.passage-refernce) {
		margin-bottom: 0.9rem;
	}

	.passage-pinned-header {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
		text-align: center;
	}

	.passage-division {
		border: 0.1rem solid;
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.passage-pinned-header,
	.passage-section-header {
		border-top: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
	}

	.passage-pinned-header,
	.passage-section-header {
		padding: 0.9rem;
	}

	.passage-division-header {
		padding: 0.9rem;
	}

	.passage-pinned-header :global(.h3),
	.passage-section-header :global(h4),
	.passage-division-header :global(h4)  {
		margin-bottom: 0.0rem;
		font-style: italic;
	}

	.passage-text {
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.0rem 0.9rem 0.9rem;
	}

	:global(.chapter-verse) {
		font-weight: bold;
		color: var(--blue-500);
	}

	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-verses .passage-text {
		white-space: normal;
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
		position: absolute;
		text-align: center;
		width: 33.3rem;
		bottom: 0.9rem;
		right: 0.9rem;
		background: var(--white-alpha);
		padding: 0.9rem;
		border-radius: 0.3rem;
		z-index: 100;
	}

	.copyright-notice p {
		font-size: 1.0rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}

	.passage-pinned.blue .passage-pinned-header {
		background-color: var(--blue-darker);
		border-color: var(--blue-darker);
	}

	.passage-pinned.blue .passage-pinned-header :global(h4) {
		color: var(--blue-lighter);
	}

	.passage-pinned.blue .passage-section-header {
		background-color: var(--blue-lighter);
		border-color: var(--blue-dark);
	}

	.passage-pinned.blue .passage-section-header :global(h4) {
		color: var(--blue-darker);
	}

	.passage-pinned.blue .passage-division {
		border-color: var(--blue-dark);
	}

	.passage-pinned.red .passage-pinned-header {
		background-color: var(--red-darker);
		border-color: var(--red-darker);
	}

	.passage-pinned.red .passage-pinned-header :global(h4) {
		color: var(--red-lighter);
	}

	.passage-pinned.red .passage-section-header {
		background-color: var(--red-lighter);
		border-color: var(--red-dark);
	}

	.passage-pinned.red .passage-section-header :global(h4) {
		color: var(--red-darker);
	}

	.passage-pinned.red .passage-division {
		border-color: var(--red-dark);
	}

	.passage-pinned.orange .passage-pinned-header {
		background-color: var(--orange-darker);
		border-color: var(--orange-darker);
	}

	.passage-pinned.orange .passage-pinned-header :global(h4) {
		color: var(--orange-lighter);
	}

	.passage-pinned.orange .passage-section-header {
		background-color: var(--orange-lighter);
		border-color: var(--orange-dark);
	}

	.passage-pinned.orange .passage-section-header :global(h4) {
		color: var(--orange-darker);
	}

	.passage-pinned.orange .passage-division {
		border-color: var(--orange-dark);
	}

	.passage-pinned.yellow .passage-pinned-header {
		background-color: var(--yellow-darker);
		border-color: var(--yellow-darker);
	}

	.passage-pinned.yellow .passage-pinned-header :global(h4) {
		color: var(--yellow-lighter);
	}

	.passage-pinned.yellow .passage-section-header {
		background-color: var(--yellow-lighter);
		border-color: var(--yellow-dark);
	}

	.passage-pinned.yellow .passage-section-header :global(h4) {
		color: var(--yellow-darker);
	}

	.passage-pinned.yellow .passage-division {
		border-color: var(--yellow-dark);
	}

	.passage-pinned.green .passage-pinned-header {
		background-color: var(--green-darker);
		border-color: var(--green-darker);
	}

	.passage-pinned.green .passage-pinned-header :global(h4) {
		color: var(--green-lighter);
	}

	.passage-pinned.green .passage-section-header {
		background-color: var(--green-lighter);
		border-color: var(--green-dark);
	}

	.passage-pinned.green .passage-section-header :global(h4) {
		color: var(--green-darker);
	}

	.passage-pinned.green .passage-division {
		border-color: var(--green-dark);
	}

	.passage-pinned.aqua .passage-pinned-header {
		background-color: var(--aqua-darker);
		border-color: var(--aqua-darker);
	}

	.passage-pinned.aqua .passage-pinned-header :global(h4) {
		color: var(--aqua-lighter);
	}

	.passage-pinned.aqua .passage-section-header {
		background-color: var(--aqua-lighter);
		border-color: var(--aqua-dark);
	}

	.passage-pinned.aqua .passage-section-header :global(h4) {
		color: var(--aqua-darker);
	}

	.passage-pinned.aqua .passage-division {
		border-color: var(--aqua-dark);
	}

	.passage-pinned.purple .passage-pinned-header {
		background-color: var(--purple-darker);
		border-color: var(--purple-darker);
	}

	.passage-pinned.purple .passage-pinned-header :global(h4) {
		color: var(--purple-lighter);
	}

	.passage-pinned.purple .passage-section-header {
		background-color: var(--purple-lighter);
		border-color: var(--purple-dark);
	}

	.passage-pinned.purple .passage-section-header :global(h4) {
		color: var(--purple-darker);
	}

	.passage-pinned.purple .passage-division {
		border-color: var(--purple-dark);
	}

	.passage-pinned.pink .passage-pinned-header {
		background-color: var(--pink-darker);
		border-color: var(--pink-darker);
	}

	.passage-pinned.pink .passage-pinned-header :global(h4) {
		color: var(--pink-lighter);
	}

	.passage-pinned.pink .passage-section-header {
		background-color: var(--pink-lighter);
		border-color: var(--pink-dark);
	}

	.passage-pinned.pink .passage-section-header :global(h4) {
		color: var(--pink-darker);
	}

	.passage-pinned.pink .passage-division {
		border-color: var(--pink-dark);
	}
</style>
