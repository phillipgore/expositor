<script>
	/**
	 * CommentaryEditor Component
	 * 
	 * Rich text editor for writing commentary on Bible passages.
	 * Uses Tiptap for WYSIWYG editing with basic formatting features.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import { Footnote } from '$lib/utils/tiptapFootnote.js';
	import Icon from '$lib/componentElements/Icon.svelte';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';

	let { content = '', onUpdate = () => {} } = $props();

	let editor;
	let editorElement;
	let showLinkInput = $state(false);
	let linkDisplayText = $state('');
	let linkUrl = $state('');
	let linkInputElement;
	let linkPopoverPosition = $state({ top: 0, left: 0, arrowPosition: 'bottom' });
	let isEditingExistingLink = $state(false);
	let editingFootnoteId = $state(null);

	// Zoom state
	let commentaryZoom = $state(
		typeof window !== 'undefined' 
			? parseInt(localStorage.getItem('commentaryZoom') || '100')
			: 100
	);
	
	let zoomScale = $derived(commentaryZoom / 100);

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			editable: true,
			extensions: [
				StarterKit.configure({
					// Disable features we don't need
					heading: false,
					code: false,
					codeBlock: false,
					strike: false
					// blockquote and horizontalRule enabled by default
				}),
				Link.configure({
					openOnClick: false,
					HTMLAttributes: {
						target: '_blank',
						rel: 'noopener noreferrer'
					}
				}),
				Footnote
			],
			content: content || '<p></p>',
			editorProps: {
				attributes: {
					class: 'tiptap-editor',
					spellcheck: 'true'
				},
				handleClick(view, pos, event) {
					// Check if clicked element is a link
					const link = event.target.closest('a');
					if (link && link.href) {
						// Prevent navigation
						event.preventDefault();
						// Open the link popover instead
						openLinkInput();
						return true;
					}
					return false;
				}
			},
			onUpdate: ({ editor }) => {
				const html = editor.getHTML();
				onUpdate(html);
			},
			autofocus: 'end'
		});
	});

	onDestroy(() => {
		if (editor) {
			editor.destroy();
		}
	});

	// Toolbar actions
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
	}

	function insertHorizontalRule() {
		editor?.chain().focus().setHorizontalRule().run();
	}

	let autoSaveTimeout;

	function autoSaveLink() {
		// Debounce auto-save
		clearTimeout(autoSaveTimeout);
		autoSaveTimeout = setTimeout(() => {
			if (!linkDisplayText && !linkUrl) {
				// Both empty - remove link if editing existing
				if (isEditingExistingLink) {
					editor?.chain().unsetLink().run();
				}
			} else if (linkUrl) {
				// Has URL - save the link
				const displayText = linkDisplayText || linkUrl;
				const url = linkUrl;
				
				if (isEditingExistingLink) {
					// Update existing link
					editor?.chain().extendMarkRange('link').setLink({ href: url }).insertContent(displayText).run();
				} else {
					// Create new link
					editor?.chain().insertContent(`<a href="${url}">${displayText}</a>`).run();
					isEditingExistingLink = true; // Now editing the link we just created
				}
			}
		}, 500); // 500ms debounce
	}

	function removeLink() {
		editor?.chain().focus().unsetLink().run();
		closePopover();
	}

	function openLink() {
		if (linkUrl && isValidUrl(linkUrl)) {
			window.open(linkUrl, '_blank', 'noopener,noreferrer');
		}
	}

	function closePopover() {
		showLinkInput = false;
		linkDisplayText = '';
		linkUrl = '';
		isEditingExistingLink = false;
		clearTimeout(autoSaveTimeout);
	}

	function isValidUrl(url) {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get the range of a mark at a given position
	 * @param {any} resolvedPos - Resolved position
	 * @param {any} type - Mark type
	 * @returns {{from: number, to: number} | null} - Range or null
	 */
	function getMarkRange(resolvedPos, type) {
		const start = resolvedPos.parent.childAfter(resolvedPos.parentOffset);
		if (!start.node) {
			return null;
		}

		const mark = start.node.marks.find(m => m.type === type);
		if (!mark) {
			return null;
		}

		let startIndex = resolvedPos.index();
		let startPos = resolvedPos.start() + start.offset;
		let endIndex = startIndex + 1;
		let endPos = startPos + start.node.nodeSize;

		// Find the start of the mark
		while (startIndex > 0 && mark.isInSet(resolvedPos.parent.child(startIndex - 1).marks)) {
			startIndex -= 1;
			startPos -= resolvedPos.parent.child(startIndex).nodeSize;
		}

		// Find the end of the mark
		while (endIndex < resolvedPos.parent.childCount && mark.isInSet(resolvedPos.parent.child(endIndex).marks)) {
			endPos += resolvedPos.parent.child(endIndex).nodeSize;
			endIndex += 1;
		}

		return { from: startPos, to: endPos };
	}

	// Computed disabled states
	let isRemoveDisabled = $derived(!linkUrl);
	let isOpenDisabled = $derived(!linkUrl || !isValidUrl(linkUrl));

	function openLinkInput() {
		if (!editor) return;
		
		const { state } = editor;
		const { selection } = state;
		let { from, to } = selection;
		
		// Check if we're on an existing link
		const linkAttrs = editor.getAttributes('link');
		isEditingExistingLink = !!linkAttrs.href;
		
		if (isEditingExistingLink) {
			// Editing existing link - get the full range of the link mark
			// Use TipTap's getMarkRange to find the complete link boundaries
			const resolvedPos = state.selection.$from;
			const markType = state.schema.marks.link;
			const markRange = getMarkRange(resolvedPos, markType);
			
			if (markRange) {
				// Found the link range
				from = markRange.from;
				to = markRange.to;
				
				// Highlight the link text in the editor
				editor.commands.setTextSelection({ from, to });
				
				// Get the full link text
				linkUrl = linkAttrs.href || '';
				const linkText = state.doc.textBetween(from, to);
				linkDisplayText = linkText || '';
			} else {
				// Fallback if mark range not found
				linkUrl = linkAttrs.href || '';
				linkDisplayText = state.doc.textBetween(from, to) || '';
			}
		} else {
			// New link - check for selected text
			const selectedText = state.doc.textBetween(from, to);
			linkDisplayText = selectedText || '';
			linkUrl = '';
		}
		
		// Calculate popover position with collision detection
		const view = editor.view;
		
		// Get coordinates for start and end of selection
		const startCoords = view.coordsAtPos(from);
		const endCoords = view.coordsAtPos(to);
		
		// Calculate center of selection
		const centerLeft = (startCoords.left + endCoords.left) / 2;
		const centerTop = (startCoords.top + endCoords.top) / 2;
		const centerBottom = (startCoords.bottom + endCoords.bottom) / 2;
		
		console.log('[LINK] Selection center:', { left: centerLeft, top: centerTop, bottom: centerBottom });
		
		// Popover dimensions
		const POPOVER_WIDTH = 320; // 32rem = 320px
		const POPOVER_HEIGHT = 200; // Approximate height with 2 fields + buttons
		const GAP = 10; // Gap between cursor and popover
		const EDGE_MARGIN = 10; // Margin from viewport edges
		
		let top, left;
		let arrowPosition = 'bottom'; // Arrow points down by default (popover above)
		
		// Vertical collision detection (using center of selection)
		const spaceAbove = centerTop;
		const spaceBelow = window.innerHeight - centerBottom;
		
		if (spaceAbove >= POPOVER_HEIGHT + GAP) {
			// Enough space above - position above selection center (preferred)
			top = centerTop - GAP;
			arrowPosition = 'bottom';
		} else if (spaceBelow >= POPOVER_HEIGHT + GAP) {
			// Not enough space above - position below selection center
			top = centerBottom + GAP;
			arrowPosition = 'top';
		} else {
			// Not enough space either way - position above anyway (best effort)
			top = centerTop - GAP;
			arrowPosition = 'bottom';
		}
		
		// Horizontal collision detection (use center of selection)
		left = centerLeft;
		const halfWidth = POPOVER_WIDTH / 2;
		
		// Constrain to viewport horizontally
		if (left - halfWidth < EDGE_MARGIN) {
			// Too close to left edge
			left = halfWidth + EDGE_MARGIN;
		} else if (left + halfWidth > window.innerWidth - EDGE_MARGIN) {
			// Too close to right edge
			left = window.innerWidth - halfWidth - EDGE_MARGIN;
		}
		
		linkPopoverPosition = { top, left, arrowPosition };
		
		console.log('[LINK] Popover position:', linkPopoverPosition);
		
		showLinkInput = true;
	}

	/**
	 * Add new footnote - inserts marker and creates editable field at bottom
	 */
	function addFootnote() {
		// Calculate next footnote number from existing footnotes
		const maxId = footnotes.length > 0 
			? Math.max(...footnotes.map(f => Number(f.id)))
			: 0;
		const nextId = maxId + 1;

		// Insert footnote marker with empty content
		editor?.chain().focus().setFootnote({
			id: String(nextId),
			content: '' // Start with empty content
		}).run();

		// Set this footnote as being edited
		editingFootnoteId = String(nextId);
		
		// Focus the new footnote field after it's rendered
		// Use a longer timeout and more specific selector
		const focusAttempts = [100, 200, 300]; // Try multiple times
		
		focusAttempts.forEach((delay) => {
			setTimeout(() => {
				// Look for textarea with matching data attribute
				const footnoteField = document.querySelector(`.footnote-field[data-footnote-id="${nextId}"]`);
				if (footnoteField && document.activeElement !== footnoteField) {
					console.log('[FOOTNOTE] Focusing footnote field:', nextId);
					// @ts-ignore - footnoteField is HTMLTextAreaElement
					footnoteField.focus();
					// Scroll into view
					footnoteField.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}, delay);
		});
	}

	/**
	 * Handle footnote content change
	 */
	function handleFootnoteChange(footnoteId, newContent) {
		// Update the footnote in the editor
		updateFootnoteContent(footnoteId, newContent);
	}

	/**
	 * Update footnote content in Tiptap editor
	 */
	function updateFootnoteContent(footnoteId, newContent) {
		if (!editor) return;

		const { state, view } = editor;
		const { tr } = state;
		let updated = false;

		// Find and update the footnote node
		state.doc.descendants((node, pos) => {
			if (node.type.name === 'footnote' && node.attrs.id === footnoteId) {
				tr.setNodeMarkup(pos, null, {
					...node.attrs,
					content: newContent
				});
				updated = true;
				return false; // Stop searching
			}
		});

		if (updated) {
			view.dispatch(tr);
		}
	}

	/**
	 * Start editing a footnote
	 */
	function startEditingFootnote(footnoteId) {
		editingFootnoteId = footnoteId;
	}

	/**
	 * Stop editing a footnote
	 */
	function stopEditingFootnote() {
		editingFootnoteId = null;
	}

	function clearFormatting() {
		editor?.chain().focus().clearNodes().unsetAllMarks().run();
	}

	/**
	 * Zoom controls
	 */
	function zoomIn() {
		commentaryZoom = Math.min(200, commentaryZoom + 25);
		if (typeof window !== 'undefined') {
			localStorage.setItem('commentaryZoom', commentaryZoom.toString());
		}
	}
	
	function zoomOut() {
		commentaryZoom = Math.max(75, commentaryZoom - 25);
		if (typeof window !== 'undefined') {
			localStorage.setItem('commentaryZoom', commentaryZoom.toString());
		}
	}

	// Extract footnotes from editor content
	let footnotes = $state([]);

	// Extract footnotes when editor updates
	$effect(() => {
		if (!editor) {
			console.log('[FOOTNOTES] No editor yet');
			return;
		}
		
		console.log('[FOOTNOTES] Editor initialized, setting up extraction');
		
		// Extract immediately
		const extractAndUpdate = () => {
			const json = editor.getJSON();
			console.log('[FOOTNOTES] Editor JSON:', json);
			const notes = [];
			
			// Recursively search for footnote nodes
			const extractFootnotes = (node) => {
				if (node.type === 'footnote' && node.attrs) {
					console.log('[FOOTNOTES] Found footnote:', node.attrs);
					notes.push({
						id: node.attrs.id,
						content: node.attrs.content
					});
				}
				if (node.content) {
					node.content.forEach(extractFootnotes);
				}
			};
			
			extractFootnotes(json);
			console.log('[FOOTNOTES] Total found:', notes.length, notes);
			// Keep footnotes in document order (don't sort by ID)
			footnotes = notes;
		};
		
		// Extract on mount
		extractAndUpdate();
		
		// Re-extract on every editor update
		const updateHandler = () => {
			extractAndUpdate();
		};
		
		editor.on('update', updateHandler);
		
		// Cleanup
		return () => {
			editor.off('update', updateHandler);
		};
	});

	// Check active states
	$effect(() => {
		if (editor) {
			// Force reactivity when editor updates
			editor.on('update', () => {});
		}
	});

	// Auto-resize footnote textareas when footnotes are loaded
	$effect(() => {
		if (footnotes.length > 0) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(() => {
				const textareas = document.querySelectorAll('.footnote-field');
				textareas.forEach((textarea) => {
					// @ts-ignore - textarea is HTMLTextAreaElement
					textarea.style.height = 'auto';
					// @ts-ignore - textarea is HTMLTextAreaElement
					textarea.style.height = textarea.scrollHeight + 'px';
				});
			}, 0);
		}
	});

	// Renumber footnote markers in text to match document order
	$effect(() => {
		if (!editor || footnotes.length === 0) return;

		setTimeout(() => {
			// Create a map of ID to display number
			const idToNumber = new Map();
			footnotes.forEach((note, index) => {
				idToNumber.set(note.id, index + 1);
			});

			// Update all footnote markers in the editor
			const markers = document.querySelectorAll('.tiptap-editor .footnote-marker');
			markers.forEach((marker) => {
				const footnoteId = marker.getAttribute('data-footnote-id');
				if (footnoteId && idToNumber.has(footnoteId)) {
					const sup = marker.querySelector('sup');
					if (sup) {
						sup.textContent = String(idToNumber.get(footnoteId));
					}
				}
			});
		}, 0);
	});

	// Click-outside detection for link input
	$effect(() => {
		if (showLinkInput) {
			const handleClickOutside = (event) => {
				if (linkInputElement && !linkInputElement.contains(event.target)) {
					closePopover();
				}
			};
			
			// Small delay to avoid immediate close from opening click
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	function isActive(type, attrs = {}) {
		return editor?.isActive(type, attrs) ?? false;
	}

	/**
	 * Handle clicks on editor content area
	 * Focus at end when clicking empty space (not on text or footnotes)
	 */
	function handleEditorContentClick(event) {
		// Don't interfere if clicking in footnotes section
		if (event.target.closest('.footnotes-section')) {
			return;
		}
		
		// Don't interfere if clicking directly on editor content
		if (event.target.closest('.tiptap-editor')) {
			return;
		}
		
		// Clicking empty space - move cursor to end
		editor?.commands.focus('end');
	}
</script>

<div class="commentary-editor">
	<div class="editor-toolbar">
		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('bold')}
				onclick={toggleBold}
				title="Bold (Cmd+B)"
				aria-label="Bold"
			>
				<Icon iconId="bold" />
			</button>
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('italic')}
				onclick={toggleItalic}
				title="Italic (Cmd+I)"
				aria-label="Italic"
			>
				<Icon iconId="italic" />
			</button>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('bulletList')}
				onclick={toggleBulletList}
				title="Bullet List"
				aria-label="Bullet List"
			>
				<Icon iconId="outline" />
			</button>
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('orderedList')}
				onclick={toggleOrderedList}
				title="Numbered List"
				aria-label="Numbered List"
			>
				<Icon iconId="outline-numbered" />
			</button>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('blockquote')}
				onclick={toggleBlockquote}
				title="Blockquote"
				aria-label="Blockquote"
			>
				<Icon iconId="block-quote" />
			</button>
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				onclick={insertHorizontalRule}
				title="Horizontal Rule"
				aria-label="Horizontal Rule"
			>
				<Icon iconId="horizontal-rule" />
			</button>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('link')}
				onmousedown={(e) => e.preventDefault()}
				onclick={openLinkInput}
				title="Link"
				aria-label="Link"
			>
				<Icon iconId="link" />
			</button>
			{#if showLinkInput}
				<div class="link-popover" class:arrow-top={linkPopoverPosition.arrowPosition === 'top'} bind:this={linkInputElement} style="top: {linkPopoverPosition.top}px; left: {linkPopoverPosition.left}px;">
					<div class="popover-arrow"></div>
					<label class="field-label">
						<span>Display:</span>
						<input
							type="text"
							bind:value={linkDisplayText}
							placeholder="Link text"
							autofocus
							oninput={() => autoSaveLink()}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									e.preventDefault();
									closePopover();
								}
							}}
						/>
					</label>
					<label class="field-label">
						<span>Link:</span>
						<input
							type="url"
							bind:value={linkUrl}
							placeholder="https://example.com"
							oninput={() => autoSaveLink()}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									e.preventDefault();
									closePopover();
								}
							}}
						/>
					</label>
					<div class="button-group">
						<button 
							type="button" 
							onclick={removeLink} 
							disabled={isRemoveDisabled}
							class="remove"
						>
							Remove
						</button>
						<button 
							type="button" 
							onclick={openLink} 
							disabled={isOpenDisabled}
							class="blue"
						>
							Open
						</button>
					</div>
				</div>
			{/if}
			
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('footnote')}
				onclick={addFootnote}
				title="Add Footnote"
				aria-label="Add Footnote"
			>
				<Icon iconId="footnote" />
			</button>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				onclick={clearFormatting}
				title="Clear Formatting"
				aria-label="Clear Formatting"
			>
				<Icon iconId="x" />
			</button>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group no-gap">
			<button
				use:tooltip
				type="button"
				class="toolbar-button no-right-round"
				onclick={zoomOut}
				disabled={commentaryZoom <= 75}
				title="Zoom Out"
				aria-label="Zoom Out"
			>
				<Icon iconId="minus-circle" />
			</button>
			<span class="zoom-level">{commentaryZoom}%</span>
			<button
				use:tooltip
				type="button"
				class="toolbar-button no-left-round"
				onclick={zoomIn}
				disabled={commentaryZoom >= 200}
				title="Zoom In"
				aria-label="Zoom In"
			>
				<Icon iconId="plus-circle" />
			</button>
		</div>
	</div>

	<div class="editor-content" style="transform: scale({zoomScale}); transform-origin: top left;" onclick={handleEditorContentClick}>
		<div bind:this={editorElement}></div>
		
		{#if footnotes.length > 0}
			<div class="footnotes-section">
				<hr class="footnotes-divider" />
				<div class="footnotes-list">
					{#each footnotes as note, index (note.id)}
						<div class="footnote-item">
							<span class="footnote-number">
								<sup>{index + 1}</sup>
							</span>
							<textarea
								class="footnote-field"
								class:editing={editingFootnoteId === note.id}
								data-footnote-id={note.id}
								value={note.content}
								placeholder="Enter footnote text..."
								rows="1"
								oninput={(e) => {
									// @ts-ignore - e.target is HTMLTextAreaElement
									const target = e.target;
									// Auto-resize textarea
									target.style.height = 'auto';
									target.style.height = target.scrollHeight + 'px';
									handleFootnoteChange(note.id, target.value);
								}}
								onfocus={() => startEditingFootnote(note.id)}
								onblur={stopEditingFootnote}
							></textarea>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.commentary-editor {
		position: relative; /* Positioning context for popups */
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: var(--white);
	}

	/* Toolbar */
	.editor-toolbar {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.9rem;
		padding: 0.6rem;
		/* border-bottom: 1px solid var(--gray-700); */
		background-color: var(--white);
		flex-shrink: 0;
	}

	.toolbar-group {
		display: flex;
		gap: 0.3rem;
	}

	.toolbar-group.no-gap {
		gap: 0.0rem;
	}

	.toolbar-divider {
		width: 1px;
		height: 2.4rem;
		background-color: var(--gray-700);
	}

	.toolbar-button {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 2.8rem;
		height: 2.8rem;
		padding: 0.6rem;
		border: none;
		border-radius: 0.3rem;
		background-color: var(--gray-light);
		color: var(--gray-darker);
		font-size: 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toolbar-button.no-right-round {
		border-top-right-radius: 0.0rem;
		border-bottom-right-radius: 0.0rem;
	}

	.toolbar-button.no-left-round {
		border-top-left-radius: 0.0rem;
		border-bottom-left-radius: 0.0rem;
	}

	.toolbar-button :global(.icon path) {
		fill: var(--gray-darker);
	}

	.toolbar-button:hover {
		background-color: var(--gray-light);
		border-color: var(--gray-500);
	}

	.toolbar-button:active {
		background-color: var(--gray-dark);
		color: var(--white);
	}

	.toolbar-button.active {
		background-color: var(--blue);
		border-color: var(--blue);
		color: var(--white);
	}

	.toolbar-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.toolbar-button:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}

	.zoom-level {
		display: flex;
		align-items: center;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--gray-300);
		min-width: 3.6rem;
		justify-content: center;
		border-top: 0.1rem solid var(--gray-light);
		border-bottom: 0.1rem solid var(--gray-light);
		background-color: var(--gray-lighter);
		padding: 0.0rem 0.6rem;
	}

	/* Link Popover with JavaScript Positioning */
	.link-popover {
		/* Fixed positioning relative to viewport */
		position: fixed;
		/* top and left set via inline styles */
		transform: translate(-50%, -100%); /* Center horizontally, position above */
		
		/* Fixed width */
		width: 32rem;
		
		/* Popup styling */
		padding: 1.2rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.4rem;
		box-shadow: 0rem 0.4rem 1.2rem var(--black-alpha);
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		z-index: 1000;
	}

	/* When popover is below cursor */
	.link-popover.arrow-top {
		transform: translate(-50%, 0); /* Position below instead of above */
	}

	/* Popover Arrow - points down when popover is above cursor */
	.popover-arrow {
		position: absolute;
		bottom: -0.6rem;
		left: 50%;
		transform: translateX(-50%) rotate(45deg);
		width: 1.2rem;
		height: 1.2rem;
		background: var(--white);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		z-index: -1;
	}

	/* Arrow points up when popover is below cursor */
	.link-popover.arrow-top .popover-arrow {
		bottom: auto;
		top: -0.6rem;
		transform: translateX(-50%) rotate(225deg);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		border-left: none;
		border-top: none;
	}

	/* Field Labels - Horizontal layout with label on left */
	.field-label {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.9rem;
	}

	.field-label span {
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--gray-400);
		min-width: 5.2rem;
		flex-shrink: 0;
		text-align: right;
	}

	/* Field Inputs - Match Input component styles */
	.field-label input {
		appearance: none;
		height: 2.8rem;
		padding: 0rem 0.9rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.4rem;
		font-family: inherit;
		color: var(--black);
		background-color: var(--white);
		flex: 1;
	}

	.field-label input:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
	}

	/* Button Group - Full width with equal buttons */
	.link-popover .button-group {
		display: flex;
		gap: 0.6rem;
		justify-content: stretch;
	}

	/* Buttons - Equal width filling container */
	.link-popover button {
		display: flex;
		justify-content: center;
		align-items: center;
		white-space: nowrap;
		flex: 1;
		height: 2.8rem;
		padding: 0rem 0.6rem;
		border-radius: 0.3rem;
		border: none;
		outline: 0;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--white);
		background-color: var(--gray-400);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.link-popover button:hover {
		opacity: 0.9;
	}

	.link-popover button:active {
		opacity: 0.8;
	}

	.link-popover button:focus-visible {
		outline: 0.2rem solid var(--gray-400);
		outline-offset: 0.1rem;
	}

	.link-popover button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.footnote-input {
		/* Center within panel */
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		top: 4.3rem;
		
		/* Fixed width */
		width: 45.8rem;
		
		/* Popup styling */
		padding: 0.6rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		z-index: 100;
	}

	.footnote-input textarea {
		padding: 0.6rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.4rem;
		font-family: inherit;
		resize: vertical;
	}

	.footnote-input .button-group {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
	}

	.footnote-input button {
		min-width: 2.8rem;
		height: 2.8rem;
		padding: 0.6rem;
		border-radius: 0.3rem;
		background-color: var(--gray-400);
		color: var(--white);
		font-size: 1.4rem;
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 1.2rem;
		font-weight: 500;
		border: none;
	}

	.footnote-input button:hover {
		background-color: var(--gray-400);
	}

	.footnote-input button:active {
		background-color: var(--gray-dark);
		color: var(--white);
	}

	.footnote-input button.blue {
		border-color: var(--blue);
		background-color: var(--blue);
		color: var(--white);
	}

	/* Editor Content */
	.editor-content {
		flex: 1;
		overflow-y: auto;
	}

	/* Tiptap Editor Styles */
	:global(.tiptap-editor) {
		outline: none;
		min-height: 100%;
		font-family: inherit;
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--black);
		padding: 1.8rem;
	}

	:global(.tiptap-editor p) {
		margin: 0 0 1.2rem 0;
	}

	:global(.tiptap-editor p:last-child) {
		margin-bottom: 0;
	}

	:global(.tiptap-editor h2) {
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--black);
		margin: 2.4rem 0 1.2rem 0;
		line-height: 1.3;
	}

	:global(.tiptap-editor h2:first-child) {
		margin-top: 0;
	}

	:global(.tiptap-editor h3) {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--black);
		margin: 1.8rem 0 0.9rem 0;
		line-height: 1.4;
	}

	:global(.tiptap-editor h3:first-child) {
		margin-top: 0;
	}

	:global(.tiptap-editor strong) {
		font-weight: 600;
		color: var(--black);
	}

	:global(.tiptap-editor em) {
		font-style: italic;
	}

	:global(.tiptap-editor ul),
	:global(.tiptap-editor ol) {
		padding-left: 2.4rem;
		margin: 0 0 1.2rem 0;
	}

	:global(.tiptap-editor li) {
		margin: 0.6rem 0;
	}

	:global(.tiptap-editor li p) {
		margin: 0;
	}

	:global(.tiptap-editor blockquote) {
		border-left: 0.3rem solid var(--gray-500);
		padding-left: 1.2rem;
		margin: 0 0 1.2rem 0;
		color: var(--gray-300);
		font-style: italic;
	}

	:global(.tiptap-editor blockquote p) {
		margin: 0.6rem 0;
	}

	:global(.tiptap-editor hr) {
		border: none;
		border-top: 0.2rem solid var(--gray-700);
		margin: 2.4rem 0;
	}

	:global(.tiptap-editor mark) {
		padding: 0.1rem 0.3rem;
		border-radius: 0.2rem;
	}

	:global(.tiptap-editor a) {
		color: var(--blue);
		text-decoration: underline;
		cursor: pointer;
	}

	:global(.tiptap-editor a:hover) {
		color: var(--blue-dark);
	}

	/* Footnote Markers in Text */
	:global(.tiptap-editor .footnote-marker) {
		color: inherit;
		font-weight: inherit;
		margin: 0 0.1rem;
		padding: 0.2rem 0.1rem 0.0rem;
		border-radius: 0.2rem;
		transition: background-color 0.15s ease;
	}

	:global(.tiptap-editor .footnote-marker sup) {
		font-size: 0.75em;
	}

	/* Selected footnote visual feedback */
	:global(.tiptap-editor .ProseMirror-selectednode.footnote-marker) {
		background-color: var(--blue-light);
		outline: 0.1rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	/* Hover state for footnotes */
	:global(.tiptap-editor .footnote-marker:hover) {
		background-color: var(--gray-light);
		cursor: pointer;
	}

	/* Footnotes Section at Bottom */
	.footnotes-section {
		margin-top: 3rem;
		padding: 1.8rem;
	}

	.footnotes-divider {
		border: none;
		border-top: 1px solid var(--gray-700);
		margin: 0 0 1.8rem 0;
	}

	.footnotes-list {
		display: flex;
		flex-direction: column;
		/* gap: 0.8rem; */
	}

	.footnote-item {
		display: flex;
		font-size: 1.4rem;
		line-height: 1.6;
		margin-bottom: 0.6rem;
	}

	.footnote-number {
		flex-shrink: 0;
		font-size: inherit;
		font-weight: inherit;

		sup {
			font-size: 0.75em;
			padding-right: 0.3rem;
		}
	}

	.footnote-field {
		flex: 1;
		border: none;
		border-radius: 0.3rem;
		padding: 0.0rem;
		font-size: 1.4rem;
		font-family: inherit;
		line-height: 1.6;
		color: var(--black);
		background-color: transparent;
		resize: none;
		min-height: 2.4rem;
		transition: all 0.15s ease;
	}

	.footnote-field:focus,
	.footnote-field.editing {
		outline: none;
		background-color: var(--white);
	}

	.footnote-field::placeholder {
		color: var(--gray-400);
		font-style: italic;
	}

	/* Placeholder */
	:global(.tiptap-editor p.is-editor-empty:first-child::before) {
		content: 'Write your commentary here...';
		color: var(--gray-400);
		pointer-events: none;
		height: 0;
		float: left;
	}
</style>
