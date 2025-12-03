<script>
	import IconButton from './IconButton.svelte';

	/**
	 * # ButtonGrouped Component
	 * 
	 * Container for mutually exclusive button groups where only one button can be
	 * active at a time (radio button pattern). Manages active state internally and
	 * provides visual grouping with border-radius adjustments.
	 * 
	 * ## Features
	 * - Automatic active state management
	 * - Only one button active at a time
	 * - Visual grouping with connected borders
	 * - Horizontal or vertical layout
	 * - Under-label support for all buttons
	 * - Change notifications via callback
	 * - Backward compatible with children snippet
	 * 
	 * ## Active State Management
	 * 
	 * The component tracks which button is active internally:
	 * - Initial active button set via `defaultActive` (or first button if not specified)
	 * - Clicking a button makes it active and deactivates others
	 * - `onActiveChange` callback receives button ID when selection changes
	 * - Parent can track active state but doesn't need to manage it
	 * 
	 * ## Visual Grouping
	 * 
	 * Buttons are visually connected:
	 * - First button: rounded left corners, straight right
	 * - Middle buttons: straight corners
	 * - Last button: straight left, rounded right corners
	 * - No gaps between buttons
	 * 
	 * ## Usage Examples
	 * 
	 * Basic grouped buttons:
	 * ```svelte
	 * <ButtonGrouped
	 *   buttons={[
	 *     { id: 'analyze', iconId: 'structure', label: 'Analyze' },
	 *     { id: 'document', iconId: 'document', label: 'Document' }
	 *   ]}
	 *   defaultActive="analyze"
	 *   buttonClasses="toolbar-dark"
	 *   underLabelClasses="light"
	 * />
	 * ```
	 * 
	 * With change notification:
	 * ```svelte
	 * <ButtonGrouped
	 *   buttons={viewModes}
	 *   defaultActive="grid"
	 *   onActiveChange={(buttonId) => {
	 *     console.log('View mode changed to:', buttonId);
	 *     updateViewMode(buttonId);
	 *   }}
	 *   buttonClasses="blue"
	 * />
	 * ```
	 * 
	 * Vertical list layout:
	 * ```svelte
	 * <ButtonGrouped
	 *   buttons={sortOptions}
	 *   isList={true}
	 *   buttonClasses="menu-light"
	 * />
	 * ```
	 * 
	 * Disabled group (all buttons disabled):
	 * ```svelte
	 * <ButtonGrouped
	 *   buttons={viewModes}
	 *   defaultActive="grid"
	 *   isDisabled={true}
	 *   buttonClasses="toolbar-dark"
	 *   underLabelClasses="light"
	 * />
	 * ```
	 * 
	 * @typedef {Object} GroupedButton
	 * @property {string} id - Button identifier (used for selection tracking)
	 * @property {string} iconId - Icon identifier from icons.json
	 * @property {string} label - Button label text (displayed as under-label)
	 */

	/**
	 * @typedef {Object} ButtonGroupedProps
	 * @property {GroupedButton[]} buttons - Array of button configurations. Each button must have unique id
	 * @property {string} [defaultActive] - ID of button that should be active initially. Defaults to first button
	 * @property {(buttonId: string) => void} [onActiveChange] - Callback when active button changes. Receives new active button's id
	 * @property {string} [buttonClasses=''] - CSS classes to apply to each button (e.g., 'toolbar-dark', 'menu-light')
	 * @property {string} [underLabelClasses=''] - CSS classes for button under-labels (e.g., 'light' for white text)
	 * @property {boolean} [isList=false] - Display buttons vertically instead of horizontally
	 * @property {boolean} [isDisabled=false] - Whether all buttons in the group are disabled
	 * @property {boolean} [isSquare=false] - Whether buttons are square
	 * @property {import('svelte').Snippet} [children] - Optional children for backward compatibility with old API
	 */

	/** @type {ButtonGroupedProps} */
	let {
		buttons,
		defaultActive,
		onActiveChange,
		buttonClasses = '',
		underLabelClasses = '',
		isList = false,
		isDisabled = false,
		isSquare = false,
		children
	} = $props();

	// Manage active state internally
	let activeButtonId = $state(defaultActive || (buttons && buttons[0]?.id));

	/**
	 * Handle button click
	 * @param {HTMLButtonElement} buttonElement
	 */
	const handleButtonClick = (buttonElement) => {
		const buttonId = buttonElement.id;
		if (buttonId && buttonId !== activeButtonId) {
			activeButtonId = buttonId;
			if (onActiveChange) {
				onActiveChange(buttonId);
			}
		}
	};
</script>

<div class="group-container">
	<div class="group-wrapper {isList ? 'list' : ''}">
		{#if children}
			<!-- Backward compatibility: render children if provided -->
			{@render children()}
		{:else if buttons}
			<!-- New API: render buttons from array -->
			{#each buttons as button}
				<IconButton
					id={button.id}
					classes="{buttonClasses} grouped"
					iconId={button.iconId}
					underLabelClasses={underLabelClasses}
					underLabel={button.label}
					groupedIsActive={handleButtonClick}
					isActive={activeButtonId === button.id}
					isDisabled={isDisabled}
					isSquare={isSquare}
				/>
			{/each}
		{/if}
	</div>
</div>

<style>
	.group-container {
		display: inline-block;
		margin: 0rem 0.3rem;

		.group-wrapper {
			display: flex;
			justify-content: center;
			align-items: center;
			height: auto;

			&.list {
				flex-direction: column;
			}

			&.list :global(button.grouped) {
				margin-top: 0rem;
				margin-bottom: 0rem;
				border-radius: 0rem;
				border: none;
			}

			&.list :global(button.grouped:first-child),
			&.list :global(.button-container:first-child button.grouped) {
				border-radius: 0.3rem 0.3rem 0rem 0rem;
			}

			&.list :global(button.grouped:last-child),
			&.list :global(.button-container:last-child button.grouped) {
				border-radius: 0rem 0rem 0.3rem 0.3rem;
				margin-top: 0rem;
				margin-bottom: 0rem;
			}

			&:not(.list) :global(button.grouped) {
				margin-right: 0rem;
				margin-left: 0rem;
				border-radius: 0rem;
				border-left: none;
			}

			&:not(.list) :global(button.grouped:first-child),
			&:not(.list) :global(.button-container:first-child button.grouped) {
				border-radius: 0.3rem 0rem 0rem 0.3rem;
				border-left: none;
				margin-right: 0rem;
			}

			&:not(.list) :global(button.grouped:last-child),
			&:not(.list) :global(.button-container:last-child button.grouped) {
				border-radius: 0rem 0.3rem 0.3rem 0rem;
				border-left: none;
				margin-left: 0rem;
			}
		}
	}
</style>
