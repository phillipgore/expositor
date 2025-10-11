<script>
	import iconData from '$lib/data/icons.json';

	/**
	 * # Icon Component
	 * 
	 * SVG icon renderer using icon definitions from icons.json.
	 * Provides consistent icon display with automatic viewBox and path management.
	 * 
	 * ## Features
	 * - Dynamic icon loading from JSON data
	 * - Active state styling
	 * - Spacing and sizing utilities via classes
	 * - Pointer events disabled for proper parent click handling
	 * - Fallback for missing icons
	 * 
	 * ## Common Classes
	 * - `menu-caret` - Small caret for dropdowns (0.7rem width)
	 * - `icon-space` - Right margin for icon+text layouts (0.6rem)
	 * - `light` - White icon fill
	 * 
	 * ## Usage Examples
	 * 
	 * Basic icon:
	 * ```svelte
	 * <Icon iconId="home" />
	 * ```
	 * 
	 * Icon with spacing:
	 * ```svelte
	 * <Icon iconId="gear" classes="icon-space" />
	 * ```
	 * 
	 * @typedef {Object} IconProps
	 * @property {string} iconId - Icon identifier matching _id in icons.json (required)
	 * @property {boolean} [isActive=false] - Active state for styling
	 * @property {string} [classes=''] - Additional CSS classes
	 */

	/** @type {IconProps} */
	let { iconId, isActive = false, classes = '' } = $props();

	/**
	 * Get icon data with fallback for missing icons
	 * @param {string} iconId - Icon identifier
	 * @returns {Object} Icon data with viewBox and d properties
	 */
	const getIcon = (iconId) => {
		const icon = iconData.find((icon) => icon._id === iconId);
		if (!icon) {
			console.warn(`Icon not found: ${iconId}`);
			return { viewBox: '0 0 16 16', d: '' }; // Fallback empty icon
		}
		return icon;
	};
</script>

<svg class="icon {isActive ? 'active' : ''} {classes}" viewBox={getIcon(iconId).viewBox}>
	<path d={getIcon(iconId).d} />
</svg>

<style>
	svg.icon {
		height: 1.4rem;
		max-width: 1.6rem;
		margin: 0rem;
		pointer-events: none;
		overflow: visible;

		&.menu-caret {
			width: 0.7rem;
			margin-left: 0.4rem;
			pointer-events: none;
		}

		&.icon-space {
			margin-right: 0.6rem;
		}

		&.light path {
			fill: var(--white);
		}
	}
</style>
