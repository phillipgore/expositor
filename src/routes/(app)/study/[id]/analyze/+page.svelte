<script>
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
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
</script>

<div class="container">
	<div class="study-header">
		<div>
			<Heading heading="h1" classes="h4" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
			{#if data.study.subtitle}
				<Heading heading="h2" classes="h5" isMuted>{data.study.subtitle}</Heading>
			{/if}
		</div>
	</div>
	
	<!-- Analyze View Content -->
	<div class="analyze-content" class:hide-verses={!$toolbarState.versesVisible} class:wide-layout={$toolbarState.wideLayout} class:overview-mode={$toolbarState.overviewMode}>
		<div class="spacer">&nbsp;</div> 
		{#if data.passagesWithText && data.passagesWithText.length > 0}
			{#each data.passagesWithText as passageText}
				<div class="passage">
					<div class="passage-container">
						{#if passageText.error}
							<div class="error-message">
								<p>Error loading {passageText.reference}: {passageText.error}</p>
							</div>
						{:else if passageText.text}
							<Heading heading="h3" classes="h4 passage-refernce">
								{passageText.reference} [{translationAbbr}]
							</Heading>
							<div class="passage-column green">
								<div class="passage-column-header">
									<Heading heading="h4" classes="h3">Title</Heading>
								</div>
									<div class="passage-section">
										<div class="passage-section-header">
											<Heading heading="h4">Title</Heading>
										</div>
										<div class="passage-division">
											<div class="passage-division-header">
												<Heading heading="h4">Title</Heading>
											</div>
											<div class="passage-text">{@html passageText.text}</div>
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
		height: 100%;
	}

	.study-header {
		width: 100%;
		text-align: center;
	}

	.placeholder-text {
		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	.analyze-content {
		display: flex;
		flex-grow: 1;
		gap: 3.2rem;
		justify-content: center;
		overflow-x: auto;
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

	.passage-container :global(.h4) {
		margin-bottom: 0.9rem;
	}

	.passage-column {
		width: 28.8rem;
	}

	.wide-layout .passage-column {
		width: 50.4rem;
	}

	.overview-mode .passage-text {
		display: none;
	}

	.overview-mode .passage-division-header {
		padding: 0.6rem;
	}

	:global(.h4.passage-refernce) {
		color: var(--gray-300)
	}

	.passage-column-header {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
		text-align: center;
	}

	.passage-division {
		border: 0.1rem solid;
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.passage-column-header,
	.passage-section-header {
		border-top: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
	}

	.passage-column-header,
	.passage-section-header {
		padding: 0.6rem;
	}

	.passage-division-header {
		padding: 0.6rem 0.6rem 0.0rem;
	}

	.passage-column-header :global(.h3),
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
		padding: 0.6rem;
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
		width: 100%;
		padding-top: 1.8rem;
	}

	.copyright-notice p {
		font-size: 1.2rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}

	.passage-column.blue .passage-column-header {
		background-color: var(--blue-darker);
		border-color: var(--blue-darker);
	}

	.passage-column.blue .passage-column-header :global(h4) {
		color: var(--blue-lighter);
	}

	.passage-column.blue .passage-section-header {
		background-color: var(--blue-lighter);
		border-color: var(--blue-dark);
	}

	.passage-column.blue .passage-section-header :global(h4) {
		color: var(--blue-darker);
	}

	.passage-column.blue .passage-division {
		border-color: var(--blue-dark);
	}

	.passage-column.red .passage-column-header {
		background-color: var(--red-darker);
		border-color: var(--red-darker);
	}

	.passage-column.red .passage-column-header :global(h4) {
		color: var(--red-lighter);
	}

	.passage-column.red .passage-section-header {
		background-color: var(--red-lighter);
		border-color: var(--red-dark);
	}

	.passage-column.red .passage-section-header :global(h4) {
		color: var(--red-darker);
	}

	.passage-column.red .passage-division {
		border-color: var(--red-dark);
	}

	.passage-column.orange .passage-column-header {
		background-color: var(--orange-darker);
		border-color: var(--orange-darker);
	}

	.passage-column.orange .passage-column-header :global(h4) {
		color: var(--orange-lighter);
	}

	.passage-column.orange .passage-section-header {
		background-color: var(--orange-lighter);
		border-color: var(--orange-dark);
	}

	.passage-column.orange .passage-section-header :global(h4) {
		color: var(--orange-darker);
	}

	.passage-column.orange .passage-division {
		border-color: var(--orange-dark);
	}

	.passage-column.yellow .passage-column-header {
		background-color: var(--yellow-darker);
		border-color: var(--yellow-darker);
	}

	.passage-column.yellow .passage-column-header :global(h4) {
		color: var(--yellow-lighter);
	}

	.passage-column.yellow .passage-section-header {
		background-color: var(--yellow-lighter);
		border-color: var(--yellow-dark);
	}

	.passage-column.yellow .passage-section-header :global(h4) {
		color: var(--yellow-darker);
	}

	.passage-column.yellow .passage-division {
		border-color: var(--yellow-dark);
	}

	.passage-column.green .passage-column-header {
		background-color: var(--green-darker);
		border-color: var(--green-darker);
	}

	.passage-column.green .passage-column-header :global(h4) {
		color: var(--green-lighter);
	}

	.passage-column.green .passage-section-header {
		background-color: var(--green-lighter);
		border-color: var(--green-dark);
	}

	.passage-column.green .passage-section-header :global(h4) {
		color: var(--green-darker);
	}

	.passage-column.green .passage-division {
		border-color: var(--green-dark);
	}

	.passage-column.aqua .passage-column-header {
		background-color: var(--aqua-darker);
		border-color: var(--aqua-darker);
	}

	.passage-column.aqua .passage-column-header :global(h4) {
		color: var(--aqua-lighter);
	}

	.passage-column.aqua .passage-section-header {
		background-color: var(--aqua-lighter);
		border-color: var(--aqua-dark);
	}

	.passage-column.aqua .passage-section-header :global(h4) {
		color: var(--aqua-darker);
	}

	.passage-column.aqua .passage-division {
		border-color: var(--aqua-dark);
	}

	.passage-column.purple .passage-column-header {
		background-color: var(--purple-darker);
		border-color: var(--purple-darker);
	}

	.passage-column.purple .passage-column-header :global(h4) {
		color: var(--purple-lighter);
	}

	.passage-column.purple .passage-section-header {
		background-color: var(--purple-lighter);
		border-color: var(--purple-dark);
	}

	.passage-column.purple .passage-section-header :global(h4) {
		color: var(--purple-darker);
	}

	.passage-column.purple .passage-division {
		border-color: var(--purple-dark);
	}

	.passage-column.pink .passage-column-header {
		background-color: var(--pink-darker);
		border-color: var(--pink-darker);
	}

	.passage-column.pink .passage-column-header :global(h4) {
		color: var(--pink-lighter);
	}

	.passage-column.pink .passage-section-header {
		background-color: var(--pink-lighter);
		border-color: var(--pink-dark);
	}

	.passage-column.pink .passage-section-header :global(h4) {
		color: var(--pink-darker);
	}

	.passage-column.pink .passage-division {
		border-color: var(--pink-dark);
	}
</style>
