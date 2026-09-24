/**
 * # API error messages for the user
 *
 * Turns a failed `fetch` into a sentence a reader can act on.
 *
 * ## Why this exists
 *
 * Every endpoint answers an unauthenticated request with `{ error: 'Unauthorized' }` and a 401.
 * That is the right word on the wire — it is the HTTP status's own name — but the modals were
 * rendering `result.error` directly, so the dialog said "Unauthorized" and stopped. §11's rule is
 * that a dead command must say WHY and what to do next; a protocol word names neither. The user
 * has not been refused permission to join their own parts, their session has lapsed, and the
 * remedy is to sign in again.
 *
 * Centralised rather than repeated in each modal because there are four of them (Join Parts,
 * Split Part, Add to Series, Reorder Runs) and a session message copied four times is four
 * messages that will drift. The same reasoning the split/join previews use for living on the
 * server: one answer, one place.
 *
 * ## What it deliberately does NOT do
 *
 * It does not rewrite non-401 errors. The planners produce careful, specific refusals — "these
 * parts aren't adjacent in Scripture" distinguishes a never-possible case from an unimplemented
 * one — and flattening those into a generic sentence would destroy exactly the distinction §11
 * asks for. Anything that is not a 401 passes through untouched.
 */

/**
 * The sentence to show for a failed response.
 *
 * @param {Response} response - The fetch response (only `status` is read).
 * @param {{ error?: string } | null | undefined} result - The parsed JSON body, if any.
 * @param {string} fallback - What to say when the body carries no message of its own.
 * @param {string} [action] - What the user was trying to do, phrased to follow "to" —
 *   e.g. `'join these parts'`. Named so the 401 says what it could not do, rather than
 *   reporting a session problem in the abstract.
 * @returns {string}
 */
export function messageForFailure(response, result, fallback, action = 'make this change') {
	if (response?.status === 401) {
		return `Your session has expired. Sign in again to ${action}.`;
	}

	return result?.error ?? fallback;
}
