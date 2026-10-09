/**
 * Helpers for the Selection menu's Select All Headings / Heading One / Two / Three items.
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
 * Plan a one-step level shift of the selected headings (Markup menu → Promote / Demote
 * Heading). 'up' promotes toward Heading One (three→two, two→one); 'down' demotes toward
 * Heading Three (one→two, two→three).
 *
 * A heading is NOT movable when it is already at the end of the range in that direction
 * (those are simply ignored), or when its segment already holds a heading at the target
 * level (those are reported as `skipped`). A segment may hold only one heading per level, so
 * within a segment the headings nearest the target end move first and free up their level
 * for the next one — e.g. a segment with Two and Three, both selected, promotes to One and
 * Two. Each planned move is therefore safe to apply in the returned order.
 * @param {StudyHeading[]} headings - Every heading in the study
 * @param {string[]} selectedIds
 * @param {'up'|'down'} direction
 * @returns {{ movable: { heading: StudyHeading, targetType: HeadingType }[], skipped: StudyHeading[] }}
 */
export function planHeadingShift(headings, selectedIds, direction) {
	const selected = new Set(selectedIds ?? []);
	const step = direction === 'up' ? -1 : 1;
	/** @type {{ heading: StudyHeading, targetType: HeadingType }[]} */
	const movable = [];
	/** @type {StudyHeading[]} */
	const skipped = [];

	/** @type {Map<string, StudyHeading[]>} */
	const bySegment = new Map();
	for (const h of headings ?? []) {
		if (!bySegment.has(h.segmentId)) bySegment.set(h.segmentId, []);
		bySegment.get(h.segmentId)?.push(h);
	}

	for (const segmentHeadings of bySegment.values()) {
		// Levels currently occupied in this segment, updated as planned moves apply.
		const occupied = new Set(segmentHeadings.map((h) => h.type));
		// Process those nearest the target end first so they vacate levels for the rest.
		const ordered = segmentHeadings
			.filter((h) => selected.has(h.id))
			.sort((a, b) => (HEADING_TYPES.indexOf(a.type) - HEADING_TYPES.indexOf(b.type)) * -step);
		for (const h of ordered) {
			const targetType = HEADING_TYPES[HEADING_TYPES.indexOf(h.type) + step];
			if (!targetType) continue; // already at the top/bottom level
			if (occupied.has(targetType)) {
				skipped.push(h);
				continue;
			}
			occupied.delete(h.type);
			occupied.add(targetType);
			movable.push({ heading: h, targetType });
		}
	}
	return { movable, skipped };
}
