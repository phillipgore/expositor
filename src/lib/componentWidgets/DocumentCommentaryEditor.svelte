<script>
	/**
	 * DocumentCommentaryEditor
	 *
	 * An inline, single-subject commentary editor for the Document page. It has
	 * TWO presentations:
	 *
	 *  - INACTIVE: renders the stored commentary read-only (identical to the page's
	 *    static commentary render — body + renumbered footnote list), wrapped in a
	 *    clickable element with a light-blue hover border. Empty commentary shows a
	 *    quiet placeholder so the section is still a clickable target.
	 *  - ACTIVE (after a click): mounts a Tiptap editor with the SAME extension set
	 *    as the Analyze slideout's CommentaryEditor (minus zoom), shows a blue
	 *    active border, surfaces the editable footnote fields + inline glossary tags
	 *    strip, and auto-saves (debounced) to the matching API endpoint. Its command
	 *    API is registered with the commentaryToolbar bus so the universal toolbar at
	 *    the top of the page drives it.
	 *
	 * The parent owns "which subject is active" (activeKey) and toggles `active`.
	 */
	import { onDestroy, tick } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Link from '@tiptap/extension-link';
	import Highlight from '@tiptap/extension-highlight';
	import { Footnote } from '$lib/utils/tiptapFootnote.js';
	import { GlossaryTerm } from '$lib/utils/tiptapGlossaryTerm.js';
	import { TaggedHighlight } from '$lib/utils/tiptapTaggedHighlight.js';
	import { getMarkRange, isValidUrl } from '$lib/utils/tiptapUtils.js';
	import { getTermById } from '$lib/data/glossaryIndex.js';
	import LinkPopover from './LinkPopover.svelte';
	import GlossaryPicker from './GlossaryPicker.svelte';
	import { renderCommentaryWithFootnotes } from '$lib/utils/commentaryRender.js';
	import {
		registerCommentaryEditor,
		unregisterCommentaryEditor,
		bumpCommentaryState
	} from '$lib/stores/commentaryToolbar.svelte.js';

	let {
		/** @type {'segment'|'heading'|'connection'} */
		subjectType,
		/** @type {string} */
		subjectId,
		/** Stored commentary HTML (read-only source). */
		content = '',
		/** Whether THIS section is the active/editable one. */
		active = false,
		/** Tag class for the read-only wrapper so the page can tune spacing. */
		scope = 'segment',
		/** Wrapper element variant: 'block' (segment/heading) or 'connection'. */
		variant = 'block',
		/** Placeholder shown when there is no commentary yet. */
		placeholder = 'Add commentary',
		/** Called after a successful save so the page can re-paginate. */
		onSaved = () => {}
	} = $props();

	const HIGHLIGHT_COLOR = 'var(--yellow-lighter)';

	let editor = $state(null);
	let editorElement = $state(null);

	// Local copy of the saved HTML so the read-only view reflects edits after the
	// editor is torn down. We only adopt the `content` prop when it ACTUALLY changes
	// (e.g. the page reloads with fresh data) — NOT on every render — so deactivating
	// the editor doesn't revert the on-screen text back to the (still-stale) prop
	// before a reload has propagated our just-saved edits.
	let localContent = $state(content);
	let lastContentProp = content;
	$effect(() => {
		if (content !== lastContentProp) {
			lastContentProp = content;
			if (!active) localContent = content;
		}
	});

	let rendered = $derived(renderCommentaryWithFootnotes(localContent));

	// Footnotes surfaced from the live editor while editing.
	let footnotes = $state([]);
	let editingFootnoteId = $state(null);

	// Link popover state
	let showLinkInput = $state(false);
	let linkDisplayText = $state('');
	let linkUrl = $state('');
	let linkInputElement = $state(null);
	let linkPopoverPosition = $state(
		/** @type {{ top: number, left: number, arrowPosition: 'top'|'bottom' }} */ ({
			top: 0,
			left: 0,
			arrowPosition: 'bottom'
		})
	);
	let isEditingExistingLink = $state(false);

	// Glossary picker state
	let showGlossaryPicker = $state(false);
	let glossaryPickerPosition = $state({ top: 0, left: 0, arrowPosition: 'bottom', arrowOffset: 0, maxHeight: 0 });
	let glossaryPickerElement = $state(null);
	let savedSelection = null;

	let saveTimeout;

	/** Resolve the load/save endpoint for this subject. */
	function getApiUrl() {
		if (subjectType === 'connection') return `/api/segments/connections/${subjectId}`;
		if (subjectType === 'heading') return `/api/passages/headings/${subjectId}`;
		return `/api/segments/${subjectId}`;
	}

	async function saveCommentary(html) {
		try {
			const response = await fetch(getApiUrl(), {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ commentary: html })
			});
			if (!response.ok) console.error('Failed to save commentary');
			else onSaved();
		} catch (error) {
			console.error('Error saving commentary:', error);
		}
	}

	function scheduleSave(html) {
		localContent = html;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => saveCommentary(html), 800);
	}

	/** Build the command API the universal toolbar calls into. */
	function buildApi() {
		return {
			get editor() {
				return editor;
			},
			toggleBold: () => editor?.chain().focus().toggleBold().run(),
			toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
			toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
			toggleHighlight: toggleHighlight,
			toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
			toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
			toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
			insertHorizontalRule: () => editor?.chain().focus().setHorizontalRule().run(),
			openLink: (triggerEl) => openLinkInput(triggerEl),
			addFootnote: addFootnote,
			openGlossary: (triggerEl) => openGlossaryInline(triggerEl),
			clearFormatting: () => editor?.chain().focus().clearNodes().unsetAllMarks().run()
		};
	}

	let apiRef = null;

	// Mount/destroy the Tiptap editor as `active` toggles.
	$effect(() => {
		if (active && editorElement && !editor) {
			mountEditor();
		}
		if (!active && editor) {
			destroyEditor();
		}
	});

	function mountEditor() {
		editor = new Editor({
			element: editorElement,
			editable: true,
			extensions: [
				StarterKit.configure({
					heading: false,
					code: false,
					codeBlock: false,
					strike: false
				}),
				Link.configure({
					openOnClick: false,
					HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
				}),
				Highlight.configure({ multicolor: true }),
				Footnote,
				GlossaryTerm,
				TaggedHighlight
			],
			content: localContent || '<p></p>',
			editorProps: {
				attributes: { class: 'tiptap-editor', spellcheck: 'true' },
				handleClick(view, pos, event) {
					const link = /** @type {HTMLElement} */ (event.target).closest('a');
					if (link && link.href) {
						event.preventDefault();
						openLinkInput();
						return true;
					}
					return false;
				}
			},
			onUpdate: ({ editor }) => {
				scheduleSave(editor.getHTML());
				extractFromEditor();
			},
			onSelectionUpdate: () => bumpCommentaryState(),
			onTransaction: () => bumpCommentaryState(),
			autofocus: 'end'
		});

		apiRef = buildApi();
		registerCommentaryEditor(apiRef);
		extractFromEditor();
	}

	function destroyEditor() {
		// Flush a pending save synchronously-ish (best effort).
		if (saveTimeout) {
			clearTimeout(saveTimeout);
			saveTimeout = null;
		}
		if (editor) {
			const html = editor.getHTML();
			localContent = html;
			saveCommentary(html);
			editor.destroy();
			editor = null;
		}
		if (apiRef) {
			unregisterCommentaryEditor(apiRef);
			apiRef = null;
		}
		showLinkInput = false;
		showGlossaryPicker = false;
	}

	onDestroy(() => {
		destroyEditor();
	});

	/** Walk the editor doc to surface footnotes. (Inline glossary terms are NOT
	    reflected here — they're collected into the single universal "Tags" section
	    at the bottom of the document, so a per-editor tags strip would be redundant.) */
	function extractFromEditor() {
		if (!editor) return;
		const json = editor.getJSON();
		const notes = [];
		const walk = (node) => {
			if (node.type === 'footnote' && node.attrs) {
				notes.push({ id: node.attrs.id, content: node.attrs.content });
			}
			if (node.content) node.content.forEach(walk);
		};
		walk(json);
		footnotes = notes;
		tick().then(autosizeFootnotes);
	}

	function autosizeFootnotes() {
		const textareas = editorElement?.parentElement?.querySelectorAll('.footnote-field') ?? [];
		textareas.forEach((ta) => {
			ta.style.height = 'auto';
			ta.style.height = ta.scrollHeight + 'px';
		});
	}

	function toggleHighlight() {
		if (!editor) return;
		if (editor.isActive('highlight')) {
			editor.chain().focus().unsetHighlight().run();
		} else {
			editor.chain().focus().setHighlight({ color: HIGHLIGHT_COLOR }).run();
		}
	}

	/* ---- Footnotes ---- */
	function addFootnote() {
		const maxId = footnotes.length > 0 ? Math.max(...footnotes.map((f) => Number(f.id))) : 0;
		const nextId = maxId + 1;
		editor?.chain().focus().setFootnote({ id: String(nextId), content: '' }).run();
		editingFootnoteId = String(nextId);
		[100, 200, 300].forEach((delay) => {
			setTimeout(() => {
				const field = editorElement?.parentElement?.querySelector(
					`.footnote-field[data-footnote-id="${nextId}"]`
				);
				if (field && document.activeElement !== field) {
					field.focus();
					field.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}, delay);
		});
	}

	function updateFootnoteContent(footnoteId, newContent) {
		if (!editor) return;
		const { state, view } = editor;
		const { tr } = state;
		let updated = false;
		state.doc.descendants((node, pos) => {
			if (node.type.name === 'footnote' && node.attrs.id === footnoteId) {
				tr.setNodeMarkup(pos, null, { ...node.attrs, content: newContent });
				updated = true;
				return false;
			}
		});
		if (updated) view.dispatch(tr);
	}

	/* ---- Link popover ---- */
	let autoSaveTimeout;
	function autoSaveLink() {
		clearTimeout(autoSaveTimeout);
		autoSaveTimeout = setTimeout(() => {
			if (!linkDisplayText && !linkUrl) {
				if (isEditingExistingLink) editor?.chain().unsetLink().run();
			} else if (linkUrl) {
				const displayText = linkDisplayText || linkUrl;
				if (isEditingExistingLink) {
					editor?.chain().extendMarkRange('link').setLink({ href: linkUrl }).insertContent(displayText).run();
				} else {
					editor?.chain().insertContent(`<a href="${linkUrl}">${displayText}</a>`).run();
					isEditingExistingLink = true;
				}
			}
		}, 500);
	}

	function removeLink() {
		editor?.chain().focus().unsetLink().run();
		closeLinkPopover();
	}

	function openLink() {
		if (linkUrl && isValidUrl(linkUrl)) window.open(linkUrl, '_blank', 'noopener,noreferrer');
	}

	function closeLinkPopover() {
		showLinkInput = false;
		linkDisplayText = '';
		linkUrl = '';
		isEditingExistingLink = false;
		clearTimeout(autoSaveTimeout);
	}

	let isRemoveDisabled = $derived(!linkUrl);
	let isOpenDisabled = $derived(!linkUrl || !isValidUrl(linkUrl));

	/**
	 * Open the link popover. Positioned over the toolbar trigger when supplied
	 * (the universal toolbar is at the top of the page), else over the selection.
	 */
	function openLinkInput(triggerEl) {
		if (!editor) return;
		const { state } = editor;
		const { selection } = state;
		let { from, to } = selection;
		const linkAttrs = editor.getAttributes('link');
		isEditingExistingLink = !!linkAttrs.href;
		if (isEditingExistingLink) {
			const resolvedPos = state.selection.$from;
			const markType = state.schema.marks.link;
			const markRange = getMarkRange(resolvedPos, markType);
			if (markRange) {
				from = markRange.from;
				to = markRange.to;
				editor.commands.setTextSelection({ from, to });
				linkUrl = linkAttrs.href || '';
				linkDisplayText = state.doc.textBetween(from, to) || '';
			} else {
				linkUrl = linkAttrs.href || '';
				linkDisplayText = state.doc.textBetween(from, to) || '';
			}
		} else {
			linkDisplayText = state.doc.textBetween(from, to) || '';
			linkUrl = '';
		}

		const GAP = 10;
		const EDGE_MARGIN = 10;
		const POPOVER_WIDTH = 320;
		let top, left;
		/** @type {'top'|'bottom'} */
		const arrowPosition = /** @type {'top'} */ ('top');
		if (triggerEl) {
			const rect = triggerEl.getBoundingClientRect();
			left = rect.left + rect.width / 2;
			top = rect.bottom + GAP;
		} else {
			const view = editor.view;
			const startCoords = view.coordsAtPos(from);
			const endCoords = view.coordsAtPos(to);
			left = (startCoords.left + endCoords.left) / 2;
			top = ((startCoords.bottom + endCoords.bottom) / 2) + GAP;
		}
		const halfWidth = POPOVER_WIDTH / 2;
		if (left - halfWidth < EDGE_MARGIN) left = halfWidth + EDGE_MARGIN;
		else if (left + halfWidth > window.innerWidth - EDGE_MARGIN) left = window.innerWidth - halfWidth - EDGE_MARGIN;
		linkPopoverPosition = { top, left, arrowPosition };
		showLinkInput = true;
	}

	// Click-outside for the link popover
	$effect(() => {
		if (showLinkInput) {
			const handler = (event) => {
				if (linkInputElement && !linkInputElement.contains(event.target)) closeLinkPopover();
			};
			setTimeout(() => window.addEventListener('click', handler), 0);
			return () => window.removeEventListener('click', handler);
		}
	});

	/* ---- Glossary picker ---- */
	let glossaryTriggerEl = null;
	function positionPickerFor(triggerEl) {
		const rect = triggerEl.getBoundingClientRect();
		const GAP = 8;
		const MARGIN = 16;
		const PREFERRED_HEIGHT = 360;
		const centerLeft = rect.left + rect.width / 2;
		const spaceAbove = rect.top - GAP - MARGIN;
		const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;
		let top, arrowPosition, maxHeight;
		if (spaceBelow >= PREFERRED_HEIGHT || spaceBelow >= spaceAbove) {
			top = rect.bottom + GAP;
			arrowPosition = 'top';
			maxHeight = spaceBelow;
		} else {
			top = rect.top - GAP;
			arrowPosition = 'bottom';
			maxHeight = spaceAbove;
		}
		let left = centerLeft;
		const half = 230;
		if (left - half < MARGIN) left = half + MARGIN;
		else if (left + half > window.innerWidth - MARGIN) left = window.innerWidth - half - MARGIN;
		const arrowOffset = centerLeft - left;
		glossaryPickerPosition = { top, left, arrowPosition, arrowOffset, maxHeight };
	}

	function openGlossaryInline(triggerEl) {
		if (!editor || !triggerEl) return;
		glossaryTriggerEl = triggerEl;
		const { from, to } = editor.state.selection;
		savedSelection = { from, to };
		positionPickerFor(triggerEl);
		showGlossaryPicker = true;
	}

	function closeGlossaryPicker() {
		showGlossaryPicker = false;
	}

	function handleGlossarySelect(termId) {
		insertInlineTerm(termId);
		closeGlossaryPicker();
	}

	function insertInlineTerm(termId) {
		if (!editor) return;
		const entry = getTermById(termId);
		const label = entry?.term || '';
		const { from, to } = savedSelection ?? editor.state.selection;
		savedSelection = null;
		const hasSelection = to > from;
		if (!hasSelection) {
			editor.chain().focus().setGlossaryTerm({ termId, label }).run();
		} else {
			const pillPositions = [];
			editor.state.doc.nodesBetween(from, to, (node, pos) => {
				if (node.type.name === 'glossaryTerm') pillPositions.push(pos);
			});
			let chain = editor.chain().focus();
			for (let i = pillPositions.length - 1; i >= 0; i--) {
				const pos = pillPositions[i];
				chain = chain.deleteRange({ from: pos, to: pos + 1 });
			}
			const adjustedTo = to - pillPositions.length;
			chain
				.insertContentAt(adjustedTo, { type: 'glossaryTerm', attrs: { termId, label } })
				.setTextSelection({ from, to: adjustedTo + 1 })
				.setTaggedHighlight({ termId })
				.setTextSelection(adjustedTo + 1)
				.run();
		}
	}

	// Click-outside for the glossary picker
	$effect(() => {
		if (showGlossaryPicker) {
			const handler = (event) => {
				if (glossaryPickerElement && !glossaryPickerElement.contains(event.target)) closeGlossaryPicker();
			};
			setTimeout(() => window.addEventListener('click', handler), 0);
			return () => window.removeEventListener('click', handler);
		}
	});

	let hasContent = $derived(!!localContent && localContent.replace(/<[^>]*>/g, '').trim().length > 0);
</script>

{#if active}
	<!-- ACTIVE: editable Tiptap surface. The blue active border is applied by the
	     page's wrapper rule; here we just provide the editor + apparatus. -->
	<div class="doc-commentary-edit" class:connection={variant === 'connection'}>
		<div class="doc-commentary-editor-surface" bind:this={editorElement}></div>

		{#if footnotes.length > 0}
			<div class="doc-commentary-footnotes">
				{#each footnotes as note, index (note.id)}
					<div class="footnote-item">
						<span class="footnote-number"><sup>{index + 1}</sup></span>
						<textarea
							class="footnote-field"
							data-footnote-id={note.id}
							value={note.content}
							placeholder="Enter footnote text..."
							rows="1"
							oninput={(e) => {
								const target = /** @type {HTMLTextAreaElement} */ (e.target);
								target.style.height = 'auto';
								target.style.height = target.scrollHeight + 'px';
								updateFootnoteContent(note.id, target.value);
							}}
							onfocus={() => (editingFootnoteId = note.id)}
							onblur={() => (editingFootnoteId = null)}
						></textarea>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{:else if hasContent}
	<!-- INACTIVE with content: read-only render (matches the page's static output). -->
	<div class="doc-commentary-body">{@html rendered.html}</div>
	{#if rendered.footnotes.length > 0}
		<ol class="doc-footnotes">
			{#each rendered.footnotes as footnote (footnote.number)}
				<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
			{/each}
		</ol>
	{/if}
{:else}
	<!-- INACTIVE empty: quiet placeholder so the section is still a click target. -->
	<div class="doc-commentary-placeholder">{placeholder}</div>
{/if}

{#if showLinkInput}
	<LinkPopover
		bind:linkDisplayText
		bind:linkUrl
		position={linkPopoverPosition}
		{isRemoveDisabled}
		{isOpenDisabled}
		onUpdate={autoSaveLink}
		onRemove={removeLink}
		onOpen={openLink}
		onClose={closeLinkPopover}
		bind:popoverElement={linkInputElement}
	/>
{/if}

{#if showGlossaryPicker}
	<GlossaryPicker
		position={glossaryPickerPosition}
		onSelect={handleGlossarySelect}
		onClose={closeGlossaryPicker}
		bind:popoverElement={glossaryPickerElement}
	/>
{/if}

<style>
	.doc-commentary-edit :global(.tiptap-editor) {
		outline: none;
		font-family: inherit;
		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-100);
		min-height: 2.4rem;
	}

	.doc-commentary-edit :global(.tiptap-editor p) {
		margin: 0 0 1.2rem 0;
	}

	.doc-commentary-edit :global(.tiptap-editor > :last-child) {
		margin-bottom: 0;
	}

	.doc-commentary-edit :global(.tiptap-editor ul),
	.doc-commentary-edit :global(.tiptap-editor ol) {
		padding-left: 2.4rem;
	}

	.doc-commentary-edit :global(.tiptap-editor li) {
		margin: 0.6rem 0;
	}

	.doc-commentary-edit :global(.tiptap-editor li p) {
		margin: 0;
	}

	/* Read-only render (the {:else if hasContent} branch). Svelte scopes styles per
	   component, so the page's `.doc-commentary-body` rule doesn't reach this div —
	   restate it here so the read view matches the 1.2rem edit view rather than
	   inheriting the larger passage-text size. */
	.doc-commentary-body {
		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-100);
	}

	.doc-commentary-body :global(> :first-child) {
		margin-top: 0;
	}

	.doc-commentary-body :global(> :last-child) {
		margin-bottom: 0;
	}

	/* Read-only footnote list beneath the commentary — match the document's 1.2rem
	   footnote styling (the page's `.doc-footnotes`/`.doc-footnote` rules are scoped
	   to the page component and don't reach here). */
	.doc-footnotes {
		margin: 0.9rem 0 0;
		padding: 0.6rem 0 0 1.8rem;
		list-style: decimal;
		list-style-position: outside;
	}

	.doc-footnote {
		font-size: 1.2rem;
		line-height: 1.6;
		color: var(--gray-300);
		margin: 0.2rem 0 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.doc-footnote::marker {
		color: var(--gray-400);
		font-weight: 600;
	}

	.doc-commentary-placeholder {
		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-400);
		font-style: italic;
	}

	/* Editable footnote fields while editing. */
	.doc-commentary-footnotes {
		margin-top: 0.9rem;
		padding-top: 0.6rem;
		border-top: 0.1rem solid var(--gray-700);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.footnote-item {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
	}

	.footnote-number {
		font-size: 1.2rem;
		color: var(--gray-400);
		font-weight: 600;
		line-height: 1.6;
	}

	.footnote-field {
		flex: 1;
		border: none;
		outline: none;
		resize: none;
		overflow: hidden;
		font-family: inherit;
		font-size: 1.2rem;
		line-height: 1.6;
		color: var(--gray-300);
		background: transparent;
		padding: 0;
	}

	.footnote-field:focus {
		color: var(--gray-100);
	}
</style>
