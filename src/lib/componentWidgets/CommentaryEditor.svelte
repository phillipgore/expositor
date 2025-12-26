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
	import Icon from '$lib/componentElements/Icon.svelte';

	let { content = '', onUpdate = () => {} } = $props();

	let editor;
	let editorElement;
	let showLinkInput = $state(false);
	let linkUrl = $state('');

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
				})
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

	function openLinkInput() {
		const previousUrl = editor?.getAttributes('link').href;
		linkUrl = previousUrl || '';
		showLinkInput = true;
	}

	function clearFormatting() {
		editor?.chain().focus().clearNodes().unsetAllMarks().run();
	}

	// Check active states
	$effect(() => {
		if (editor) {
			// Force reactivity when editor updates
			editor.on('update', () => {});
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
				type="button"
				class="toolbar-button"
				class:active={isActive('bold')}
				onclick={toggleBold}
				title="Bold (Cmd+B)"
				aria-label="Bold"
			>
				<strong>B</strong>
			</button>
			<button
				type="button"
				class="toolbar-button"
				class:active={isActive('italic')}
				onclick={toggleItalic}
				title="Italic (Cmd+I)"
				aria-label="Italic"
			>
				<em>I</em>
			</button>
		</div>

		<div class="toolbar-divider"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="toolbar-button"
				class:active={isActive('bulletList')}
				onclick={toggleBulletList}
				title="Bullet List"
				aria-label="Bullet List"
			>
				•
			</button>
			<button
				type="button"
				class="toolbar-button"
				class:active={isActive('orderedList')}
				onclick={toggleOrderedList}
				title="Numbered List"
				aria-label="Numbered List"
			>
				1.
			</button>
		</div>

		<div class="toolbar-divider"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="toolbar-button"
				class:active={isActive('blockquote')}
				onclick={toggleBlockquote}
				title="Blockquote"
				aria-label="Blockquote"
			>
				❝
			</button>
			<button
				type="button"
				class="toolbar-button"
				onclick={insertHorizontalRule}
				title="Horizontal Rule"
				aria-label="Horizontal Rule"
			>
				—
			</button>
		</div>

		<div class="toolbar-divider"></div>

		<div class="toolbar-group">
			<div class="toolbar-button-wrapper">
				<button
					type="button"
					class="toolbar-button"
					class:active={isActive('link')}
					onclick={openLinkInput}
					title="Link"
					aria-label="Link"
				>
					🔗
				</button>
				{#if showLinkInput}
					<div class="link-input">
						<input
							type="url"
							bind:value={linkUrl}
							placeholder="https://example.com"
							onkeydown={(e) => e.key === 'Enter' && setLink()}
						/>
						<button type="button" onclick={setLink}>✓</button>
						{#if isActive('link')}
							<button type="button" onclick={removeLink}>✕</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div class="toolbar-divider"></div>

		<div class="toolbar-group">
			<button
				type="button"
				class="toolbar-button"
				onclick={clearFormatting}
				title="Clear Formatting"
				aria-label="Clear Formatting"
			>
				×
			</button>
		</div>
	</div>

	<div class="editor-content">
		<div bind:this={editorElement}></div>
	</div>
</div>

<style>
	.commentary-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background-color: var(--white);
	}

	/* Toolbar */
	.editor-toolbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.9rem;
		border-bottom: 1px solid var(--gray-700);
		background-color: var(--gray-lighter);
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
		min-width: 3.2rem;
		height: 3.2rem;
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

	.toolbar-button:hover {
		background-color: var(--gray-light);
		border-color: var(--gray-500);
	}

	.toolbar-button:active {
		background-color: var(--gray-400);
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

	.toolbar-button-wrapper {
		position: relative;
	}

	.link-input {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.3rem;
		padding: 0.6rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		box-shadow: 0 0.2rem 0.8rem rgba(0, 0, 0, 0.1);
		display: flex;
		gap: 0.3rem;
		z-index: 100;
		min-width: 30rem;
	}

	.link-input input {
		flex: 1;
		padding: 0.6rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.4rem;
	}

	.link-input button {
		padding: 0.6rem 1.2rem;
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		background: var(--white);
		color: var(--black);
		cursor: pointer;
		font-size: 1.4rem;
	}

	.link-input button:hover {
		background: var(--gray-light);
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

	/* Placeholder */
	:global(.tiptap-editor p.is-editor-empty:first-child::before) {
		content: 'Write your commentary here...';
		color: var(--gray-400);
		pointer-events: none;
		height: 0;
		float: left;
	}
</style>
