<script>
	// Menu Component (Modern - CSS Popover & Anchor Positioning)
	// Dropdown menu container using native CSS Popover API and Anchor Positioning.
	// Significantly simplified from legacy version - no manual positioning needed.
	
	let {
		menuId,
		classes = '',
		alignment = 'start',
		children
	} = $props();

	// Generate anchor reference from menuId
	let anchorName = `--anchor-${menuId}`;
	
	// Build alignment class (always apply for explicit control)
	let alignmentClass = `align-${alignment}`;
</script>

<div
	id={menuId}
	popover="auto"
	class="menu {classes} {alignmentClass}"
	style="position-anchor: {anchorName}"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.menu {
		/* Reset popover defaults */
		margin: 0;
		border: none;
		padding: 0;
		
		/* Menu styling */
		border-radius: 0.3rem;
		padding: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		background-color: var(--gray-800);
		display: flex;
		flex-direction: column;
		
		/* Hide scrollbar but allow scrolling */
		overflow-y: auto;
		-ms-overflow-style: none;
		scrollbar-width: none;
		
		/* CSS Anchor Positioning - position below button by default */
		position-anchor: var(--position-anchor);
		
		/* Position below the anchor, aligned to left edge */
		top: anchor(bottom);
		left: anchor(left);
		margin-top: 0.3rem;
		
		/* Alignment variants using anchor positioning */
		&.align-start {
			left: anchor(left);
		}
		
		&.align-end {
			right: anchor(right);
			left: auto;
		}
		
		&.align-center {
			left: anchor(center);
			translate: -50% 0;
		}
		
		/* Right-aligned menu (legacy support) */
		&.menu-right {
			right: anchor(right);
			left: auto;
		}
		
		/* Handle overflow - try flipping to top if no space below */
		position-try-options: flip-block;
		
		/* Constrain to viewport with some padding */
		max-block-size: calc(100vh - 2rem);
		
		/* Hide webkit scrollbar */
		&::-webkit-scrollbar {
			display: none;
		}
		
		/* Popover open animation */
		&:popover-open {
			animation: menuFadeIn 150ms ease-out;
		}
		
		/* Starting style for animation */
		@starting-style {
			&:popover-open {
				opacity: 0;
				transform: translateY(-0.5rem);
			}
		}
		
		/* Ensure hidden when not open (fallback for polyfill) */
		&:not(:popover-open) {
			display: none;
		}
	}
	
	@keyframes menuFadeIn {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
