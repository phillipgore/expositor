import { v4 as uuidv4 } from 'uuid';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { study, passage, studyGroup } from '$lib/server/db/schema.js';
import { auth } from '$lib/server/auth.js';
import { eq, and } from 'drizzle-orm';
import bibleData from '$lib/data/bible.json';
import { expandGroupAncestors, createDefaultPassageStructure } from '$lib/server/db/utils.js';
import {
	validatePassagesLimits,
	checkSinglePassageSupport
} from '$lib/utils/translationLimits.js';
import { planSeriesParts } from '$lib/utils/seriesPlanning.js';

import { fetchPassagesTextWithCache } from '$lib/server/bibleApi.js';
import { enforceCacheLimit } from '$lib/server/db/cacheEvictionRunner.js';

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
	const testament = bibleData[0].testamentData.find((t) => t._id === testamentId);
	if (!testament) return bookId;

	const book = testament.bookData.find((b) => b._id === bookId);
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
			.where(and(eq(studyGroup.id, groupId), eq(studyGroup.userId, session.user.id)))
			.limit(1);

		group = groups[0] || null;
	}

	// Get all studies for duplicate title checking
	const studies = await db.select().from(study).where(eq(study.userId, session.user.id));

	return {
		studies,
		groupId: group?.id || null,
		groupName: group?.name || null
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ request, fetch }) => {

		// Get the current user from session using better-auth
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session?.user?.id) {
			return fail(401, { error: 'You must be logged in to create a study' });
		}

		try {
			const formData = await request.formData();
			const title = formData.get('title');
			const subtitle = formData.get('subtitle');
			const translation = formData.get('translation') || 'esv';
			const passagesJson = formData.get('passages');
			const groupId = formData.get('groupId');

			// §5 route 1: the New Study form's "A series of studies" choice, plus the
			// chapters-per-part setting the preview was computed from. Absent on every existing
			// caller, which is the point — rule 2, "the default is always one study", must hold
			// for a form that says nothing about series at all.
			const createAsSeries = formData.get('createAsSeries') === 'true';
			const chaptersPerPart = Number(formData.get('chaptersPerPart')) || 1;

			// Per-passage divisions for a multi-passage study. Parsed defensively: a malformed
			// value must fall back to "every passage whole" — the pre-existing shape — rather than
			// abort a study creation that is otherwise valid.
			let chaptersPerPassage = [];
			try {
				const raw = formData.get('chaptersPerPassage');
				if (typeof raw === 'string' && raw.trim() !== '') {
					const parsed = JSON.parse(raw);
					if (Array.isArray(parsed)) {
						chaptersPerPassage = parsed.map((n) => Number(n) || 0);
					}
				}
			} catch {
				chaptersPerPassage = [];
			}


			// Validate title
			if (!title || typeof title !== 'string' || title.trim() === '') {
				return fail(400, {
					error: 'Title is required',
					title: title || ''
				});
			}

			// Validate translation
			if (!['esv', 'net'].includes(translation.toString())) {
				return fail(400, {
					error: 'Invalid translation selected',
					title: title.toString()
				});
			}

			// Validate groupId if provided
			if (groupId && typeof groupId === 'string' && groupId.trim() !== '') {
				const groups = await db
					.select()
					.from(studyGroup)
					.where(and(eq(studyGroup.id, groupId), eq(studyGroup.userId, session.user.id)))
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

			// Validate each passage against the translation's retrieval policy.
			//
			// Passages are NEVER auto-split any more. Silently turning one requested
			// Psalms passage into six was surprising, and passage shape is a
			// document-structure decision that belongs to the user: it determines the
			// structure trees, the dividers, and how the study reads. So an oversized
			// selection is refused with an explanation naming both remedies (add
			// several passages, or pick a translation that can serve the range whole)
			// rather than quietly reshaped.
			//
			// For a translation whose `retrieval.chunking` is enabled this rarely
			// triggers: the fetch layer assembles a large passage from several
			// requests, so one passage can span a whole book. It is ESV — where one
			// passage is one request, and Crossway polices completeness server-side —
			// that still has a real per-passage ceiling.
			//
			// Note the client blocks these cases during selection so the user finds
			// out while choosing rather than after committing; this is the server-side
			// backstop for a direct POST. That mirroring is the point — and is exactly what
			// drifted below, so keep the two in step.
			//
			// ⚠️ SERIES-AWARE. Asking `validatePassagesLimits()` unconditionally was a bug that
			// blocked the very case the series feature exists to solve: §5 creates-then-parts, so
			// the passages arriving here are still the undivided whole-book range. A Matthew
			// series was refused with "This passage spans 1071 verses… add it as several smaller
			// passages" — advice the user had already taken, by asking for a series. The client
			// had been fixed for exactly this (`submissionBlockedByPassages`) and the server had
			// not, which is COMPLIANCE §1.9: a check belongs at every chokepoint, not the one
			// that came to mind first.
			//
			// Crossway's limits are per REQUEST and per PAGE, and a part is its own study on its
			// own page fetched by its own request — so the PARTS are what those clauses govern,
			// not the source range they were derived from (COMPLIANCE §1.10).
			const seriesPlanForLimits = createAsSeries
				? planSeriesParts({
						passages: passagesData,
						chaptersPerPart,
						chaptersPerPassage,
						translationId: translation.toString(),
						baseTitle: title.toString()
					})
				: null;

			// Only a plan that will really become a series may substitute its parts for the whole
			// range. Fewer than 2 parts means the conversion below produces nothing — an
			// ineligible range, or a setting that collapses to one part — and the study stays a
			// single undivided study, which is exactly what the one-study check governs.
			//
			// Without this branch `createAsSeries=true` would be a trivial bypass of the passage
			// limit: claim a series, get no parts, keep an unservable study.
			const willBeSeries = (seriesPlanForLimits?.parts?.length ?? 0) >= 2;

			if (willBeSeries) {
				// The same question the form asks, via the same helper, against the same planner
				// the /api/series endpoint runs. A part ESV genuinely cannot serve still blocks.
				const unservablePart = seriesPlanForLimits.parts
					.map((part) => ({
						seriesOrder: part.seriesOrder,
						...checkSinglePassageSupport(part.passages[0], translation.toString())
					}))
					.find((result) => !result.canBeSinglePassage);

				if (unservablePart) {
					return fail(400, {
						error: `Part ${unservablePart.seriesOrder} cannot be loaded: ${unservablePart.message}`,
						title: title.toString()
					});
				}
			} else {
				const limitCheck = validatePassagesLimits(passagesData, translation.toString());
				if (!limitCheck.valid) {
					return fail(400, {
						error: limitCheck.error,
						title: title.toString()
					});
				}
			}


			// Create study and passages in a transaction
			const studyId = uuidv4();

			const now = new Date();

			// Insert study with groupId and translation
			await db.insert(study).values({
				id: studyId,
				title: title.toString().trim(),
				subtitle:
					subtitle && typeof subtitle === 'string' && subtitle.trim() !== ''
						? subtitle.toString().trim()
						: null,
				translation: translation.toString(),
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

			// Create default column, section, and segment for each passage
			for (const passageValue of passageValues) {
				await createDefaultPassageStructure(
					passageValue.id,
					passageValue.testament,
					passageValue.bookId,
					passageValue.fromChapter,
					passageValue.fromVerse
				);
			}

			// If study was created in a group, expand that group and all ancestors
			if (groupId && typeof groupId === 'string' && groupId.trim() !== '') {
				await expandGroupAncestors(groupId, session.user.id);
			}

			// Warm the per-passage text cache so the very first study load is fast
			// instead of fetching the whole study from the translation API. This is
			// best-effort: any failure here is swallowed and the passage simply
			// lazy-fills on first load (it starts with cachedText = null).
			let cacheFilled = false;
			try {
				await fetchPassagesTextWithCache(passageValues, translation.toString(), {
					onFetched: async (passageRow, result) => {
						await db
							.update(passage)
							.set({ cachedText: result.text, textCachedAt: new Date() })
							.where(eq(passage.id, passageRow.id));
						cacheFilled = true;
					}
				});
			} catch (cacheError) {
				console.error('Failed to warm passage text cache for new study:', cacheError);
			}

			// Enforce the local-storage cap after the fill (COMPLIANCE.md §5 item 1).
			//
			// Creating a study is the other way text enters the cache, so it needs the same enforcement as
			// the study loader. Wiring only the loader would have left a route by which a user could push
			// storage over the cap and keep it there — the §1.9 lesson that a check belongs at every
			// chokepoint, not at the one that came to mind first. Not awaited: the redirect below does not
			// depend on it.
			if (cacheFilled) {
				void enforceCacheLimit(session.user.id);
			}

			// §5 route 1: convert the just-created study into a series.
			//
			// Create-then-part, rather than a separate series-creation path. The endpoint's own
			// docs anticipate this ("The New Study flow's offer (§5, route 1) ends up here too,
			// having created the study first"), and it matters that it is the SAME endpoint: it
			// runs `planSeriesParts()`, so the parts a user gets from this form are identical to
			// the ones the "Split into a Series…" preview showed them. A parallel implementation
			// here would be a second answer to "what are the parts", free to drift from the first.
			//
			// The source study becomes part 1 in place, so `studyId` stays valid either way and
			// the redirect below needs no special case.
			//
			// A failure here is deliberately NOT fatal: the study exists and is perfectly usable,
			// so we land the user on it rather than discarding their work over a failed
			// conversion they can retry from the study menu. Eligibility is not pre-checked —
			// the endpoint owns that rule (§5: eligibility is never tightened), and re-deriving
			// it here would be a second gate to keep in sync.
			if (createAsSeries) {
				try {
					const response = await fetch('/api/series', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ studyId, chaptersPerPart, chaptersPerPassage })
					});
					if (!response.ok) {
						const detail = await response.json().catch(() => ({}));
						console.error('Series conversion failed for new study:', detail?.error);
					}
				} catch (seriesError) {
					console.error('Series conversion failed for new study:', seriesError);
				}
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
