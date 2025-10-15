<script>
	/**
	 * # Toolbar Component
	 * 
	 * Flexible toolbar container for navigation and action buttons.
	 * Supports both light and dark themes with customizable positioning.
	 * 
	 * ## Features
	 * - Light and dark color schemes
	 * - Flexible positioning (static, sticky, fixed, absolute)
	 * - Border options (top, bottom)
	 * - Rounded variant
	 * - Z-index control for layering
	 * - Full positioning control (top, right, bottom, left)
	 * 
	 * ## Usage Examples
	 * 
	 * Basic light toolbar:
	 * ```svelte
	 * <Toolbar>
	 *   <Button label="Home" />
	 *   <SpacerFlex />
	 *   <Button label="Settings" />
	 * </Toolbar>
	 * ```
	 * 
	 * Dark sticky toolbar:
	 * ```svelte
	 * <Toolbar classes="dark" position="sticky" zIndex="1000">
	 *   <MenuButton iconId="menu" menuId="MainMenu" />
	 *   <SpacerFlex />
	 *   <Button label="Account" />
	 * </Toolbar>
	 * ```
	 * 
	 * Rounded toolbar:
	 * ```svelte
	 * <Toolbar classes="light rounded bd-top bd-bottom">
	 *   <IconButton iconId="back" />
	 *   <IconButton iconId="forward" />
	 * </Toolbar>
	 * ```
	 * 
	 * Fixed positioned toolbar:
	 * ```svelte
	 * <Toolbar classes="dark" position="fixed" top="0" left="0" right="0" zIndex="999">
	 *   <Logo />
	 *   <SpacerFlex />
	 *   <Navigation />
	 * </Toolbar>
	 * ```
	 * 
	 * ## Available Classes
	 * - `light` - White background (default)
	 * - `dark` - Dark gray background
	 * - `rounded` - Fully rounded corners
	 * - `bd-top` - Top border
	 * - `bd-bottom` - Bottom border
	 * 
	 * @typedef {Object} ToolbarProps
	 * @property {string} [classes='light border-bottom'] - Style classes. Combine: 'light'/'dark', 'rounded', 'bd-top'/'bd-bottom'
	 * @property {string} [position='static'] - CSS position value (static, sticky, fixed, absolute, relative)
	 * @property {string} [top='auto'] - CSS top position value
	 * @property {string} [right='auto'] - CSS right position value
	 * @property {string} [bottom='auto'] - CSS bottom position value
	 * @property {string} [left='auto'] - CSS left position value
	 * @property {string} [zIndex='auto'] - Z-index value for layering control
	 * @property {import('svelte').Snippet} children - Toolbar content (buttons, spacers, etc.)
	 */

	/** @type {ToolbarProps} */
	let {
		classes = 'light border-bottom',
		position = 'static',
		top = 'auto',
		right = 'auto',
		bottom = 'auto',
		left = 'auto',
		zIndex = 'auto',
		children
	} = $props();
</script>

<header
	class={classes}
	style:position
	style:top
	style:right
	style:bottom
	style:left
	style:z-index={zIndex}
>
	{#if children}
		{@render children()}
	{/if}
</header>

<style>
	header {
		display: flex;
		align-items: center;
		margin: 0.0rem;
		padding: 0.0rem 0.9rem;
		min-height: 5.4rem;
		border: none;

		&.rounded {
			border-radius: 100vw;
		}

		&.bd-top {
			border-top: 0.1rem solid;
		}

		&.bd-bottom {
			border-bottom: 0.1rem solid;
		}

		&.dark {
			background-color: var(--gray-200);
			color: var(--white);
			border-color: var(--black);
		}

		&.light {
			background-color: var(--white);
			color: var(--gray-200);
			border-color: var(--gray-700);
		}
	}
</style>
