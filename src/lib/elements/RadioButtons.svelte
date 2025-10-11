<script>
	import Label from './Label.svelte';

	/**
	 * # RadioButtons Component
	 * 
	 * Group of radio button inputs with labels and automatic state management.
	 * Handles selection state internally and syncs with external properties.
	 * 
	 * ## Features
	 * - Vertical or horizontal (inline) layout
	 * - Automatic checked state management
	 * - Group-level disabled state
	 * - Blue accent color for selections
	 * - Associated labels for accessibility
	 * - Change event handling
	 * 
	 * ## Radio Button Structure
	 * Each radio button in RadioButtonProperties should have:
	 * - `id`: Unique button identifier
	 * - `value`: Radio button value
	 * - `text`: Label text
	 * - `isChecked`: Initial checked state
	 * - `isDisabled`: (optional) Individual button disabled state
	 * 
	 * ## Usage Examples
	 * 
	 * Vertical radio buttons:
	 * ```svelte
	 * <RadioButtons
	 *   RadioButtonProperties={[
	 *     { id: 'option1', value: 'opt1', text: 'Option 1', isChecked: true },
	 *     { id: 'option2', value: 'opt2', text: 'Option 2', isChecked: false }
	 *   ]}
	 *   name="choice"
	 * />
	 * ```
	 * 
	 * Inline radio buttons:
	 * ```svelte
	 * <RadioButtons
	 *   RadioButtonProperties={testamentOptions}
	 *   name="testament"
	 *   isInline
	 * />
	 * ```
	 * 
	 * With change handler:
	 * ```svelte
	 * <RadioButtons
	 *   RadioButtonProperties={options}
	 *   name="selection"
	 *   handleChange={(e) => console.log('Selected:', e.currentTarget.value)}
	 * />
	 * ```
	 * 
	 * @typedef {Object} RadioButtonProperty
	 * @property {string} id - Unique button identifier
	 * @property {string} value - Radio button value
	 * @property {string} text - Label text
	 * @property {boolean} isChecked - Initial checked state
	 * @property {boolean} [isDisabled] - Individual button disabled state
	 */

	/**
	 * @typedef {Object} RadioButtonsProps
	 * @property {RadioButtonProperty[]} RadioButtonProperties - Array of radio button configurations (required)
	 * @property {string} name - Radio group name for form association (required)
	 * @property {boolean} [isInline=false] - Display buttons horizontally instead of vertically
	 * @property {boolean} [isDisabled=false] - Disable all radio buttons in the group
	 * @property {(event: Event) => void} [handleChange] - Change event handler
	 */

	/** @type {RadioButtonsProps} */
	let { RadioButtonProperties, name, isInline = false, isDisabled = false, handleChange } = $props();

	let checkedValue = $state();

	// Find and set initially checked value
	$effect(() => {
		checkedValue = RadioButtonProperties.find(
			(buttonProperty) => buttonProperty.isChecked === true
		)?.value;
	});
</script>

<div class="radio-buttons-container {isInline ? 'inline' : ''}">
	{#each RadioButtonProperties as buttonProperty}
		<div class="button-container {isDisabled ? 'disabled' : ''}">
			<input
				type="radio"
				id={buttonProperty.id}
				{name}
				value={buttonProperty.value}
				disabled={isDisabled}
				bind:group={checkedValue}
				onchange={handleChange}
			/>
			<Label forId={buttonProperty.id} text={buttonProperty.text} classes="dark" isInline></Label>
		</div>
	{/each}
</div>

<style>
	.radio-buttons-container {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		height: 2.6rem;

		&.inline {
			flex-direction: row;
			gap: 1.8rem;
		}

		.button-container {
			display: flex;
			align-items: center;
			gap: 0.3rem;

			:global(label) {
				margin-bottom: 0rem;
			}

			&.disabled :global(label) {
				color: var(--gray-500);
			}
		}
	}

	input {
		accent-color: var(--blue);
	}
</style>
