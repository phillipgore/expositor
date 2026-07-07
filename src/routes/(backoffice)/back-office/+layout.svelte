<script>
	/**
	 * # Back Office Layout
	 *
	 * Shared layout for all admin Back Office pages. Renders the blue
	 * Back Office toolbar and a scrollable content region for pages.
	 */

	import ToolbarBackOffice from '$lib/componentWidgets/ToolbarBackOffice.svelte';

	let { children } = $props();
</script>

<ToolbarBackOffice />

<div class="back-office-content">
	{@render children()}
</div>

<style>
	.back-office-content {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		overflow-y: auto;
		padding: 2.4rem;
	}
</style>
