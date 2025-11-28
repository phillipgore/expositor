<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ToolbarApp from '$lib/componentWidgets/ToolbarApp.svelte';
	import StudiesPanel from '$lib/componentWidgets/StudiesPanel.svelte';
	import { toolbarState, setToolbarState } from '$lib/stores/toolbar.js';

	let { data, children } = $props();

	// Initialize toolbar state with persisted panel open state
	$effect(() => {
		if (data.studiesPanelOpen !== undefined) {
			setToolbarState('studiesPanelOpen', data.studiesPanelOpen);
		}
	});

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (!authenticated) {
				goto('/signin');
			} else if ($page.url.pathname === '/') {
				// Redirect to /new-study if on root path
				goto('/new-study');
			}
		});

		return unsubscribe;
	});
</script>

{#if $isAuthenticated}
	<ToolbarApp groups={data.groups || []}></ToolbarApp>
	<div class="app-container">
		<StudiesPanel 
			isOpen={$toolbarState.studiesPanelOpen} 
			studies={data.studies}
			groups={data.groups || []}
			ungroupedStudies={data.ungroupedStudies || []}
			initialWidth={data.studiesPanelWidth || 300}
		/>
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
		padding: 1.8rem 0.0rem;
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
