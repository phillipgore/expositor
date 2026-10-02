<script>
	/**
	 * AnalyzeStudyToolbar
	 *
	 * Sub-toolbar under the app toolbar on the Analyze page, styled like the
	 * Document page's commentary toolbar. Title/subtitle on the left; series part
	 * navigation (SeriesPartNav) on the right. It sits outside the zoomed scroll
	 * area, so it never scales. The in-content study header is still rendered for
	 * export/print (see exportAnalyze.js prepareForCapture).
	 */
	import SeriesPartNav from '$lib/componentWidgets/SeriesPartNav.svelte';

	/** @type {{ title: string, subtitle?: string | null, seriesContext?: any }} */
	let { title, subtitle = null, seriesContext = null } = $props();
</script>

<div class="analyze-study-toolbar">
	<div class="titles">
		<h1 class="title">{title}</h1>
		{#if subtitle}
			<p class="subtitle">{subtitle}</p>
		{/if}
	</div>
	<SeriesPartNav {seriesContext} view="analyze" />
</div>

<style>
	.analyze-study-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		/* Left 4.4rem lines the title up with the content. Right 3.8rem + the nav
		   button's 0.6rem inner padding puts the chevron glyph 4.4rem from the edge. */
		padding: 0.6rem 3.8rem 0.6rem 4.4rem;
		box-sizing: border-box;
		background-color: var(--white);
		border-bottom: 0.1rem solid var(--gray-700);
		flex-shrink: 0;
	}

	/* Title and subtitle side by side on one line (baseline-aligned) so the bar
	   is the same single-row height as the Document commentary toolbar. */
	.titles {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 0.9rem;
		/* Fill the space left of the chevrons so the title's max-width % resolves
		   against the toolbar, not against the title's own width (which made
		   subtitle-less titles truncate to 70% of themselves). */
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}

	.title {
		font-size: 1.8rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 0;
		max-width: 70%;
	}

	/* No subtitle: the title may use the full width and shrink (with ellipsis)
	   only when it truly doesn't fit. */
	.title:only-child {
		max-width: 100%;
		flex-shrink: 1;
	}

	.subtitle {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--gray-400);
		line-height: 1.2;
		margin: 0;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media print {
		.analyze-study-toolbar {
			display: none;
		}
	}
</style>
