<script>
	import { isAuthenticated } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ToolbarApp from '$lib/componentWidgets/ToolbarApp.svelte';
	import StudiesPanel from '$lib/componentWidgets/StudiesPanel.svelte';
	import CommentaryPanel from '$lib/componentWidgets/CommentaryPanel.svelte';
	import { toolbarState, setToolbarState } from '$lib/stores/toolbar.js';

	let { data, children } = $props();

	// Initialize toolbar state with persisted preferences
	$effect(() => {
		if (data.studiesPanelOpen !== undefined) {
			setToolbarState('studiesPanelOpen', data.studiesPanelOpen);
		}
		if (data.commentaryPanelOpen !== undefined) {
			setToolbarState('commentaryPanelOpen', data.commentaryPanelOpen);
		}
		// View menu toggle preferences
		if (data.headingsVisible !== undefined) {
			setToolbarState('headingsVisible', data.headingsVisible);
		}
		if (data.notesVisible !== undefined) {
			setToolbarState('notesVisible', data.notesVisible);
		}
		if (data.passageNotesVisible !== undefined) {
			setToolbarState('passageNotesVisible', data.passageNotesVisible);
		}
		if (data.connectionNotesVisible !== undefined) {
			setToolbarState('connectionNotesVisible', data.connectionNotesVisible);
		}
		if (data.connectionsVisible !== undefined) {
			setToolbarState('connectionsVisible', data.connectionsVisible);
		}
		if (data.columnConnectionsVisible !== undefined) {
			setToolbarState('columnConnectionsVisible', data.columnConnectionsVisible);
		}
		if (data.sectionConnectionsVisible !== undefined) {
			setToolbarState('sectionConnectionsVisible', data.sectionConnectionsVisible);
		}
		if (data.segmentConnectionsVisible !== undefined) {
			setToolbarState('segmentConnectionsVisible', data.segmentConnectionsVisible);
		}
		if (data.crossItemConnectionsVisible !== undefined) {
			setToolbarState('crossItemConnectionsVisible', data.crossItemConnectionsVisible);
		}
		if (data.referencesVisible !== undefined) {
			setToolbarState('referencesVisible', data.referencesVisible);
		}
		if (data.versesVisible !== undefined) {
			setToolbarState('versesVisible', data.versesVisible);
		}
		if (data.paragraphBreaksVisible !== undefined) {
			setToolbarState('paragraphBreaksVisible', data.paragraphBreaksVisible);
		}
		if (data.wideLayout !== undefined) {
			setToolbarState('wideLayout', data.wideLayout);
		}
		if (data.overviewMode !== undefined) {
			setToolbarState('overviewMode', data.overviewMode);
		}
		if (data.selectorsVisible !== undefined) {
			setToolbarState('selectorsVisible', data.selectorsVisible);
		}
		if (data.layoutControlsVisible !== undefined) {
			setToolbarState('layoutControlsVisible', data.layoutControlsVisible);
		}
	});

	onMount(() => {
		const unsubscribe = isAuthenticated.subscribe((authenticated) => {
			if (!authenticated) {
				goto('/signin');
			} else if ($page.url.pathname === '/') {
				// Redirect to the dashboard (with the Finder open) if on root path
				goto('/dashboard');
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
		<CommentaryPanel 
			isOpen={$toolbarState.commentaryPanelOpen}
			initialWidth={data.commentaryPanelWidth || 300}
		/>
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
		flex-grow: 1;
		min-height: 0; /* Allow flex item to shrink below content size */
		overflow: hidden;
	}

	/* ============================================
	   CONTENT WRAPPER
	   ============================================ */
	.content-wrapper {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		padding: 0.0rem;
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
