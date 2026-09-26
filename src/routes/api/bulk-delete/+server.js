import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studyGroup, study, studySeries } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, inArray } from 'drizzle-orm';
import { planGroupDeletion } from '$lib/utils/groupDeletion.js';

/**
 * Bulk delete studies, series and groups with smart preservation of unselected items.
 *
 * Unselected groups, studies AND series inside a deleted group are moved to the nearest surviving
 * ancestor (or the top level) before anything is deleted — see `planGroupDeletion()`. Series must
 * be moved first because `study_series.group_id` cascades: left in place, a series and all its
 * parts would be deleted with the group despite the confirmation promising they are preserved.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const {
			selectedGroupIds = [],
			selectedStudyIds = [],
			selectedSeriesIds = []
		} = await request.json();

		if (
			selectedGroupIds.length === 0 &&
			selectedStudyIds.length === 0 &&
			selectedSeriesIds.length === 0
		) {
			return json({ error: 'No items selected' }, { status: 400 });
		}

		const userId = session.user.id;

		// Step 1: Fetch ALL groups, studies and series for this user to understand hierarchy
		const allGroups = await db
			.select()
			.from(studyGroup)
			.where(eq(studyGroup.userId, userId));

		const allStudies = await db
			.select()
			.from(study)
			.where(eq(study.userId, userId));

		const allSeries = await db
			.select({ id: studySeries.id, groupId: studySeries.groupId })
			.from(studySeries)
			.where(eq(studySeries.userId, userId));

		// Step 2: Decide what is preserved and where each preserved item goes
		const plan = planGroupDeletion({
			groups: allGroups,
			studies: allStudies,
			series: allSeries,
			selectedGroupIds,
			selectedStudyIds,
			selectedSeriesIds
		});

		// Step 3: Move preserved items to safe parents BEFORE deleting anything — every one of
		// these rows would otherwise be cascaded away with its group.
		const now = new Date();
		const updates = [
			...plan.moveGroups.map(({ id, parentGroupId }) =>
				db.update(studyGroup).set({ parentGroupId, updatedAt: now }).where(eq(studyGroup.id, id))
			),
			...plan.moveStudies.map(({ id, groupId }) =>
				db.update(study).set({ groupId, updatedAt: now }).where(eq(study.id, id))
			),
			...plan.moveSeries.map(({ id, groupId }) =>
				db.update(studySeries).set({ groupId, updatedAt: now }).where(eq(studySeries.id, id))
			)
		];

		if (updates.length > 0) {
			await Promise.all(updates);
		}

		// Step 4: Delete selected series. `study.series_id` cascades, so every part goes with its
		// series — the same outcome as `DELETE /api/series/[id]` (§4 "Deletion").
		if (selectedSeriesIds.length > 0) {
			await db
				.delete(studySeries)
				.where(and(
					inArray(studySeries.id, selectedSeriesIds),
					eq(studySeries.userId, userId)
				));
		}

		// Step 5: Delete selected studies (must delete before groups due to foreign keys)
		if (selectedStudyIds.length > 0) {
			await db
				.delete(study)
				.where(and(
					inArray(study.id, selectedStudyIds),
					eq(study.userId, userId)
				));
		}

		// Step 6: Delete selected groups (cascade will handle any remaining descendants)
		if (selectedGroupIds.length > 0) {
			await db
				.delete(studyGroup)
				.where(and(
					inArray(studyGroup.id, selectedGroupIds),
					eq(studyGroup.userId, userId)
				));
		}

		return json({ 
			success: true,
			deleted: {
				groups: selectedGroupIds.length,
				studies: selectedStudyIds.length,
				series: selectedSeriesIds.length
			},
			preserved: plan.preserved
		});

	} catch (error) {
		console.error('Bulk delete error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
