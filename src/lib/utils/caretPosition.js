/**
 * # Caret position helpers
 *
 * A selected word carries a caret `position` of `'before'` or `'after'`. Every structural
 * command (Insert Column / Section / Segment, Move Text Up / Down) needs the same thing from
 * it: the **insertion word** — the first word on the far side of the caret.
 *
 * - `'before'` → the selected word itself.
 * - `'after'`  → the next `.selectable-word` sibling of the selected word, or `null` when the
 *   caret is after the last word of its container (the segment).
 *
 * ⚠️ The `'after'` lookup deliberately stays inside the word's parent element, i.e. its
 * segment. That is why a caret *before* a segment's first word exists at all: it is the only
 * way to name a segment boundary as an insertion point (e.g. Insert Section between two
 * existing segments). It is also why the caret starts `'before'` only on a segment's first
 * word — see {@link initialCaretPosition}.
 *
 * @module caretPosition
 */

/**
 * The word id of the next `.selectable-word` after `wordElement` in the same parent, or null.
 * @param {Element | null} wordElement
 * @returns {string | null}
 */
export function getNextWordId(wordElement) {
	let next = wordElement?.nextElementSibling ?? null;
	while (next) {
		if (next.classList?.contains('selectable-word')) {
			return /** @type {HTMLElement} */ (next).dataset?.wordId || null;
		}
		next = next.nextElementSibling;
	}
	return null;
}

/**
 * The insertion word id for a caret: the selected word when the caret is before it, else the
 * next word in the same segment (null at the end of a segment).
 * @param {{ wordId: string, position: 'before' | 'after' } | null} selectedWord
 * @param {Element | null} wordElement - The selected word's element (only read for `'after'`).
 * @returns {string | null}
 */
export function getInsertionWordId(selectedWord, wordElement) {
	if (!selectedWord) return null;
	if (selectedWord.position === 'before') return selectedWord.wordId || null;
	return getNextWordId(wordElement);
}

/**
 * Where the caret lands when a word is first clicked: `'before'` only if the word is the first
 * `.selectable-word` in its segment container, `'after'` everywhere else.
 * @param {Element} wordElement
 * @param {string} segmentSelector - Selector for the word's segment container.
 * @returns {'before' | 'after'}
 */
export function initialCaretPosition(wordElement, segmentSelector) {
	const firstInSegment = wordElement.closest(segmentSelector)?.querySelector('.selectable-word');
	return firstInSegment === wordElement ? 'before' : 'after';
}
