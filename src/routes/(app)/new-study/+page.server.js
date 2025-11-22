import { v4 as uuidv4 } from 'uuid';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage, studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';
import bibleData from '$lib/data/bible.json';
import { expandGroupAncestors } from '$lib/server/db/utils.js';

/**
 * @typedef {Object} PassageData
 * @property {string} id
 * @property {string} testament
 * @property {string} book
 * @property {number} fromChapter
 * @property {number} toChapter
 * @property {number} fromVerse
 * @property {number} toVerse
 */

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
export async function load({ url, request }) {
	// Get the current user from session (guaranteed by layout)
	const session = await auth.api.getSession({ headers: request.headers });
	
	// Get groupId from URL if provided
	const groupId = url.searchParams.get('groupId');
	let group = null;

	if (groupId) {
		// Verify group exists and belongs to user
		const groups = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, groupId),
				eq(studyGroup.userId, session.user.id)
			))
			.limit(1);

		group = groups[0] || null;
	}

	// Get all studies for duplicate title checking
	const studies = await db
		.select()
		.from(study)
		.where(eq(study.userId, session.user.id));

	return {
		studies,
		groupId: group?.id || null,
		groupName: group?.name || null
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request }) => {
		// Get the current user from session using better-auth
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return fail(401, { error: 'You must be logged in to create a study' });
		}

		try {
			const formData = await request.formData();
			const title = formData.get('title');
			const subtitle = formData.get('subtitle');
			const passagesJson = formData.get('passages');
			const groupId = formData.get('groupId');

			// Validate title
			if (!title || typeof title !== 'string' || title.trim() === '') {
				return fail(400, { 
					error: 'Title is required',
					title: title || ''
				});
			}

			// Validate groupId if provided
			if (groupId && typeof groupId === 'string' && groupId.trim() !== '') {
				const groups = await db
					.select()
					.from(studyGroup)
					.where(and(
						eq(studyGroup.id, groupId),
						eq(studyGroup.userId, session.user.id)
					))
					.limit(1);

				if (groups.length === 0) {
					return fail(400, {
						error: 'Invalid group selected',
						title: title.toString()
					});
				}
			}

			// Parse and validate passages
			/** @type {PassageData[]} */
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

			// Create study and passages in a transaction
			const studyId = uuidv4();
			const now = new Date();

			// Insert study with groupId if provided
			await db.insert(study).values({
				id: studyId,
				title: title.toString().trim(),
				subtitle: subtitle && typeof subtitle === 'string' && subtitle.trim() !== '' ? subtitle.toString().trim() : null,
				userId: session.user.id,
				groupId: groupId && typeof groupId === 'string' && groupId.trim() !== '' ? groupId : null,
				createdAt: now,
				updatedAt: now
			});

			// Insert passages
			const passageValues = passagesData.map((p, index) => ({
				id: uuidv4(),
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

			// If study was created in a group, expand that group and all ancestors
			if (groupId && typeof groupId === 'string' && groupId.trim() !== '') {
				await expandGroupAncestors(groupId, session.user.id);
			}

			// Redirect to the study view page (adjust URL as needed)
			throw redirect(303, `/study/${studyId}`);

		} catch (error) {
			// If it's a redirect, re-throw it
			if (error?.status === 303) {
				throw error;
			}

			console.error('Error creating study:', error);
			return fail(500, { 
				error: 'Failed to create study. Please try again.'
			});
		}
	}
};
