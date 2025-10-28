<script>
	import Heading from '$lib/componentElements/Heading.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
</script>

<div class="container">
	<Icon iconId="book" isActive={false}  classes=""></Icon>
	<Heading heading="h1" alignCenter>Expositor App</Heading>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;
	}

	.container :global(.icon) {
		margin-top: -15.5rem;
		height: 10.0rem;
		max-width: initial;
		margin-bottom: 2.7rem;
		fill: var(--gray-700);
	}
</style>
