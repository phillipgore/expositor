import { v4 as uuidv4 } from 'uuid';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq } from 'drizzle-orm';
import bibleData from '$lib/data/bible.json';
import {
	diffPassages,
	applyPassageRangeChange,
	rangeFirstWordId,
	createDefaultStructureTx
} from '$lib/server/db/passageReconcile.js';
import { validatePassagesLimits } from '$lib/utils/translationLimits.js';

/**
 * Get book name from book ID
 * @param {string} testamentId
 * @param {string} bookId
 * @returns {string}
 */
function getBookName(testamentId, bookId) {
	const testament = bibleData[0].testamentData.find((t) => t._id === testamentId);
	if (!testament) return bookId;

	const book = testament.bookData.find((b) => b._id === bookId);
	return book ? book.title : bookId;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, depends }) {
	depends('app:studies');

	// Get the current user from session (guaranteed by layout)
	const session = await auth.api.getSession({ headers: request.headers });
	const studyId = params.id;

	try {
		// Query the study by ID
		const studyResult = await db.select().from(study).where(eq(study.id, studyId)).limit(1);

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
		const allStudies = await db.select().from(study).where(eq(study.userId, session.user.id));

		// Transform passages to match form format
		const formattedPassages = passagesData.map((p) => ({
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
				subtitle: studyData.subtitle,
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
			const studyResult = await db.select().from(study).where(eq(study.id, studyId)).limit(1);

			if (studyResult.length === 0) {
				return fail(404, { error: 'Study not found' });
			}

			if (studyResult[0].userId !== session.user.id) {
				return fail(403, { error: 'You do not have permission to edit this study' });
			}

			const formData = await request.formData();
			const title = formData.get('title');
			const subtitle = formData.get('subtitle');
			const passagesJson = formData.get('passages');
			const decisionsJson = formData.get('decisions');

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
				if (
					!p.testament ||
					!p.book ||
					typeof p.fromChapter !== 'number' ||
					typeof p.toChapter !== 'number' ||
					typeof p.fromVerse !== 'number' ||
					typeof p.toVerse !== 'number'
				) {
					return fail(400, {
						error: 'Invalid passage data',
						title: title.toString()
					});
				}
			}

			// Guard against the translation API's per-request limits (e.g. ESV's
			// 500-verse / half-a-book cap). The study's translation can't change
			// once created, so validate the edited ranges against it before we
			// reconcile and re-fetch text. Reject over-limit ranges up front.
			const studyTranslation = studyResult[0].translation || 'esv';
			const limitCheck = validatePassagesLimits(passagesData, studyTranslation);
			if (!limitCheck.valid) {
				return fail(400, {
					error: limitCheck.error,
					title: title.toString()
				});
			}

			// Parse per-passage decisions (keyed by passage id). Optional —
			// defaults are applied in the reconciliation engine when absent.
			/** @type {Record<string, any>} */

			let decisions = {};
			if (decisionsJson) {
				try {
					decisions = JSON.parse(decisionsJson.toString()) || {};
				} catch {
					decisions = {};
				}
			}

			const now = new Date();

			// Load existing passages so we can diff rather than destroy.
			const existingPassages = await db.select().from(passage).where(eq(passage.studyId, studyId));

			const { added, removed, changed, unchanged } = diffPassages(existingPassages, passagesData);

			// Build a quick lookup of the new order for displayOrder updates.
			const orderById = new Map(passagesData.map((p, index) => [p.id, index]));

			// Run everything in a single transaction so a partial failure can't
			// leave the study in a half-reconciled state.
			await db.transaction(async (tx) => {
				// 1. Update study title/subtitle.
				await tx
					.update(study)
					.set({
						title: title.toString().trim(),
						subtitle:
							subtitle && typeof subtitle === 'string' && subtitle.trim() !== ''
								? subtitle.toString().trim()
								: null,
						updatedAt: now
					})
					.where(eq(study.id, studyId));

				// 2. Remove passages the user deleted (cascade clears their structure).
				if (removed.length > 0) {
					for (const old of removed) {
						await tx.delete(passage).where(eq(passage.id, old.id));
					}
				}

				// 3. Add brand-new passages with a default structure.
				for (const next of added) {
					await tx.insert(passage).values({
						id: next.id || uuidv4(),
						studyId: studyId,
						testament: next.testament,
						bookId: next.book,
						bookName: getBookName(next.testament, next.book),
						fromChapter: next.fromChapter,
						toChapter: next.toChapter,
						fromVerse: next.fromVerse,
						toVerse: next.toVerse,
						displayOrder: orderById.get(next.id) ?? 0,
						createdAt: now
					});
					const firstWord = rangeFirstWordId({
						testament: next.testament,
						bookId: next.book,
						fromChapter: next.fromChapter,
						fromVerse: next.fromVerse
					});
					await createDefaultStructureTx(tx, next.id, firstWord);
				}

				// 4. Reconcile passages whose verse range changed (preserve structure).
				for (const { old, next } of changed) {
					await tx
						.update(passage)
						.set({
							testament: next.testament,
							bookId: next.book,
							bookName: getBookName(next.testament, next.book),
							fromChapter: next.fromChapter,
							toChapter: next.toChapter,
							fromVerse: next.fromVerse,
							toVerse: next.toVerse,
							displayOrder: orderById.get(next.id) ?? old.displayOrder
						})
						.where(eq(passage.id, next.id));

					await applyPassageRangeChange(tx, studyId, old, next, decisions[next.id] || {});
				}

				// 5. Keep displayOrder in sync for unchanged passages (reordering).
				for (const { old, next } of unchanged) {
					const newOrder = orderById.get(next.id) ?? old.displayOrder;
					if (newOrder !== old.displayOrder) {
						await tx.update(passage).set({ displayOrder: newOrder }).where(eq(passage.id, next.id));
					}
				}
			});

			// Redirect to the study view page
			throw redirect(303, `/study/${studyId}`);
		} catch (err) {
			// If it's a redirect, re-throw it
			if (err?.status === 303) {
				throw err;
			}

			console.error('Error updating study:', err);
			return fail(500, {
				error: 'Failed to update study. Please try again.'
			});
		}
	}
};
