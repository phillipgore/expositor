/**
 * Shared commentary-rendering helpers.
 *
 * Commentary authored in the CommentaryEditor stores each footnote inline as a
 * `<span class="footnote-marker" data-footnote-id data-footnote-content>` whose
 * visible content is just a superscript number — the actual note text lives in
 * the `data-footnote-content` attribute. These helpers surface those footnotes
 * for read-only display (renumbering markers + collecting the note text), and
 * decode the handful of HTML entities ProseMirror's attribute serialization
 * produces. Regex-based (not DOM-based) so they work during SSR too.
 *
 * Extracted from the document page so the inline DocumentCommentaryEditor can
 * render the SAME read-only output the page's static commentary render produces.
 */

/**
 * Decode the handful of HTML entities that ProseMirror's attribute
 * serialization produces. `&amp;` is decoded LAST so an already-escaped
 * sequence round-trips correctly.
 * @param {string} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
	if (!str) return '';
	return str
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

/**
 * Prepare a commentary HTML string for read-only display by surfacing its
 * footnotes. Walks the markers IN DOCUMENT ORDER, renumbering each marker's
 * superscript sequentially (1, 2, 3…) and collecting each footnote's decoded
 * text so a footnote list can render beneath the commentary.
 * @param {string|null|undefined} html
 * @returns {{ html: string, footnotes: Array<{ number: number, content: string }> }}
 */
export function renderCommentaryWithFootnotes(html) {
	if (!html || typeof html !== 'string') return { html: html ?? '', footnotes: [] };

	/** @type {Array<{ number: number, content: string }>} */
	const footnotes = [];
	let counter = 0;

	const markerRe = /<span\b([^>]*\bdata-footnote-id=[^>]*)>[\s\S]*?<\/span>/gi;

	const newHtml = html.replace(markerRe, (match, attrs) => {
		counter += 1;
		const number = counter;
		const contentMatch = attrs.match(/data-footnote-content=("|')([\s\S]*?)\1/i);
		const rawContent = contentMatch ? contentMatch[2] : '';
		footnotes.push({ number, content: decodeHtmlEntities(rawContent) });
		return `<span${attrs}><sup>${number}</sup></span>`;
	});

	return { html: newHtml, footnotes };
}
