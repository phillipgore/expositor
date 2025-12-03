<script>
	import Button from './Button.svelte';
	import Icon from '../Icon.svelte';

	/**
	 * # ToggleButton Component
	 * 
	 * Self-managing toggle button with automatic state tracking and visual feedback.
	 * Manages its own active/inactive state and notifies parent on changes.
	 * 
	 * ## Features
	 * - Automatic state management (tracks on/off internally)
	 * - Visual active state feedback
	 * - Optional icon display
	 * - Under-label support for toolbars
	 * - External state synchronization
	 * - ARIA pressed state for accessibility
	 * 
	 * ## State Management
	 * 
	 * The component manages its own state internally but can be controlled externally:
	 * - Initial state set via `isActive` prop
	 * - Internal state updates on click
	 * - `onToggle` callback receives new state
	 * - External changes to `isActive` sync to internal state
	 * 
	 * ## Usage Examples
	 * 
	 * Basic toggle:
	 * ```svelte
	 * <ToggleButton 
	 *   iconId="wide" 
	 *   label="Wide Mode"
	 *   onToggle={(isActive) => console.log('Wide mode:', isActive)}
	 * />
	 * ```
	 * 
	 * Toolbar toggle with under-label:
	 * ```svelte
	 * <ToggleButton 
	 *   iconId="outline" 
	 *   underLabel="Overview"
	 *   underLabelClasses="light"
	 *   classes="toolbar-dark"
	 *   isActive={showOverview}
	 *   onToggle={(active) => showOverview = active}
	 * />
	 * ```
	 * 
	 * Controlled toggle (external state):
	 * ```svelte
	 * <ToggleButton 
	 *   iconId="note" 
	 *   label="Notes"
	 *   isActive={notesVisible}
	 *   onToggle={(active) => {
	 *     notesVisible = active;
	 *     savePreference('notes', active);
	 *   }}
	 * />
	 * ```
	 * 
	 * @typedef {'button' | 'submit' | 'reset'} ButtonType
	 */

	/**
	 * @typedef {Object} ToggleButtonProps
	 * @property {string} [id] - Unique button identifier. Auto-generated if not provided
	 * @property {string} [classes='blue'] - Style classes (toolbar-dark recommended for toolbars)
	 * @property {(isActive: boolean) => void} [onToggle] - Callback when toggle state changes. Receives new boolean state
	 * @property {string} [iconId] - Icon identifier from icons.json. Icon changes opacity when active
	 * @property {string} [label] - Text label displayed next to icon
	 * @property {string} [underLabel] - Text displayed below button (for toolbar buttons)
	 * @property {string} [underLabelClasses] - CSS classes for under-label ('light' for white text)
	 * @property {boolean} [isDisabled=false] - Whether button is disabled
	 * @property {boolean} [isFullWidth=false] - Whether button stretches to full width
	 * @property {boolean} [isRound=false] - Whether button is circular
	 * @property {boolean} [isSquare=false] - Whether button is square
	 * @property {boolean} [isActive=false] - Initial active state. Can be updated externally to control the toggle
	 * @property {ButtonType} [type='button'] - HTML button type attribute
	 */

	/** @type {ToggleButtonProps} */
	let {
		id,
		classes,
		onToggle,
		iconId,
		label,
		underLabel,
		underLabelClasses,
		isDisabled,
		isFullWidth,
		isRound,
		isSquare,
		isActive = false,
		type
	} = $props();

	// Track internal toggle state
	let internalActive = $state(isActive);

	// Derive icon classes based on whether label is present
	let iconClasses = $derived.by(() => {
		if (!iconId) return '';
		let iconSpace = label ? 'icon-space' : '';
		let blank = iconId === 'blank' ? 'blank' : '';
		return `${iconSpace} ${blank}`.trim();
	});

	/**
	 * Handle toggle button click
	 */
	const handleToggle = () => {
		internalActive = !internalActive;
		if (onToggle) {
			onToggle(internalActive);
		}
	};

	// Sync external isActive changes to internal state
	$effect(() => {
		if (isActive !== undefined) {
			internalActive = isActive;
		}
	});
</script>

{#if underLabel}
	<div class="button-container">
		<div class="button-wrapper">
			<Button
				{id}
				{classes}
				handleClick={handleToggle}
				{isDisabled}
				{isFullWidth}
				{isRound}
				{isSquare}
				{type}
				isActive={internalActive}
				ariaPressed={internalActive ? 'true' : 'false'}
			>
				{#if iconId}
					<Icon {iconId} isActive={internalActive} classes={iconClasses} />
				{/if}
				{#if label}
					{label}
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
		handleClick={handleToggle}
		{isDisabled}
		{isFullWidth}
		{isRound}
		{isSquare}
		{type}
		isActive={internalActive}
		ariaPressed={internalActive ? 'true' : 'false'}
	>
		{#if iconId}
			<Icon {iconId} isActive={internalActive} classes={iconClasses} />
		{/if}
		{#if label}
			{label}
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
</style>
