<script>
	import { fade } from 'svelte/transition';

	/**
	 * # Menu Component
	 * 
	 * Dropdown menu container with fade animations and positioning.
	 * Typically controlled by MenuButton and populated with menu items.
	 * 
	 * ## Features
	 * - Fade in/out animations
	 * - Absolute positioning below trigger element
	 * - Scrollable overflow handling
	 * - Right-aligned variant
	 * - Hidden scrollbars for clean appearance
	 * - Conditional rendering based on active state
	 * 
	 * ## Usage Examples
	 * 
	 * Basic menu (usually via MenuButton):
	 * ```svelte
	 * <Menu isActive={isOpen} menuOffset="3rem">
	 *   <IconButton iconId="account" label="Profile" classes="menu-light" />
	 *   <IconButton iconId="gear" label="Settings" classes="menu-light" />
	 * </Menu>
	 * ```
	 * 
	 * Right-aligned menu:
	 * ```svelte
	 * <Menu isActive={isOpen} menuOffset="3rem" classes="menu-right">
	 *   <IconButton iconId="power" label="Sign Out" classes="menu-light" />
	 * </Menu>
	 * ```
	 * 
	 * @typedef {Object} MenuProps
	 * @property {string} [classes=''] - Additional CSS classes. Use 'menu-right' for right alignment
	 * @property {any} [menuElements] - Reserved for future use
	 * @property {boolean} isActive - Controls menu visibility (required)
	 * @property {string} [menuOffset] - Top offset positioning (CSS value like '3rem')
	 * @property {import('svelte').Snippet} children - Menu items content (required)
	 */

	/** @type {MenuProps} */
	let { classes = '', menuElements, isActive, menuOffset, children } = $props();
</script>

{#if isActive}
	<div
		class="menu {classes}"
		style="top: {menuOffset}"
		in:fade={{ duration: 50 }}
		out:fade={{ duration: 100 }}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.menu {
		position: absolute;
		z-index: 100;
		border-radius: 0.3rem;
		overflow-y: scroll;
		padding: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		background-color: var(--gray-800);
		/* border: 0.1rem solid var(--gray-700); */
		display: flex;
		flex-direction: column;
		animation: fadeOut 600ms;
		-ms-overflow-style: none;
		scrollbar-width: none;
		margin: 0rem 0.2rem;
		/* min-width: 12.6rem; */

		&.menu-right {
			right: 0rem;
		}

		&::-webkit-scrollbar {
			display: none;
		}
	}
</style>
