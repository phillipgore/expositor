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
	 * - `title`: (optional) Tooltip text
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
	 * @property {string} [title] - Tooltip text for the radio button
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
	let radioRefs = $state([]);

	// Find and set initially checked value
	$effect(() => {
		checkedValue = RadioButtonProperties.find(
			(buttonProperty) => buttonProperty.isChecked === true
		)?.value;
	});

	/**
	 * Handle keyboard navigation for radio button groups
	 * @param {KeyboardEvent} event
	 * @param {number} currentIndex
	 */
	function handleKeydown(event, currentIndex) {
		const enabledButtons = RadioButtonProperties.map((prop, idx) => ({ ...prop, idx })).filter(
			(prop) => !isDisabled && !prop.isDisabled
		);

		if (enabledButtons.length === 0) return;

		let targetIndex = -1;

		switch (event.key) {
			case 'ArrowDown':
			case 'ArrowRight':
				event.preventDefault();
				// Find next enabled button
				for (let i = currentIndex + 1; i < RadioButtonProperties.length; i++) {
					if (!RadioButtonProperties[i].isDisabled) {
						targetIndex = i;
						break;
					}
				}
				// Wrap to first if at end
				if (targetIndex === -1) {
					for (let i = 0; i < RadioButtonProperties.length; i++) {
						if (!RadioButtonProperties[i].isDisabled) {
							targetIndex = i;
							break;
						}
					}
				}
				break;

			case 'ArrowUp':
			case 'ArrowLeft':
				event.preventDefault();
				// Find previous enabled button
				for (let i = currentIndex - 1; i >= 0; i--) {
					if (!RadioButtonProperties[i].isDisabled) {
						targetIndex = i;
						break;
					}
				}
				// Wrap to last if at beginning
				if (targetIndex === -1) {
					for (let i = RadioButtonProperties.length - 1; i >= 0; i--) {
						if (!RadioButtonProperties[i].isDisabled) {
							targetIndex = i;
							break;
						}
					}
				}
				break;
		}

		// Update checked value and focus
		if (targetIndex !== -1) {
			checkedValue = RadioButtonProperties[targetIndex].value;
			radioRefs[targetIndex]?.focus();
			// Trigger change handler if provided
			if (handleChange) {
				const syntheticEvent = new Event('change', { bubbles: true });
				Object.defineProperty(syntheticEvent, 'currentTarget', {
					writable: false,
					value: radioRefs[targetIndex]
				});
				handleChange(syntheticEvent);
			}
		}
	}

	/**
	 * Determine tabindex for each radio button
	 * Only the checked button (or first if none checked) should be tabbable
	 * @param {number} index
	 * @returns {number}
	 */
	function getTabIndex(index) {
		if (isDisabled || RadioButtonProperties[index].isDisabled) return -1;
		
		// If a button is checked, only that button should be tabbable
		if (checkedValue) {
			return RadioButtonProperties[index].value === checkedValue ? 0 : -1;
		}
		
		// If no button is checked, first enabled button should be tabbable
		const firstEnabledIndex = RadioButtonProperties.findIndex(prop => !prop.isDisabled);
		return index === firstEnabledIndex ? 0 : -1;
	}
</script>

<div class="radio-buttons-container {isInline ? 'inline' : ''}">
	{#each RadioButtonProperties as buttonProperty, index}
		<div class="button-container {isDisabled ? 'disabled' : ''}">
			<input
				bind:this={radioRefs[index]}
				type="radio"
				id={buttonProperty.id}
				{name}
				value={buttonProperty.value}
				disabled={isDisabled || buttonProperty.isDisabled}
				tabindex={getTabIndex(index)}
				bind:group={checkedValue}
				onchange={handleChange}
				onkeydown={(e) => handleKeydown(e, index)}
				title={buttonProperty.title || ''}
			/>
			<Label 
				forId={buttonProperty.id} 
				text={buttonProperty.text} 
				classes="dark" 
				isInline
				title={buttonProperty.title || ''}
			></Label>
		</div>
	{/each}
</div>

<style>
	.radio-buttons-container {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.8rem;

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

		&:focus,
		&:focus-visible {
			/* outline: 0.1rem solid var(--blue);
			outline-offset: 0.2rem; */
			box-shadow: 0rem 0rem 0.0rem 0.0rem;
		}
	}
</style>
