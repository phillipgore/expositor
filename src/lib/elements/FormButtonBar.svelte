<script>
	let { children, marginTop = false } = $props();
</script>

<div class="button-bar">
	{@render children()}
</div>

<style>
	.button-bar {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}
</style>
