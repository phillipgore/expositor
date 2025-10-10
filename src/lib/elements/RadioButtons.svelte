<script>
	import Label from './Label.svelte';

	// RadioButtonProperties: id, value, text, isChecked, isDisabled
	let { RadioButtonProperties, name, isInline, isDisabled, handleChange } = $props();

	let checkedValue = $state();

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
