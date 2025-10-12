<script>
	/**
	 * # StudiesPanel Component
	 * 
	 * Slide-in panel from the left that displays available studies.
	 * Opens/closes via toggle button in toolbar without overlaying content.
	 * 
	 * ## Features
	 * - Slides in from left with smooth CSS transition
	 * - Pushes main content to the right (doesn't overlay)
	 * - Full height below toolbar
	 * - Fixed width when open
	 * 
	 * ## Props
	 * @property {boolean} isOpen - Whether panel is currently open
	 * 
	 * @component
	 */
    import Heading from "$lib/elements/Heading.svelte";

	let { isOpen = false } = $props();
</script>

<aside class="studies-panel" class:open={isOpen}>
	<div class="panel-content">
        <Heading heading="h1" classes="h4">Studies</Heading>
		<!-- Study list will be added here -->
	</div>
</aside>

<style>
	.studies-panel {
		width: 0;
		min-width: 0;
		height: 100%;
		background-color: var(--gray-lighter);
		border-right: 1px solid var(--gray-700);
		overflow: hidden;
		transition: width 0.3s ease-in-out, min-width 0.3s ease-in-out;
		flex-shrink: 0;
	}

	.studies-panel.open {
		width: 300px;
		min-width: 300px;
	}

	.panel-content {
		width: 300px;
		height: 100%;
		padding: 1.8rem;
		overflow-y: auto;
	}

	.panel-title {
		font-size: 2rem;
		font-weight: 500;
		margin: 0 0 1.8rem 0;
		color: var(--black);
	}
</style>
