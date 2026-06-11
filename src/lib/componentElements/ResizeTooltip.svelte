<script>
	/**
	 * ResizeTooltip
	 *
	 * A small viewport-fixed label that follows a segment-height resize drag,
	 * displaying the live height in pixels. It is positioned by its parent via
	 * `x` (horizontal center) and `y` (the segment's current bottom edge), and
	 * renders just above that point so it sits over the gray center drag indicator.
	 */
	let {
		/** Horizontal center in viewport px. */
		x = 0,
		/** Vertical anchor (segment bottom edge) in viewport px. */
		y = 0,
		/** Height value to display, in CSS px. */
		height = 0,
		/** Optional leading label (e.g. a snapped multiple like "Double"). */
		label = null
	} = $props();
</script>

<div class="resize-tooltip" style:left="{x}px" style:top="{y}px">
	{#if label}{label} · {/if}{height}px
</div>


<style>
	.resize-tooltip {
		position: fixed;
		/* Center horizontally and lift above the anchor point so the label clears
		   the gray center drag indicator that sits on the segment's bottom border. */
		transform: translate(-50%, calc(-100% - 0.6rem));
		padding: 0.3rem 0.6rem;
		border-radius: 0.3rem;
		background-color: var(--gray-200);
		color: var(--white);

		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		white-space: nowrap;
		pointer-events: none;
		z-index: 201;
	}
</style>
