import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';

/**
 * Update a series.
 *
 * Phase 1 accepts only the fields the Finder needs: `isCollapsed` (disclosure state) and
 * `name` (rename). Membership and ordering are deliberately NOT editable here — adding or
 * removing parts has to maintain seriesOrder and the study.seriesId back-reference together,
 * which is the job of the dedicated endpoints in later phases (SERIES_PLAN §11), not of a
 * generic field-patcher that would happily leave a gap in the sequence.
 *
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;
		const body = await request.json();

		// Verify the series belongs to the user. Scoping the SELECT by userId (rather than
		// fetching then comparing) means a series belonging to someone else is indistinguishable
		// from one that does not exist.
		const existing = await db
			.select()
			.from(studySeries)
			.where(and(
				eq(studySeries.id, id),
				eq(studySeries.userId, session.user.id)
			))
			.limit(1);

		if (existing.length === 0) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		/** @type {Record<string, unknown>} */
		const updates = { updatedAt: new Date() };

		if (typeof body.isCollapsed === 'boolean') {
			updates.isCollapsed = body.isCollapsed;
		}

		if (typeof body.name === 'string') {
			const trimmed = body.name.trim();
			if (trimmed === '') {
				return json({ error: 'Series name cannot be empty' }, { status: 400 });
			}
			updates.name = trimmed;
		}

		// lastPartId records which part to reopen when the series title is clicked (Q18).
		// It must name a part OF THIS SERIES: accepting an arbitrary study id would make the
		// series row navigate somewhere outside itself.
		if (body.lastPartId !== undefined) {
			if (body.lastPartId === null) {
				updates.lastPartId = null;
			} else {
				const part = await db
					.select({ id: study.id })
					.from(study)
					.where(and(
						eq(study.id, body.lastPartId),
						eq(study.seriesId, id),
						eq(study.userId, session.user.id)
					))
					.limit(1);

				if (part.length === 0) {
					return json({ error: 'lastPartId must reference a part of this series' }, { status: 400 });
				}
				updates.lastPartId = body.lastPartId;
			}
		}

		// Only updatedAt present means the body carried nothing actionable.
		if (Object.keys(updates).length === 1) {
			return json({ error: 'No supported fields to update' }, { status: 400 });
		}

		const [updated] = await db
			.update(studySeries)
			.set(updates)
			.where(eq(studySeries.id, id))
			.returning();

		return json({ series: updated });
	} catch (error) {
		console.error('Error updating series:', error);
		return json({ error: 'Failed to update series' }, { status: 500 });
	}
};
