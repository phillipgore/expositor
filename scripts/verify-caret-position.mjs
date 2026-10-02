/**
 * Verify caret → insertion-word resolution and the initial caret position (caretPosition.js).
 *
 * The properties that matter:
 *   - 'before' resolves to the selected word itself;
 *   - 'after' resolves to the next `.selectable-word` in the same segment, skipping spaces and
 *     verse numbers, and to null after the segment's last word (it never crosses a segment);
 *   - a first click lands 'before' only on a segment's first word, 'after' everywhere else.
 *
 * Uses a minimal DOM stand-in (no DOM library is installed).
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-caret-position.mjs
 */

import {
	getNextWordId,
	getInsertionWordId,
	initialCaretPosition
} from '../src/lib/utils/caretPosition.js';

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
	} else {
		fail += 1;
		console.log(
			`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
		);
	}
}

/** Minimal element: classList, dataset, siblings, closest('.x'), querySelector('.x'). */
function el(className, { wordId, children = [] } = {}) {
	const classes = new Set(className.split(' '));
	const node = {
		classList: { contains: (c) => classes.has(c) },
		dataset: wordId ? { wordId } : {},
		parent: null,
		children,
		get nextElementSibling() {
			if (!this.parent) return null;
			const sibs = this.parent.children;
			return sibs[sibs.indexOf(this) + 1] ?? null;
		},
		closest(sel) {
			let n = this;
			while (n) {
				if (n.classList.contains(sel.slice(1))) return n;
				n = n.parent;
			}
			return null;
		},
		querySelector(sel) {
			for (const c of this.children) {
				if (c.classList.contains(sel.slice(1))) return c;
				const hit = c.querySelector(sel);
				if (hit) return hit;
			}
			return null;
		}
	};
	children.forEach((c) => (c.parent = node));
	return node;
}

const w = (id) => el('selectable-word', { wordId: id });
const space = () => el('selectable-space');

// Segment A: [verse-num] w1 _ w2 _ w3     Segment B: w4 _ w5
const w1 = w('A-1'), w2 = w('A-2'), w3 = w('A-3'), w4 = w('B-4'), w5 = w('B-5');
const segA = el('segment', { children: [el('verse-number'), w1, space(), w2, space(), w3] });
const segB = el('segment', { children: [w4, space(), w5] });
el('section', { children: [segA, segB] });

// getNextWordId
check('next skips spaces', getNextWordId(w1), 'A-2');
check('next at segment end is null (no crossing)', getNextWordId(w3), null);
check('next of null element', getNextWordId(null), null);

// getInsertionWordId
check('before → selected word', getInsertionWordId({ wordId: 'B-4', position: 'before' }, null), 'B-4');
check('after → next word', getInsertionWordId({ wordId: 'A-2', position: 'after' }, w2), 'A-3');
check('after last word of segment → null', getInsertionWordId({ wordId: 'A-3', position: 'after' }, w3), null);
check('no selection → null', getInsertionWordId(null, w1), null);

// initialCaretPosition
check('first word (after a verse number) → before', initialCaretPosition(w1, '.segment'), 'before');
check('middle word → after', initialCaretPosition(w2, '.segment'), 'after');
check('last word → after', initialCaretPosition(w3, '.segment'), 'after');
check('first word of next segment → before', initialCaretPosition(w4, '.segment'), 'before');
check('missing container → after', initialCaretPosition(w5, '.passage-text'), 'after');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
