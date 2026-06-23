/**
 * Commentary Toolbar bus.
 *
 * Connects the universal commentary toolbar at the top of the Document page to
 * whichever inline commentary editor is currently active. Only ONE commentary
 * section is editable at a time: clicking a section mounts a Tiptap editor that
 * registers its command API here; the top toolbar reads `activeApi` to drive
 * its buttons and `version` to keep active-states (bold/italic/…) live as the
 * cursor moves. When no section is active the toolbar is disabled.
 *
 * Uses runes in a `.svelte.js` module so the reactive `$state` is shared across
 * the (separate) toolbar and editor components.
 *
 * @typedef {Object} CommentaryEditorApi
 * @property {import('@tiptap/core').Editor} editor
 * @property {() => void} toggleBold
 * @property {() => void} toggleItalic
 * @property {() => void} toggleUnderline
 * @property {() => void} toggleHighlight
 * @property {() => void} toggleBulletList
 * @property {() => void} toggleOrderedList
 * @property {() => void} toggleBlockquote
 * @property {() => void} insertHorizontalRule
 * @property {(triggerEl: HTMLElement) => void} openLink
 * @property {() => void} addFootnote
 * @property {(triggerEl: HTMLElement) => void} openGlossary
 * @property {() => void} clearFormatting
 */

/** @type {{ value: CommentaryEditorApi | null }} */
let activeApi = $state({ value: null });
let version = $state({ value: 0 });

/** Register the active editor's command API (called when a section activates). */
export function registerCommentaryEditor(api) {
	activeApi.value = api;
}

/**
 * Unregister an editor. Pass the SAME api object that was registered so a late
 * teardown can't clobber a newer active editor.
 * @param {CommentaryEditorApi} api
 */
export function unregisterCommentaryEditor(api) {
	if (!api || activeApi.value === api) {
		activeApi.value = null;
	}
}

/** The active editor's command API, or null when nothing is editable. */
export function getActiveCommentaryApi() {
	return activeApi.value;
}

/** True when some commentary section is currently editable. */
export function hasActiveCommentary() {
	return activeApi.value !== null;
}

/** Bump on every selection/transaction so toolbar active-states re-evaluate. */
export function bumpCommentaryState() {
	version.value++;
}

/**
 * Reactive `isActive` proxy for the toolbar. Touches `version` so it
 * re-evaluates as the cursor moves, then defers to the active editor.
 * @param {string} type
 * @param {Object} [attrs]
 * @returns {boolean}
 */
export function isCommentaryActive(type, attrs = {}) {
	version.value; // track
	return activeApi.value?.editor?.isActive(type, attrs) ?? false;
}
