import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { describeRuns, planRunReorder } from '$lib/utils/seriesReorder.js';

/**
 * Reorder a series by moving one RUN to a new position (SERIES_PLAN §4, phase 3).
 *
 * §4: "reordering permutes runs. Parts within a run are rigid, and runs are never interleaved." So the
 * request names a run index, not a part id — a part cannot be moved out of a contiguous block, because
 * doing so would produce a series claiming Romans 8 sits between chapters 3 and 4, which is a false
 * statement about the text rather than a teaching order.
 *
 * `GET` returns the run decomposition so a client can render what is draggable without duplicating the
 * adjacency predicate; `PATCH` applies a move.
 *
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		const loaded = await loadSeriesParts(params.id, session.user.id);
		if (!loaded) return json({ error: 'Series not found' }, { status: 404 });

		return json(describeRuns(loaded.parts));
	} catch (error) {
		console.error('Error describing series runs:', error);
		return json({ error: 'Failed to read the series' }, { status: 500 });
	}
};

/** @type {import('./$types').RequestHandler} */
export const PATCH = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		const { fromIndex, toIndex } = (await request.json()) ?? {};

		const loaded = await loadSeriesParts(params.id, session.user.id);
		if (!loaded) return json({ error: 'Series not found' }, { status: 404 });

		const plan = planRunReorder({ parts: loaded.parts, fromIndex, toIndex });
		if (!plan.ok) {
			// The planner's own sentence, which distinguishes "this series is one continuous run" from an
			// out-of-range index. §11's rule that a refusal says WHY applies here too.
			return json({ error: plan.error }, { status: 400 });
		}

		if (plan.updates.length > 0) {
			await db.transaction(async (tx) => {
				const now = new Date();
				for (const update of plan.updates) {
					await tx
						.update(study)
						.set({ seriesOrder: update.seriesOrder, updatedAt: now })
						.where(eq(study.id, update.id));
				}
				await tx.update(studySeries).set({ updatedAt: now }).where(eq(studySeries.id, params.id));
			});
		}

		return json({ success: true, order: plan.order, moved: plan.updates.length });
	} catch (error) {
		console.error('Error reordering series runs:', error);
		return json({ error: 'Failed to reorder the series' }, { status: 500 });
	}
};

/**
 * Every part of a series with its passages, scoped by user.
 *
 * `computeRuns()` reads `part.passages` to fold the adjacency predicate, so the ranges must travel with
 * the parts. Scoped by `userId` in the query so another user's series is indistinguishable from a
 * missing one, matching every other endpoint here.
 */
async function loadSeriesParts(seriesId, userId) {
	const [series] = await db
		.select()
		.from(studySeries)
		.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, userId)))
		.limit(1);
	if (!series) return null;

	const parts = await db
		.select()
		.from(study)
		.where(and(eq(study.seriesId, seriesId), eq(study.userId, userId)))
		.orderBy(asc(study.seriesOrder));
	if (parts.length === 0) return { series, parts: [] };

	const rows = await db
		.select()
		.from(passage)
		.where(
			inArray(
				passage.studyId,
				parts.map((p) => p.id)
			)
		);

	return {
		series,
		parts: parts.map((part) => ({
			...part,
			passages: rows
				.filter((row) => row.studyId === part.id)
				.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		}))
	};
}
