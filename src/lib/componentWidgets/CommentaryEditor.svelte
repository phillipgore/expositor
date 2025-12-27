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
	let linkUrl = $state('');
	let linkInputElement;
	let showFootnoteInput = $state(false);
	let footnoteContent = $state('');
	let footnoteInputElement;

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

	function setLink() {
		if (!linkUrl) {
			editor?.chain().focus().unsetLink().run();
		} else {
			editor?.chain().focus().setLink({ href: linkUrl }).run();
		}
		showLinkInput = false;
		linkUrl = '';
	}

	function removeLink() {
		editor?.chain().focus().unsetLink().run();
		showLinkInput = false;
	}

	function cancelLink() {
		showLinkInput = false;
		linkUrl = '';
	}

	function openLinkInput() {
		const previousUrl = editor?.getAttributes('link').href;
		linkUrl = previousUrl || '';
		showLinkInput = true;
	}

	function openFootnoteInput() {
		showFootnoteInput = true;
		footnoteContent = '';
	}

	function addFootnote() {
		if (!footnoteContent.trim()) {
			showFootnoteInput = false;
			return;
		}

		// Calculate next footnote number from existing footnotes
		const maxId = footnotes.length > 0 
			? Math.max(...footnotes.map(f => Number(f.id)))
			: 0;
		const nextId = maxId + 1;

		editor?.chain().focus().setFootnote({
			id: String(nextId),
			content: footnoteContent
		}).run();

		showFootnoteInput = false;
		footnoteContent = '';
	}

	function cancelFootnote() {
		showFootnoteInput = false;
		footnoteContent = '';
	}

	function clearFormatting() {
		editor?.chain().focus().clearNodes().unsetAllMarks().run();
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
			footnotes = notes.sort((a, b) => Number(a.id) - Number(b.id));
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

	// Click-outside detection for link input
	$effect(() => {
		if (showLinkInput) {
			const handleClickOutside = (event) => {
				if (linkInputElement && !linkInputElement.contains(event.target)) {
					cancelLink();
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

	// Click-outside detection for footnote input
	$effect(() => {
		if (showFootnoteInput) {
			const handleClickOutside = (event) => {
				if (footnoteInputElement && !footnoteInputElement.contains(event.target)) {
					cancelFootnote();
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

		<div class="toolbar-divider"></div>

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

		<div class="toolbar-divider"></div>

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

		<div class="toolbar-divider"></div>

		<div class="toolbar-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('link')}
				onclick={openLinkInput}
				title="Link"
				aria-label="Link"
			>
				<Icon iconId="link" />
			</button>
			{#if showLinkInput}
				<div class="link-input" bind:this={linkInputElement}>
					<input
						type="url"
						bind:value={linkUrl}
						placeholder="https://example.com"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								setLink();
							} else if (e.key === 'Escape') {
								e.preventDefault();
								cancelLink();
							}
						}}
					/>
					<div class="button-group">
						<button type="button" onclick={setLink}>
							<Icon iconId="check" />
						</button>
						<button type="button" onclick={cancelLink}>
							<Icon iconId="x" />
						</button>
					</div>
				</div>
			{/if}
			
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('footnote')}
				onclick={openFootnoteInput}
				title="Footnote"
				aria-label="Footnote"
			>
				<Icon iconId="footnote" />
			</button>
			{#if showFootnoteInput}
				<div class="footnote-input" bind:this={footnoteInputElement}>
					<textarea
						bind:value={footnoteContent}
						placeholder="Enter footnote text..."
						rows="3"
						onkeydown={(e) => {
							if (e.key === 'Enter' && e.metaKey) {
								addFootnote();
							} else if (e.key === 'Escape') {
								e.preventDefault();
								cancelFootnote();
							}
						}}
					></textarea>
					<div class="button-group">
						<button type="button" onclick={addFootnote}>
							<Icon iconId="check" />
						</button>
						<button type="button" onclick={cancelFootnote}>
							<Icon iconId="x" />
						</button>
					</div>
				</div>
			{/if}
		</div>

		<div class="toolbar-divider"></div>

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
	</div>

	<div class="editor-content">
		<div bind:this={editorElement}></div>
		
		{#if footnotes.length > 0}
			<div class="footnotes-section">
				<hr class="footnotes-divider" />
				<div class="footnotes-list">
					{#each footnotes as note}
						<div class="footnote-item">
							<span class="footnote-number">{note.id}.</span>
							<span class="footnote-text">{note.content}</span>
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
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
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

	.toolbar-button:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: 2px;
	}

	.link-input {
		/* Center within panel */
		position: absolute;
		left: 50%;
		top: 3.8rem;
		transform: translateX(-50%);
		
		/* Fixed width */
		width: 34.0rem;
		
		/* Popup styling */
		padding: 0.6rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		z-index: 100;
	}

	.link-input input {
		padding: 0.6rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.4rem;
	}

	.link-input .button-group {
		display: flex;
		gap: 0.3rem;
		justify-content: flex-end;
	}

	.link-input button {
		min-width: 2.8rem;
		height: 2.8rem;
		padding: 0.6rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		background-color: var(--white);
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.link-input button:hover {
		background-color: var(--gray-light);
		border-color: var(--gray-500);
	}

	.link-input button:active {
		background-color: var(--gray-400);
	}

	.footnote-input {
		/* Center within panel */
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		top: 3.8rem;
		
		/* Fixed width */
		width: 34.0rem;
		
		/* Popup styling */
		padding: 0.6rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.1);
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
		gap: 0.3rem;
		justify-content: flex-end;
	}

	.footnote-input button {
		min-width: 2.8rem;
		height: 2.8rem;
		padding: 0.6rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		background-color: var(--white);
		color: var(--black);
		font-size: 1.4rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.footnote-input button:hover {
		background-color: var(--gray-light);
		border-color: var(--gray-500);
	}

	.footnote-input button:active {
		background-color: var(--gray-400);
	}

	/* Editor Content */
	.editor-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	/* Tiptap Editor Styles */
	:global(.tiptap-editor) {
		outline: none;
		min-height: 100%;
		font-family: inherit;
		font-size: 1.4rem;
		line-height: 1.6;
		color: var(--black);
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
		color: var(--blue);
		font-weight: 600;
		margin: 0 0.1rem;
	}

	:global(.tiptap-editor .footnote-marker sup) {
		font-size: 0.75em;
	}

	/* Footnotes Section at Bottom */
	.footnotes-section {
		margin-top: 3rem;
		padding-top: 1.5rem;
	}

	.footnotes-divider {
		border: none;
		border-top: 1px solid var(--gray-700);
		margin: 0 0 1.5rem 0;
	}

	.footnotes-list {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.footnote-item {
		display: flex;
		gap: 0.8rem;
		font-size: 1.3rem;
		line-height: 1.6;
		color: var(--gray-300);
	}

	.footnote-number {
		flex-shrink: 0;
		font-weight: 600;
		color: var(--blue);
		min-width: 2.5rem;
	}

	.footnote-text {
		flex: 1;
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
