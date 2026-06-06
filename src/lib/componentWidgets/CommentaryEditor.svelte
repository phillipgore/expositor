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
	import Highlight from '@tiptap/extension-highlight';
	import { Footnote } from '$lib/utils/tiptapFootnote.js';
	import { GlossaryTerm } from '$lib/utils/tiptapGlossaryTerm.js';
	import { getMarkRange, isValidUrl } from '$lib/utils/tiptapUtils.js';
	import Icon from '$lib/componentElements/Icon.svelte';
	import LinkPopover from './LinkPopover.svelte';
	import GlossaryPicker from './GlossaryPicker.svelte';
	import GlossaryBadge from '$lib/componentElements/GlossaryBadge.svelte';
	import { tooltip } from '$lib/composables/useTooltip.svelte.js';
	import * as tooltipStore from '$lib/stores/tooltipStore.svelte.js';
	import { getTooltipHtml, getTermById } from '$lib/data/glossaryIndex.js';


	let {
		content = '',
		onUpdate = () => {},
		/** @type {'segment'|'section'|'column'|'connection'|null} */
		subjectType = null,
		/** @type {string|null} */
		subjectId = null
	} = $props();


	let editor;
	let editorElement;
	let showLinkInput = $state(false);
	let linkDisplayText = $state('');
	let linkUrl = $state('');
	let linkInputElement;
	let linkPopoverPosition = $state({ top: 0, left: 0, arrowPosition: 'bottom' });
	let isEditingExistingLink = $state(false);
	let editingFootnoteId = $state(null);

	// Reactive counter bumped on every editor selection/transaction so that
	// `isActive()` (and thus the toolbar active states) re-evaluates live as the
	// cursor moves, not just when document content changes.
	let editorState = $state(0);

	// Heading dropdown (H4–H6) state
	let showHeadingMenu = $state(false);
	let headingMenuElement = $state(null);

	// Lists dropdown (Bullet / Numbered) state
	let showListsMenu = $state(false);
	let listsMenuElement = $state(null);

	// Insert dropdown (Blockquote / Horizontal Rule) state
	let showInsertMenu = $state(false);
	let insertMenuElement = $state(null);

	// Highlight color dropdown state
	let showHighlightMenu = $state(false);
	let highlightMenuElement = $state(null);

	// The 8 app colors offered for highlighting (uses the `-light` shade).
	const highlightColors = [
		{ name: 'Red', value: 'var(--red-light)' },
		{ name: 'Orange', value: 'var(--orange-light)' },
		{ name: 'Yellow', value: 'var(--yellow-light)' },
		{ name: 'Green', value: 'var(--green-light)' },
		{ name: 'Aqua', value: 'var(--aqua-light)' },
		{ name: 'Blue', value: 'var(--blue-light)' },
		{ name: 'Purple', value: 'var(--purple-light)' },
		{ name: 'Pink', value: 'var(--pink-light)' }
	];

	// Glossary picker state. `glossaryMode` distinguishes the two entry points:
	//  - 'inline' → insert a badge into the prose at the cursor
	//  - 'tag'    → add a bottom tag for the whole subject
	let showGlossaryPicker = $state(false);
	let glossaryMode = $state('inline');
	let glossaryPickerPosition = $state({ top: 0, left: 0, arrowPosition: 'bottom', arrowOffset: 0, maxHeight: 0 });


	let glossaryPickerElement = $state(null);
	// Remember the element that opened the picker so we can reposition it when
	// the window is resized while the picker is open.
	let glossaryTriggerEl = null;


	// Bottom "tags" for the whole subject (loaded from /api/commentary-tags).
	let tags = $state([]);


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
					// Limit headings to H4–H6 so they stay semantically distinct
					// from the H1–H3 used by the passage/segment structure.
					heading: { levels: [4, 5, 6] },
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
				Highlight.configure({ multicolor: true }),
				Footnote,
				GlossaryTerm
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
			// Bump the reactive counter so toolbar active states re-evaluate as the
			// selection moves or any transaction is applied.
			onSelectionUpdate: () => {
				editorState++;
			},
			onTransaction: () => {
				editorState++;
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

	function toggleUnderline() {
		editor?.chain().focus().toggleUnderline().run();
	}

	/** Apply a highlight in the given color and close the menu. */
	function setHighlight(color) {
		editor?.chain().focus().setHighlight({ color }).run();
		showHighlightMenu = false;
	}

	/** Remove any highlight from the selection and close the menu. */
	function removeHighlight() {
		editor?.chain().focus().unsetHighlight().run();
		showHighlightMenu = false;
	}

	/** Toggle the Highlight color dropdown menu open/closed. */
	function toggleHighlightMenu() {
		showHighlightMenu = !showHighlightMenu;
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
		showListsMenu = false;
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
		showListsMenu = false;
	}

	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
		showInsertMenu = false;
	}

	function insertHorizontalRule() {
		editor?.chain().focus().setHorizontalRule().run();
		showInsertMenu = false;
	}

	/** Toggle the Lists dropdown menu open/closed. */
	function toggleListsMenu() {
		showListsMenu = !showListsMenu;
	}

	/** Toggle the Insert dropdown menu open/closed. */
	function toggleInsertMenu() {
		showInsertMenu = !showInsertMenu;
	}

	/**
	 * Toggle a heading at the given level (4, 5 or 6). Toggling an already-active
	 * level turns the block back into a paragraph.
	 * @param {4|5|6} level
	 */
	function toggleHeading(level) {
		editor?.chain().focus().toggleHeading({ level }).run();
		showHeadingMenu = false;
	}

	/** Toggle the H4–H6 dropdown menu open/closed. */
	function toggleHeadingMenu() {
		showHeadingMenu = !showHeadingMenu;
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
		// Touch the reactive counter so this re-evaluates on selection/transaction
		// changes, keeping the toolbar's active states in sync with the cursor.
		editorState;
		return editor?.isActive(type, attrs) ?? false;
	}

	// Click-outside detection for the heading (H4–H6) dropdown menu
	$effect(() => {
		if (showHeadingMenu) {
			const handleClickOutside = (event) => {
				if (headingMenuElement && !headingMenuElement.contains(event.target)) {
					showHeadingMenu = false;
				}
			};
			// Small delay to avoid immediate close from the opening click
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// Click-outside detection for the Lists dropdown menu
	$effect(() => {
		if (showListsMenu) {
			const handleClickOutside = (event) => {
				if (listsMenuElement && !listsMenuElement.contains(event.target)) {
					showListsMenu = false;
				}
			};
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// Click-outside detection for the Insert dropdown menu
	$effect(() => {
		if (showInsertMenu) {
			const handleClickOutside = (event) => {
				if (insertMenuElement && !insertMenuElement.contains(event.target)) {
					showInsertMenu = false;
				}
			};
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// Click-outside detection for the Highlight color dropdown menu
	$effect(() => {
		if (showHighlightMenu) {
			const handleClickOutside = (event) => {
				if (highlightMenuElement && !highlightMenuElement.contains(event.target)) {
					showHighlightMenu = false;
				}
			};
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	/* ----------------------------------------------------------------------
	 * Glossary: inline insertion + bottom tags
	 * -------------------------------------------------------------------- */

	/**
	 * Position the glossary picker relative to a trigger element (toolbar button
	 * or "Add tag" button), with simple vertical collision handling.
	 * @param {HTMLElement} triggerEl
	 */
	function positionPickerFor(triggerEl) {
		const rect = triggerEl.getBoundingClientRect();
		const GAP = 8;
		const MARGIN = 16; // breathing room from the viewport edges
		const PREFERRED_HEIGHT = 360; // ideal picker height when space allows
		const centerLeft = rect.left + rect.width / 2;

		// Space available on each side of the trigger (minus gap + margin).
		const spaceAbove = rect.top - GAP - MARGIN;
		const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN;

		let top;
		let arrowPosition;
		let maxHeight;
		// Prefer above when it can fit a useful amount; otherwise pick the side
		// with the most room. The picker grows upward (arrow bottom) or downward
		// (arrow top) from `top`, so clamp maxHeight to that side's free space.
		if (spaceAbove >= PREFERRED_HEIGHT || spaceAbove >= spaceBelow) {
			top = rect.top - GAP;
			arrowPosition = 'bottom';
			maxHeight = spaceAbove;
		} else {
			top = rect.bottom + GAP;
			arrowPosition = 'top';
			maxHeight = spaceBelow;
		}

		// Keep horizontally within viewport (picker is 34rem ≈ 340px, half = 170)
		let left = centerLeft;
		const half = 170;
		if (left - half < MARGIN) left = half + MARGIN;
		else if (left + half > window.innerWidth - MARGIN) left = window.innerWidth - half - MARGIN;

		// The picker may be clamped away from the trigger's center, so tell the
		// picker how far (in px) to shift its arrow to keep pointing at the button.
		const arrowOffset = centerLeft - left;

		glossaryPickerPosition = { top, left, arrowPosition, arrowOffset, maxHeight };
	}



	/**
	 * Open the picker to insert an inline glossary badge at the cursor.
	 */
	function openGlossaryInline(event) {
		glossaryMode = 'inline';
		glossaryTriggerEl = event.currentTarget;
		positionPickerFor(event.currentTarget);
		showGlossaryPicker = true;
	}


	/**
	 * Open the picker to add a bottom tag for the whole subject.
	 */
	function openGlossaryTag(event) {
		glossaryMode = 'tag';
		glossaryTriggerEl = event.currentTarget;
		positionPickerFor(event.currentTarget);
		showGlossaryPicker = true;
	}


	function closeGlossaryPicker() {
		showGlossaryPicker = false;
	}

	/**
	 * Handle a term chosen from the picker, routing to the active mode.
	 * @param {string} termId
	 */
	function handleGlossarySelect(termId) {
		if (glossaryMode === 'inline') {
			insertInlineTerm(termId);
		} else {
			addTag(termId);
		}
		closeGlossaryPicker();
	}

	/**
	 * Insert an inline glossary badge node at the current cursor position.
	 * @param {string} termId
	 */
	function insertInlineTerm(termId) {
		const entry = getTermById(termId);
		editor
			?.chain()
			.focus()
			.setGlossaryTerm({ termId, label: entry?.term || '' })
			.run();
	}

	/* ---- Bottom tags (persisted via /api/commentary-tags) ---- */

	let hasSubject = $derived(!!subjectType && !!subjectId);

	async function loadTags() {
		if (!subjectType || !subjectId) {
			tags = [];
			return;
		}
		try {
			const res = await fetch(
				`/api/commentary-tags?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`
			);
			if (res.ok) {
				const data = await res.json();
				tags = data.tags || [];
			} else {
				tags = [];
			}
		} catch (error) {
			console.error('[TAGS] Failed to load tags:', error);
			tags = [];
		}
	}

	async function addTag(termId) {
		if (!subjectType || !subjectId) return;
		// Optimistic: skip if already present
		if (tags.some((t) => t.termId === termId)) return;
		try {
			const res = await fetch('/api/commentary-tags', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subjectType, subjectId, termId })
			});
			if (res.ok) {
				const data = await res.json();
				if (data.tag) tags = [...tags, data.tag];
			}
		} catch (error) {
			console.error('[TAGS] Failed to add tag:', error);
		}
	}

	async function removeTag(tag) {
		try {
			const res = await fetch(`/api/commentary-tags?id=${encodeURIComponent(tag.id)}`, {
				method: 'DELETE'
			});
			if (res.ok) {
				tags = tags.filter((t) => t.id !== tag.id);
			}
		} catch (error) {
			console.error('[TAGS] Failed to remove tag:', error);
		}
	}

	// Load tags whenever the subject changes
	$effect(() => {
		// Reference reactive deps explicitly
		const _type = subjectType;
		const _id = subjectId;
		loadTags();
	});

	// Wire hover tooltips for inline glossary badges rendered inside Tiptap.
	// Delegated listeners on the editor element (the `use:tooltip` action can't
	// attach to raw ProseMirror DOM).
	$effect(() => {
		if (!editorElement) return;

		const handleEnter = (event) => {
			const badge = event.target.closest?.('.glossary-term');
			if (!badge) return;
			const termId = badge.getAttribute('data-term-id');
			if (!termId) return;
			tooltipStore.show({
				content: getTooltipHtml(termId),
				targetElement: badge,
				placement: 'top',
				offset: 2,
				allowHtml: true
			});
		};
		const handleLeave = (event) => {
			if (event.target.closest?.('.glossary-term')) {
				tooltipStore.hide();
			}
		};
		// Clicking an inline badge pins its tooltip open (selectable for copying)
		// until the user clicks elsewhere. Stop propagation so the tooltip's own
		// click-outside handler doesn't immediately close it.
		const handleClick = (event) => {
			const badge = event.target.closest?.('.glossary-term');
			if (!badge) return;
			const termId = badge.getAttribute('data-term-id');
			if (!termId) return;
			event.stopPropagation();
			tooltipStore.pin({
				content: getTooltipHtml(termId),
				targetElement: badge,
				placement: 'top',
				offset: 2,
				allowHtml: true
			});
		};

		editorElement.addEventListener('mouseover', handleEnter);
		editorElement.addEventListener('mouseout', handleLeave);
		editorElement.addEventListener('click', handleClick);

		return () => {
			editorElement.removeEventListener('mouseover', handleEnter);
			editorElement.removeEventListener('mouseout', handleLeave);
			editorElement.removeEventListener('click', handleClick);
		};
	});


	// Click-outside detection for the glossary picker
	$effect(() => {
		if (showGlossaryPicker) {
			const handleClickOutside = (event) => {
				if (glossaryPickerElement && !glossaryPickerElement.contains(event.target)) {
					closeGlossaryPicker();
				}
			};
			setTimeout(() => {
				window.addEventListener('click', handleClickOutside);
			}, 0);
			return () => {
				window.removeEventListener('click', handleClickOutside);
			};
		}
	});

	// Recompute the picker's position/size when the viewport is resized while the
	// picker is open, so it grows or shrinks to the available vertical space.
	$effect(() => {
		if (showGlossaryPicker && glossaryTriggerEl) {
			const handleResize = () => {
				if (glossaryTriggerEl) positionPickerFor(glossaryTriggerEl);
			};
			window.addEventListener('resize', handleResize);
			return () => {
				window.removeEventListener('resize', handleResize);
			};
		}
	});



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
		<div class="toolbar-group dropdown-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button has-caret"
				class:active={isActive('heading', { level: 4 }) ||
					isActive('heading', { level: 5 }) ||
					isActive('heading', { level: 6 })}
				onmousedown={(e) => e.preventDefault()}
				onclick={toggleHeadingMenu}
				title="Heading"
				aria-label="Heading"
				aria-haspopup="menu"
				aria-expanded={showHeadingMenu}
			>
				<Icon iconId="headings" />
				<Icon iconId="caret-down" classes="menu-caret" />
			</button>

			{#if showHeadingMenu}
				<div class="dropdown-menu" role="menu" bind:this={headingMenuElement}>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('heading', { level: 4 })}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => toggleHeading(4)}
					>
						Heading 4
					</button>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('heading', { level: 5 })}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => toggleHeading(5)}
					>
						Heading 5
					</button>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('heading', { level: 6 })}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => toggleHeading(6)}
					>
						Heading 6
					</button>
				</div>
			{/if}
		</div>

		<!-- <div class="toolbar-divider"></div> -->

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
			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				class:active={isActive('underline')}
				onclick={toggleUnderline}
				title="Underline (Cmd+U)"
				aria-label="Underline"
			>
				<Icon iconId="underline" />
			</button>
			<div class="dropdown-group">
				<button
					use:tooltip
					type="button"
					class="toolbar-button has-caret"
					class:active={isActive('highlight')}
					onmousedown={(e) => e.preventDefault()}
					onclick={toggleHighlightMenu}
					title="Highlight"
					aria-label="Highlight"
					aria-haspopup="menu"
					aria-expanded={showHighlightMenu}
				>
					<Icon iconId="highlight" />
					<Icon iconId="caret-down" classes="menu-caret" />
				</button>

				{#if showHighlightMenu}
					<div class="dropdown-menu" role="menu" bind:this={highlightMenuElement}>
						{#each highlightColors as color (color.name)}
							<button
								type="button"
								class="dropdown-menu-item"
								class:active={isActive('highlight', { color: color.value })}
								role="menuitem"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => setHighlight(color.value)}
							>
								{color.name}
							</button>
						{/each}
						<div class="dropdown-divider" role="separator"></div>
						<button
							type="button"
							class="dropdown-menu-item"
							role="menuitem"
							onmousedown={(e) => e.preventDefault()}
							onclick={removeHighlight}
						>
							Remove Highlight
						</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group dropdown-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button has-caret"
				class:active={isActive('bulletList') || isActive('orderedList')}
				onmousedown={(e) => e.preventDefault()}
				onclick={toggleListsMenu}
				title="Lists"
				aria-label="Lists"
				aria-haspopup="menu"
				aria-expanded={showListsMenu}
			>
				<Icon iconId="outline-bulleted" />
				<Icon iconId="caret-down" classes="menu-caret" />
			</button>

			{#if showListsMenu}
				<div class="dropdown-menu" role="menu" bind:this={listsMenuElement}>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('bulletList')}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={toggleBulletList}
					>
						Bullet List
					</button>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('orderedList')}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={toggleOrderedList}
					>
						Numbered List
					</button>
				</div>
			{/if}
		</div>

		<!-- <div class="toolbar-divider"></div> -->

		<div class="toolbar-group dropdown-group">
			<button
				use:tooltip
				type="button"
				class="toolbar-button has-caret"
				class:active={isActive('blockquote')}
				onmousedown={(e) => e.preventDefault()}
				onclick={toggleInsertMenu}
				title="Insert"
				aria-label="Insert"
				aria-haspopup="menu"
				aria-expanded={showInsertMenu}
			>
				<Icon iconId="plus" />
				<Icon iconId="caret-down" classes="menu-caret" />
			</button>

			{#if showInsertMenu}
				<div class="dropdown-menu" role="menu" bind:this={insertMenuElement}>
					<button
						type="button"
						class="dropdown-menu-item"
						class:active={isActive('blockquote')}
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={toggleBlockquote}
					>
						Blockquote
					</button>
					<button
						type="button"
						class="dropdown-menu-item"
						role="menuitem"
						onmousedown={(e) => e.preventDefault()}
						onclick={insertHorizontalRule}
					>
						Horizontal Rule
					</button>
				</div>
			{/if}
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

			<button
				use:tooltip
				type="button"
				class="toolbar-button"
				onmousedown={(e) => e.preventDefault()}
				onclick={openGlossaryInline}
				title="Insert Glossary Term"
				aria-label="Insert Glossary Term"
			>
				<Icon iconId="glossary" />
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
			onClose={closePopover}
			bind:popoverElement={linkInputElement}
		/>
	{/if}

	<div class="editor-content" style="transform: scale({zoomScale}); transform-origin: top left;" onclick={handleEditorContentClick}>
		<div bind:this={editorElement}></div>
		
		{#if hasSubject}
			<div class="tags-section">
				<div class="tags-box">
				<div class="tags-row">
					<div class="tags-list">
						{#each tags as tag (tag.id)}
							<GlossaryBadge
								termId={tag.termId}
								removable={true}
								onRemove={() => removeTag(tag)}
							/>
						{/each}
					</div>
					<div class="tags-actions">
						<button
							type="button"
							class="tag-add-button"
							onmousedown={(e) => e.preventDefault()}
							onclick={openGlossaryTag}
							aria-label="Add Glossary Term"
						>
							Add Glossary Term
						</button>

					</div>
				</div>
				</div>
			</div>
		{/if}

		{#if footnotes.length > 0}
			<div class="footnotes-section">
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

{#if showGlossaryPicker}
	<GlossaryPicker
		position={glossaryPickerPosition}
		onSelect={handleGlossarySelect}
		onClose={closeGlossaryPicker}
		bind:popoverElement={glossaryPickerElement}
	/>
{/if}


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

	/* Toolbar dropdowns (Heading / Lists / Insert) */
	.dropdown-group {
		position: relative;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 200;
		display: flex;
		flex-direction: column;
		min-width: 14rem;
		padding: 0.3rem;
		background-color: var(--gray-800);
		border: none;
		border-radius: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
	}

	.dropdown-divider {
		margin: 0.4rem 0;
		border-top: 0.1rem solid var(--gray-700);
	}

	.dropdown-menu-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.6rem 0.9rem;
		border: none;
		border-radius: 0.3rem;
		background-color: transparent;
		color: var(--black);
		font-size: 1.2rem;
		font-weight: 500;
		font-family: inherit;
		line-height: 1;
		white-space: nowrap;
		text-align: left;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dropdown-menu-item :global(.menu-item-icon path) {
		fill: var(--gray-darker);
	}

	.dropdown-menu-item:hover {
		background-color: var(--blue);
		color: var(--white);
	}

	.dropdown-menu-item:hover :global(.menu-item-icon path) {
		fill: var(--white);
	}

	.dropdown-menu-item.active {
		background-color: var(--gray-dark);
		color: var(--white);
	}

	.dropdown-menu-item.active :global(.menu-item-icon path) {
		fill: var(--white);
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
		background-color: var(--gray-dark);
		border-color: var(--gray-dark);
		color: var(--white);
	}

	.toolbar-button.active :global(.icon path) {
		fill: var(--white);
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

	:global(.tiptap-editor h4) {
		font-size: 2.0rem;
		font-weight: 600;
		color: var(--black);
		margin: 1.6rem 0 0.4rem 0;
		line-height: 1.4;
	}

	:global(.tiptap-editor h4:first-child) {
		margin-top: 0;
	}

	:global(.tiptap-editor h5) {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--black);
		margin: 1.6rem 0 0.4rem 0;
		line-height: 1.5;
	}

	:global(.tiptap-editor h5:first-child) {
		margin-top: 0;
	}

	:global(.tiptap-editor h6) {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--gray-400);
		margin: 1.6rem 0 0.4rem 0;
		line-height: 1.5;
	}

	:global(.tiptap-editor h6:first-child) {
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
		margin-top: 2.2rem;
		padding: 0 1.8rem 1.8rem;
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

	/* Inline Glossary Term badges (rendered by the Tiptap GlossaryTerm node) */
	:global(.tiptap-editor .glossary-term) {
		display: inline-block;
		padding: 0.1rem 0.6rem;
		border-radius: 999em;
		font-size: 0.9em;
		font-weight: 500;
		line-height: 1.4;
		white-space: nowrap;
		cursor: default;
		vertical-align: baseline;
	}

	:global(.tiptap-editor .glossary-term.gray) { background-color: var(--gray-lighter); color: var(--gray-darker); }
	:global(.tiptap-editor .glossary-term.red) { background-color: var(--red-lighter); color: var(--red-darker); }
	:global(.tiptap-editor .glossary-term.orange) { background-color: var(--orange-lighter); color: var(--orange-darker); }
	:global(.tiptap-editor .glossary-term.yellow) { background-color: var(--yellow-lighter); color: var(--yellow-darker); }
	:global(.tiptap-editor .glossary-term.green) { background-color: var(--green-lighter); color: var(--green-darker); }
	:global(.tiptap-editor .glossary-term.aqua) { background-color: var(--aqua-lighter); color: var(--aqua-darker); }
	:global(.tiptap-editor .glossary-term.blue) { background-color: var(--blue-lighter); color: var(--blue-darker); }
	:global(.tiptap-editor .glossary-term.purple) { background-color: var(--purple-lighter); color: var(--purple-darker); }
	:global(.tiptap-editor .glossary-term.pink) { background-color: var(--pink-lighter); color: var(--pink-darker); }

	:global(.tiptap-editor .ProseMirror-selectednode.glossary-term) {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.1rem;
	}

	/* Bottom Tags strip */
	.tags-section {
		padding: 0 1.8rem;
	}

	/* Bordered box surrounding the bottom glossary terms */
	.tags-box {
		border: 1px solid var(--gray-700);
		border-radius: 0.3rem;
		padding: 1.2rem;
	}

	.tags-row {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.9rem;
	}

	.tags-actions {
		display: flex;
		justify-content: flex-end;
	}


	.tags-label {
		flex-shrink: 0;
		font-size: 1.1rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gray-400);
		padding-top: 0.4rem;
	}

	.tags-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.tag-add-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.8rem;
		padding: 0 0.9rem;
		border: none;
		border-radius: 0.3rem;
		background-color: var(--gray-light);
		color: var(--gray-darker);
		font-size: 1.2rem;
		font-weight: 600;
		font-family: inherit;
		line-height: 1;
		white-space: nowrap;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tag-add-button:hover {
		background-color: var(--gray-light);
		border-color: var(--gray-500);
	}

	.tag-add-button:active {
		background-color: var(--gray-dark);
		color: var(--white);
	}


</style>

