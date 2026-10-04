/**
 * Series-wide selection (cross-part selection, step 1).
 *
 * The Analyze page keeps its working selection in local state, which is lost
 * when the user moves to another part of a series (each part is its own
 * page). This store remembers the selection for ONE series across parts:
 *
 *   - items carry the part (study id) they live in;
 *   - the current part's items are mirrored from the page's selection;
 *   - a plain click replaces the whole selection (other parts cleared),
 *     Cmd/Ctrl-click keeps it (see the analyze page);
 *   - persisted to sessionStorage per series, so a reload keeps it but
 *     closing the tab does not. Switching to another series (or a plain
 *     study) clears it.
 *
 * Pure data — no DOM. The page and SeriesSelectionChip read/write it.
 */
import { writable, get } from 'svelte/store';

/** @typedef {'column'|'section'|'segment'} SelType */
/** @typedef {{ partId: string, type: SelType, id: string, label: string }} SeriesSelItem */
/** @typedef {{ seriesId: string|null, items: SeriesSelItem[], reveal: { partId: string } | null }} SeriesSelState */

const STORAGE_PREFIX = 'expositor:series-selection:';

/** @type {SeriesSelState} */
const EMPTY = { seriesId: null, items: [], reveal: null };

export const seriesSelection = writable(EMPTY);

/** @param {string} seriesId @returns {SeriesSelItem[]} */
function load(seriesId) {
	if (typeof sessionStorage === 'undefined') return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_PREFIX + seriesId);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.filter((i) => i && i.partId && i.id && ['column', 'section', 'segment'].includes(i.type))
			: [];
	} catch {
		return [];
	}
}

/** @param {SeriesSelState} state */
function save(state) {
	if (typeof sessionStorage === 'undefined' || !state.seriesId) return;
	try {
		if (state.items.length) sessionStorage.setItem(STORAGE_PREFIX + state.seriesId, JSON.stringify(state.items));
		else sessionStorage.removeItem(STORAGE_PREFIX + state.seriesId);
	} catch {
		/* storage full / disabled: memory copy still works */
	}
}

/** @param {(s: SeriesSelState) => SeriesSelState} fn */
function update(fn) {
	seriesSelection.update((s) => {
		const next = fn(s);
		save(next);
		return next;
	});
}

/**
 * Point the store at a series (or null for a plain study). Switching series
 * loads that series' saved selection; other series' selections are dropped.
 * @param {string|null} seriesId
 */
export function useSeries(seriesId) {
	const cur = get(seriesSelection);
	if (cur.seriesId === seriesId) return;
	if (cur.seriesId && typeof sessionStorage !== 'undefined') {
		try { sessionStorage.removeItem(STORAGE_PREFIX + cur.seriesId); } catch { /* ignore */ }
	}
	seriesSelection.set(seriesId ? { seriesId, items: load(seriesId), reveal: null } : EMPTY);
}

/**
 * Items of one part, in store order.
 * @param {SeriesSelState} state @param {string} partId
 */
export function itemsForPart(state, partId) {
	return state.items.filter((i) => i.partId === partId);
}

/** Same type+id set? @param {SeriesSelItem[]} a @param {SeriesSelItem[]} b */
export function sameItems(a, b) {
	if (a.length !== b.length) return false;
	const keys = new Set(a.map((i) => `${i.type}:${i.id}`));
	return b.every((i) => keys.has(`${i.type}:${i.id}`));
}

/**
 * Replace one part's items with the page's current selection.
 * @param {string} partId
 * @param {SeriesSelItem[]} items
 * @param {{ keepOtherParts: boolean }} opts — false for a plain click (clears other parts)
 */
export function setPartItems(partId, items, { keepOtherParts }) {
	update((s) => ({
		...s,
		items: [...(keepOtherParts ? s.items.filter((i) => i.partId !== partId) : []), ...items]
	}));
}

/** @param {SeriesSelItem} item */
export function removeItem(item) {
	update((s) => ({
		...s,
		items: s.items.filter((i) => !(i.partId === item.partId && i.type === item.type && i.id === item.id))
	}));
}

export function clearSeriesSelection() {
	update((s) => ({ ...s, items: [], reveal: null }));
}

/** Ask the page that opens `partId` to scroll its restored selection into view. @param {string} partId */
export function requestReveal(partId) {
	seriesSelection.update((s) => ({ ...s, reveal: { partId } }));
}

/** @param {string} partId @returns {boolean} true if a reveal was pending for this part (and clears it) */
export function takeReveal(partId) {
	const s = get(seriesSelection);
	if (s.reveal?.partId !== partId) return false;
	seriesSelection.set({ ...s, reveal: null });
	return true;
}

// ── Series Focus (CROSS_PART_PLAN step 3, Option B) ─────────────────────────
// Focus that travels with the user between parts. When Focus is entered in a
// part of a series, the focused items of EVERY part are snapshotted here; each
// part the user then opens shows only its own snapshotted items. Kept separate
// from the live selection so Cmd-clicks during Focus don't change what is shown.

/** @typedef {{ seriesId: string, items: SeriesSelItem[] } | null} SeriesFocusState */

// Memory only: the toolbar's focusMode isn't persisted either, so a reload
// leaves Focus (and this snapshot) off together.
/** @type {import('svelte/store').Writable<SeriesFocusState>} */
export const seriesFocus = writable(/** @type {SeriesFocusState} */ (null));

/** @param {string} seriesId @param {SeriesSelItem[]} items */
export function startSeriesFocus(seriesId, items) {
	seriesFocus.set({ seriesId, items: dedupe(items) });
}

export function endSeriesFocus() {
	seriesFocus.set(null);
}

/** @param {SeriesSelItem[]} items */
function dedupe(items) {
	const seen = new Set();
	return items.filter((i) => {
		const k = `${i.partId}:${i.type}:${i.id}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

/**
 * Part ids that have focused items, in series order.
 * @param {SeriesFocusState} focus @param {Array<{ id: string }>} parts
 */
export function focusedPartIds(focus, parts) {
	if (!focus) return [];
	const ids = new Set(focus.items.map((i) => i.partId));
	return (parts ?? []).map((p) => p.id).filter((id) => ids.has(id));
}
