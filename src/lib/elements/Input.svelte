<script>
	let { id, name, type = 'text', isFullWidth, isDisabled, isLarge, value = $bindable('') } = $props();
</script>

<input
	{id}
	{name}
	{type}
	bind:value
	class="{isFullWidth ? 'full-width' : ''} {isLarge ? 'large' : ''}"
	disabled={isDisabled}
/>

<style>
	input {
		appearance: none;
		border: solid 0.1rem var(--gray-700);
		border-radius: 0.3rem;
		height: 2.6rem;
		padding: 0rem 0.6rem 0rem 0.6rem;
		font-size: 1.4rem;
		color: var(--black);
		background-color: var(--white);

		&.full-width {
			width: 100%;
		}

		&.large {
			height: 4.4rem;
			padding: 0rem 1.2rem 0rem 1.2rem;
			font-size: 2rem;
		}

		&:focus {
			outline: none;
			border-color: var(--blue);
			box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
		}

		&:disabled {
			background-color: var(--gray-900);
		}
	}
</style>
