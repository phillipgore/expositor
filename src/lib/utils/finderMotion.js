/**
 * Finder motion that can be switched off per update.
 *
 * ⚠️ PERFORMANCE — measured, not guessed (FINDER_PERFORMANCE_REPORT.md). Typing in the Finder's
 * search force-expands every group and series and re-keys the list, so EVERY row runs a `flip`
 * and every group/series runs a `slide` intro at once. In Safari that animation work was ~80% of
 * the cost of a search: typing "romans" took 136 ms of main-thread time with motion and 31 ms
 * without, and the worst keystroke fell from 59 ms to 13 ms.
 *
 * Moves, drags and a manual expand/collapse still animate — those are the changes motion exists
 * to explain. A search result set is not "rows moving", it is a different list, so it snaps.
 *
 * Svelte requires `animate:` / `transition:` directives to be static, so the switch lives in the
 * parameters: `{ enabled: false }` returns a zero-duration config, which Svelte treats as "no
 * animation" and does not tick.
 */
import { flip } from 'svelte/animate';
import { slide } from 'svelte/transition';

/**
 * `animate:finderFlip={{ enabled, duration }}`
 * @param {Element} node
 * @param {{ from: DOMRect, to: DOMRect }} rects
 * @param {{ enabled?: boolean, duration?: number }} [params]
 */
export function finderFlip(node, rects, params = {}) {
	const { enabled = true, ...rest } = params;
	return enabled ? flip(node, rects, rest) : { duration: 0 };
}

/**
 * `transition:finderSlide={{ enabled, duration }}`
 * @param {Element} node
 * @param {{ enabled?: boolean, duration?: number }} [params]
 */
export function finderSlide(node, params = {}) {
	const { enabled = true, ...rest } = params;
	return enabled ? slide(node, rest) : { duration: 0 };
}
