/**
 * The eight named structure colors. Mirrors the passage_segment color CHECK
 * constraint (schema.ts / migration 0053). Color lives on segments; columns and
 * sections are colored by recoloring every segment they contain.
 */
export const SEGMENT_COLORS = /** @type {const} */ ([
	'red',
	'orange',
	'yellow',
	'green',
	'aqua',
	'blue',
	'purple',
	'pink'
]);

/** Color given to brand-new structure that has nothing to inherit from. */
export const DEFAULT_SEGMENT_COLOR = 'blue';

/**
 * @param {unknown} color
 * @returns {boolean}
 */
export function isValidSegmentColor(color) {
	return typeof color === 'string' && /** @type {readonly string[]} */ (SEGMENT_COLORS).includes(color);
}
