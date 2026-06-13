/**
 * Shared Quick Note constraints.
 *
 * `QUICK_NOTE_MAX_CHARS` is the single source of truth for the character cap on
 * Quick Notes (both passage/segment notes and connection notes). It is enforced
 * client-side as a soft authoring guard (the editor's `maxlength` + counter) and
 * server-side when notes are merged during a Join or Edit Study reconcile.
 *
 * Commentary is intentionally NOT capped — only Quick Notes use this limit.
 */

/** Maximum characters allowed in a Quick Note. */
export const QUICK_NOTE_MAX_CHARS = 280;

/** Ellipsis appended to a note that had to be truncated on merge. */
export const TRUNCATION_ELLIPSIS = '…';

/**
 * Clamp a Quick Note to the character cap. When the text exceeds the limit it is
 * cut to leave room for a trailing ellipsis, so the reader is reminded that some
 * content was dropped on merge. Returns the text unchanged when within the cap.
 *
 * @param {string|null|undefined} text
 * @param {number} [max=QUICK_NOTE_MAX_CHARS]
 * @returns {string|null|undefined} the (possibly truncated) text
 */
export function truncateNote(text, max = QUICK_NOTE_MAX_CHARS) {
	if (text == null) return text;
	if (text.length <= max) return text;
	// Reserve one character for the ellipsis, then trim any trailing whitespace
	// so the ellipsis sits flush against the last word.
	const sliceLength = Math.max(0, max - TRUNCATION_ELLIPSIS.length);
	return text.slice(0, sliceLength).replace(/\s+$/, '') + TRUNCATION_ELLIPSIS;
}

/**
 * Would folding `fromNote` onto `targetNote` (appended with a newline) exceed
 * the cap? Used by the dry-run analyzers so the UI can warn that a Merge will
 * truncate. Mirrors the concatenation used in the fold helpers.
 *
 * @param {string|null|undefined} targetNote
 * @param {string|null|undefined} fromNote
 * @param {number} [max=QUICK_NOTE_MAX_CHARS]
 * @returns {boolean}
 */
export function mergedNoteWillTruncate(targetNote, fromNote, max = QUICK_NOTE_MAX_CHARS) {
	if (!fromNote) return false;
	const merged = targetNote ? `${targetNote}\n${fromNote}` : fromNote;
	return merged.length > max;
}
