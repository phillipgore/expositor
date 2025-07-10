<script>
	let { spacingTop = '0.4rem', spacingBottom = '0.4rem' } = $props();
</script>

<div
	class="horizontal-divider"
	style="margin-top: {spacingTop}; padding-bottom: {spacingBottom}"
></div>

<style>
	.horizontal-divider {
		margin-top: 0.4rem;
		border-top: 0.1rem solid var(--gray-700);
		width: 100%;
	}
</style>
