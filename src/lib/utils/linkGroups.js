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

/** @type {Record<'columnSpacing'|'columnWidth'|'sectionSpacing', LinkGroupKind>} */
export const LINK_KINDS = {
	columnSpacing: { idAttr: 'data-column-id', groupAttr: 'data-spacing-group-id' },
	columnWidth: { idAttr: 'data-column-id', groupAttr: 'data-width-group-id' },
	sectionSpacing: { idAttr: 'data-section-id', groupAttr: 'data-spacing-group-id' }
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
 * Compute Link / Unlink availability for a selection, using the same rule as linked
 * segment heights: Link needs 2+ items not already all in ONE group; Unlink needs at
 * least one linked item.
 * @param {LinkGroupKind} kind
 * @param {string[]} ids
 * @returns {{ canLink: boolean, canUnlink: boolean }}
 */
export function getLinkAvailability(kind, ids) {
	const groups = ids.map((id) => getGroupId(kind, id));
	const allSame = ids.length >= 2 && groups.every((g) => g && g === groups[0]);
	return { canLink: ids.length >= 2 && !allSame, canUnlink: groups.some((g) => !!g) };
}
