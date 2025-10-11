<script>
	import { v4 as uuidv4 } from 'uuid';

	/**
	 * # Button Component
	 * 
	 * Core button component providing base functionality for all button types.
	 * Handles click events, navigation, keyboard interaction, and accessibility.
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
	 * - `system-blue` (default) - Primary blue button
	 * - `system-gray` - Secondary gray button
	 * - `system-red` - Destructive red button
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
	 * <Button label="Go to page" url="/page" classes="system-blue" />
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
	 * @property {string} [classes='system-blue'] - Style classes. Available: system-blue, system-gray, system-red, toolbar-dark, menu-light
	 * @property {string} [url] - URL to navigate to on click. Uses window.location.href
	 * @property {(event?: MouseEvent) => void} [handleClick] - Click event handler. Receives MouseEvent for access to target, modifiers, etc.
	 * @property {string} [label] - Button text label. Ignored if children snippet provided
	 * @property {boolean} [isDisabled=false] - Whether button is disabled. Prevents all interaction
	 * @property {boolean} [isFullWidth=false] - Whether button stretches to full container width
	 * @property {boolean} [isRound=false] - Whether button is circular. Useful for icon-only buttons
	 * @property {ButtonType} [type='button'] - HTML button type attribute. Use 'submit' for forms
	 * @property {boolean} [isActive=false] - Active state. Applies 'active' class for visual feedback
	 * @property {string} [ariaLabel] - Accessible label for screen readers. Required if no visible label
	 * @property {'true' | 'false' | 'mixed'} [ariaPressed] - ARIA pressed state for toggle buttons
	 * @property {'true' | 'false'} [ariaExpanded] - ARIA expanded state for disclosure buttons
	 * @property {'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog'} [ariaHaspopup] - ARIA haspopup indicator for buttons that open popups
	 * @property {string} [popovertarget] - ID of the popover element to control (CSS Popover API)
	 * @property {string} [style] - Inline CSS styles for the button element
	 * @property {string} [role] - ARIA role attribute (e.g., 'menuitem' for menu items)
	 * @property {import('svelte').Snippet} [children] - Snippet for custom button content. Takes precedence over label
	 */

	/** @type {ButtonProps} */
	let {
		id = uuidv4(),
		classes = 'system-blue',
		url,
		handleClick,
		label,
		isDisabled,
		isFullWidth,
		isRound,
		type = 'button',
		isActive = false,
		ariaLabel,
		ariaPressed,
		ariaExpanded,
		ariaHaspopup,
		popovertarget,
		style,
		role,
		children
	} = $props();

	/**
	 * @param {MouseEvent} event
	 */
	const buttonClick = (event) => {
		// For menu buttons, focus first item after popover opens
		if (popovertarget) {
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
		}
		
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
		// For buttons with popovertarget, let browser handle Enter/Space natively
		if (popovertarget && (event.key === 'Enter' || event.key === ' ')) {
			// Don't preventDefault - let the browser open the popover
			// Trigger focus on first menu item after popover opens
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

<button
	tabindex={role === 'menuitem' ? -1 : 0}
	{id}
	{type}
	{style}
	{role}
	class="{classes} {isActive ? 'active' : ''} {isRound ? 'round' : ''} {isFullWidth
		? 'full-width'
		: ''}"
	onclick={(e) => buttonClick(e)}
	onkeydown={(e) => handleKeyDown(e)}
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

<style>
	button {
		display: flex;
		justify-content: center;
		align-items: center;
		white-space: nowrap;
		border-radius: 0.3rem;
		height: 2.6rem;
		min-width: 4.8rem;
		padding: 0rem 0.6rem;
		border: none;
		outline: 0;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--white);
		background-color: transparent;
		text-decoration: none;

		/* Focus styles for keyboard navigation */
		&:focus-visible {
			outline: 0.1rem solid var(--blue);
			outline-offset: 0.2rem;
		}

		&.round {
			border-radius: 50%;
			min-width: 2.6rem;
			width: 2.6rem;
			padding: 0rem;

			&.large {
				min-width: 3rem;
				width: 3rem;
				height: 3rem;
			}
		}

		&.justify-content-left {
			justify-content: left;
		}

		&.full-width {
			width: 100%;
		}

		&.toolbar-dark {
			border: 0.1rem solid;
			border-color: var(--gray-200);
			background-color: var(--gray-400);
			margin: 0rem 0.2rem;

			&:focus-visible {
				outline: 0.2rem solid var(--gray-800);
			}

			&.active:enabled {
				background-color: var(--gray-800);
				color: var(--gray-200);

				:global(.icon path) {
					fill: var(--gray-200);
				}
			}

			:global(.icon path) {
				fill: var(--white);
			}
		}

		&.menu-light:enabled {
			color: var(--black);
			background-color: transparent;
			border: none;
			text-decoration: none;
			height: 2.6rem;
			margin: 0rem;
			justify-content: left;

			:global(.icon path) {
				fill: var(--gray-200);
			}

			&.icon-fill-red :global(.icon path) {
				fill: var(--red-light);
				stroke: var(--red-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-orange :global(.icon path) {
				fill: var(--orange-light);
				stroke: var(--orange-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-yellow :global(.icon path) {
				fill: var(--yellow-light);
				stroke: var(--yellow-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-green :global(.icon path) {
				fill: var(--green-light);
				stroke: var(--green-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-aqua :global(.icon path) {
				fill: var(--aqua-light);
				stroke: var(--aqua-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-blue :global(.icon path) {
				fill: var(--blue-light);
				stroke: var(--blue-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-purple :global(.icon path) {
				fill: var(--purple-light);
				stroke: var(--purple-dark);
				stroke-width: 0.15rem;
			}
			&.icon-fill-pink :global(.icon path) {
				fill: var(--pink-light);
				stroke: var(--pink-dark);
				stroke-width: 0.15rem;
			}

			:global(.icon.blank path) {
				fill: transparent;
			}

			&:hover, &:focus-visible {
				outline: none;
				color: var(--white);
				background-color: var(--blue);

				:global(.icon path) {
					fill: var(--white);
				}

				:global(.icon.blank path) {
					fill: transparent;
				}

				&.icon-fill-red :global(.icon path) {
					fill: var(--red-light);
				}
				&.icon-fill-orange :global(.icon path) {
					fill: var(--orange-light);
				}
				&.icon-fill-yellow :global(.icon path) {
					fill: var(--yellow-light);
				}
				&.icon-fill-green :global(.icon path) {
					fill: var(--green-light);
				}
				&.icon-fill-aqua :global(.icon path) {
					fill: var(--aqua-light);
				}
				&.icon-fill-blue :global(.icon path) {
					fill: var(--blue-light);
				}
				&.icon-fill-purple :global(.icon path) {
					fill: var(--purple-light);
				}
				&.icon-fill-pink :global(.icon path) {
					fill: var(--pink-light);
				}
			}
		}

		&.menu-light:disabled {
			color: var(--black);
			opacity: 0.55;

			:global(.icon path) {
				fill: var(--gray-200);
			}

			&.icon-fill-red :global(.icon path),
			&.icon-fill-orange :global(.icon path),
			&.icon-fill-yellow :global(.icon path),
			&.icon-fill-green :global(.icon path),
			&.icon-fill-aqua :global(.icon path),
			&.icon-fill-blue :global(.icon path),
			&.icon-fill-purple :global(.icon path),
			&.icon-fill-pink :global(.icon path) {
				fill: var(--gray-700);
				stroke: var(--gray-200);
			}
		}

		&.system-blue {
			border-color: var(--blue);
			background-color: var(--blue);

			&:focus-visible {
				outline: 0.2rem solid var(--orange);
			}

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&.system-gray {
			border-color: var(--gray-400);
			background-color: var(--gray-400);

			&:focus-visible {
				outline: 0.2rem solid var(--gray-400);
			}

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&.system-red {
			border-color: var(--red);
			background-color: var(--red);

			&:focus-visible {
				outline: 0.2rem solid var(--red);
			}

			:global(.icon path) {
				fill: var(--white);
			}

			&:disabled :global(.icon) {
				opacity: 0.85;
			}
		}

		&:disabled {
			opacity: 0.55;
		}
	}
</style>
