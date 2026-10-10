/**
 * `fetch` for layout writes that must not fail silently.
 *
 * `fetch` only rejects on network errors; a 400 / 403 / 500 resolves normally, so a
 * bare `await fetch(...)` treats a rejected save as a success. This wrapper throws on
 * any non-2xx response (with the server's `error` message when it sent one) so the
 * caller's existing `catch` sees the failure.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
export async function patchJson(url, init) {
	const response = await fetch(url, init);
	if (!response.ok) {
		const body = await response.json().catch(() => null);
		throw new Error(body?.error || `Request to ${url} failed (${response.status})`);
	}
	return response;
}
