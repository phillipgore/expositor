<script>
	import ToolbarAuth from '$lib/components/ToolbarAuth.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import Icon from '$lib/elements/Icon.svelte';
</script>

<ToolbarAuth></ToolbarAuth>

<div class="wrapper">
	<div class="branding">
		<Icon iconId="book"></Icon>
		<Heading heading="h1" alignCenter>Expositor App</Heading>
	</div>
</div>

<style>
	.wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;

		.branding {
			display: flex;
			flex-direction: column;
			align-items: center;
			margin-bottom: 12rem;

			:global(.icon) {
				height: 6rem;
				max-width: initial;
				margin-bottom: 2.1rem;
				fill: var(--blue);
			}
		}
	}
</style>
