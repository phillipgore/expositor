<script>
	import Icon from './Icon.svelte';

	// optionProperties: value, text, isDisabled, isSelected
	let {
		id,
		classes,
		name,
		optionProperties,
		selectedValue,
		isFullWidth,
		isDisabled,
		handleChange
	} = $props();

	let internalSelectedValue = $state(selectedValue);

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
			border-color: var(--system-blue);
			box-shadow: 0rem 0rem 0.6rem var(--system-blue-alpha);
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
		background-color: var(--system-blue);
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
