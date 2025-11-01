<script>
	/**
	 * # Heading Component
	 * 
	 * Semantic heading elements (h1-h6) with consistent styling and flexible options.
	 * Uses children snippet for flexible content.
	 * 
	 * ## Features
	 * - All 6 HTML heading levels (h1-h6)
	 * - Style classes for size override (h1-h6 classes available in CSS)
	 * - Alignment options (center, right)
	 * - Muted color variant for less emphasis
	 * - Sub-heading mode (reduces margin for grouping)
	 * 
	 * ## Usage Examples
	 * 
	 * Basic heading:
	 * ```svelte
	 * <Heading heading="h1" classes="h4">Page Title</Heading>
	 * ```
	 * 
	 * Centered heading:
	 * ```svelte
	 * <Heading heading="h2" alignCenter>Welcome</Heading>
	 * ```
	 * 
	 * Heading with sub-heading:
	 * ```svelte
	 * <Heading heading="h1" classes="h4" hasSub>Main Title</Heading>
	 * <Heading heading="h2" classes="h5" isMuted>Subtitle text</Heading>
	 * ```
	 * 
	 * @typedef {Object} HeadingProps
	 * @property {'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'} heading - Heading level (required)
	 * @property {string} [classes=''] - Additional CSS classes. Use h1-h6 classes for size override
	 * @property {boolean} [alignCenter=false] - Center align text
	 * @property {boolean} [alignRight=false] - Right align text
	 * @property {boolean} [hasSub=false] - Sub-heading style (reduced margin for grouping)
	 * @property {boolean} [isMuted=false] - Gray color for less emphasis
	 * @property {boolean} [notBold=false] - Remove bold for less emphasis
	 * @property {import('svelte').Snippet} children - Heading content (required)
	 */

	/** @type {HeadingProps} */
	let { heading, classes = '', children, alignCenter = false, alignRight = false, hasSub = false, isMuted = false, notBold = false } = $props();
</script>

<svelte:element
	this={heading}
	class="{classes} {alignCenter ? 'align-center' : ''} {alignRight ? 'align-right' : ''} {isMuted ? 'muted' : ''} {hasSub ? 'has-sub' : ''} {notBold ? 'not-bold' : ''}"
>
	{@render children()}
</svelte:element>


<style>

	.align-center {
		text-align: center;
	}

	.align-right {
		text-align: right;
	}
    
	h1,
	.h1,
	h2,
	.h2,
	h3,
	.h3,
	h4,
	.h4,
	h5,
	.h5,
	h6,
	.h6 {
		margin: 0em 0em 2.0rem;
		color: var(--black);
	}
	h1,
	.h1 {
		font-size: 4rem;
	}
	h2,
	.h2 {
		font-size: 3.2rem;
	}
	h3,
	.h3 {
		font-size: 2.8rem;
	}
	h4,
	.h4 {
		font-size: 2.4rem;
	}
	h5,
	.h5 {
		font-size: 2rem;
	}
	h6,
	.h6 {
		font-size: 1.6rem;
	}
	.has-sub{
		margin: 0.0rem;
		line-height: 1.5;
	}
	.muted {
		color: var(--gray-500)
	}
	.not-bold {
		font-weight: normal;
	}
</style>
