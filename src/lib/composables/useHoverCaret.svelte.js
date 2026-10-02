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
 * - Also draws the hover highlight as a floating box (`highlight` colour, default the word's
 *   `--section-light`), hidden on selected words, scroll, leave and drag.
 * - Also draws the SELECTED word's highlight + persistent caret (`data-selected` /
 *   `data-position`) in an out-of-flow layer inside `node`, so selecting never re-lays out text.
 * - Hidden on scroll, pointer leave and drag; re-evaluated when the hovered word's selection
 *   attributes change (a MutationObserver, since the page stamps them from an $effect).
 *
 * ## Usage
 * ```svelte
 * <div use:hoverCaret={{ color: 'var(--blue)', opacity: 1 }}>…words…</div>
 * ```
 * `color` defaults to the word's `--section-darker` (falling back to its text colour);
 * `highlight` defaults to its `--section-light`.
 *
 * @param {HTMLElement} node - Container whose descendant `.selectable-word`s get the caret.
 * @param {{ color?: string, opacity?: number, highlight?: string }} [options]
 */
export function hoverCaret(node, options = {}) {
	let { color = '', opacity = 0.5, highlight = '' } = options;

	/** Caret colour: explicit `color`, else the word's section colour, else its text colour. @param {HTMLElement} word */
	const caretColor = (word) => {
		if (color) return color;
		const cs = getComputedStyle(word);
		return cs.getPropertyValue('--section-darker').trim() || cs.color;
	};

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

	// Hover highlight: a second floating box over the word, NOT a style change on the word.
	// Measured on Matthew in Safari: changing the hovered word's own background (via `:hover`
	// OR a class) repaints the huge text layer and pins the CPU at ~100%. Moving a small fixed
	// box never touches the text. `multiply` makes the tint look like a background on light
	// paper (dark text stays dark).
	const box = document.createElement('div');
	box.className = 'hover-highlight';
	box.setAttribute('aria-hidden', 'true');
	Object.assign(box.style, {
		position: 'fixed',
		left: '0',
		top: '0',
		pointerEvents: 'none',
		zIndex: '4',
		display: 'none',
		mixBlendMode: 'multiply'
	});
	document.body.appendChild(box);

	// Selected word: highlight + persistent caret, ALSO drawn outside the text. Stamping a
	// background and a `::before` caret onto the word re-laid out the whole text block on every
	// selection change (~10k inline spans), which made switching words slow and left Safari busy
	// so hover lagged afterwards. These live inside `node` (absolute, out of flow), so they
	// scroll and zoom with the content and never affect its layout.
	if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
	const selLayer = document.createElement('div');
	selLayer.className = 'selection-layer';
	selLayer.setAttribute('aria-hidden', 'true');
	Object.assign(selLayer.style, {
		position: 'absolute',
		left: '0',
		top: '0',
		width: '0',
		height: '0',
		pointerEvents: 'none',
		zIndex: '4',
		display: 'none'
	});
	const selBox = document.createElement('div');
	Object.assign(selBox.style, { position: 'absolute', left: '0', top: '0' });
	const selCaret = /** @type {HTMLElement} */ (caret.cloneNode(true));
	selCaret.className = 'selection-caret';
	Object.assign(selCaret.style, { position: 'absolute', display: 'block', opacity: '1', zIndex: '1' });
	selLayer.append(selBox, selCaret);
	node.appendChild(selLayer);

	/** @type {HTMLElement | null} */
	let selected = null;
	const drawSelection = () => {
		if (!selected || !selected.isConnected || !selected.hasAttribute('data-selected')) {
			selected = null;
			selLayer.style.display = 'none';
			return;
		}
		const nodeRect = node.getBoundingClientRect();
		const nodeScale = node.offsetWidth > 0 ? nodeRect.width / node.offsetWidth : 1;
		const rect = selected.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			selLayer.style.display = 'none';
			return;
		}
		// Word coordinates in node's local (unscaled, scrolled) space.
		const x = (rect.left - nodeRect.left) / nodeScale + node.scrollLeft - node.clientLeft;
		const y = (rect.top - nodeRect.top) / nodeScale + node.scrollTop - node.clientTop;
		const w = rect.width / nodeScale;
		const h = rect.height / nodeScale;
		// Scale of the text relative to node (Analyze zoom lives inside node).
		const s = selected.offsetWidth > 0 ? w / selected.offsetWidth : 1;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
		const tint = highlight || getComputedStyle(selected).getPropertyValue('--section-light').trim();
		Object.assign(selBox.style, {
			background: tint || 'rgba(255, 255, 255, 0.15)',
			borderRadius: `${0.2 * rem * s}px`,
			width: `${w}px`,
			height: `${h}px`,
			transform: `translate(${x}px, ${y}px)`
		});
		// Blend on the LAYER: it is a stacking context (z-index), so a child's blend would only
		// see the empty layer and hide the word. The caret is opaque, so multiply leaves it intact.
		selLayer.style.mixBlendMode = tint ? 'multiply' : 'normal';
		selCaret.style.color = caretColor(selected);
		// Old CSS: before → `left: -0.7rem`, after → `right: -0.7rem`; both `top: -0.9rem`, 1rem box.
		const cx =
			selected.getAttribute('data-position') === 'after' ? x + w + 0.7 * rem * s - 1 * rem * s : x - 0.7 * rem * s;
		selCaret.style.transform = `translate(${cx}px, ${y - 0.9 * rem * s}px) scale(${s})`;
		selLayer.style.display = 'block';
	};
	// Content can reflow under a fixed selection (edits, zoom, resize): re-place it, at most
	// once per frame, and only while something is selected.
	let raf = 0;
	const scheduleDraw = () => {
		if (!selected || raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			drawSelection();
		});
	};
	const resizeObserver = new ResizeObserver(scheduleDraw);
	resizeObserver.observe(node);
	if (node.firstElementChild) resizeObserver.observe(node.firstElementChild);
	const reflowObserver = new MutationObserver((records) => {
		// Ignore our own layer's style writes (would loop every frame).
		if (records.some((r) => !selLayer.contains(r.target))) scheduleDraw();
	});
	reflowObserver.observe(node, { subtree: true, childList: true, characterData: true, attributeFilter: ['style', 'class'] });

	/** @type {HTMLElement | null} */
	let highlighted = null;
	/** Word under the pointer (kept while selected, so deselecting restores the highlight). */
	/** @type {HTMLElement | null} */
	let hovered = null;
	/** @param {HTMLElement | null} word */
	const setHighlight = (word) => {
		if (!word || word.hasAttribute('data-selected')) {
			highlighted = null;
			box.style.display = 'none';
			return;
		}
		if (word === highlighted && box.style.display !== 'none') return;
		highlighted = word;
		const rect = word.getBoundingClientRect();
		const scale = word.offsetWidth > 0 ? rect.width / word.offsetWidth : 1;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
		const tint = highlight || getComputedStyle(word).getPropertyValue('--section-light').trim();
		box.style.background = tint || 'rgba(255, 255, 255, 0.1)';
		box.style.mixBlendMode = tint ? 'multiply' : 'normal';
		box.style.borderRadius = `${0.2 * rem * scale}px`;
		box.style.width = `${rect.width}px`;
		box.style.height = `${rect.height}px`;
		box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
		box.style.display = 'block';
	};

	const hide = () => {
		current = null;
		setHighlight(null);
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
		caret.style.color = caretColor(word);
		caret.style.opacity = String(opacity);
		// Offsets match the old `left: -0.7rem; top: -0.9rem` relative to the word's box.
		caret.style.transform = `translate(${rect.left - 0.7 * rem * scale}px, ${rect.top - 0.9 * rem * scale}px) scale(${scale})`;
		caret.style.display = 'block';
	};

	/** @param {MouseEvent} event */
	const onOver = (event) => {
		const word = /** @type {HTMLElement} */ (event.target)?.closest?.('.selectable-word');
		hovered = word && node.contains(word) ? /** @type {HTMLElement} */ (word) : null;
		setHighlight(word && node.contains(word) ? /** @type {HTMLElement} */ (word) : null);
		if (buttonsDown) {
			// Dragging: no caret while sweeping a selection (as before).
			if (hovered !== current) {
				current = null;
				caret.style.display = 'none';
			}
			return;
		}
		if (word && node.contains(word)) {
			if (word !== current || caret.style.display === 'none') show(/** @type {HTMLElement} */ (word));
		} else {
			hide();
		}
	};

	const onDown = () => {
		// Hide nothing on press. The page applies the selection after a double-click delay; hiding
		// here left a gap with no caret/highlight until `data-selected` landed (a "blink", longer
		// in Safari). The MutationObserver hides both in the same frame the selection arrives, and
		// `onOver` hides the caret once a drag actually leaves the pressed word.
		buttonsDown = true;
	};

	/** @param {MouseEvent} event */
	const onUp = (event) => {
		buttonsDown = false;
		const word = /** @type {HTMLElement} */ (event.target)?.closest?.('.selectable-word');
		// Re-show only after a drag; a plain click keeps the caret as-is (no re-flash).
		if (word && node.contains(word) && word !== current) show(/** @type {HTMLElement} */ (word));
	};

	// Selection is stamped onto words by the page's $effects at an unpredictable moment after
	// the click, so re-evaluate whenever the hovered word's selection attributes change.
	const observer = new MutationObserver((records) => {
		let selChanged = false;
		for (const r of records) {
			const t = /** @type {HTMLElement} */ (r.target);
			if (r.attributeName === 'data-selected' || r.attributeName === 'data-position') {
				if (t.hasAttribute('data-selected')) selected = t;
				selChanged = true;
			}
		}
		if (selChanged) drawSelection();
		if (current && records.some((r) => r.target === current)) show(current);
		if (hovered && records.some((r) => r.target === hovered)) setHighlight(hovered);
	});
	observer.observe(node, {
		subtree: true,
		attributes: true,
		attributeFilter: ['data-selected', 'data-position', 'data-suppress-hover-caret']
	});
	// A selection that already exists when mounted.
	selected = node.querySelector('.selectable-word[data-selected]');
	drawSelection();

	node.addEventListener('mouseover', onOver);
	const onLeave = () => {
		hovered = null;
		setHighlight(null);
		hide();
	};

	node.addEventListener('mouseleave', onLeave);
	node.addEventListener('mousedown', onDown);
	window.addEventListener('mouseup', onUp);
	// Capture: the scrolling element is an inner pane, not the window.
	window.addEventListener('scroll', hide, true);

	return {
		/** @param {{ color?: string, opacity?: number, highlight?: string }} [next] */
		update(next = {}) {
			({ color = '', opacity = 0.5, highlight = '' } = next);
			drawSelection();
		},
		destroy() {
			observer.disconnect();
			resizeObserver.disconnect();
			reflowObserver.disconnect();
			cancelAnimationFrame(raf);
			selLayer.remove();
			node.removeEventListener('mouseover', onOver);
			box.remove();
			node.removeEventListener('mouseleave', onLeave);
			node.removeEventListener('mousedown', onDown);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('scroll', hide, true);
			caret.remove();
		}
	};
}
