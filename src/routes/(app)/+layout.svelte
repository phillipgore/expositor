<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ToolbarApp from '$lib/componentWidgets/ToolbarApp.svelte';
	import StudiesPanel from '$lib/componentWidgets/StudiesPanel.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';

	/** @type {import('./$types').LayoutData} */
	let { data, children } = $props();

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (!authenticated) {
				goto('/signin');
			} else if ($page.url.pathname === '/') {
				// Redirect to /new if on root path
				goto('/new');
			}
		});

		return unsubscribe;
	});
</script>

{#if $isAuthenticated}
	<ToolbarApp></ToolbarApp>
	<div class="app-container">
		<StudiesPanel isOpen={$toolbarState.studiesPanelOpen} studies={data.studies} />
		<div class="content-wrapper">
			{@render children()}
		</div>
	</div>
{:else}
	<div class="redirecting">Redirecting to sign in...</div>
{/if}

<style>
	/* ============================================
	   APP CONTAINER
	   ============================================ */
	.app-container {
		display: flex;
		flex-direction: row;
		height: calc(100vh - 5.2rem); /* Full height minus toolbar */
		overflow: hidden;
	}

	/* ============================================
	   CONTENT WRAPPER
	   ============================================ */
	.content-wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		padding: 1.8rem;
		overflow-y: auto;
		transition: margin-left 0.3s ease-in-out;
	}

	/* ============================================
	   LOADING STATE
	   ============================================ */
	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100vh;
		font-size: 1.2rem;
	}
</style>
