import { db } from '$lib/server/db/index.js';
import { commentaryTag } from '$lib/server/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { json } from '@sveltejs/kit';

const VALID_SUBJECT_TYPES = ['segment', 'section', 'column', 'connection'];

/**
 * GET /api/commentary-tags?subjectType=&subjectId=
 * List glossary tags for a commentary subject, in display order.
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ request, url }) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const subjectType = url.searchParams.get('subjectType');
	const subjectId = url.searchParams.get('subjectId');

	if (!subjectType || !subjectId || !VALID_SUBJECT_TYPES.includes(subjectType)) {
		return json({ error: 'Invalid subjectType or subjectId' }, { status: 400 });
	}

	try {
		const tags = await db
			.select()
			.from(commentaryTag)
			.where(
				and(
					eq(commentaryTag.subjectType, subjectType),
					eq(commentaryTag.subjectId, subjectId)
				)
			)
			.orderBy(asc(commentaryTag.displayOrder), asc(commentaryTag.createdAt));

		return json({ tags });
	} catch (error) {
		console.error('Error fetching commentary tags:', error);
		return json({ error: 'Failed to fetch tags' }, { status: 500 });
	}
}

/**
 * POST /api/commentary-tags
 * Body: { subjectType, subjectId, termId }
 * Add a glossary tag to a subject (no-op if it already exists).
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ request }) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { subjectType, subjectId, termId } = await request.json();

		if (
			!subjectType ||
			!subjectId ||
			!termId ||
			!VALID_SUBJECT_TYPES.includes(subjectType)
		) {
			return json({ error: 'Invalid request body' }, { status: 400 });
		}

		// Prevent duplicate (subject, term) pairs.
		const existing = await db
			.select()
			.from(commentaryTag)
			.where(
				and(
					eq(commentaryTag.subjectType, subjectType),
					eq(commentaryTag.subjectId, subjectId),
					eq(commentaryTag.termId, termId)
				)
			)
			.limit(1);

		if (existing.length > 0) {
			return json({ tag: existing[0], created: false });
		}

		// Append to the end of the existing tags.
		const current = await db
			.select()
			.from(commentaryTag)
			.where(
				and(
					eq(commentaryTag.subjectType, subjectType),
					eq(commentaryTag.subjectId, subjectId)
				)
			);
		const displayOrder = current.length;

		const id = crypto.randomUUID();
		const [tag] = await db
			.insert(commentaryTag)
			.values({ id, subjectType, subjectId, termId, displayOrder })
			.returning();

		return json({ tag, created: true });
	} catch (error) {
		console.error('Error adding commentary tag:', error);
		return json({ error: 'Failed to add tag' }, { status: 500 });
	}
}

/**
 * DELETE /api/commentary-tags?id=
 *   or   /api/commentary-tags?subjectType=&subjectId=&termId=
 * Remove a glossary tag.
 * @type {import('./$types').RequestHandler}
 */
export async function DELETE({ request, url }) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const id = url.searchParams.get('id');
		const subjectType = url.searchParams.get('subjectType');
		const subjectId = url.searchParams.get('subjectId');
		const termId = url.searchParams.get('termId');

		if (id) {
			await db.delete(commentaryTag).where(eq(commentaryTag.id, id));
			return json({ success: true });
		}

		if (subjectType && subjectId && termId) {
			await db
				.delete(commentaryTag)
				.where(
					and(
						eq(commentaryTag.subjectType, subjectType),
						eq(commentaryTag.subjectId, subjectId),
						eq(commentaryTag.termId, termId)
					)
				);
			return json({ success: true });
		}

		return json({ error: 'Provide id or (subjectType, subjectId, termId)' }, { status: 400 });
	} catch (error) {
		console.error('Error deleting commentary tag:', error);
		return json({ error: 'Failed to delete tag' }, { status: 500 });
	}
}
