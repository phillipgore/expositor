/**
 * # Move Selected Up / Down — the write path (SERIES_PLAN §8)
 *
 * Two tiers, one command. An item either moves into an **adjacent container inside its own passage**
 * (a section into the next column; a segment into the next section) or, when no such container exists,
 * into the **adjacent part**. `itemTransfer.js` decides which, and refuses a middle item outright.
 *
 * ## Why this is so much smaller than `crossPartJoin.js`
 *
 * Nothing is folded and nothing is deleted, so the entire Merge/Delete apparatus is absent. More
 * importantly the **within-passage tier moves no verses at all**: the passage's range is unchanged, so
 * there is no `planBoundaryShift`, no `cachedText` invalidation, no display re-validation and no
 * connection re-ownership. It is one `UPDATE` plus the existing re-anchor sweep.
 *
 * The cross-part tier does move verses, and there it borrows the same machinery the Joins use.
 *
 * ## ⚠️ What the re-anchor sweep does for free, and why nothing here duplicates it
 *
 * `reanchorPassages()` recomputes every column's and section's `startingWordId` from its own first
 * live child, **in either direction**, and deletes containers left with no children
 * (`reanchor.js:130-193`). A transfer is exactly the gesture that strands a container — move a
 * section's only segment out and the section is empty; move a column's only section out and the column
 * is too. So the sweep is not an optimisation here, it is the cleanup, and it must run on every path.
 *
 * ⚠️ `topOffset` is cleared when a section changes column. The field is documented as pushing a section
 * down "so it visually aligns with sections/segments in **other columns**" — an alignment computed
 * against a column the section no longer sits in. Keeping a hand-tuned offset that now aligns against
 * nothing is a silent wrongness, so it is dropped and the user can re-tune.
 *
 * @module itemTransferDb
 */

import { passage, passageColumn, passageSection, passageSegment, segmentConnection, study } from './schema.js';
import { eq, inArray } from 'drizzle-orm';
import { loadPassageSequence } from './passageSequence.js';
import { reanchorPassages } from './reanchor.js';
import { planBoundaryShift } from '$lib/utils/boundaryMove.js';
// ⚠️ `compareWordIds` deliberately IGNORES the book segment (`wordIds.js`), and its safety note reads
// "safe for every current caller — all of them order structure within one passage, which cannot span
// books". The cross-part path below orders structure across TWO passages, so that justification no
// longer covers it by its own terms. It remains correct for a different reason: `isPassageSeamEligible`
// has already refused `'different-books'` by the time any comparison here runs, so both passages are
// in the same book by construction. Recorded because the original note would otherwise read as false.
import { compareWordIds } from '$lib/utils/wordIds.js';

import { isPassageSeamEligible, classifyPassageSeam } from '$lib/utils/sequenceScope.js';
import { validateStudyDisplayLimits, getDisplayLimits } from '$lib/utils/translationLimits.js';
import {
	locateInSequence,
	resolveTransfer,
	wouldEmptyPassage
} from '$lib/utils/itemTransfer.js';

/** Every segment beneath an item, whatever its tier — the rows whose study ownership may change. */
function segmentsBeneath(located, granularity) {
	if (granularity === 'segment') return [located.item];
	if (granularity === 'section') return located.item.segments ?? [];
	const out = [];
	for (const section of located.item.sections ?? []) out.push(...(section.segments ?? []));
	return out;
}

/**
 * Where would this item go, and is the move legal? No writes.
 *
 * Thin now: `resolveTransfer` owns the whole rule (edge of its container, adjacent container in
 * reading order), so this adds only what the pure layer cannot see — seam eligibility, whether the
 * part would be emptied, the boundary arithmetic and the display-limit re-check.
 *
 * ⚠️ `crossesPassage` — NOT the granularity — decides whether verses move. A section stepping between
 * two columns of one passage moves nothing; the same section stepping into the next part's column
 * moves plenty. The previous version keyed this off a per-tier notion and got both cases wrong.
 *
 * @param {Object} dbx
 * @param {string} userId
 * @param {string} passageId
 * @param {string} itemId
 * @param {'segment'|'section'|'column'} granularity
 * @param {'up'|'down'} direction
 * @returns {Promise<Object>}
 */
export async function analyzeItemTransfer(dbx, userId, passageId, itemId, granularity, direction) {
	const loaded = await loadPassageSequence(dbx, userId, passageId);
	if (!loaded) return { ok: false, reason: 'Passage not found.' };

	const plan = resolveTransfer({
		sequence: loaded.sequence,
		granularity,
		itemId,
		direction
	});
	if (!plan.ok) return { ok: false, reason: plan.reason };

	const entry = loaded.sequence[plan.sourcePassageIndex];
	const target = loaded.sequence[plan.targetPassageIndex];

	// A move inside one passage touches no verses, so none of the boundary machinery applies.
	if (!plan.crossesPassage) {
		return {
			ok: true,
			reason: null,
			granularity,
			direction,
			crossesPassage: false,
			crossesPart: false,
			passageId,
			fromPassageId: entry.passageId,
			toPassageId: entry.passageId,
			fromStudyId: entry.studyId,
			toStudyId: entry.studyId,
			seriesId: loaded.seriesId ?? null,
			targetColumnId: plan.targetColumnId,
			targetSectionId: plan.targetSectionId,
			versesMoved: 0,
			display: null
		};
	}

	// ── Crossing a passage: everything below is about the verses following the structure ──
	//
	// Seam eligibility is borrowed, never re-implemented (§4's "one concept, several uses"), and is
	// classified in SEQUENCE order — earlier passage first — because contiguity is a property of the
	// seam, not of the direction it is approached from.
	const earlier = direction === 'up' ? target.passage : entry.passage;
	const later = direction === 'up' ? entry.passage : target.passage;
	if (!isPassageSeamEligible(earlier, later)) {
		const kind = classifyPassageSeam(earlier, later);
		return { ok: false, reason: reasonForSeam(kind), seamKind: kind };
	}

	// Emptying a part is Join Parts under another name. `boundaryMove.js` refuses the range version of
	// this, but it can only see ranges — a passage stripped of all structure keeps a valid range.
	if (wouldEmptyPassage(entry.tree, granularity)) {
		return {
			ok: false,
			reason: `Moving this ${granularity} would leave its part with no structure at all. Use Join Parts to merge them instead.`
		};
	}

	const located = locateInSequence(loaded.sequence, granularity, itemId);
	const shift = planShiftFor(entry, target, located, granularity, direction);
	if (!shift.ok) return { ok: false, reason: shift.error };

	const [receivingStudy] = await dbx
		.select({ translation: study.translation })
		.from(study)
		.where(eq(study.id, target.studyId))
		.limit(1);
	const translationId = receivingStudy?.translation ?? 'esv';

	return {
		ok: true,
		reason: null,
		granularity,
		direction,
		crossesPassage: true,
		crossesPart: plan.crossesPart,
		passageId,
		fromPassageId: entry.passageId,
		toPassageId: target.passageId,
		fromStudyId: entry.studyId,
		toStudyId: target.studyId,
		seriesId: loaded.seriesId ?? null,
		targetColumnId: plan.targetColumnId,
		targetSectionId: plan.targetSectionId,
		versesMoved: shift.versesMoved,
		shiftBefore: shift.before,
		shiftAfter: shift.after,
		display: await displayWarnings(dbx, entry, target, shift, translationId, direction)
	};
}

/** Why an ineligible seam is ineligible. Every branch is permanent, so none of them says "yet" (§11). */
function reasonForSeam(kind) {
	if (kind === 'different-books') {
		return 'These parts aren’t adjacent in Scripture, so structure can’t move between them.';
	}
	if (kind === 'overlap') {
		// Q40, settled: overlap is its own excluded state, distinct from a gap.
		return 'These parts overlap, so moving structure between them would repeat verses.';
	}
	return 'There’s a gap in Scripture between these parts, so structure can’t move between them.';
}

/**
 * Where the passage boundary lands once this item changes part.
 *
 * The verses must follow the structure, or the item renders in one part while its words belong to the
 * other. Which anchor sets the new boundary depends on the direction, and the rule is the same one
 * `crossPartJoin.js` derives for its two paths:
 *
 * - **Up**: the item LEAVES this passage, so this passage must now begin at the first anchor that
 *   STAYS. Using the moved item's own anchor would leave the boundary inside the block that left.
 * - **Down**: the item leaves for the later passage, which must now begin where the ITEM begins — so
 *   the new boundary is the first MOVING anchor.
 *
 * ⚠️ Two branches rather than one parameterised expression. They ask different questions of different
 * passages, and folding them behind a flag is how the backwards rule ends up silently applied to a
 * forward gesture.
 */
function planShiftFor(entry, neighbour, located, granularity, direction) {
	const moving = segmentsBeneath(located, granularity);
	const nothing = (error) => ({ ok: false, error, before: null, after: null, versesMoved: 0 });

	if (moving.length === 0) {
		return nothing(`That ${granularity} holds no text, so there is nothing to move.`);
	}

	const movingIds = new Set(moving.map((s) => s.id));

	if (direction === 'up') {
		const staying = [];
		for (const column of entry.tree ?? []) {
			for (const section of column.sections ?? []) {
				for (const segment of section.segments ?? []) {
					if (!movingIds.has(segment.id)) staying.push(segment);
				}
			}
		}
		staying.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
		if (staying.length === 0) {
			return nothing(
				`Moving this ${granularity} would move every verse out of its part. Use Join Parts instead.`
			);
		}
		return planBoundaryShift({
			before: neighbour.passage,
			after: entry.passage,
			newBoundaryWordId: staying[0].startingWordId
		});
	}

	const sorted = moving.slice().sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId));
	return planBoundaryShift({
		before: entry.passage,
		after: neighbour.passage,
		newBoundaryWordId: sorted[0].startingWordId
	});
}

/**
 * Display-limit warnings for both affected studies after the proposed shift (§10.1).
 *
 * ⚠️ Checked per STUDY, not per passage — the display cap is per page, so a study's other passages
 * count towards it. And the RECEIVER is the part that grew: moving up, the earlier part; moving down,
 * the later one. Re-checking the part that shrank can only ever pass, and lets the growing one breach
 * silently.
 */
async function displayWarnings(dbx, entry, neighbour, shift, translationId, direction) {
	const forStudy = async (studyId, replacement) => {
		const rows = await dbx.select().from(passage).where(eq(passage.studyId, studyId));
		const substituted = rows.map((r) => (r.id === replacement.id ? replacement : r));
		return validateStudyDisplayLimits(substituted, translationId).warnings;
	};

	// `shift.before` always describes the EARLIER passage of the pair, whichever way the item went.
	const earlierEntry = direction === 'up' ? neighbour : entry;
	const laterEntry = direction === 'up' ? entry : neighbour;

	const earlier = await forStudy(earlierEntry.studyId, shift.before);
	const later = await forStudy(laterEntry.studyId, shift.after);

	const receiver = direction === 'up' ? earlier : later;
	const donor = direction === 'up' ? later : earlier;

	// Q41: refuse BEFORE writing, never mid-gesture. A block requires BOTH that the translation
	// enforces blocking AND that this particular move actually warns — blocking on enforcement alone
	// would refuse every compliant move under a 'block' translation. Every translation ships 'warn'
	// today, so this is latent, which is exactly why it is written now.
	const enforcement = getDisplayLimits(translationId).enforcement;
	const blocked = enforcement === 'block' && (receiver.length > 0 || donor.length > 0);

	return { receiver, donor, enforcement, blocked };
}

/**
 * Perform a Move Selected Up / Down.
 *
 * Re-analysed inside the call rather than trusting a client-supplied plan: the dry run may be seconds
 * old, and a concurrent edit must not be overwritten on the strength of a stale preview. Same rule
 * `joinAcrossBoundary` follows.
 *
 * ## The two tiers, and what separates them
 *
 * A **within-passage** move is one `UPDATE` of a parent id plus the re-anchor sweep. No verses move,
 * so nothing else can be affected.
 *
 * A **part** move additionally hands the rows to another study, shifts both passage ranges, clears
 * both `cachedText` blobs and re-anchors both passages.
 *
 * ⚠️ **Connection ownership is rewritten even though nothing is deleted.** §8 records that
 * `segmentConnection.studyId` becomes *wrong* — not merely insufficient — once structure spans parts:
 * `countTouchingConnections()` filters on it, so a connection left owned by the donor study silently
 * disappears from every count, and `analyzeJoin()` then tells the user no connections are affected. A
 * transfer leaves BOTH endpoints alive, which is precisely the case that produces a live connection
 * owned by a study containing neither end.
 *
 * @param {Object} dbInstance
 * @param {string} userId
 * @param {string} passageId
 * @param {string} itemId
 * @param {'segment'|'section'|'column'} granularity
 * @param {'up'|'down'} direction
 * @returns {Promise<Object>}
 */
export async function transferItem(dbInstance, userId, passageId, itemId, granularity, direction) {
	const plan = await analyzeItemTransfer(dbInstance, userId, passageId, itemId, granularity, direction);
	if (!plan.ok) throw new Error(plan.reason ?? 'That move is not available.');
	if (plan.display?.blocked) {
		throw new Error('That move would breach this translation’s display limit, so it was not made.');
	}

	const loaded = await loadPassageSequence(dbInstance, userId, passageId);
	if (!loaded) throw new Error('Passage not found.');
	// Located over the whole SEQUENCE, not `passageId`'s own tree: `segmentsBeneath` needs the item's
	// children to re-own their connections, and the item is always in the passage the request names —
	// but resolving it the same way the plan did keeps the two from ever disagreeing about which row
	// is meant.
	const located = locateInSequence(loaded.sequence, granularity, itemId);
	if (!located) throw new Error(`That ${granularity} could not be found.`);

	const movingSegmentIds = segmentsBeneath(located, granularity).map((s) => s.id);

	await dbInstance.transaction(async (tx) => {
		const now = new Date();

		// ── 1. Re-parent the item itself ──
		//
		// The anchor is NOT touched. Order is derived from `startingWordId`, so the item sorts into its
		// new container on its own — last when moving up, first when moving down — and rewriting the
		// anchor here would be the one thing that could put it out of order.
		if (granularity === 'section') {
			await tx
				.update(passageSection)
				.set({
					passageColumnId: plan.targetColumnId,
					// See the module header: an offset tuned to align against a column the section has
					// just left is aligning against nothing.
					topOffset: null,
					updatedAt: now
				})
				.where(eq(passageSection.id, itemId));
		} else if (granularity === 'segment') {
			await tx
				.update(passageSegment)
				.set({ passageSectionId: plan.targetSectionId, updatedAt: now })
				.where(eq(passageSegment.id, itemId));
		} else if (plan.crossesPassage) {
			// A column's parent IS its passage, so it only has something to change when the move crosses
			// one. A column moving between two passages of the same part takes this branch too — the
			// part is unchanged, but the owning passage is not.
			await tx
				.update(passageColumn)
				.set({ passageId: plan.toPassageId, updatedAt: now })
				.where(eq(passageColumn.id, itemId));
		}

		// A move inside one passage is done bar the sweep: no verses moved, so nothing else is stale.
		if (!plan.crossesPassage) {
			await reanchorPassages(tx, [passageId]);
			return;
		}

		// ── 2. Hand the connections to the receiving study ──
		const reown = { studyId: plan.toStudyId, seriesId: plan.seriesId, updatedAt: now };
		if (movingSegmentIds.length > 0) {
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.fromSegmentId, movingSegmentIds));
			await tx
				.update(segmentConnection)
				.set(reown)
				.where(inArray(segmentConnection.toSegmentId, movingSegmentIds));
		}
		if (granularity !== 'segment') {
			// The container's own endpoints, on whichever pair of columns matches its type. Named rather
			// than reusing one variable, which is how the wrong pair gets consulted.
			const fromCol =
				granularity === 'column' ? segmentConnection.fromColumnId : segmentConnection.fromSectionId;
			const toCol =
				granularity === 'column' ? segmentConnection.toColumnId : segmentConnection.toSectionId;
			await tx.update(segmentConnection).set(reown).where(eq(fromCol, itemId));
			await tx.update(segmentConnection).set(reown).where(eq(toCol, itemId));
		}

		// ── 3. The verses follow the structure ──
		//
		// `shiftBefore` / `shiftAfter` always describe the EARLIER and LATER passage of the pair
		// respectively, whichever way the item travelled — so the ids they apply to are chosen by
		// direction, not by which passage the gesture started in.
		const earlierId = direction === 'up' ? plan.toPassageId : plan.fromPassageId;
		const laterId = direction === 'up' ? plan.fromPassageId : plan.toPassageId;

		await tx
			.update(passage)
			.set({
				toChapter: plan.shiftBefore.toChapter,
				toVerse: plan.shiftBefore.toVerse,
				// cachedText is keyed by verse range, so both sides must refetch.
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, earlierId));

		await tx
			.update(passage)
			.set({
				fromChapter: plan.shiftAfter.fromChapter,
				fromVerse: plan.shiftAfter.fromVerse,
				cachedText: null,
				textCachedAt: null
			})
			.where(eq(passage.id, laterId));

		// ⚠️ BOTH passages. The receiver has just been handed containers whose anchors were never
		// reconciled with it, and the donor may have been left with empty ones — `reanchorPassages`
		// re-anchors in either direction and prunes childless containers, which is exactly the cleanup a
		// transfer needs on both sides.
		await reanchorPassages(tx, [plan.fromPassageId, plan.toPassageId]);
	});

	return {
		crossesPassage: plan.crossesPassage,
		crossesPart: plan.crossesPart,
		granularity,
		direction,
		movedSegments: movingSegmentIds.length,
		versesMoved: plan.versesMoved ?? 0,
		fromPassageId: plan.fromPassageId ?? passageId,
		toPassageId: plan.toPassageId ?? passageId,
		display: plan.display
	};
}
