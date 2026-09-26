/**
 * Plan a bulk delete of groups, studies and series with smart preservation.
 *
 * Deleting a group does NOT delete what is inside it. Everything the user did not select is
 * preserved and moved to a safe location — the nearest ancestor group that is not itself being
 * deleted, or the top level. This is what the confirmation promises: "Unselected items within
 * groups will be preserved and moved to safe locations."
 *
 * ⚠️ Series are included deliberately. `study_series.group_id` is `ON DELETE CASCADE`, so a series
 * that is not moved out BEFORE its group is deleted is destroyed along with every one of its parts.
 * An earlier version of `/api/bulk-delete` planned only groups and studies, so the one kind of
 * content the database would cascade away was exactly the kind it forgot to preserve.
 *
 * Parts of a series are never planned here: a part's place is its series (`seriesOrder`), its
 * `groupId` is null, and it moves when its series moves.
 *
 * `/api/bulk-delete` is the ONLY endpoint that deletes a group — `DELETE /api/groups/[id]` was
 * removed for bypassing this plan. Do not add a second delete path; route through this function.
 *
 * Pure — no database access — so the verify suite can pin it.
 *
 * @param {Object} input
 * @param {Array<Record<string, any>>} input.groups - ALL of the user's groups (`id`, `parentGroupId`)
 * @param {Array<Record<string, any>>} input.studies - ALL of the user's studies (`id`, `groupId`, `seriesId`)
 * @param {Array<Record<string, any>>} [input.series] - ALL of the user's series (`id`, `groupId`)
 * @param {string[]} [input.selectedGroupIds]
 * @param {string[]} [input.selectedStudyIds]
 * @param {string[]} [input.selectedSeriesIds]
 * @returns {{
 *   moveGroups: Array<{id: string, parentGroupId: string|null}>,
 *   moveStudies: Array<{id: string, groupId: string|null}>,
 *   moveSeries: Array<{id: string, groupId: string|null}>,
 *   preserved: { groups: number, studies: number, series: number }
 * }}
 */
export function planGroupDeletion({
	groups,
	studies,
	series = [],
	selectedGroupIds = [],
	selectedStudyIds = [],
	selectedSeriesIds = []
}) {
	const groupMap = new Map(groups.map((g) => [g.id, g]));
	const selectedGroups = new Set(selectedGroupIds);
	const selectedStudies = new Set(selectedStudyIds);
	const selectedSeries = new Set(selectedSeriesIds);

	// Every group being deleted, plus every group nested (at any depth) inside one.
	const insideDeleted = (groupId) => {
		const seen = new Set();
		let current = groupId;
		while (current && !seen.has(current)) {
			if (selectedGroups.has(current)) return true;
			seen.add(current);
			current = groupMap.get(current)?.parentGroupId ?? null;
		}
		return false;
	};

	// Nearest ancestor (starting at `parentId` itself) that survives, or null for top level.
	const safeParent = (parentId) => {
		const seen = new Set();
		let current = parentId;
		while (current && selectedGroups.has(current) && !seen.has(current)) {
			seen.add(current);
			current = groupMap.get(current)?.parentGroupId ?? null;
		}
		return current ?? null;
	};

	const moveGroups = [];
	const moveStudies = [];
	const moveSeries = [];
	const preserved = { groups: 0, studies: 0, series: 0 };

	for (const group of groups) {
		if (selectedGroups.has(group.id) || !insideDeleted(group.parentGroupId)) continue;
		preserved.groups += 1;
		const target = safeParent(group.parentGroupId);
		if (target !== group.parentGroupId) moveGroups.push({ id: group.id, parentGroupId: target });
	}

	for (const item of studies) {
		if (item.seriesId) continue; // parts travel with their series
		if (selectedStudies.has(item.id) || !insideDeleted(item.groupId)) continue;
		preserved.studies += 1;
		const target = safeParent(item.groupId);
		if (target !== item.groupId) moveStudies.push({ id: item.id, groupId: target });
	}

	for (const item of series) {
		if (selectedSeries.has(item.id) || !insideDeleted(item.groupId)) continue;
		preserved.series += 1;
		const target = safeParent(item.groupId);
		if (target !== item.groupId) moveSeries.push({ id: item.id, groupId: target });
	}

	return { moveGroups, moveStudies, moveSeries, preserved };
}
