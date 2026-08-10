import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { planAddToSeries } from '$lib/utils/seriesMembership.js';

/**
 * Add an existing standalone study to a series as a new part (SERIES_PLAN Q17, phase 3).
 *
 * Q17 asked for this "phase 3 — needs invariant checks", and §4's invariant table is those checks. It
 * is deliberately uneven: a translation mismatch **refuses**, because a series carries one export
 * attribution and a part in another translation makes that attribution false. A gap, an overlap or a
 * different book only **warn** — Prison Epistles is four books with three permanently dead boundaries
 * and is §4's own example of a legitimate series, so blocking those would forbid the motivating case.
 *
 * ## Why the study is moved rather than copied
 *
 * The row keeps its id, so every link, note, connection and piece of commentary survives — the same
 * reasoning `POST /api/series` uses when it converts a study into part 1 rather than duplicating it.
 * A copy would silently fork the user's work.
 *
 * `dryRun` reports the warnings without writing, so a drop confirmation can state them first.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

		const seriesId = params.id;
		const { studyId, dryRun = false } = (await request.json()) ?? {};
		if (!studyId || typeof studyId !== 'string') {
			return json({ error: 'studyId is required' }, { status: 400 });
		}

		// Scoped by userId so another user's series is indistinguishable from a missing one.
		const [series] = await db
			.select()
			.from(studySeries)
			.where(and(eq(studySeries.id, seriesId), eq(studySeries.userId, session.user.id)))
			.limit(1);
		if (!series) return json({ error: 'Series not found' }, { status: 404 });

		const [candidate] = await db
			.select()
			.from(study)
			.where(and(eq(study.id, studyId), eq(study.userId, session.user.id)))
			.limit(1);
		if (!candidate) return json({ error: 'Study not found' }, { status: 404 });

		const parts = await db
			.select()
			.from(study)
			.where(and(eq(study.seriesId, seriesId), eq(study.userId, session.user.id)))
			.orderBy(asc(study.seriesOrder));

		// Ranges travel with the parts: `classifyBoundary()` reads `part.passages` to judge adjacency.
		const ids = [...parts.map((p) => p.id), studyId];
		const passageRows = await db.select().from(passage).where(inArray(passage.studyId, ids));
		const withPassages = (row) => ({
			...row,
			passages: passageRows
				.filter((p) => p.studyId === row.id)
				.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
		});

		const plan = planAddToSeries({
			study: withPassages(candidate),
			series,
			parts: parts.map(withPassages)
		});

		if (!plan.ok) {
			// The planner's own sentence names both translations, or says the study already belongs
			// somewhere — more use than a generic refusal.
			return json({ error: plan.error }, { status: 400 });
		}

		const report = {
			ok: true,
			studyId,
			title: candidate.title,
			seriesOrder: plan.seriesOrder,
			// Reported, never blocking: §4 makes contiguity a warning, and the drop confirmation states
			// these before the user commits.
			warnings: plan.warnings
		};

		if (dryRun) return json({ ...report, dryRun: true });

		await db.transaction(async (tx) => {
			const now = new Date();
			await tx
				.update(study)
				.set({
					seriesId,
					seriesOrder: plan.seriesOrder,
					// A part's home is its series, never a group directly — otherwise it renders both inside
					// the series and loose in the group.
					groupId: null,
					updatedAt: now
				})
				.where(eq(study.id, studyId));

			await tx.update(studySeries).set({ updatedAt: now }).where(eq(studySeries.id, seriesId));
		});

		return json(report);
	} catch (error) {
		console.error('Error adding a study to a series:', error);
		return json({ error: 'Failed to add the study to the series' }, { status: 500 });
	}
};
