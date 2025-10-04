<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated, isLoading } from '$lib/stores/auth.js';
	import ToolbarAuth from '$lib/components/ToolbarAuth.svelte';
	import Icon from '$lib/elements/Icon.svelte';

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (!$isLoading) {
				if (authenticated) {
					goto('/new');
				} else {
					goto('/signin');
				}
			}
		});

		return unsubscribe;
	});
</script>

<ToolbarAuth></ToolbarAuth>

<div class="wrapper">
	<div class="branding">
		<Icon iconId="book" isActive={false} classes=""></Icon>
		<h1>Expositor App</h1>
		<p>Loading...</p>
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

			h1 {
				font-size: 4rem;
				margin: 0 0 0.5em;
				color: var(--black);
				text-align: center;
			}

			p {
				color: var(--gray-400);
				font-size: 1.4rem;
			}

			:global(.icon) {
				height: 6rem;
				max-width: initial;
				margin-bottom: 2.1rem;
				fill: var(--blue);
			}
		}
	}
</style>
