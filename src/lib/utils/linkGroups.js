/**
 * Client-side helpers for layout LINK GROUPS (column spacing, column width, section
 * spacing). Membership is read from data attributes the Analyze page renders on each
 * `.column` / `.section` element — mirroring how linked segment heights are read from
 * `data-height-group-id`.
 */

/**
 * @typedef {Object} LinkGroupKind
 * @property {string} idAttr - Attribute holding the item id (e.g. 'data-column-id')
 * @property {string} groupAttr - Attribute holding the group id (e.g. 'data-width-group-id')
 */

/** @type {Record<'columnSpacing'|'columnWidth'|'sectionSpacing'|'segmentHeight', LinkGroupKind>} */
export const LINK_KINDS = {
	columnSpacing: { idAttr: 'data-column-id', groupAttr: 'data-spacing-group-id' },
	columnWidth: { idAttr: 'data-column-id', groupAttr: 'data-width-group-id' },
	sectionSpacing: { idAttr: 'data-section-id', groupAttr: 'data-spacing-group-id' },
	segmentHeight: { idAttr: 'data-segment-id', groupAttr: 'data-height-group-id' }
};

/**
 * Read an item's group id from the DOM, or null when it isn't linked.
 * @param {LinkGroupKind} kind
 * @param {string} id
 * @returns {string|null}
 */
export function getGroupId(kind, id) {
	const el = document.querySelector(`[${kind.idAttr}="${CSS.escape(id)}"]`);
	return el?.getAttribute(kind.groupAttr) || null;
}

/**
 * Every item linked to `id` (including `id` itself, first). Returns `[id]` when the
 * item isn't linked.
 * @param {LinkGroupKind} kind
 * @param {string} id
 * @returns {string[]}
 */
export function getGroupMemberIds(kind, id) {
	const groupId = getGroupId(kind, id);
	if (!groupId) return [id];
	const members = Array.from(document.querySelectorAll(`[${kind.groupAttr}="${CSS.escape(groupId)}"][${kind.idAttr}]`))
		.map((el) => el.getAttribute(kind.idAttr))
		.filter((m) => !!m && m !== id);
	return [id, .../** @type {string[]} */ (members)];
}

/**
 * Expand a selection so it includes every member of each linked group it touches
 * (order preserved, deduped). Used so Set / Reset on a linked item applies to its group.
 * @param {LinkGroupKind} kind
 * @param {string[]} ids
 * @returns {string[]}
 */
export function expandToGroups(kind, ids) {
	const out = new Set();
	for (const id of ids) getGroupMemberIds(kind, id).forEach((m) => out.add(m));
	return Array.from(out);
}

/**
 * Pure Link checkbox state from the group ids of the counted selection (null = not linked).
 * - 'on'    — every selected item is linked (any groups)  → ticked; click UNLINKS the selection
 * - 'mixed' — some selected items linked, some not         → dash;   click JOINS them into one group
 * - 'off'   — 2+ selected, none linked                     → empty;  click LINKS them
 * - null    — nothing to do (nothing selected, or a single unlinked item) → disabled
 * @param {(string|null)[]} groups
 * @returns {'on'|'mixed'|'off'|null}
 */
export function linkStateFromGroups(groups) {
	const linked = groups.filter((g) => !!g).length;
	if (groups.length === 0) return null;
	if (linked === groups.length) return 'on';
	if (linked > 0) return 'mixed';
	return groups.length >= 2 ? 'off' : null;
}

/**
 * Link / Unlink availability for a selection, as the flags the toolbar store holds.
 * canLink = click links/joins ('off' | 'mixed'); canUnlink = click unlinks ('on').
 * Both true is the 'mixed' (dash) state — clicking it joins, never unlinks.
 * @param {LinkGroupKind} kind
 * @param {string[]} ids
 * @returns {{ canLink: boolean, canUnlink: boolean }}
 */
export function getLinkAvailability(kind, ids) {
	const state = linkStateFromGroups(ids.map((id) => getGroupId(kind, id)));
	return {
		canLink: state === 'off' || state === 'mixed',
		canUnlink: state === 'on' || state === 'mixed'
	};
}

/**
 * The ids a Link click should send. A partly linked selection JOINS the existing group:
 * every member of each group it touches is included (so nothing outside the selection is
 * split off), with linked items first so ids[0] — the item whose value the group adopts —
 * is an existing member rather than the newcomer.
 * @param {LinkGroupKind} kind
 * @param {string[]} ids
 * @returns {string[]}
 */
export function idsForLink(kind, ids) {
	const expanded = expandToGroups(kind, ids);
	const linked = expanded.filter((id) => !!getGroupId(kind, id));
	const unlinked = expanded.filter((id) => !getGroupId(kind, id));
	return [...linked, ...unlinked];
}
