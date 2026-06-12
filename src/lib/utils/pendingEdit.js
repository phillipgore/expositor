/**
 * Shared sessionStorage keys for the Edit Study → Review hand-off.
 *
 * When an edit changes passage verse ranges in a way that needs the user's
 * decisions, the Edit Study form stashes the pending edit (title, subtitle,
 * passages, and the analyze-edit report) under `pendingEditKey` and sets a
 * one-time `armedKey` flag, then navigates to the full-page review. The review
 * page consumes the flag on mount so a refresh / deep-link redirects back to
 * the edit form instead of showing a stale review.
 */

/**
 * Key holding the JSON payload `{ title, subtitle, passages, report }`.
 * @param {string} studyId
 * @returns {string}
 */
export function pendingEditKey(studyId) {
	return `expositor:pending-edit:${studyId}`;
}

/**
 * One-time "arrived via Next" flag, consumed on the review page's first mount.
 * @param {string} studyId
 * @returns {string}
 */
export function armedKey(studyId) {
	return `expositor:review-armed:${studyId}`;
}
