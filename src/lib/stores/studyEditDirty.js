/**
 * Shared "unsaved changes" flag for the Edit Study flow.
 *
 * `StudyForm` (in edit mode) writes here whenever its fields diverge from the
 * last-saved data, and clears it on save/cancel/unmount. The edit-flow layout
 * (`/study/[id]/edit/+layout.svelte`) reads it from `beforeNavigate` to decide
 * whether to prompt the user before discarding in-progress edits.
 *
 * It lives in a module-level store (not component state) because the form and
 * the layout are separate components, and the layout must observe the form's
 * dirtiness even though it doesn't own the form.
 */
import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<boolean>} */
export const studyEditDirty = writable(false);

/** Mark the in-progress edit as having unsaved changes. */
export function setStudyEditDirty(dirty) {
	studyEditDirty.set(!!dirty);
}

/** Clear the unsaved-changes flag (after save, cancel, or unmount). */
export function clearStudyEditDirty() {
	studyEditDirty.set(false);
}
