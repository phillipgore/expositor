<script>
	import { fade } from 'svelte/transition';

	let { classes, menuElements, isActive, menuOffset, children } = $props();
</script>

{#if isActive}
	<div
		class="menu {classes}"
		style="top: {menuOffset}"
		in:fade={{ duration: 50 }}
		out:fade={{ duration: 100 }}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>
{/if}

<style>
	.menu {
		position: absolute;
		z-index: 100;
		border-radius: 0.3rem;
		overflow-y: scroll;
		padding: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		background-color: var(--gray-800);
		/* border: 0.1rem solid var(--gray-700); */
		display: flex;
		flex-direction: column;
		animation: fadeOut 600ms;
		-ms-overflow-style: none;
		scrollbar-width: none;
		margin: 0rem 0.2rem;

		&.menu-right {
			right: 0rem;
		}

		&::-webkit-scrollbar {
			display: none;
		}
	}
</style>
