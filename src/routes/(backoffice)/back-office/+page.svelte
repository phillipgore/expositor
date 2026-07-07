<script>
	/**
	 * # Back Office Page
	 *
	 * Admin-only area, guarded server-side in +page.server.js.
	 * Currently empty — the blue toolbar across the top is in place for
	 * future Back Office tools.
	 */

	import ToolbarBackOffice from '$lib/componentWidgets/ToolbarBackOffice.svelte';
</script>

<svelte:head>
	<title>Back Office — Expositor App</title>
</svelte:head>

<ToolbarBackOffice />

<div class="back-office-content">
	<!-- Back Office content coming soon -->
</div>

<style>
	.back-office-content {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		overflow-y: auto;
	}
</style>
