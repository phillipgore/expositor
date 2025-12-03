<script>
	import { fade } from 'svelte/transition';
	import tooltipState from '$lib/stores/tooltipStore.svelte.js';

	/**
	 * # Tooltip Component
	 * 
	 * Renders custom tooltips with smart positioning and smooth animations.
	 * Should be placed once at the app root level - manages all tooltips globally.
	 * 
	 * ## Features
	 * - Smart auto-positioning with viewport collision detection
	 * - Smooth fade in/out transitions
	 * - Arrow pointer to target element
	 * - Portal rendering at body level (avoids z-index issues)
	 * - Multi-line text support
	 * - HTML content support (when enabled)
	 */

	let tooltipElement = $state(null);
	let position = $state({ x: 0, y: 0, placement: 'top' });

	/**
	 * Calculate tooltip position with smart placement
	 */
	const calculatePosition = () => {
		if (!$tooltipState.targetElement || !tooltipElement) return;

		const targetRect = $tooltipState.targetElement.getBoundingClientRect();
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const offset = $tooltipState.offset;
		const arrow = 8; // Arrow size

		// Try placements in order of preference
		const placements = $tooltipState.placement === 'auto' 
			? ['top', 'bottom', 'right', 'left']
			: [$tooltipState.placement, 'top', 'bottom', 'right', 'left'];

		for (const placement of placements) {
			const pos = getPositionForPlacement(placement, targetRect, tooltipRect, offset, arrow);
			
			// Check if position is within viewport
			if (isInViewport(pos, tooltipRect)) {
				position = { ...pos, placement };
				return;
			}
		}

		// Fallback to first placement if none fit perfectly
		position = { 
			...getPositionForPlacement(placements[0], targetRect, tooltipRect, offset, arrow), 
			placement: placements[0] 
		};
	};

	/**
	 * Get position coordinates for a specific placement
	 * @param {string} placement - Placement direction
	 * @param {DOMRect} targetRect - Target element bounding rect
	 * @param {DOMRect} tooltipRect - Tooltip element bounding rect
	 * @param {number} offset - Distance from target
	 * @param {number} arrow - Arrow size
	 */
	const getPositionForPlacement = (placement, targetRect, tooltipRect, offset, arrow) => {
		const scrollX = window.scrollX || window.pageXOffset;
		const scrollY = window.scrollY || window.pageYOffset;

		switch (placement) {
			case 'top':
				return {
					x: targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2),
					y: targetRect.top + scrollY - tooltipRect.height - offset - arrow
				};
			case 'bottom':
				return {
					x: targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2),
					y: targetRect.bottom + scrollY + offset + arrow
				};
			case 'left':
				return {
					x: targetRect.left + scrollX - tooltipRect.width - offset - arrow,
					y: targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2)
				};
			case 'right':
				return {
					x: targetRect.right + scrollX + offset + arrow,
					y: targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2)
				};
			default:
				return { x: 0, y: 0 };
		}
	};

	/**
	 * Check if position would keep tooltip within viewport
	 * @param {Object} pos - Position coordinates
	 * @param {DOMRect} tooltipRect - Tooltip bounding rect
	 */
	const isInViewport = (pos, tooltipRect) => {
		const padding = 8; // Minimum distance from viewport edge
		
		return (
			pos.x >= padding &&
			pos.y >= padding &&
			pos.x + tooltipRect.width <= window.innerWidth - padding &&
			pos.y + tooltipRect.height <= window.innerHeight - padding
		);
	};

	// Recalculate position when tooltip becomes visible or window resizes
	$effect(() => {
		if ($tooltipState.isVisible && tooltipElement) {
			calculatePosition();
			
			// Update on scroll or resize
			const handleUpdate = () => calculatePosition();
			window.addEventListener('scroll', handleUpdate, true);
			window.addEventListener('resize', handleUpdate);
			
			return () => {
				window.removeEventListener('scroll', handleUpdate, true);
				window.removeEventListener('resize', handleUpdate);
			};
		}
	});
</script>

{#if $tooltipState.isVisible && $tooltipState.content}
	<div
		bind:this={tooltipElement}
		class="tooltip {position.placement}"
		style="left: {position.x}px; top: {position.y}px;"
		transition:fade={{ duration: 200 }}
		role="tooltip"
	>
		<div class="tooltip-cover">
			{#if $tooltipState.allowHtml}
				{@html $tooltipState.content}
			{:else}
				{$tooltipState.content}
			{/if}
		</div>
		<div class="tooltip-arrow"></div>
	</div>
{/if}

<style>
	.tooltip {
		position: absolute;
		z-index: 10000;
		background-color: var(--gray-800);
		color: var(--black);
		border-radius: 0.3rem;
		font-size: 1.2rem;
		line-height: 1.5;
		max-width: 25rem;
		box-shadow: 0rem 0rem 0.4rem var(--gray-400);
		pointer-events: none;
		white-space: normal;
		word-wrap: break-word;
		font-weight: 400;
	}

	.tooltip-cover {
		position: relative;
		border-radius: 0.3rem;
		background-color: var(--gray-800);
		padding: 0.6rem 1rem;
		z-index: 100;
	}

	/* Arrow positioning based on tooltip placement */
	.tooltip-arrow {
		position: absolute;
		width: 0.8rem;
		height: 0.8rem;
		background-color: var(--gray-800);
		box-shadow: 0rem 0rem 0.4rem var(--gray-400);
		transform: rotate(45deg);
		z-index: 50;
	}

	.tooltip.top .tooltip-arrow {
		bottom: -0.4rem;
		left: 50%;
		margin-left: -0.4rem;
	}

	.tooltip.bottom .tooltip-arrow {
		top: -0.4rem;
		left: 50%;
		margin-left: -0.4rem;
	}

	.tooltip.left .tooltip-arrow {
		right: -0.4rem;
		top: 50%;
		margin-top: -0.4rem;
	}

	.tooltip.right .tooltip-arrow {
		left: -0.4rem;
		top: 50%;
		margin-top: -0.4rem;
	}
</style>
