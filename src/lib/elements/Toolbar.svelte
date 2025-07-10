<script>
	let {
		classes = 'light border-bottom',
		position = 'static',
		top = 'auto',
		right = 'auto',
		bottom = 'auto',
		left = 'auto',
		zIndex = 'auto',
		children
	} = $props();
</script>

<header
	class={classes}
	style:position
	style:top
	style:right
	style:bottom
	style:left
	style:z-index={zIndex}
>
	{#if children}
		{@render children()}
	{/if}
</header>

<style>
	header {
		display: flex;
		align-items: center;
		margin: 0.0rem;
		padding: 0.0rem 0.9rem;
		min-height: 5rem;
		border: none;

		&.rounded {
			border-radius: 100vw;
		}

		&.bd-top {
			border-top: 0.1rem solid;
		}

		&.bd-bottom {
			border-bottom: 0.1rem solid;
		}

		&.dark {
			background-color: var(--gray-200);
			color: var(--white);
			border-color: var(--black);
		}

		&.light {
			background-color: var(--white);
			color: var(--gray-200);
			border-color: var(--gray-700);
		}
	}
</style>
