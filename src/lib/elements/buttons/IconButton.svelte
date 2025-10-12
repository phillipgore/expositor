<script>
	import Button from './Button.svelte';
	import Icon from '../Icon.svelte';

	/**
	 * # IconButton Component
	 * 
	 * Button component with integrated icon support. Extends Button with icon display,
	 * optional labels, keyboard shortcuts, and grouped button functionality.
	 * 
	 * ## Features
	 * - Icon display with automatic spacing
	 * - Optional text label (left or right of icon)
	 * - Under-label support for toolbar buttons
	 * - Keyboard shortcut hints
	 * - Grouped button support with active state
	 * - All Button features (click handling, navigation, accessibility)
	 * 
	 * ## Common Use Cases
	 * 
	 * Toolbar button with under-label:
	 * ```svelte
	 * <IconButton 
	 *   iconId="home" 
	 *   underLabel="Home"
	 *   underLabelClasses="light"
	 *   classes="toolbar-dark"
	 *   url="/home"
	 * />
	 * ```
	 * 
	 * Menu item with shortcut:
	 * ```svelte
	 * <IconButton 
	 *   iconId="account" 
	 *   label="Account Settings"
	 *   shortcut="⌘S"
	 *   classes="menu-light"
	 *   handleClick={openSettings}
	 * />
	 * ```
	 * 
	 * Grouped button (managed by ButtonGrouped):
	 * ```svelte
	 * <IconButton 
	 *   id="analyze"
	 *   iconId="structure" 
	 *   classes="toolbar-dark grouped"
	 *   groupedIsActive={handleSelection}
	 *   isActive={true}
	 * />
	 * ```
	 * 
	 * Icon with label on left:
	 * ```svelte
	 * <IconButton 
	 *   iconId="power" 
	 *   label="Sign Out"
	 *   labelIsLeft={true}
	 *   classes="menu-light"
	 * />
	 * ```
	 * 
	 * @typedef {'button' | 'submit' | 'reset'} ButtonType
	 */

	/**
	 * @typedef {Object} IconButtonProps
	 * @property {string} [id] - Unique button identifier. Auto-generated if not provided
	 * @property {string} [classes='blue'] - Style classes (blue, toolbar-dark, menu-light, etc.)
	 * @property {string} [href] - URL for link navigation. Renders as <a> element
	 * @property {string} [target] - Link target attribute. Only used with href
	 * @property {string} [rel] - Link rel attribute. Only used with href
	 * @property {string} [url] - (Deprecated) URL to navigate to on click. Use href instead
	 * @property {(event?: MouseEvent) => void} [handleClick] - Click event handler with MouseEvent access
	 * @property {string} iconId - Icon identifier (required). Must match an icon in icons.json
	 * @property {string} [label] - Text label displayed next to icon
	 * @property {string} [underLabel] - Text displayed below button (for toolbar buttons)
	 * @property {string} [underLabelClasses] - CSS classes for under-label ('light' for white text)
	 * @property {boolean} [isDisabled=false] - Whether button is disabled
	 * @property {boolean} [isFullWidth=false] - Whether button stretches to full width
	 * @property {boolean} [isRound=false] - Whether button is circular (icon-only mode)
	 * @property {boolean} [isActive=false] - Active state for toggle/grouped buttons
	 * @property {ButtonType} [type='button'] - HTML button type
	 * @property {(target: HTMLButtonElement) => void} [groupedIsActive] - Callback for grouped button selection. Receives button element with id
	 * @property {string} [shortcut] - Keyboard shortcut hint (e.g., "⌘S", "Ctrl+A"). Supports HTML
	 * @property {string} [iconColor] - Reserved for icon color (use CSS classes like 'icon-fill-red' instead)
	 * @property {string} [iconStrokeColor] - Reserved for icon stroke (use CSS classes instead)
	 * @property {boolean} [labelIsLeft=false] - Display label before icon instead of after
	 * @property {string} [popovertarget] - ID of the popover element to control (CSS Popover API)
	 * @property {string} [popovertargetaction] - Popover action: 'toggle' | 'show' | 'hide'
	 * @property {string} [role] - ARIA role attribute (e.g., 'menuitem' for menu items)
	 * @property {string} [ariaLabel] - Accessible label for screen readers. Auto-derived from label or underLabel if not provided
	 */

	/** @type {IconButtonProps} */
	let {
		id,
		classes,
		href,
		target,
		rel,
		url,
		handleClick,
		iconId,
		label,
		underLabel,
		underLabelClasses,
		isDisabled,
		isFullWidth,
		isRound,
		isActive,
		type,
		groupedIsActive,
		shortcut,
		iconColor,
		iconStrokeColor,
		labelIsLeft,
		popovertarget,
		popovertargetaction,
		role,
		ariaLabel
	} = $props();

	// Derive icon classes based on whether label is present
	let iconClasses = $derived.by(() => {
		let iconSpace = label ? 'icon-space' : '';
		let blank = iconId === 'blank' ? 'blank' : '';
		return `${iconSpace} ${blank}`.trim();
	});

	/**
	 * Intelligently derive aria-label for accessibility
	 * Priority: explicit ariaLabel > visible label > underLabel
	 * If button has visible label, no aria-label needed (screen readers will read the visible text)
	 * If icon-only with underLabel, use underLabel as aria-label
	 * Otherwise, use explicit ariaLabel if provided
	 */
	let derivedAriaLabel = $derived.by(() => {
		// If explicit ariaLabel provided, use it
		if (ariaLabel) {
			return ariaLabel;
		}
		// If button has visible label, don't add aria-label (redundant)
		if (label) {
			return undefined;
		}
		// If icon-only with underLabel, use underLabel for accessibility
		if (underLabel) {
			return underLabel;
		}
		// No accessible text available
		return undefined;
	});

	/**
	 * Enhanced click handler for grouped buttons
	 * @param {MouseEvent} event
	 */
	const handleGroupedClick = (event) => {
		// Call groupedIsActive if provided (for grouped button selections)
		if (groupedIsActive && event.currentTarget instanceof HTMLButtonElement) {
			groupedIsActive(event.currentTarget);
		}
		// Also call regular handleClick if provided
		if (handleClick) {
			handleClick(event);
		}
	};
</script>

{#if underLabel}
	<div class="button-container">
		<div class="button-wrapper">
		<Button
			{id}
			{classes}
			{href}
			{target}
			{rel}
			{url}
			handleClick={handleGroupedClick}
			{isDisabled}
			{isFullWidth}
			{isRound}
			{isActive}
			{type}
			{role}
			{popovertarget}
			ariaLabel={derivedAriaLabel}
		>
				{#if labelIsLeft && label}
					<span class="label-left">{label}</span>
				{/if}
				<Icon 
					{iconId} 
					isActive={false} 
					classes={iconClasses}
				/>
				{#if !labelIsLeft && label}
					{label}
				{/if}
				{#if shortcut}
					<span class="shortcut">{@html shortcut}</span>
				{/if}
			</Button>
			<div class="button-under-label {underLabelClasses} {isDisabled ? 'disabled' : ''}">
				{underLabel}
			</div>
		</div>
	</div>
{:else}
	<Button
		{id}
		{classes}
		{href}
		{target}
		{rel}
		{url}
		handleClick={handleGroupedClick}
		{isDisabled}
		{isFullWidth}
		{isRound}
		{isActive}
		{type}
		{role}
		{popovertarget}
		ariaLabel={derivedAriaLabel}
	>
		{#if labelIsLeft && label}
			<span class="label-left">{label}</span>
		{/if}
		<Icon 
			{iconId} 
			isActive={false} 
			classes={iconClasses}
		/>
		{#if !labelIsLeft && label}
			{label}
		{/if}
		{#if shortcut}
			<span class="shortcut">{@html shortcut}</span>
		{/if}
	</Button>
{/if}

<style>
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
	}

	:global(.shortcut) {
		margin-left: auto;
		font-size: 1rem;
		opacity: 0.7;
		font-weight: 400;
	}

	:global(.label-left) {
		margin-right: 0.4rem;
	}
</style>
