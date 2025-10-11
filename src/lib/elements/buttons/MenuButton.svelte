<script>
	import Button from './Button.svelte';
	import Icon from '../Icon.svelte';
	import MenuRegistratrion from '$lib/components/MenuRegistratrion.svelte';

	/**
	 * # MenuButton Component
	 * 
	 * Button that opens a dropdown menu. Manages menu open/close state, positioning,
	 * and handles outside clicks to close the menu. Integrates with MenuRegistration
	 * for menu content management.
	 * 
	 * ## Features
	 * - Automatic menu positioning below button
	 * - Click-outside-to-close functionality
	 * - Dynamic label updates from menu selections
	 * - Down caret icon indicator
	 * - Under-label support for toolbars
	 * - ARIA expanded state for accessibility
	 * - Prevents menu from closing immediately after opening
	 * 
	 * ## Menu Integration
	 * 
	 * The button integrates with the menu system via:
	 * - `menuId` - Links to corresponding menu component
	 * - `setButtonLabel` - Callback for menu to update button label
	 * - `closeMenu` - Callback for menu items to close menu after selection
	 * 
	 * ## Usage Examples
	 * 
	 * Basic menu button:
	 * ```svelte
	 * <MenuButton 
	 *   iconId="gear" 
	 *   label="Settings"
	 *   menuId="MenuSettings"
	 *   classes="menu-light"
	 * />
	 * ```
	 * 
	 * Toolbar menu with under-label:
	 * ```svelte
	 * <MenuButton 
	 *   iconId="paintbrush" 
	 *   underLabel="Color"
	 *   underLabelClasses="light"
	 *   menuId="MenuColor"
	 *   classes="toolbar-dark"
	 * />
	 * ```
	 * 
	 * Menu with dynamic label (e.g., zoom selector):
	 * ```svelte
	 * <MenuButton 
	 *   label="100%"
	 *   menuId="MenuZoom"
	 *   classes="toolbar-dark"
	 *   underLabel="Zoom"
	 *   underLabelClasses="light"
	 * />
	 * <!-- Menu items can call setButtonLabel to change "100%" to selected value -->
	 * ```
	 * 
	 * @typedef {'button' | 'submit' | 'reset'} ButtonType
	 */

	/**
	 * @typedef {Object} MenuButtonProps
	 * @property {string} [id] - Unique button identifier. Auto-generated if not provided
	 * @property {string} [classes='system-blue'] - Style classes (toolbar-dark, menu-light, etc.)
	 * @property {string} menuId - Menu component identifier (required). Must match a menu component's id
	 * @property {string} [iconId] - Icon identifier from icons.json. Displayed before label
	 * @property {string} [label] - Button text label. Can be updated by menu selections
	 * @property {string} [underLabel] - Text displayed below button (for toolbar buttons)
	 * @property {string} [underLabelClasses] - CSS classes for under-label ('light' for white text)
	 * @property {boolean} [isDisabled=false] - Whether button is disabled
	 * @property {boolean} [isFullWidth=false] - Whether button stretches to full width
	 * @property {boolean} [isRound=false] - Whether button is circular
	 * @property {ButtonType} [type='button'] - HTML button type attribute
	 */

	/** @type {MenuButtonProps} */
	let {
		id,
		classes,
		menuId,
		iconId,
		label,
		underLabel,
		underLabelClasses,
		isDisabled,
		isFullWidth,
		isRound,
		type
	} = $props();

	/** @type {number | undefined} */
	let buttonHeight = $state();
	/** @type {string | undefined} */
	let menuOffset = $state();
	/** @type {boolean} */
	let isMenuOpen = $state(false);

	// Derive icon classes based on whether label is present
	let iconClasses = $derived.by(() => {
		if (!iconId) return '';
		let iconSpace = label ? 'icon-space' : '';
		let blank = iconId === 'blank' ? 'blank' : '';
		return `${iconSpace} ${blank}`.trim();
	});

	let justOpened = $state(false);

	/**
	 * Handle menu button click
	 */
	const handleMenuToggle = () => {
		if (buttonHeight) {
			menuOffset = `${(buttonHeight + 3) / 10}rem`;
		}
		
		// If opening, set flag to prevent immediate close
		if (!isMenuOpen) {
			justOpened = true;
			setTimeout(() => {
				justOpened = false;
			}, 100);
		}
		
		isMenuOpen = !isMenuOpen;
	};

	/**
	 * Handle window clicks to close menu
	 * @param {MouseEvent} event
	 */
	const windowClick = (event) => {
		if (!isMenuOpen || justOpened) return;

		// Check if click is on this specific button or inside this specific menu
		if (event.target instanceof HTMLElement) {
			const clickedElement = event.target;
			// Check if the click is on this button or inside this menu's content
			const isThisButton = clickedElement.closest(`#${id}`);
			const isInsideThisMenu = clickedElement.closest('.menu');
			
			// Close if click is not on this button and not inside this menu
			if (!isThisButton && !isInsideThisMenu) {
				isMenuOpen = false;
			}
		}
	};

	/**
	 * Updates the button label (called by MenuRegistration)
	 * @param {string} newLabel
	 */
	const setLabel = (newLabel) => {
		label = newLabel;
	};

	/**
	 * Closes the menu (called by menu items when clicked)
	 */
	const closeMenu = () => {
		isMenuOpen = false;
	};
</script>

<svelte:window onclick={windowClick} />

<!-- Wrapper for menu dropdowns -->
{#snippet menuWrapper()}
	<span class="menu-wrapper" bind:offsetHeight={buttonHeight}>
		<Button
			{id}
			{classes}
			handleClick={handleMenuToggle}
			{isDisabled}
			{isFullWidth}
			{isRound}
			{type}
			isActive={isMenuOpen}
			ariaExpanded={isMenuOpen ? 'true' : 'false'}
			ariaHaspopup="true"
		>
			{#if iconId}
				<Icon {iconId} isActive={isMenuOpen} classes={iconClasses} />
			{/if}
			{#if label}
				{label}
			{/if}
			<Icon iconId="caret-down" isActive={isMenuOpen} classes="menu-caret" />
		</Button>
		<MenuRegistratrion {menuId} isActive={isMenuOpen} {menuOffset} setButtonLabel={setLabel} {closeMenu} />
	</span>
{/snippet}

{#if underLabel}
	<div class="button-container">
		<div class="button-wrapper">
			{@render menuWrapper()}
			<div class="button-under-label {underLabelClasses} {isDisabled ? 'disabled' : ''}">
				{underLabel}
			</div>
		</div>
	</div>
{:else}
	{@render menuWrapper()}
{/if}

<style>
	.menu-wrapper {
		display: flex;
		flex-direction: column;
	}

	.button-container {
		display: inline-block;

		.button-wrapper {
			display: flex;
			flex-direction: column;
			position: relative;
		}

		.button-under-label {
			text-align: center;
			font-size: 1.1rem;
			letter-spacing: 0.04rem;
			cursor: default;
			padding: 0rem 0.4rem;
			z-index: 5;
			display: block;
			margin-top: 0.3rem;
			font-weight: 400;
			color: var(--black);

			&.light {
				color: var(--white);
			}

			&.disabled {
				opacity: 0.65;
			}
		}

		.menu-wrapper {
			display: flex;
			flex-direction: column;
		}
	}
</style>
