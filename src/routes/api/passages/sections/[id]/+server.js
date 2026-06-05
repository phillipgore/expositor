import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { passageSection } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth.js';

/**
 * Get a section record (including commentary)
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const sectionId = params.id;

		const sections = await db.select()
			.from(passageSection)
			.where(eq(passageSection.id, sectionId))
			.limit(1);

		if (sections.length === 0) {
			return json({ error: 'Section not found' }, { status: 404 });
		}

		return json(sections[0]);
	} catch (error) {
		console.error('Get section error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/**
 * Update section color and/or commentary
 * @type {import('./$types').RequestHandler}
 */
export const PATCH = async ({ request, params }) => {
	try {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		
		if (!session?.user?.id) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const sectionId = params.id;

		// Handle top-offset update (vertical reposition spacing).
		// topOffset is the EXTRA spacing in px added above the section beyond its
		// default gap. null/0 = default spacing; positive integer = pushed down.
		if ('topOffset' in body) {
			const { topOffset } = body;

			if (topOffset !== null) {
				if (typeof topOffset !== 'number' || !Number.isFinite(topOffset) || topOffset < 0) {
					return json({ error: 'Invalid topOffset' }, { status: 400 });
				}
			}

			await db.update(passageSection)
				.set({
					topOffset: topOffset === null ? null : Math.round(topOffset),
					updatedAt: new Date()
				})
				.where(eq(passageSection.id, sectionId));

			return json({ success: true }, { status: 200 });
		}

		// Handle commentary update
		if ('commentary' in body) {

			const { commentary } = body;

			if (commentary !== undefined && typeof commentary !== 'string' && commentary !== null) {
				return json({ error: 'Invalid commentary' }, { status: 400 });
			}

			await db.update(passageSection)
				.set({
					commentary: commentary ?? null,
					updatedAt: new Date()
				})
				.where(eq(passageSection.id, sectionId));

			return json({ success: true }, { status: 200 });
		}

		// Handle color update (original behaviour)
		const { color } = body;

		const validColors = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink'];
		if (!color || !validColors.includes(color)) {
			return json({ error: 'Invalid color. Must be one of: ' + validColors.join(', ') }, { status: 400 });
		}

		// Update section color
		await db.update(passageSection)
			.set({ 
				color,
				updatedAt: new Date()
			})
			.where(eq(passageSection.id, sectionId));

		return json({ success: true }, { status: 200 });
	} catch (error) {
		console.error('Update section error:', error);
		
		if (error.message === 'Unauthorized') {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
