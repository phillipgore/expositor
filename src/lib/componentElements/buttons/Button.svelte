<script>
	import { v4 as uuidv4 } from 'uuid';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';

	/**
	 * # Button Component
	 * 
	 * Core button component providing base functionality for all button types.
	 * Handles click events, navigation, keyboard interaction, and accessibility.
	 * 
	 * ## ACCESSIBILITY NOTE
	 * If this button navigates to a new page/route, consider using an <a> element
	 * instead for better semantics. Reserve <button> for actions that don't change
	 * location (like opening modals, toggling state, submitting forms, etc.).
	 * 
	 * ## Features
	 * - Automatic UUID generation for accessibility
	 * - Click event handling with MouseEvent support
	 * - URL navigation
	 * - Keyboard accessibility (Enter/Space)
	 * - Active state management
	 * - Comprehensive ARIA support
	 * - Multiple style variants via classes
	 * - Snippet support for custom content
	 * 
	 * ## Style Classes
	 * - `blue` (default) - Primary blue button
	 * - `gray` - Secondary gray button
	 * - `red` - Destructive red button
	 * - `toolbar-dark` - Dark toolbar button with icon support
	 * - `menu-light` - Light menu item button
	 * 
	 * ## Usage Examples
	 * 
	 * Basic button:
	 * ```svelte
	 * <Button label="Click me" handleClick={() => console.log('clicked')} />
	 * ```
	 * 
	 * Navigation button:
	 * ```svelte
	 * <Button label="Go to page" url="/page" classes="blue" />
	 * ```
	 * 
	 * Custom content with snippet:
	 * ```svelte
	 * <Button classes="toolbar-dark">
	 *   <Icon iconId="home" />
	 *   <span>Home</span>
	 * </Button>
	 * ```
	 * 
	 * Active state (for toggles):
	 * ```svelte
	 * <Button label="Toggle" isActive={isActive} />
	 * ```
	 * 
	 * @typedef {'button' | 'submit' | 'reset'} ButtonType
	 */

	/**
	 * @typedef {Object} ButtonProps
	 * @property {string} [id] - Unique button identifier. Auto-generates UUID if not provided
	 * @property {string} [classes='blue'] - Style classes. Available: blue, gray, red, toolbar-dark, menu-light
	 * @property {string} [href] - URL for link navigation. Renders as <a> element instead of <button>
	 * @property {string} [target] - Link target attribute (_blank, _self, etc.). Only used with href
	 * @property {string} [rel] - Link rel attribute (e.g., 'noopener noreferrer'). Only used with href
	 * @property {string} [url] - (Deprecated) URL to navigate to on click. Use href instead for semantic links
	 * @property {(event?: MouseEvent) => void} [handleClick] - Click event handler. Receives MouseEvent for access to target, modifiers, etc.
	 * @property {string} [label] - Button text label. Ignored if children snippet provided
 * @property {boolean} [isDisabled=false] - Whether button/link is disabled. Prevents all interaction
 * @property {boolean} [isFullWidth=false] - Whether button stretches to full container width
 * @property {boolean} [isRound=false] - Whether button is circular. Useful for icon-only buttons
 * @property {boolean} [isSquare=false] - Whether button is square. Useful for icon-only buttons
 * @property {boolean} [isLarge=false] - Large size variant (4.4rem height, 2rem font). Matches Input.large dimensions
	 * @property {ButtonType} [type='button'] - HTML button type attribute. Use 'submit' for forms. Only used for buttons
	 * @property {boolean} [isActive=false] - Active state. Applies 'active' class for visual feedback
	 * @property {string} [ariaLabel] - Accessible label for screen readers. Required if no visible label
	 * @property {'true' | 'false' | 'mixed'} [ariaPressed] - ARIA pressed state for toggle buttons
	 * @property {'true' | 'false'} [ariaExpanded] - ARIA expanded state for disclosure buttons
	 * @property {'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'} [ariaHaspopup] - ARIA haspopup indicator for buttons that open popups
	 * @property {string} [popovertarget] - ID of the popover element to control (CSS Popover API). Only used for buttons
	 * @property {string} [style] - Inline CSS styles for the element
	 * @property {string} [role] - ARIA role attribute (e.g., 'menuitem' for menu items)
	 * @property {string} [title] - Tooltip text displayed on hover
	 * @property {HTMLButtonElement | HTMLAnchorElement} [buttonElement] - Bindable reference to the button/link element
	 * @property {import('svelte').Snippet} [children] - Snippet for custom content. Takes precedence over label
	 */

	/** @type {ButtonProps} */
	let {
		id = uuidv4(),
		classes = 'blue',
		href,
		target,
		rel,
		url,
		handleClick,
		label,
		isDisabled,
		isFullWidth,
		isRound,
		isSquare,
		isLarge = false,
		type = 'button',
		isActive = false,
		ariaLabel,
		ariaPressed,
		ariaExpanded,
		ariaHaspopup,
		popovertarget,
		style,
		role,
		title,
		children,
		buttonElement = $bindable()
	} = $props();

	// Determine if this should render as a link
	const isLink = !!href;

	// Track if button should hide focus outline
	// MenuButtons start with no-focus class by default
	let hasNoFocusClass = $state(!!popovertarget);
	let isTabKeyPressed = $state(false);

	/**
	 * Handle mousedown event to add no-focus class
	 */
	const handleMouseDown = () => {
		hasNoFocusClass = true;
	};

	/**
	 * Handle window keydown to detect Tab key navigation
	 * @param {KeyboardEvent} event
	 */
	const handleWindowKeyDown = (event) => {
		if (event.key === 'Tab') {
			isTabKeyPressed = true;
		}
	};

	/**
	 * Handle focus event to remove no-focus class if focus came from keyboard Tab
	 * @param {FocusEvent} event
	 */
	const handleFocus = (event) => {
		// If Tab was pressed (keyboard navigation), remove no-focus class
		if (isTabKeyPressed) {
			hasNoFocusClass = false;
			isTabKeyPressed = false;
		}
	};

	// Add window event listener for Tab key detection
	$effect(() => {
		window.addEventListener('keydown', handleWindowKeyDown);
		return () => {
			window.removeEventListener('keydown', handleWindowKeyDown);
		};
	});

	// For menu buttons, listen for mouse clicks on menu items
	$effect(() => {
		if (popovertarget) {
			const menu = document.getElementById(popovertarget);
			if (menu) {
				const handleMenuMouseDown = () => {
					// User clicked in menu with mouse, so add no-focus class
					hasNoFocusClass = true;
				};
				
				menu.addEventListener('mousedown', handleMenuMouseDown);
				return () => {
					menu.removeEventListener('mousedown', handleMenuMouseDown);
				};
			}
		}
	});

	/**
	 * @param {MouseEvent} event
	 */
	const buttonClick = (event) => {
		// Execute custom click handler with event
		if (handleClick) {
			handleClick(event);
		}

		// Navigate to URL if provided
		if (url) {
			window.location.href = url;
		}
	};

	/**
	 * @param {KeyboardEvent} event
	 */
	const handleKeyDown = (event) => {
		// Handle Tab key for buttons with popovertarget - close menu if open
		if (popovertarget && event.key === 'Tab') {
			const menu = document.getElementById(popovertarget);
			if (menu && menu.matches(':popover-open')) {
				menu.hidePopover();
			}
			// Don't preventDefault - allow Tab to move focus naturally
			return;
		}
		
		// For buttons with popovertarget, let browser handle Enter/Space natively
		if (popovertarget && (event.key === 'Enter' || event.key === ' ')) {
			// Don't preventDefault - let the browser open the popover
			// Focus first menu item after popover opens
			setTimeout(() => {
				const menu = document.getElementById(popovertarget);
				if (menu && menu.matches(':popover-open')) {
					const firstItem = /** @type {HTMLElement | null} */ (menu.querySelector('[role="menuitem"]'));
					if (firstItem) {
						firstItem.setAttribute('tabindex', '0');
						firstItem.focus();
						
						// Dispatch custom event to notify Menu that first item is focused
						menu.dispatchEvent(new CustomEvent('menufirstitemfocused'));
					}
				}
			}, 100);
			return;
		}
		
		// Handle Enter and Space for activation (standard button behavior)
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			buttonClick(/** @type {MouseEvent} */ (/** @type {any} */ (event)));
		}
		// Allow arrow keys, Home, End, and Escape to bubble up for menu navigation
		// These keys should not be handled by the button, but by parent menu containers
	};
</script>

{#if isLink}
	<a
		{href}
		{target}
		{rel}
		{id}
		{style}
		{role}
		{title}
		use:tooltip
		class="{classes} {isActive ? 'active' : ''} {isRound ? 'round' : ''} {isSquare ? 'square' : ''} {isLarge ? 'large' : ''} {isFullWidth
			? 'full-width'
			: ''} {hasNoFocusClass ? 'no-focus' : ''}"
		tabindex={isDisabled ? -1 : role === 'menuitem' ? -1 : 0}
		aria-disabled={isDisabled ? 'true' : undefined}
		aria-label={ariaLabel}
		onclick={(e) => {
			if (isDisabled) {
				e.preventDefault();
				return;
			}
			if (handleClick) {
				handleClick(e);
			}
		}}
		onmousedown={handleMouseDown}
		onfocus={(e) => handleFocus(e)}
	>
		{#if children}
			{@render children()}
		{:else if label}
			{label}
		{:else}
			NO LABEL
		{/if}
	</a>
{:else}
	<button
		bind:this={buttonElement}
		use:tooltip
		tabindex={role === 'menuitem' ? -1 : 0}
		{id}
		{type}
		{style}
		{role}
		{title}
		class="{classes} {isActive ? 'active' : ''} {isRound ? 'round' : ''} {isSquare ? 'square' : ''} {isLarge ? 'large' : ''} {isFullWidth
			? 'full-width'
			: ''} {hasNoFocusClass ? 'no-focus' : ''}"
		onclick={(e) => buttonClick(e)}
		onkeydown={(e) => handleKeyDown(e)}
		onmousedown={handleMouseDown}
		onfocus={(e) => handleFocus(e)}
		disabled={isDisabled}
		aria-label={ariaLabel}
		aria-pressed={ariaPressed}
		aria-expanded={ariaExpanded}
		aria-haspopup={ariaHaspopup}
		popovertarget={popovertarget}
	>
		{#if children}
			{@render children()}
		{:else if label}
			{label}
		{:else}
			NO LABEL
		{/if}
	</button>
{/if}

<style>
	/* ============================================
	   BASE BUTTON/LINK STYLES
	   ============================================ */
	button,
	a {
		display: flex;
		justify-content: center;
		align-items: center;
		white-space: nowrap;
		border-radius: 0.3rem;
		height: 2.8rem;
		min-width: 4.8rem;
		padding: 0rem 0.6rem;
		border: none;
		outline: 0;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--white);
		background-color: transparent;
		text-decoration: none;
		cursor: pointer;
	}

	/* Link-specific: disabled state */
	a[aria-disabled='true'] {
		opacity: 0.55;
		pointer-events: none;
		cursor: not-allowed;
	}

	/* ============================================
	   SIZE VARIANTS
	   ============================================ */
	button.large,
	a.large {
		height: 4.4rem;
		padding: 0rem 1.2rem;
		font-size: 2rem;
	}

	button.round,
	a.round {
		border-radius: 50%;
		min-width: 2.8rem;
		width: 2.8rem;
		padding: 0rem;
	}

	button.round.large,
	a.round.large {
		min-width: 3rem;
		width: 3rem;
		height: 3rem;
	}

	button.square,
	a.square {
		min-width: 2.8rem;
		width: 2.8rem;
		padding: 0rem;
	}

	button.full-width,
	a.full-width {
		width: 100%;
	}

	/* ============================================
	   LAYOUT MODIFIERS
	   ============================================ */
	button.justify-content-left,
	a.justify-content-left {
		justify-content: left;
	}

	/* ============================================
	   COLOR THEMES - Primary Buttons
	   ============================================ */
	button.blue,
	a.blue {
		border-color: var(--blue);
		background-color: var(--blue);
	}

	button.blue :global(.icon path),
	a.blue :global(.icon path) {
		fill: var(--white);
	}

	button.blue:disabled :global(.icon),
	a.blue[aria-disabled='true'] :global(.icon) {
		opacity: 0.85;
	}

	button.gray,
	a.gray {
		border-color: var(--gray-400);
		background-color: var(--gray-400);
	}

	button.gray :global(.icon path),
	a.gray :global(.icon path) {
		fill: var(--white);
	}

	button.gray:disabled :global(.icon),
	a.gray[aria-disabled='true'] :global(.icon) {
		opacity: 0.85;
	}

	button.red,
	a.red {
		border-color: var(--red);
		background-color: var(--red);
	}

	button.red :global(.icon path),
	a.red :global(.icon path) {
		fill: var(--white);
	}

	button.red:disabled :global(.icon),
	a.red[aria-disabled='true'] :global(.icon) {
		opacity: 0.85;
	}

	/* ============================================
	   CONTEXT VARIANTS - Passage Toolbar
	   ============================================ */
	button.passage-toolbar,
	a.passage-toolbar {
		background-color: var(--gray-light);
	}

	button.passage-toolbar :global(.icon path),
	a.passage-toolbar :global(.icon path) {
		fill: var(--gray-darker);
	}

	button.passage-toolbar.active:enabled,
	a.passage-toolbar.active {
		background-color: var(--gray-dark);
		color: var(--white);
	}

	button.passage-toolbar.active:enabled :global(.icon path),
	a.passage-toolbar.active :global(.icon path) {
		fill: var(--white);
	}

	/* ============================================
	   CONTEXT VARIANTS - Toolbar
	   ============================================ */
	button.toolbar-dark,
	a.toolbar-dark {
		background-color: var(--gray-400);
		margin: 0rem 0.3rem;
	}

	button.toolbar-dark :global(.icon path),
	a.toolbar-dark :global(.icon path) {
		fill: var(--white);
	}

	button.toolbar-dark.active:enabled,
	a.toolbar-dark.active {
		background-color: var(--gray-800);
		color: var(--gray-200);
	}

	button.toolbar-dark.active:enabled :global(.icon path),
	a.toolbar-dark.active :global(.icon path) {
		fill: var(--gray-200);
	}

	/* ============================================
	   CONTEXT VARIANTS - Menu
	   ============================================ */
	button.menu-light:enabled {
		color: var(--black);
		background-color: transparent;
		border: none;
		text-decoration: none;
		height: 2.8rem;
		margin: 0rem;
		justify-content: left;
	}

	button.menu-light:enabled :global(.icon path) {
		fill: var(--gray-200);
	}

	button.menu-light:enabled :global(.icon.blank path) {
		fill: transparent;
	}

	/* Menu Icon Fill Colors - Enabled */
	button:enabled.icon-fill-red :global(.icon path) {
		fill: var(--red-light);
		stroke: var(--red-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-orange :global(.icon path) {
		fill: var(--orange-light);
		stroke: var(--orange-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-yellow :global(.icon path) {
		fill: var(--yellow-light);
		stroke: var(--yellow-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-green :global(.icon path) {
		fill: var(--green-light);
		stroke: var(--green-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-aqua :global(.icon path) {
		fill: var(--aqua-light);
		stroke: var(--aqua-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-blue :global(.icon path) {
		fill: var(--blue-light);
		stroke: var(--blue-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-purple :global(.icon path) {
		fill: var(--purple-light);
		stroke: var(--purple-dark);
		stroke-width: 0.15rem;
	}

	button:enabled.icon-fill-pink :global(.icon path) {
		fill: var(--pink-light);
		stroke: var(--pink-dark);
		stroke-width: 0.15rem;
	}

	/* Menu Hover/Focus States */
	button.menu-light:enabled:hover,
	button.menu-light:enabled:focus-visible {
		outline: none;
		color: var(--white);
		background-color: var(--blue);
	}

	button.menu-light:enabled:hover :global(.icon path),
	button.menu-light:enabled:focus-visible :global(.icon path) {
		fill: var(--white);
	}

	button.menu-light:enabled:hover :global(.icon.blank path),
	button.menu-light:enabled:focus-visible :global(.icon.blank path) {
		fill: transparent;
	}

	/* Menu Icon Fill Colors - Hover/Focus */
	button.menu-light:enabled:hover.icon-fill-red :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-red :global(.icon path) {
		fill: var(--red-light);
	}

	button.menu-light:enabled:hover.icon-fill-orange :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-orange :global(.icon path) {
		fill: var(--orange-light);
	}

	button.menu-light:enabled:hover.icon-fill-yellow :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-yellow :global(.icon path) {
		fill: var(--yellow-light);
	}

	button.menu-light:enabled:hover.icon-fill-green :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-green :global(.icon path) {
		fill: var(--green-light);
	}

	button.menu-light:enabled:hover.icon-fill-aqua :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-aqua :global(.icon path) {
		fill: var(--aqua-light);
	}

	button.menu-light:enabled:hover.icon-fill-blue :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-blue :global(.icon path) {
		fill: var(--blue-light);
	}

	button.menu-light:enabled:hover.icon-fill-purple :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-purple :global(.icon path) {
		fill: var(--purple-light);
	}

	button.menu-light:enabled:hover.icon-fill-pink :global(.icon path),
	button.menu-light:enabled:focus-visible.icon-fill-pink :global(.icon path) {
		fill: var(--pink-light);
	}

	/* Menu Disabled State */
	button.menu-light:disabled {
		color: var(--black);
		opacity: 0.55;
	}

	button.menu-light:disabled :global(.icon path) {
		fill: var(--gray-200);
	}

	button.menu-light:disabled.icon-fill-red :global(.icon path),
	button.menu-light:disabled.icon-fill-orange :global(.icon path),
	button.menu-light:disabled.icon-fill-yellow :global(.icon path),
	button.menu-light:disabled.icon-fill-green :global(.icon path),
	button.menu-light:disabled.icon-fill-aqua :global(.icon path),
	button.menu-light:disabled.icon-fill-blue :global(.icon path),
	button.menu-light:disabled.icon-fill-purple :global(.icon path),
	button.menu-light:disabled.icon-fill-pink :global(.icon path) {
		fill: var(--gray-700);
		stroke: var(--gray-200);
	}

	/* ============================================
	   STATE MODIFIERS
	   ============================================ */
	button:disabled {
		opacity: 0.55;
	}

	/* ============================================
	   FOCUS STYLES (Keyboard Navigation)
	   ============================================ */
	button:focus-visible,
	a:focus-visible {
		outline: 0.1rem solid var(--blue);
		outline-offset: 0.2rem;
	}

	button.toolbar-dark:focus-visible,
	a.toolbar-dark:focus-visible {
		outline: 0.2rem solid var(--gray-800);
		outline-offset: 0.1rem;
	}

	button.blue:focus-visible,
	a.blue:focus-visible {
		outline: 0.2rem solid var(--blue);
	}

	button.gray:focus-visible,
	a.gray:focus-visible {
		outline: 0.2rem solid var(--gray-400);
	}

	button.red:focus-visible,
	a.red:focus-visible {
		outline: 0.2rem solid var(--red);
	}

	/* Remove outline when no-focus class is present - must be last to override other focus styles */
	button.no-focus:focus-visible,
	a.no-focus:focus-visible {
		outline: none;
	}
</style>
