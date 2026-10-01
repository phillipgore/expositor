/**
 * # Hover Caret Action
 *
 * Draws the "insert here" caret above whichever `.selectable-word` the pointer is over, using
 * ONE floating element for the whole container instead of a `::before` on the word.
 *
 * ## Why not `::before`
 * A study's text is one inline formatting context holding every word (Matthew 1:1–14:36 is
 * ~10,500 spans). Creating a pseudo-element inside an inline span re-lays out that entire
 * context, so every word-to-word move cost a full layout (~11 ms in Chrome, far more in
 * Safari). A `position: fixed` element outside the text never touches the text's layout.
 *
 * ## Rules (unchanged from the CSS version)
 * - No caret on a word with `data-selected` (it draws its own persistent caret).
 * - No caret on a word with `data-suppress-hover-caret` (just deselected under the pointer).
 * - Hidden on scroll, pointer leave and drag; re-evaluated when the hovered word's selection
 *   attributes change (a MutationObserver, since the page stamps them from an $effect).
 *
 * ## Usage
 * ```svelte
 * <div use:hoverCaret={{ color: 'var(--blue)', opacity: 1 }}>…words…</div>
 * ```
 * `color` defaults to the word's own text colour (Analyze's `currentColor` behaviour).
 *
 * @param {HTMLElement} node - Container whose descendant `.selectable-word`s get the caret.
 * @param {{ color?: string, opacity?: number }} [options]
 */
export function hoverCaret(node, options = {}) {
	let { color = '', opacity = 0.5 } = options;

	const caret = document.createElement('div');
	caret.className = 'hover-caret';
	caret.setAttribute('aria-hidden', 'true');
	// The same caret path the CSS used, filled with currentColor so `color` tints it.
	caret.innerHTML =
		'<svg viewBox="0 0 32 32" width="100%" height="100%"><path fill="currentColor" d="M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3"/></svg>';
	Object.assign(caret.style, {
		position: 'fixed',
		left: '0',
		top: '0',
		width: '1rem',
		height: '1rem',
		pointerEvents: 'none',
		zIndex: '5',
		display: 'none',
		transformOrigin: 'top left'
	});
	document.body.appendChild(caret);

	/** @type {HTMLElement | null} */
	let current = null;
	let buttonsDown = false;

	const hide = () => {
		current = null;
		caret.style.display = 'none';
	};

	/** @param {HTMLElement} word */
	const show = (word) => {
		current = word;
		if (word.hasAttribute('data-selected') || word.hasAttribute('data-suppress-hover-caret')) {
			caret.style.display = 'none';
			return;
		}
		const rect = word.getBoundingClientRect();
		// Zoom is a CSS transform on an ancestor; the visual/layout width ratio recovers it so
		// the caret scales with the text exactly as the pseudo-element did.
		const scale = word.offsetWidth > 0 ? rect.width / word.offsetWidth : 1;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
		caret.style.color = color || getComputedStyle(word).color;
		caret.style.opacity = String(opacity);
		// Offsets match the old `left: -0.7rem; top: -0.9rem` relative to the word's box.
		caret.style.transform = `translate(${rect.left - 0.7 * rem * scale}px, ${rect.top - 0.9 * rem * scale}px) scale(${scale})`;
		caret.style.display = 'block';
	};

	/** @param {MouseEvent} event */
	const onOver = (event) => {
		if (buttonsDown) return;
		const word = /** @type {HTMLElement} */ (event.target)?.closest?.('.selectable-word');
		if (word && node.contains(word)) {
			if (word !== current || caret.style.display === 'none') show(/** @type {HTMLElement} */ (word));
		} else {
			hide();
		}
	};

	const onDown = () => {
		buttonsDown = true;
		hide();
	};

	/** @param {MouseEvent} event */
	const onUp = (event) => {
		buttonsDown = false;
		const word = /** @type {HTMLElement} */ (event.target)?.closest?.('.selectable-word');
		if (word && node.contains(word)) show(/** @type {HTMLElement} */ (word));
	};

	// Selection is stamped onto words by the page's $effects at an unpredictable moment after
	// the click, so re-evaluate whenever the hovered word's selection attributes change.
	const observer = new MutationObserver((records) => {
		if (current && records.some((r) => r.target === current)) show(current);
	});
	observer.observe(node, {
		subtree: true,
		attributes: true,
		attributeFilter: ['data-selected', 'data-suppress-hover-caret']
	});

	node.addEventListener('mouseover', onOver);
	node.addEventListener('mouseleave', hide);
	node.addEventListener('mousedown', onDown);
	window.addEventListener('mouseup', onUp);
	// Capture: the scrolling element is an inner pane, not the window.
	window.addEventListener('scroll', hide, true);

	return {
		/** @param {{ color?: string, opacity?: number }} [next] */
		update(next = {}) {
			({ color = '', opacity = 0.5 } = next);
		},
		destroy() {
			observer.disconnect();
			node.removeEventListener('mouseover', onOver);
			node.removeEventListener('mouseleave', hide);
			node.removeEventListener('mousedown', onDown);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('scroll', hide, true);
			caret.remove();
		}
	};
}
