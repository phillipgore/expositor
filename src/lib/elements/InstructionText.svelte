<script>
	let { children } = $props();
</script>

<div class="instructions">
	{@render children()}
</div>

<style>
	.instructions {
		color: var(--gray-500);
		line-height: 1.5;
		margin-bottom: 1.8rem;
	}

	.instructions :global(p) {
		margin: 0.0rem 0.0rem 0.9rem;
	}

	.instructions :global(ol) {
		margin: 0;
		padding-left: 2.4rem;
	}

	.instructions :global(li) {
		margin-bottom: 0.9rem;
	}
</style>
