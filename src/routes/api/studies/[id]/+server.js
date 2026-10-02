import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, studySeries } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';


/**
 * Delete a study.
 *
 * When the study is a part of a series this also enforces §4's deletion rules: the part's verses
 * leave the series entirely (they are NOT handed to a neighbour — that would be Join Parts wearing
 * the wrong label), and **deleting down to one part dissolves the series**, because "a one-part
 * series is a study wearing a costume".
 *
 * `seriesOrder` on the surviving parts is deliberately left alone. §4: canonical order seeds it
 * once and never touches it again, so re-normalising 1..n here would clobber a deliberate
 * arrangement. The resulting gap in the sequence is expected — the run helper derives contiguity
 * from passages, not from consecutive order numbers.
 *
 * @type {import('./$types').RequestHandler}
 */
export const DELETE = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;

		// Verify the study belongs to the current user before deleting
		const existingStudy = await db
			.select()
			.from(study)
			.where(and(eq(study.id, id), eq(study.userId, session.user.id)))
			.limit(1);

		if (existingStudy.length === 0) {
			return json({ error: 'Study not found' }, { status: 404 });
		}

		const seriesId = existingStudy[0].seriesId;

		// Not part of a series: the original single-statement path, unchanged.
		if (!seriesId) {
			await db
				.delete(study)
				.where(and(eq(study.id, id), eq(study.userId, session.user.id)));

			return json({ success: true }, { status: 200 });
		}

		// A part of a series. The delete and any dissolve must be atomic: a crash between them
		// would leave a one-part series, which is precisely the state §4 says cannot exist.
		const result = await db.transaction(async (tx) => {
			await tx
				.delete(study)
				.where(and(eq(study.id, id), eq(study.userId, session.user.id)));

			const remaining = await tx
				.select({ id: study.id })
				.from(study)
				.where(eq(study.seriesId, seriesId));

			// Two or more parts left: still a series, nothing further to do. The run it belonged
			// to may now be split in two, but runs are derived on demand (§4) so there is no
			// stored state to update here.
			if (remaining.length >= 2) {
				return { dissolved: false, remainingParts: remaining.length };
			}

			// One part left: dissolve the series, leaving a standalone study.
			//
			// ORDER MATTERS. `study.series_id` is ON DELETE CASCADE, so deleting the series row
			// first would take the surviving part with it — turning "dissolve into a standalone
			// study" into "silently destroy the user's last part". Clear the back-reference first,
			// then remove the now-empty series row.
			if (remaining.length === 1) {
				await tx
					.update(study)
					.set({ seriesId: null, seriesOrder: null, updatedAt: new Date() })
					.where(eq(study.id, remaining[0].id));
			}

			// `last_part_id` is ON DELETE SET NULL, so it cannot hold a dangling reference here;
			// the series row is going away regardless.
			await tx.delete(studySeries).where(eq(studySeries.id, seriesId));

			return {
				dissolved: true,
				remainingParts: remaining.length,
				dissolvedIntoStudyId: remaining[0]?.id ?? null
			};
		});

		return json({ success: true, ...result }, { status: 200 });
	} catch (error) {
		console.error('Delete study error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};


/**
 * Update a study (e.g., change its groupId)
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id } = params;
		const body = await request.json();

		// Verify the study belongs to the current user
		const existingStudy = await db
			.select()
			.from(study)
			.where(and(eq(study.id, id), eq(study.userId, session.user.id)))
			.limit(1);

		if (existingStudy.length === 0) {
			return json({ error: 'Study not found' }, { status: 404 });
		}

		// Only fields present in the body are written: an absent key means "leave it alone".
		/** @type {Record<string, unknown>} */
		const updates = { updatedAt: new Date() };

		// groupId (can be null to ungroup)
		if (body.groupId !== undefined) {
			updates.groupId = body.groupId;
		}

		// Title is NOT NULL, so an empty title is rejected rather than cleared.
		if (body.title !== undefined) {
			if (typeof body.title !== 'string' || body.title.trim() === '') {
				return json({ error: 'Study title cannot be empty' }, { status: 400 });
			}
			updates.title = body.title.trim().slice(0, 500);
		}

		// Subtitle is nullable: `null` and '' both clear it.
		if (body.subtitle !== undefined) {
			if (body.subtitle === null) {
				updates.subtitle = null;
			} else if (typeof body.subtitle === 'string') {
				updates.subtitle = body.subtitle.trim() === '' ? null : body.subtitle.trim().slice(0, 500);
			} else {
				return json({ error: 'subtitle must be a string or null' }, { status: 400 });
			}
		}

		if (Object.keys(updates).length === 1) {
			return json({ error: 'No supported fields to update' }, { status: 400 });
		}

		await db
			.update(study)
			.set(updates)
			.where(eq(study.id, id));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update study error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
