<script>
	/**
	 * CommentaryPanel Component
	 * 
	 * A resizable panel that slides out from the right side of the page.
	 * Contains a rich text editor for writing commentary on Bible passages.
	 * 
	 * Architecture:
	 * - Slide-out animation
	 * - Mouse-draggable resize handle (on left edge)
	 * - Keyboard-accessible resizing
	 * - State persistence (localStorage + database)
	 * - Auto-saves commentary as user types
	 */
	import { untrack } from 'svelte';
	import { usePanelResize } from "$lib/composables/usePanelResize.svelte.js";
	import CommentaryEditor from "./CommentaryEditor.svelte";
	import { toolbarState } from '$lib/stores/toolbar.js';

	let { isOpen = false, initialWidth = 300 } = $props();

	// State for current segment and its commentary
	let currentSegmentId = $state(null);
	let commentaryContent = $state('');
	let saveTimeout = $state(null);

	// Initialize panel resize with API persistence
	const panelResize = usePanelResize(
		initialWidth,
		'commentaryPanelWidth',
		'/api/user/preferences',
		() => isOpen,
		'commentaryPanelWidth', // API property name
		'right', // Panel is on the right side
		475 // Minimum width: 47.6rem
	);
	
	let panelWidth = $derived(panelResize.getWidth());
	let isResizing = $derived(panelResize.getIsResizing());

	/**
	 * Effect for global resize listeners
	 */
	$effect(() => {
		return panelResize.setupResizeListeners();
	});

	/**
	 * Load commentary from database for a segment
	 */
	async function loadCommentary(segmentId) {
		if (!segmentId) {
			commentaryContent = '';
			return;
		}

		console.log('[LOAD] Starting API call for segment:', segmentId);
		try {
			const response = await fetch(`/api/segments/${segmentId}`);
			if (response.ok) {
				const data = await response.json();
				console.log('[LOAD] API returned data for segment:', segmentId, 'commentary length:', data.commentary?.length || 0);
				commentaryContent = data.commentary || '';
				console.log('[LOAD] Set commentaryContent, length:', commentaryContent.length);
			} else {
				console.error('[LOAD] Failed to load commentary, status:', response.status);
				commentaryContent = '';
			}
		} catch (error) {
			console.error('[LOAD] Error loading commentary:', error);
			commentaryContent = '';
		}
	}

	/**
	 * Save commentary to database (debounced)
	 */
	async function saveCommentary(segmentId, html) {
		if (!segmentId) return;

		try {
			const response = await fetch(`/api/segments/${segmentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commentary: html })
			});

			if (!response.ok) {
				console.error('Failed to save commentary');
			}
		} catch (error) {
			console.error('Error saving commentary:', error);
		}
	}

	/**
	 * Handle commentary updates with debouncing
	 */
	function handleCommentaryUpdate(html) {
		// Update local state immediately
		commentaryContent = html;

		// Clear existing timeout
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		// Capture segment ID NOW (not when timeout fires)
		// This prevents race condition if user switches segments before save completes
		const segmentIdToSave = currentSegmentId;

		// Save after 1 second of inactivity
		saveTimeout = setTimeout(() => {
			saveCommentary(segmentIdToSave, html);
		}, 1000);
	}

	/**
	 * Watch for segment changes and load commentary
	 * Uses untrack() to prevent effect from re-running when currentSegmentId changes internally
	 */
	$effect(() => {
		const segmentId = $toolbarState.activeSegmentId;
		console.log('[COMMENTARY PANEL] Received segment ID from store:', segmentId);
		
		// Use untrack to read currentSegmentId without creating a dependency
		// This prevents the effect from re-running when we update currentSegmentId internally
		const currentId = untrack(() => currentSegmentId);
		
		// If segment changed, load its commentary
		if (segmentId !== currentId) {
			// Save any pending changes from previous segment
			if (saveTimeout) {
				clearTimeout(saveTimeout);
				saveTimeout = null;
			}
			
			// Save and load sequentially, CRITICAL: update currentSegmentId AFTER loading
			(async () => {
				// First, save current segment (if exists)
				const prevId = untrack(() => currentSegmentId);
				const prevContent = untrack(() => commentaryContent);
				if (prevId && prevContent) {
					await saveCommentary(prevId, prevContent);
				}
				
				// Second, load new segment's commentary
				if (segmentId) {
					await loadCommentary(segmentId);
				} else {
					commentaryContent = '';
				}
				
				// FINALLY, update current segment (triggers #key remount with correct content)
				currentSegmentId = segmentId;
			})();
		}
	});

	/**
	 * Handle keyboard resize
	 */
	function handleResizeKeyDown(event) {
		const step = 10; // pixels to resize per keypress
		
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			panelResize.adjustWidth(step); // Left arrow increases width (expands leftward)
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			panelResize.adjustWidth(-step); // Right arrow decreases width (shrinks rightward)
		}
	}
</script>

<aside class="commentary-panel" class:open={isOpen} class:resizing={isResizing} style:width="{isOpen ? panelWidth : 0}px">
	{#if isOpen}
		<div 
			class="resize-handle"
			tabindex="0"
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize commentary panel. Use left and right arrow keys to adjust width."
			onmousedown={panelResize.handleResizeStart}
			onkeydown={handleResizeKeyDown}
		></div>
	{/if}
	<div class="panel-content" style:width="{panelWidth}px">
		{#if $toolbarState.hasActiveSegment}
			{#key currentSegmentId}
				<CommentaryEditor 
					content={commentaryContent}
					onUpdate={handleCommentaryUpdate}
				/>
			{/key}
		{:else}
			<div class="empty-state">
				<p>Select a segment to add commentary</p>
			</div>
		{/if}
	</div>
</aside>

<style>
	.commentary-panel {
		position: relative;
		min-width: 0;
		height: 100%;
		background-color: var(--gray-lighter);
		border-left: 1px solid var(--gray-700);
		overflow: hidden;
		transition: width 0.3s ease-in-out;
		flex-shrink: 0;
	}

	.commentary-panel.resizing {
		transition: none;
	}

	.panel-content {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		z-index: 10;
		background-color: transparent;
	}

	.resize-handle:focus-visible {
		outline: 0.1rem solid var(--gray-700);
		background-color: var(--gray-light);
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 2rem;
	}

	.empty-state p {
		color: var(--gray-400);
		font-size: 1.4rem;
		text-align: center;
		line-height: 1.5;
		margin: 0;
	}
</style>
