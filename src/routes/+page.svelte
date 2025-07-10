<script>
	import Heading from '$lib/elements/Heading.svelte';
	import Icon from '$lib/elements/Icon.svelte';
</script>

<div class="branding-container">
	<div class="branding">
		<Icon iconId="book"></Icon>
		<Heading heading="h1" alignCenter>Expositor App</Heading>
	</div>
</div>

<style>
	.branding-container {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;

		.branding {
			display: flex;
			flex-direction: column;
			align-items: center;
			padding-bottom: 9.0rem;

			:global(.icon) {
				height: 6.0rem;
				max-width: initial;
				margin-bottom: 2.1rem;
				fill: var(--blue);
			}
		}
	}
</style>
