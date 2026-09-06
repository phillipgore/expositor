import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { studySeries, study, studyGroup } from '$lib/server/db/schema.js';
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

		// The subtitle, which is nullable — so `null` and `''` both mean "clear it", while an absent
		// key means "leave it alone". Accepted here as well as in `reserialize` because renaming a
		// series is a placement-style edit that should not require the whole review flow.
		if (body.subtitle !== undefined) {
			if (body.subtitle === null) {
				updates.subtitle = null;
			} else if (typeof body.subtitle === 'string') {
				updates.subtitle = body.subtitle.trim() === '' ? null : body.subtitle.trim();
			} else {
				return json({ error: 'subtitle must be a string or null' }, { status: 400 });
			}
		}

		// Filing the series in a group, or moving it back to the top level with an explicit null.
		//
		// This is a PLACEMENT change, not a membership one, so it does not fall foul of the note
		// above: it never touches which studies are parts, nor their seriesOrder. A series occupies
		// one Finder slot the way a study does (§4), and the Finder's "Move to..." command had no
		// way to move it until this existed — it issued a PATCH that this handler ignored, so the
		// move reported success and nothing moved.
		//
		// `undefined` means "not mentioned"; `null` means "move to the top level". Distinguishing
		// them matters, because `groupId` is nullable and a caller must be able to clear it.
		if (body.groupId !== undefined) {
			if (body.groupId === null) {
				updates.groupId = null;
			} else if (typeof body.groupId === 'string' && body.groupId.trim() !== '') {
				// The destination must be a group THIS user owns. Without the ownership check a
				// series could be filed into someone else's group, where its owner could no longer
				// see it — scoping the lookup makes a foreign group indistinguishable from a
				// missing one, as everywhere else in this file.
				const [group] = await db
					.select({ id: studyGroup.id })
					.from(studyGroup)
					.where(and(eq(studyGroup.id, body.groupId), eq(studyGroup.userId, session.user.id)))
					.limit(1);

				if (!group) {
					return json({ error: 'That group could not be found' }, { status: 400 });
				}
				updates.groupId = body.groupId;
			} else {
				return json({ error: 'groupId must be a group id or null' }, { status: 400 });
			}
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

/**
 * Delete a series and every part in it.
 *
 * §4: "deleting a series deletes everything in it", reversing Q6's earlier `set null`
 * recommendation. The delete of the `study_series` row is the whole operation — `study.series_id`
 * carries `ON DELETE CASCADE` (migration 0046), so the parts, their passages, structure, notes and
 * commentary all go with it, and the six `segment_connection` endpoint FKs collect the cross-part
 * connections with no special handling. That is why series deletion "dissolves the cross-part
 * connection problem" while boundary moves do not (§4's own warning against over-reading this).
 *
 * The count is returned so the caller can report what was destroyed. It is gathered BEFORE the
 * delete, because afterwards the rows are gone and the number is unrecoverable.
 *
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;

		const existing = await db
			.select({ id: studySeries.id, name: studySeries.name })
			.from(studySeries)
			.where(and(
				eq(studySeries.id, id),
				eq(studySeries.userId, session.user.id)
			))
			.limit(1);

		if (existing.length === 0) {
			return json({ error: 'Series not found' }, { status: 404 });
		}

		const parts = await db
			.select({ id: study.id })
			.from(study)
			.where(eq(study.seriesId, id));

		await db.delete(studySeries).where(eq(studySeries.id, id));

		return json({ success: true, deletedParts: parts.length, name: existing[0].name });
	} catch (error) {
		console.error('Error deleting series:', error);
		return json({ error: 'Failed to delete series' }, { status: 500 });
	}
};

