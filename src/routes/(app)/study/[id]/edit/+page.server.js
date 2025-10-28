import { v4 as uuidv4 } from 'uuid';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';
import bibleData from '$lib/data/bible.json';

/**
 * Get book name from book ID
 * @param {string} testamentId
 * @param {string} bookId
 * @returns {string}
 */
function getBookName(testamentId, bookId) {
	const testament = bibleData[0].testamentData.find(t => t._id === testamentId);
	if (!testament) return bookId;
	
	const book = testament.bookData.find(b => b._id === bookId);
	return book ? book.title : bookId;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');
	
	// Get the current user from session
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user?.id) {
		throw error(401, 'You must be logged in to edit studies');
	}

	const studyId = params.id;

	try {
		// Query the study by ID
		const studyResult = await db
			.select()
			.from(study)
			.where(eq(study.id, studyId))
			.limit(1);

		if (studyResult.length === 0) {
			throw error(404, 'Study not found');
		}

		const studyData = studyResult[0];

		// Verify the study belongs to the logged-in user
		if (studyData.userId !== session.user.id) {
			throw error(403, 'You do not have permission to edit this study');
		}

		// Query the passages for this study
		const passagesData = await db
			.select()
			.from(passage)
			.where(eq(passage.studyId, studyId))
			.orderBy(passage.displayOrder);

		// Get all studies for duplicate checking (excluding current study)
		const allStudies = await db
			.select()
			.from(study)
			.where(eq(study.userId, session.user.id));

		// Transform passages to match form format
		const formattedPassages = passagesData.map(p => ({
			id: p.id,
			testament: p.testament,
			book: p.bookId,
			fromChapter: p.fromChapter,
			toChapter: p.toChapter,
			fromVerse: p.fromVerse,
			toVerse: p.toVerse
		}));

		return {
			study: {
				id: studyData.id,
				title: studyData.title,
				passages: formattedPassages
			},
			studies: allStudies
		};
	} catch (err) {
		// Re-throw error responses
		if (err.status) {
			throw err;
		}
		
		console.error('Error loading study for edit:', err);
		throw error(500, 'Failed to load study');
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request, params }) => {
		// Get the current user from session
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return fail(401, { error: 'You must be logged in to edit a study' });
		}

		const studyId = params.id;

		try {
			// Verify study exists and belongs to user
			const studyResult = await db
				.select()
				.from(study)
				.where(eq(study.id, studyId))
				.limit(1);

			if (studyResult.length === 0) {
				return fail(404, { error: 'Study not found' });
			}

			if (studyResult[0].userId !== session.user.id) {
				return fail(403, { error: 'You do not have permission to edit this study' });
			}

			const formData = await request.formData();
			const title = formData.get('title');
			const passagesJson = formData.get('passages');

			// Validate title
			if (!title || typeof title !== 'string' || title.trim() === '') {
				return fail(400, { 
					error: 'Title is required',
					title: title || ''
				});
			}

			// Parse and validate passages
			let passagesData;
			try {
				passagesData = JSON.parse(passagesJson?.toString() || '[]');
			} catch {
				return fail(400, { 
					error: 'Invalid passages data',
					title: title.toString()
				});
			}

			if (!Array.isArray(passagesData) || passagesData.length === 0) {
				return fail(400, { 
					error: 'At least one passage is required',
					title: title.toString()
				});
			}

			// Validate each passage
			for (const p of passagesData) {
				if (!p.testament || !p.book || 
					typeof p.fromChapter !== 'number' || 
					typeof p.toChapter !== 'number' ||
					typeof p.fromVerse !== 'number' || 
					typeof p.toVerse !== 'number') {
					return fail(400, { 
						error: 'Invalid passage data',
						title: title.toString()
					});
				}
			}

			const now = new Date();

			// Update study
			await db
				.update(study)
				.set({
					title: title.toString().trim(),
					updatedAt: now
				})
				.where(eq(study.id, studyId));

			// Delete existing passages
			await db
				.delete(passage)
				.where(eq(passage.studyId, studyId));

			// Insert new passages
			const passageValues = passagesData.map((p, index) => ({
				id: p.id || uuidv4(),
				studyId: studyId,
				testament: p.testament,
				bookId: p.book,
				bookName: getBookName(p.testament, p.book),
				fromChapter: p.fromChapter,
				toChapter: p.toChapter,
				fromVerse: p.fromVerse,
				toVerse: p.toVerse,
				displayOrder: index,
				createdAt: now
			}));

			await db.insert(passage).values(passageValues);

			// Redirect to the study view page
			throw redirect(303, `/study/${studyId}`);

		} catch (error) {
			// If it's a redirect, re-throw it
			if (error?.status === 303) {
				throw error;
			}

			console.error('Error updating study:', error);
			return fail(500, { 
				error: 'Failed to update study. Please try again.'
			});
		}
	}
};
