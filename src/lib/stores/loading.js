import { writable } from 'svelte/store';

/**
 * # studyContentLoading
 *
 * True while a study route's STREAMED content (passage text/structure/connections)
 * is still resolving. The study layout streams its heavy data so the page shell
 * renders instantly, which means SvelteKit's `navigating` store clears as soon as
 * the light `load` returns — before the streamed content lands.
 *
 * This store bridges that gap: the document/analyze pages set it `true` while their
 * `streamedContent` is null and `false` once it resolves. NavigationIndicator ORs it
 * with `$navigating` so the single global Spinner stays up continuously from
 * navigation start until the content is actually ready (no two-spinner handoff).
 *
 * @type {import('svelte/store').Writable<boolean>}
 */
export const studyContentLoading = writable(false);

/**
 * Set whether study streamed content is currently loading.
 * @param {boolean} value
 */
export function setStudyContentLoading(value) {
	studyContentLoading.set(value);
}
