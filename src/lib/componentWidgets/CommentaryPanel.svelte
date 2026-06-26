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

	/**
	 * The currently active "subject" being commented on.
	 * @type {{ type: 'segment'|'connection'|'heading', id: string } | null}
	 */
	let currentSubject = $state(null);

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
		547, // Minimum width: 54.7rem (547px) — extra room to fit the full toolbar
		816  // Maximum width: 81.6rem (816px)
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
	 * Resolve the URL for loading/saving commentary based on subject type.
	 * @param {{ type: 'segment'|'connection'|'heading', id: string }} subject
	 */
	function getApiUrl(subject) {
		if (subject.type === 'connection') return `/api/segments/connections/${subject.id}`;
		if (subject.type === 'heading')    return `/api/passages/headings/${subject.id}`;
		return `/api/segments/${subject.id}`;
	}

	/**
	 * Load commentary from the database for the given subject.
	 * @param {{ type: 'segment'|'connection'|'heading', id: string }} subject
	 */
	async function loadCommentary(subject) {

		try {
			const response = await fetch(getApiUrl(subject));
			if (response.ok) {
				const data = await response.json();
				commentaryContent = data.commentary || '';
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
	 * Save commentary to the database for the given subject.
	 * @param {{ type: 'segment'|'connection'|'heading', id: string }} subject
	 * @param {string} html
	 */
	async function saveCommentary(subject, html) {

		try {
			const response = await fetch(getApiUrl(subject), {
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
	 * Handle commentary updates with debouncing.
	 */
	function handleCommentaryUpdate(html) {
		commentaryContent = html;

		if (saveTimeout) clearTimeout(saveTimeout);

		// Capture subject NOW to avoid race conditions if the user switches subjects
		const subjectToSave = untrack(() => currentSubject);

		saveTimeout = setTimeout(() => {
			if (subjectToSave) saveCommentary(subjectToSave, html);
		}, 1000);
	}

	/**
	 * Watch for heading, segment, or connection changes and load commentary.
	 * Priority: heading → connection → segment.
	 * A heading is selected via its hover select button and is an independent subject.
	 * Columns and sections are no longer commentable subjects (their commentary was
	 * removed in favor of heading commentary).
	 * Uses untrack() to prevent infinite loops.
	 */
	$effect(() => {
		const headingId    = $toolbarState.activeHeadingId;
		const segmentId    = $toolbarState.activeSegmentId;
		// Only show commentary when exactly one connection is selected.
		// Multi-selection (Cmd+Click) clears the panel so the user sees the empty state.
		const connectionId = $toolbarState.activeConnectionIds.length === 1
			? $toolbarState.activeConnectionIds[0]
			: null;

		// Determine the new subject
		/** @type {{ type: 'segment'|'connection'|'heading', id: string } | null} */
		const newSubject = headingId
			? { type: 'heading', id: headingId }
			: connectionId
				? { type: 'connection', id: connectionId }
				: segmentId
					? { type: 'segment', id: segmentId }
					: null;


		const prevSubject = untrack(() => currentSubject);

		// Only act if the subject actually changed
		const subjectChanged =
			newSubject?.type !== prevSubject?.type ||
			newSubject?.id   !== prevSubject?.id;

		if (!subjectChanged) return;

		// Cancel any pending save
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}

		(async () => {
			// Save current subject's commentary before switching
			const prev    = untrack(() => currentSubject);
			const content = untrack(() => commentaryContent);
			if (prev && content) {
				await saveCommentary(prev, content);
			}

			// Load the new subject's commentary
			if (newSubject) {
				await loadCommentary(newSubject);
			} else {
				commentaryContent = '';
			}

			// Update subject AFTER loading to trigger #key remount with correct content
			currentSubject = newSubject;
		})();
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
		<!-- Gate on `isOpen`: the CommentaryEditor autofocuses on mount, so it must NOT
		     be instantiated while this panel is closed. On the Document view the panel
		     is closed (width 0) but it still reacts to the shared activeHeading/segment/
		     connection toolbar state; without this guard the hidden editor would mount
		     and steal focus from the Document view's own inline heading/commentary
		     editor the instant a heading is clicked. -->
		{#if isOpen && ($toolbarState.hasActiveHeading || $toolbarState.hasActiveSegment || ($toolbarState.hasActiveConnection && $toolbarState.activeConnectionIds.length === 1))}

			{#key currentSubject?.id}
				<CommentaryEditor
					content={commentaryContent}
					onUpdate={handleCommentaryUpdate}
					subjectType={currentSubject?.type ?? null}
					subjectId={currentSubject?.id ?? null}
				/>

			{/key}
		{:else}
			<div class="empty-state">
				<p>Select a heading, segment, or connection to add commentary</p>
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
