<script>
	import Icon from './Icon.svelte';

	/**
	 * # Select Component
	 * 
	 * Custom-styled dropdown select with icon arrows.
	 * Manages selection state internally and syncs with external value.
	 * 
	 * ## Features
	 * - Custom arrow styling (up/down carets)
	 * - Full-width mode
	 * - Disabled state
	 * - Focus state with blue highlight
	 * - Internal state management with external sync
	 * - Supports disabled individual options
	 * 
	 * ## Option Structure
	 * Each option in optionProperties should have:
	 * - `value`: Option value (string or number)
	 * - `text`: Display text
	 * - `isDisabled`: (optional) Disable this option
	 * - `isSelected`: (optional) Mark as initially selected
	 * 
	 * ## Usage Examples
	 * 
	 * Basic select:
	 * ```svelte
	 * <Select
	 *   id="book"
	 *   name="book"
	 *   optionProperties={[
	 *     { value: 'gen', text: 'Genesis', isSelected: true },
	 *     { value: 'exo', text: 'Exodus' }
	 *   ]}
	 *   isFullWidth
	 * />
	 * ```
	 * 
	 * With change handler:
	 * ```svelte
	 * <Select
	 *   id="chapter"
	 *   name="chapter"
	 *   optionProperties={chapterOptions}
	 *   selectedValue={selectedChapter}
	 *   handleChange={(e) => selectedChapter = e.currentTarget.value}
	 *   isFullWidth
	 * />
	 * ```
	 * 
	 * @typedef {Object} SelectOption
	 * @property {string | number} value - Option value
	 * @property {string} text - Display text
	 * @property {boolean} [isDisabled] - Disable this option
	 * @property {boolean} [isSelected] - Mark as initially selected
	 */

	/**
	 * @typedef {Object} SelectProps
	 * @property {string} id - Select identifier (required)
	 * @property {string} [classes=''] - Additional CSS classes
	 * @property {string} name - Select name for forms (required)
	 * @property {SelectOption[]} optionProperties - Array of option objects (required)
	 * @property {string | number} [selectedValue] - Controlled value for external state management
	 * @property {boolean} [isFullWidth=false] - Stretch to container width
	 * @property {boolean} [isDisabled=false] - Disable select
	 * @property {(event: Event) => void} [handleChange] - Change event handler
	 */

	/** @type {SelectProps} */
	let {
		id,
		classes = '',
		name,
		optionProperties,
		selectedValue,
		isFullWidth = false,
		isDisabled = false,
		handleChange
	} = $props();

	let internalSelectedValue = $state(selectedValue);

	// Sync internal state with external value or find initially selected option
	$effect(() => {
		internalSelectedValue =
			selectedValue ||
			optionProperties.find((optionProperty) => optionProperty.isSelected === true)?.value;
	});
</script>

<div class="select-container {isFullWidth ? 'full-width' : ''}">
	<select
		{name}
		{id}
		class={classes}
		disabled={isDisabled}
		bind:value={internalSelectedValue}
		onchange={handleChange}
	>
		{#each optionProperties as optionProperty}
			<option value={optionProperty.value} disabled={optionProperty.isDisabled}
				>{optionProperty.text}</option
			>
		{/each}
	</select>
	<div class="select-arrow {isDisabled ? 'disabled' : ''}">
		<Icon iconId="caret-up" classes="light"></Icon>
		<Icon iconId="caret-down" classes="light"></Icon>
	</div>
</div>

<style>
	.select-container {
		position: relative;
		display: inline-block;
		border-radius: 0.3rem;
		margin: 0rem 0rem -0.1rem;

		&.full-width {
			display: block;

			select {
				width: 100%;
			}
		}
	}

	select {
		appearance: none;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.3rem;
		height: 2.6rem;
		padding: 0rem 2.9rem 0rem 0.6rem;
		font-size: 1.4rem;
		color: var(--black);
		background-color: var(--white);

		&:focus {
			outline: none;
			border-color: var(--blue);
			box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
		}

		&:disabled {
			background-color: var(--gray-900);
			color: var(--gray-500);
		}
	}

	.select-arrow {
		content: '';
		position: absolute;
		width: 1.8rem;
		height: 1.8rem;
		background-color: var(--blue);
		top: 0;
		right: 0;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.2rem;
		margin: 0.4rem;
		border-radius: 0.3rem;
		pointer-events: none;

		:global(.icon) {
			overflow: hidden;
		}

		&.disabled {
			opacity: 0.55;

			:global(.icon) {
				opacity: 0.85;
			}
		}
	}
</style>
