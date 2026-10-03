/**
 * Helpers for the Markup menu's Select All Headings / Heading One / Two / Three items.
 *
 * The Analyze and Document views publish the open study's saved headings to the toolbar
 * store (`setStudyHeadings`). The menu uses that list to enable its Select All items,
 * select headings by level, and check multi-heading conversions.
 */

/** @typedef {'one'|'two'|'three'} HeadingType */
/** @typedef {{ id: string, type: HeadingType, segmentId: string }} StudyHeading */

const HEADING_TYPES = /** @type {const} */ (['one', 'two', 'three']);

/**
 * Collect every SAVED heading (one with a passage_heading row id) in reading order,
 * walking passages → columns → sections → segments as loaded by the study layout.
 * Pending (not yet saved) headings have no id and are skipped.
 * @param {any[]|null|undefined} passagesWithText
 * @returns {StudyHeading[]}
 */
export function collectStudyHeadings(passagesWithText) {
	/** @type {StudyHeading[]} */
	const out = [];
	for (const passageText of passagesWithText ?? []) {
		for (const column of passageText?.structure?.columns ?? []) {
			for (const section of column.sections ?? []) {
				for (const segment of section.segments ?? []) {
					const ids = {
						one: segment.headingOneId ?? null,
						two: segment.headingTwoId ?? null,
						three: segment.headingThreeId ?? null
					};
					// Fall back to the raw headings[] rows when the projected ids are absent.
					for (const h of segment.headings ?? []) {
						if (h?.id && HEADING_TYPES.includes(h.headingType) && !ids[h.headingType]) {
							ids[h.headingType] = h.id;
						}
					}
					for (const type of HEADING_TYPES) {
						if (ids[type]) out.push({ id: ids[type], type, segmentId: segment.id });
					}
				}
			}
		}
	}
	return out;
}

/**
 * Which heading levels a segment holds, in the shape `setActiveHeading` expects.
 * @param {StudyHeading[]} headings
 * @param {string} segmentId
 */
export function segmentHeadingFlags(headings, segmentId) {
	const inSegment = headings.filter((h) => h.segmentId === segmentId);
	return {
		hasHeadingOne: inSegment.some((h) => h.type === 'one'),
		hasHeadingTwo: inSegment.some((h) => h.type === 'two'),
		hasHeadingThree: inSegment.some((h) => h.type === 'three')
	};
}

/**
 * Split the selected headings into those that can be converted to `targetType` and those
 * that must be skipped because their segment already holds a heading at that level (a
 * segment may hold only one heading per level).
 * @param {StudyHeading[]} headings - Every heading in the study
 * @param {string[]} selectedIds
 * @param {HeadingType} targetType
 * @returns {{ convertible: StudyHeading[], skipped: StudyHeading[] }}
 */
export function planHeadingConversion(headings, selectedIds, targetType) {
	const selected = new Set(selectedIds);
	const convertible = [];
	const skipped = [];
	for (const h of headings) {
		if (!selected.has(h.id) || h.type === targetType) continue;
		const conflict = headings.some(
			(other) => other.segmentId === h.segmentId && other.type === targetType
		);
		(conflict ? skipped : convertible).push(h);
	}
	return { convertible, skipped };
}
