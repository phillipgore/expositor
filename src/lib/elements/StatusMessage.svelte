<script>
	let { children } = $props();
</script>

<div class="status-message">
	{@render children()}
</div>

<style>
	.status-message {
		margin-top: 2.7rem;
		text-align: center;
		color: var(--gray-400);
	}
</style>
