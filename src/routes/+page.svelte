<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import ToolbarAuth from '$lib/components/ToolbarAuth.svelte';
	import Icon from '$lib/elements/Icon.svelte';
	import Heading from '$lib/elements/Heading.svelte';
</script>

<ToolbarAuth></ToolbarAuth>

<div class="branding-container">
	<div class="branding" role="img" aria-label="Expositor App Logo">
		<Icon iconId="book" isActive={false} classes=""></Icon>
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
				height: 6rem;
				max-width: initial;
				margin-bottom: 2.1rem;
				fill: var(--gray-700);
			}
		}
	}
</style>
