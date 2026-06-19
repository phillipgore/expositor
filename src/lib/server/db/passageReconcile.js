/**
 * Passage reconciliation engine.
 *
 * When a study is edited, passages may be added, removed, reordered, or have
 * their verse range changed. This module makes editing NON-DESTRUCTIVE: instead
 * of deleting and recreating every passage's structure (which wiped all
 * columns/sections/segments/connections/headings/notes/commentary), it
 * diffs the old vs. new passages by id and only touches what actually changed.
 *
 * Structure is anchored solely by `startingWordId` (BOOK-CHAP-VERSE-WORD). An
 * item implicitly runs until the next same-type item begins, or until the end
 * of the passage. Segments may begin mid-verse and span multiple verses, so all
 * boundary math is done with word IDs (via compareWordIds), never raw verses.
 *
 * Glossary terms live inline inside commentary prose (not as separate rows), so
 * there is no item-level tag table to clean up when structure is removed.
 */

import {
	passageColumn,
	passageSection,
	passageSegment,
	passageHeading,
	segmentConnection
} from '$lib/server/db/schema.js';


import { eq, inArray, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bibleData from '$lib/data/bible.json';
import { compareWordIds } from '$lib/server/db/utils.js';
import { truncateNote, mergedNoteWillTruncate } from '$lib/constants/notes.js';


/* ------------------------------------------------------------------ */
/* Bible-data helpers (server-side, work directly off bible.json)      */
/* ------------------------------------------------------------------ */

/**
 * Find a book's metadata.
 * @param {string} testament - 'OT' | 'NT'
 * @param {string} bookId
 * @returns {{abbr: string, title: string, chapterCount: number, verseCounts: Object}|null}
 */
function getBookMeta(testament, bookId) {
	const t = bibleData[0].testamentData.find((x) => x._id === testament);
	if (!t) return null;
	const book = t.bookData.find((b) => b._id === bookId);
	if (!book) return null;
	return {
		abbr: (book.titleShortAbbreviation || book._id).toUpperCase(),
		title: book.title,
		chapterCount: book.chapterCount,
		verseCounts: book.chapterData[0]
	};
}

/**
 * Number of verses in a chapter.
 * @param {string} testament
 * @param {string} bookId
 * @param {number} chapter
 * @returns {number}
 */
function getVerseCount(testament, bookId, chapter) {
	const meta = getBookMeta(testament, bookId);
	if (!meta) return 0;
	const n = meta.verseCounts[String(chapter)];
	return typeof n === 'number' ? n : 0;
}

/**
 * @param {number} n
 * @returns {string} zero-padded to 3 digits
 */
function pad3(n) {
	return String(n).padStart(3, '0');
}

/**
 * First word ID of a (chapter, verse).
 * @returns {string}
 */
function wordIdOf(testament, bookId, chapter, verse) {
	const meta = getBookMeta(testament, bookId);
	const abbr = meta ? meta.abbr : bookId.toUpperCase();
	return `${abbr}-${pad3(chapter)}-${pad3(verse)}-001`;
}

/**
 * The (chapter, verse) immediately following the given one, rolling over to the
 * next chapter when needed.
 * @returns {{chapter: number, verse: number}|null} null if end of book
 */
function nextVerse(testament, bookId, chapter, verse) {
	const versesInChapter = getVerseCount(testament, bookId, chapter);
	if (verse < versesInChapter) {
		return { chapter, verse: verse + 1 };
	}
	const meta = getBookMeta(testament, bookId);
	if (!meta || chapter >= meta.chapterCount) return null; // end of book
	return { chapter: chapter + 1, verse: 1 };
}

/**
 * The (chapter, verse) immediately preceding the given one.
 * @returns {{chapter: number, verse: number}|null} null if start of book
 */
function prevVerse(testament, bookId, chapter, verse) {
	if (verse > 1) return { chapter, verse: verse - 1 };
	if (chapter <= 1) return null;
	const prevCount = getVerseCount(testament, bookId, chapter - 1);
	return { chapter: chapter - 1, verse: prevCount };
}

/**
 * Inclusive first word ID of a passage range.
 * @param {{testament:string, bookId:string, fromChapter:number, fromVerse:number}} r
 * @returns {string}
 */
function rangeFirstWordId(r) {
	return wordIdOf(r.testament, r.bookId, r.fromChapter, r.fromVerse);
}

/**
 * EXCLUSIVE end word ID of a passage range — the first word of the verse AFTER
 * the range's last verse. Used as an open upper bound for "is this item inside
 * the range?" tests. Falls back to a max sentinel when the range ends the book.
 * @param {{testament:string, bookId:string, toChapter:number, toVerse:number}} r
 * @returns {string}
 */
function rangeExclusiveEndWordId(r) {
	const meta = getBookMeta(r.testament, r.bookId);
	const abbr = meta ? meta.abbr : r.bookId.toUpperCase();
	const nv = nextVerse(r.testament, r.bookId, r.toChapter, r.toVerse);
	if (!nv) return `${abbr}-999-999-999`;
	return `${abbr}-${pad3(nv.chapter)}-${pad3(nv.verse)}-001`;
}

/**
 * Count verses inclusively between two (chapter, verse) points (same book).
 * @returns {number}
 */
function countVerses(testament, bookId, fromCh, fromV, toCh, toV) {
	if (fromCh > toCh || (fromCh === toCh && fromV > toV)) return 0;
	let count = 0;
	let ch = fromCh;
	let v = fromV;
	// Guard against runaway loops
	let guard = 0;
	while (guard++ < 10000) {
		count++;
		if (ch === toCh && v === toV) break;
		const nv = nextVerse(testament, bookId, ch, v);
		if (!nv) break;
		ch = nv.chapter;
		v = nv.verse;
	}
	return count;
}

/**
 * Human-readable reference string for a (sub)range.
 * @returns {string}
 */
function refString(testament, bookId, fromCh, fromV, toCh, toV) {
	const meta = getBookMeta(testament, bookId);
	const name = meta ? meta.title : bookId;
	if (fromCh === toCh && fromV === toV) return `${name} ${fromCh}:${fromV}`;
	if (fromCh === toCh) return `${name} ${fromCh}:${fromV}-${toV}`;
	return `${name} ${fromCh}:${fromV}-${toCh}:${toV}`;
}

/* ------------------------------------------------------------------ */
/* Structure loading                                                   */
/* ------------------------------------------------------------------ */

/**
 * Load a passage's full structure tree ordered by startingWordId.
 * @returns {Promise<Array>} columns[] each with sections[] each with segments[]
 */
async function loadTree(dbx, passageId) {
	const columns = await dbx
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));
	if (columns.length === 0) return [];

	const columnIds = columns.map((c) => c.id);
	const sections = await dbx
		.select()
		.from(passageSection)
		.where(inArray(passageSection.passageColumnId, columnIds))
		.orderBy(asc(passageSection.startingWordId));

	const sectionIds = sections.map((s) => s.id);
	const rawSegments =
		sectionIds.length > 0
			? await dbx
					.select()
					.from(passageSegment)
					.where(inArray(passageSegment.passageSectionId, sectionIds))
					.orderBy(asc(passageSegment.startingWordId))
			: [];

	// Headings live in passage_heading. Project them back onto each segment as
	// headingOne/Two/Three (+ matching ids) so content checks, summaries, and
	// fold logic can keep reasoning about a segment's headings via the segment
	// object. The original heading rows remain the source of truth in the DB.
	const segmentIds = rawSegments.map((s) => s.id);
	const headings =
		segmentIds.length > 0
			? await dbx
					.select()
					.from(passageHeading)
					.where(inArray(passageHeading.passageSegmentId, segmentIds))
			: [];
	const headingsBySegment = new Map();
	for (const h of headings) {
		const list = headingsBySegment.get(h.passageSegmentId);
		if (list) list.push(h);
		else headingsBySegment.set(h.passageSegmentId, [h]);
	}
	const segments = rawSegments.map((seg) => {
		const segHeadings = headingsBySegment.get(seg.id) ?? [];
		const byType = { one: null, two: null, three: null };
		for (const h of segHeadings) byType[h.headingType] = h;
		return {
			...seg,
			headingOne: byType.one?.text ?? null,
			headingTwo: byType.two?.text ?? null,
			headingThree: byType.three?.text ?? null,
			headingOneId: byType.one?.id ?? null,
			headingTwoId: byType.two?.id ?? null,
			headingThreeId: byType.three?.id ?? null
		};
	});

	return columns.map((col) => ({

		...col,
		sections: sections
			.filter((s) => s.passageColumnId === col.id)
			.map((sec) => ({
				...sec,
				segments: segments
					.filter((seg) => seg.passageSectionId === sec.id)
					.sort((a, b) => compareWordIds(a.startingWordId, b.startingWordId))
			}))
	}));
}

/**
 * Flatten a tree to segments in word order, each tagged with its parents.
 * @returns {Array<{segment:Object, section:Object, column:Object}>}
 */
function flattenSegments(tree) {
	const out = [];
	for (const column of tree) {
		for (const section of column.sections) {
			for (const segment of section.segments) {
				out.push({ segment, section, column });
			}
		}
	}
	out.sort((a, b) => compareWordIds(a.segment.startingWordId, b.segment.startingWordId));
	return out;
}

/**
 * Does a segment row carry user content worth preserving?
 *
 * Layout overrides (`height`) are intentionally excluded: layout belongs to
 * whatever structure survives an edit and is never a reason to force a
 * Merge/Delete decision — matching how section `topOffset` and column
 * `width`/`leftOffset` are already treated.
 *
 * @param {Object} seg
 * @returns {boolean}
 */
function segmentHasContent(seg) {
	return Boolean(
		seg.headingOne || seg.headingTwo || seg.headingThree || seg.note || seg.commentary
	);
}

/* ------------------------------------------------------------------ */
/* Passage list diff                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} NewPassage
 * @property {string} id
 * @property {string} testament
 * @property {string} book        - book id (maps to passage.bookId)
 * @property {number} fromChapter
 * @property {number} toChapter
 * @property {number} fromVerse
 * @property {number} toVerse
 */

/**
 * Categorize old (DB) vs new (form) passages by id.
 * @param {Array} oldPassages - rows from `passage` table
 * @param {NewPassage[]} newPassages
 */
export function diffPassages(oldPassages, newPassages) {
	const oldById = new Map(oldPassages.map((p) => [p.id, p]));
	const newById = new Map(newPassages.map((p) => [p.id, p]));

	const added = [];
	const removed = [];
	const changed = []; // { old, next }
	const unchanged = []; // { old, next }

	for (const next of newPassages) {
		const old = oldById.get(next.id);
		if (!old) {
			added.push(next);
			continue;
		}
		const rangeChanged =
			old.testament !== next.testament ||
			old.bookId !== next.book ||
			old.fromChapter !== next.fromChapter ||
			old.toChapter !== next.toChapter ||
			old.fromVerse !== next.fromVerse ||
			old.toVerse !== next.toVerse;
		if (rangeChanged) changed.push({ old, next });
		else unchanged.push({ old, next });
	}

	for (const old of oldPassages) {
		if (!newById.has(old.id)) removed.push(old);
	}

	return { added, removed, changed, unchanged };
}

/**
 * Compute the four edge operations implied by an old → new range change.
 * @returns {{addStart:Object|null, removeStart:Object|null, addEnd:Object|null, removeEnd:Object|null, replace:boolean}}
 */
function computeEdges(old, next) {
	// Book / testament change can't be re-anchored — treat as a full replace.
	if (old.testament !== next.testament || old.bookId !== next.book) {
		return { addStart: null, removeStart: null, addEnd: null, removeEnd: null, replace: true };
	}

	const t = next.testament;
	const b = next.book;

	const oldFirst = rangeFirstWordId({
		testament: t,
		bookId: b,
		fromChapter: old.fromChapter,
		fromVerse: old.fromVerse
	});
	const newFirst = rangeFirstWordId({
		testament: t,
		bookId: b,
		fromChapter: next.fromChapter,
		fromVerse: next.fromVerse
	});
	const oldEnd = rangeExclusiveEndWordId({
		testament: t,
		bookId: b,
		toChapter: old.toChapter,
		toVerse: old.toVerse
	});
	const newEnd = rangeExclusiveEndWordId({
		testament: t,
		bookId: b,
		toChapter: next.toChapter,
		toVerse: next.toVerse
	});

	const startCmp = compareWordIds(newFirst, oldFirst);
	const endCmp = compareWordIds(newEnd, oldEnd);

	let addStart = null;
	let removeStart = null;
	let addEnd = null;
	let removeEnd = null;

	if (startCmp < 0) {
		// Range extended earlier: added verses are [newFrom .. verse before oldFrom]
		const pv = prevVerse(t, b, old.fromChapter, old.fromVerse);
		addStart = {
			newFirst,
			count: pv ? countVerses(t, b, next.fromChapter, next.fromVerse, pv.chapter, pv.verse) : 0,
			reference: pv ? refString(t, b, next.fromChapter, next.fromVerse, pv.chapter, pv.verse) : ''
		};
	} else if (startCmp > 0) {
		// Range trimmed at start: removed verses are [oldFrom .. verse before newFrom]
		const pv = prevVerse(t, b, next.fromChapter, next.fromVerse);
		removeStart = {
			newFirst,
			count: pv ? countVerses(t, b, old.fromChapter, old.fromVerse, pv.chapter, pv.verse) : 0,
			reference: pv ? refString(t, b, old.fromChapter, old.fromVerse, pv.chapter, pv.verse) : ''
		};
	}

	if (endCmp > 0) {
		// Range extended later: first added word is the old exclusive end; added
		// verses are [verse after oldTo .. newTo]
		const nv = nextVerse(t, b, old.toChapter, old.toVerse);
		addEnd = {
			firstAddedWord: oldEnd,
			count: nv ? countVerses(t, b, nv.chapter, nv.verse, next.toChapter, next.toVerse) : 0,
			reference: nv ? refString(t, b, nv.chapter, nv.verse, next.toChapter, next.toVerse) : ''
		};
	} else if (endCmp < 0) {
		// Range trimmed at end: orphans are items with start >= newEnd; removed
		// verses are [verse after newTo .. oldTo]
		const nv = nextVerse(t, b, next.toChapter, next.toVerse);
		removeEnd = {
			newEnd,
			count: nv ? countVerses(t, b, nv.chapter, nv.verse, old.toChapter, old.toVerse) : 0,
			reference: nv ? refString(t, b, nv.chapter, nv.verse, old.toChapter, old.toVerse) : ''
		};
	}

	return { addStart, removeStart, addEnd, removeEnd, replace: false };
}

/* ------------------------------------------------------------------ */
/* Impact analysis (drives the Review modal)                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Removal geometry + content-summary helpers (shared by analyze/apply)*/

/* ------------------------------------------------------------------ */


/**
 * Resolve the orphaned items and the single surviving "merge target" for a
 * removal edge. The target is the adjacent surviving segment (and, through it,
 * its section and column) that orphaned content / connections fold into.
 *
 * @param {Array} tree - loadTree() output
 * @param {Array} flat - flattenSegments(tree) output
 * @param {'start'|'end'} side
 * @param {string} boundaryWord - newFirst (start) or newEnd (end)
 * @returns {{orphanEntries:Array, survivors:Array, target:Object|null,
 *   orphanSections:Array, orphanColumns:Array, orphanSegIdSet:Set<string>}}
 */
function computeRemovalSets(tree, flat, side, boundaryWord) {
	let orphanEntries;
	let survivors;
	let targetEntry;
	if (side === 'start') {
		// Covering segment = greatest start <= boundary; everything strictly
		// before it is orphaned, and the covering segment is the merge target.
		let coveringIdx = -1;
		for (let i = 0; i < flat.length; i++) {
			if (compareWordIds(flat[i].segment.startingWordId, boundaryWord) <= 0) coveringIdx = i;
			else break;
		}
		if (coveringIdx <= 0) {
			orphanEntries = [];
			survivors = flat.slice();
			targetEntry = flat[0] || null;
		} else {
			orphanEntries = flat.slice(0, coveringIdx);
			survivors = flat.slice(coveringIdx);
			targetEntry = flat[coveringIdx];
		}
	} else {
		// Orphans are segments at/after the new exclusive end; the last survivor
		// is the merge target.
		orphanEntries = flat.filter((e) => compareWordIds(e.segment.startingWordId, boundaryWord) >= 0);
		survivors = flat.filter((e) => compareWordIds(e.segment.startingWordId, boundaryWord) < 0);
		targetEntry = survivors.length ? survivors[survivors.length - 1] : null;
	}

	const orphanSegIdSet = new Set(orphanEntries.map((e) => e.segment.id));
	const orphanSections = [];
	const orphanColumns = [];
	for (const column of tree) {
		const colSegs = column.sections.flatMap((s) => s.segments);
		const colAllOrphan = colSegs.length > 0 && colSegs.every((seg) => orphanSegIdSet.has(seg.id));
		if (colAllOrphan) orphanColumns.push(column);
		for (const section of column.sections) {
			const allOrphan =
				section.segments.length > 0 && section.segments.every((seg) => orphanSegIdSet.has(seg.id));
			if (allOrphan) orphanSections.push(section);
		}
	}

	const target = targetEntry
		? { segment: targetEntry.segment, section: targetEntry.section, column: targetEntry.column }
		: null;

	return { orphanEntries, survivors, target, orphanSections, orphanColumns, orphanSegIdSet };
}

/**
 * Parse a BOOK-CHAP-VERSE-WORD id into a short "chapter:verse" label.
 * @param {string} wordId
 * @returns {string}
 */
function wordIdToRef(wordId) {
	const parts = String(wordId).split('-');
	if (parts.length < 3) return '';
	return `${parseInt(parts[1], 10)}:${parseInt(parts[2], 10)}`;
}

/** Short human summary of a segment's authored content. */
function summarizeSegmentContent(seg) {
	const parts = [];
	if (seg.headingOne || seg.headingTwo || seg.headingThree) parts.push('headings');
	if (seg.note) parts.push('note');
	if (seg.commentary) parts.push('commentary');

	// Layout (`height`) is intentionally omitted — it belongs to the surviving
	// structure and is never surfaced as authored content in the review.
	return parts.join(', ');
}

/** Short summary of a section/column commentary subject. */
function summarizeCommentarySubject(row) {
	const parts = [];
	if (row.commentary) parts.push('commentary');
	return parts.join(', ');
}

/** Short summary of a connection (endpoint kinds + any content). */
function summarizeConnection(conn) {
	const parts = [];
	if (conn.note) parts.push('note');
	if (conn.commentary) parts.push('commentary');
	const content = parts.length ? `, ${parts.join(', ')}` : '';
	return `${conn.fromType} ↔ ${conn.toType}${content}`;
}

/** Read one end of a connection as a {type, id} pair. */
function connEndpoint(conn, end) {
	const type = end === 'from' ? conn.fromType : conn.toType;
	let id;
	if (type === 'segment') id = end === 'from' ? conn.fromSegmentId : conn.toSegmentId;
	else if (type === 'section') id = end === 'from' ? conn.fromSectionId : conn.toSectionId;
	else id = end === 'from' ? conn.fromColumnId : conn.toColumnId;
	return { type, id };
}

/** True when two endpoints reference the same entity. */
function sameEndpoint(a, b) {
	return a.type === b.type && a.id === b.id;
}

/** True when two endpoint pairs are equal, ignoring direction (A↔B == B↔A). */
function endpointsKeyEqual(a1, a2, b1, b2) {
	return (
		(sameEndpoint(a1, b1) && sameEndpoint(a2, b2)) || (sameEndpoint(a1, b2) && sameEndpoint(a2, b1))
	);
}

/** Re-point an endpoint onto its surviving merge target, if it was removed. */
function remapEndpoint(ep, segMap, secMap, colMap) {
	if (ep.type === 'segment' && segMap.has(ep.id)) return { type: 'segment', id: segMap.get(ep.id) };
	if (ep.type === 'section' && secMap.has(ep.id)) return { type: 'section', id: secMap.get(ep.id) };
	if (ep.type === 'column' && colMap.has(ep.id)) return { type: 'column', id: colMap.get(ep.id) };
	return ep;
}

/** Build the DB column patch for one connection end ('from'|'to'). */
function endpointColumns(end, ep) {
	const cap = end === 'from' ? 'from' : 'to';
	return {
		[`${cap}Type`]: ep.type,
		[`${cap}SegmentId`]: ep.type === 'segment' ? ep.id : null,
		[`${cap}SectionId`]: ep.type === 'section' ? ep.id : null,
		[`${cap}ColumnId`]: ep.type === 'column' ? ep.id : null
	};
}

/**
 * Analyze a removal edge against the live structure to find, per orphaned
 * ENTITY (segment / section / column / connection), what would be lost and
 * what its merge target would be. Only entities that actually carry authored
 * content are surfaced (empty containers are pruned silently); every affected
 * connection is surfaced regardless of content, since the link itself is lost.
 *
 * @param {'start'|'end'} side
 * @param {string} boundaryWord - newFirst (start) or newEnd (end)
 */
async function analyzeRemoval(dbx, studyId, passageId, side, boundaryWord) {
	const tree = await loadTree(dbx, passageId);
	const flat = flattenSegments(tree);
	const sets = computeRemovalSets(tree, flat, side, boundaryWord);
	const { orphanEntries, target, orphanSections, orphanColumns, orphanSegIdSet } = sets;
	const hasTarget = !!target;

	const segments = orphanEntries
		.filter((e) => segmentHasContent(e.segment))
		.map((e) => ({
			id: e.segment.id,
			label: wordIdToRef(e.segment.startingWordId),
			summary: summarizeSegmentContent(e.segment),
			canMerge: hasTarget
		}));

	const sections = orphanSections
		.filter((s) => s.commentary)
		.map((s) => ({
			id: s.id,
			summary: summarizeCommentarySubject(s),
			canMerge: hasTarget
		}));

	const columns = orphanColumns
		.filter((c) => c.commentary)
		.map((c) => ({
			id: c.id,
			summary: summarizeCommentarySubject(c),
			canMerge: hasTarget
		}));

	// Connections touching any orphaned item.
	const orphanSectionIds = new Set(orphanSections.map((s) => s.id));
	const orphanColumnIds = new Set(orphanColumns.map((c) => c.id));
	const allConnections = await dbx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));
	const affected = allConnections.filter(
		(c) =>
			(c.fromSegmentId && orphanSegIdSet.has(c.fromSegmentId)) ||
			(c.toSegmentId && orphanSegIdSet.has(c.toSegmentId)) ||
			(c.fromSectionId && orphanSectionIds.has(c.fromSectionId)) ||
			(c.toSectionId && orphanSectionIds.has(c.toSectionId)) ||
			(c.fromColumnId && orphanColumnIds.has(c.fromColumnId)) ||
			(c.toColumnId && orphanColumnIds.has(c.toColumnId))
	);

	// Maps from each removed entity → the surviving target of the same kind,
	// used here only to detect connections that would collapse into a self-loop.
	const segMap = new Map();
	const secMap = new Map();
	const colMap = new Map();
	if (target) {
		for (const e of orphanEntries) segMap.set(e.segment.id, target.segment.id);
		for (const s of orphanSections) secMap.set(s.id, target.section.id);
		for (const c of orphanColumns) colMap.set(c.id, target.column.id);
	}
	const connections = affected.map((c) => {
		const nf = remapEndpoint(connEndpoint(c, 'from'), segMap, secMap, colMap);
		const nt = remapEndpoint(connEndpoint(c, 'to'), segMap, secMap, colMap);
		const selfLoop = sameEndpoint(nf, nt);
		return {
			id: c.id,
			summary: summarizeConnection(c),
			canReanchor: hasTarget && !selfLoop
		};
	});

	const needsDecision =
		segments.length > 0 || sections.length > 0 || columns.length > 0 || connections.length > 0;

	return {
		segments,
		sections,
		columns,
		connections,
		// Aggregate counts retained for any consumer that wants quick totals.
		segmentsWithContent: segments.length,
		sectionsWithContent: sections.length,
		columnsWithContent: columns.length,
		needsDecision,
		canMerge: hasTarget
	};
}

/**
 * Produce the impact report for an entire edit (used before committing).
 * @param {Object} dbx
 * @param {string} studyId
 * @param {Array} oldPassages - DB rows
 * @param {NewPassage[]} newPassages
 * @returns {Promise<{passages: Array, requiresReview: boolean}>}
 */
export async function analyzeEdit(dbx, studyId, oldPassages, newPassages) {
	const { changed } = diffPassages(oldPassages, newPassages);
	const reports = [];

	for (const { old, next } of changed) {
		const edges = computeEdges(old, next);
		const meta = getBookMeta(next.testament, next.book);
		const passageLabel = meta ? meta.title : next.book;
		// Full proposed reference, e.g. "Matthew 5:3-12", for the review heading.
		const passageReference = refString(
			next.testament,
			next.book,
			next.fromChapter,
			next.fromVerse,
			next.toChapter,
			next.toVerse
		);
		const report = {
			passageId: next.id,
			label: passageLabel,
			reference: passageReference,
			replace: edges.replace,

			addStart: null,
			addEnd: null,
			removeStart: null,
			removeEnd: null
		};

		if (edges.replace) {
			reports.push(report);
			continue;
		}

		if (edges.addStart) {
			report.addStart = { count: edges.addStart.count, reference: edges.addStart.reference };
		}
		if (edges.addEnd) {
			report.addEnd = { count: edges.addEnd.count, reference: edges.addEnd.reference };
		}
		if (edges.removeStart) {
			const impact = await analyzeRemoval(
				dbx,
				studyId,
				next.id,
				'start',
				edges.removeStart.newFirst
			);
			report.removeStart = {
				...impact,
				count: edges.removeStart.count,
				reference: edges.removeStart.reference
			};
		}
		if (edges.removeEnd) {
			const impact = await analyzeRemoval(dbx, studyId, next.id, 'end', edges.removeEnd.newEnd);
			report.removeEnd = {
				...impact,
				count: edges.removeEnd.count,
				reference: edges.removeEnd.reference
			};
		}

		reports.push(report);
	}

	const requiresReview = reports.some(
		(r) =>
			r.replace ||
			r.addStart ||
			r.addEnd ||
			(r.removeStart && r.removeStart.needsDecision) ||
			(r.removeEnd && r.removeEnd.needsDecision)
	);

	return { passages: reports, requiresReview };
}

/* ------------------------------------------------------------------ */
/* Mutation helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Delete a set of segments (by id). Connections referencing them are
 * cascade-deleted by FK.
 */
async function deleteSegments(tx, segmentIds) {
	if (segmentIds.length === 0) return;
	await tx.delete(passageSegment).where(inArray(passageSegment.id, segmentIds));
}

/**
 * Delete now-empty sections and columns in a passage (no surviving segments).
 * Connections referencing them are cascade-deleted by FK.
 */
async function pruneEmptyContainers(tx, passageId) {
	const tree = await loadTree(tx, passageId);

	const emptySectionIds = [];
	const emptyColumnIds = [];
	for (const column of tree) {
		const colSegs = column.sections.flatMap((s) => s.segments);
		if (colSegs.length === 0) {
			emptyColumnIds.push(column.id);
			continue;
		}
		for (const section of column.sections) {
			if (section.segments.length === 0) emptySectionIds.push(section.id);
		}
	}

	if (emptySectionIds.length > 0) {
		await tx.delete(passageSection).where(inArray(passageSection.id, emptySectionIds));
	}
	if (emptyColumnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, emptyColumnIds));
	}
}

/**
 * Fold an orphan segment's content into a surviving target segment.
 * - Headings fill only EMPTY target slots (never overwrite).
 * - note / commentary are appended.
 *
 * Layout (`height`) is deliberately NOT carried over: layout belongs to the
 * surviving structure, so the target keeps its own height and the orphan's is
 * simply discarded.
 */
async function foldSegmentContent(tx, fromSeg, targetSeg) {
	const set = {};

	// Headings live in passage_heading. Move the orphan's heading rows onto the
	// target ONLY for types the target lacks (never overwrite). Each moved row
	// keeps its own commentary; same-type duplicates are discarded with the
	// orphan when it is deleted by the caller. The projected headingX/headingXId
	// fields on the seg objects come from loadTree().
	const moveHeading = async (type, fromText, fromId, targetText) => {
		if (targetText || !fromText || !fromId) return;
		await tx
			.update(passageHeading)
			.set({ passageSegmentId: targetSeg.id, updatedAt: new Date() })
			.where(eq(passageHeading.id, fromId));
	};
	await moveHeading('one', fromSeg.headingOne, fromSeg.headingOneId, targetSeg.headingOne);
	await moveHeading('two', fromSeg.headingTwo, fromSeg.headingTwoId, targetSeg.headingTwo);
	await moveHeading('three', fromSeg.headingThree, fromSeg.headingThreeId, targetSeg.headingThree);
	// Keep the in-memory target projection consistent for any later folds.
	if (!targetSeg.headingOne && fromSeg.headingOne) targetSeg.headingOne = fromSeg.headingOne;
	if (!targetSeg.headingTwo && fromSeg.headingTwo) targetSeg.headingTwo = fromSeg.headingTwo;
	if (!targetSeg.headingThree && fromSeg.headingThree) targetSeg.headingThree = fromSeg.headingThree;

	if (fromSeg.note) {

		// Quick Notes are capped; a merge that would overflow is truncated (with an
		// ellipsis) rather than silently storing an over-limit note. Commentary is
		// intentionally NOT capped, so it is appended in full below.
		const merged = targetSeg.note ? `${targetSeg.note}\n${fromSeg.note}` : fromSeg.note;
		set.note = truncateNote(merged);
		targetSeg.note = set.note;
	}
	if (fromSeg.commentary) {
		set.commentary = targetSeg.commentary
			? `${targetSeg.commentary}\n${fromSeg.commentary}`
			: fromSeg.commentary;
		targetSeg.commentary = set.commentary;
	}

	if (Object.keys(set).length > 0) {
		set.updatedAt = new Date();

		await tx.update(passageSegment).set(set).where(eq(passageSegment.id, targetSeg.id));
	}
}

/**
 * Fold an orphan section's commentary into a surviving target section.
 * Commentary is appended (inline glossary terms ride along with it).
 */
async function foldCommentarySubject(tx, table, subjectType, fromRow, targetRow) {
	if (fromRow.commentary) {
		const merged = targetRow.commentary
			? `${targetRow.commentary}\n${fromRow.commentary}`
			: fromRow.commentary;
		targetRow.commentary = merged;
		await tx
			.update(table)
			.set({ commentary: merged, updatedAt: new Date() })
			.where(eq(table.id, targetRow.id));
	}
}

/**
 * Re-anchor or delete ALL connections touching the orphaned items of a removal
 * edge, per a single group-level choice ('reanchor' or 'delete').
 *
 * When the choice is 'reanchor' (default), each affected connection:
 *   - Re-points each end that landed on a removed segment/section/column to the
 *     surviving merge target of the same kind.
 *   - If both ends collapse onto the same target (self-loop), it is dropped
 *     (auto-fallback — a self-loop can't be re-anchored).
 *   - If the re-anchored shape duplicates an existing connection (same unordered
 *     endpoint pair), this one's note/commentary fold into that existing
 *     connection and this row is deleted (no duplicate created).
 *   - Otherwise its endpoints are updated in place.
 * When the choice is 'delete' (or no surviving target exists), every affected
 * connection is removed outright.
 *
 * Must run BEFORE the orphan segments are deleted (so FK cascade doesn't remove
 * connections we intend to re-anchor).
 *
 * @param {Object} target - { segment, section, column } surviving merge target
 * @param {string} connChoice - 'reanchor' | 'delete'
 */
async function reanchorOrphanConnections(
	tx,
	studyId,
	orphanSegIds,
	orphanSectionIds,
	orphanColumnIds,
	target,
	connChoice = 'reanchor'
) {
	const segSet = new Set(orphanSegIds);
	const secSet = new Set(orphanSectionIds);
	const colSet = new Set(orphanColumnIds);

	const allConns = await tx
		.select()
		.from(segmentConnection)
		.where(eq(segmentConnection.studyId, studyId));

	const affected = allConns.filter(
		(c) =>
			(c.fromSegmentId && segSet.has(c.fromSegmentId)) ||
			(c.toSegmentId && segSet.has(c.toSegmentId)) ||
			(c.fromSectionId && secSet.has(c.fromSectionId)) ||
			(c.toSectionId && secSet.has(c.toSectionId)) ||
			(c.fromColumnId && colSet.has(c.fromColumnId)) ||
			(c.toColumnId && colSet.has(c.toColumnId))
	);
	if (affected.length === 0) return;

	// Maps from removed entity → surviving target of the same kind.
	const segMap = new Map();
	const secMap = new Map();
	const colMap = new Map();
	if (target) {
		for (const id of orphanSegIds) segMap.set(id, target.segment.id);
		for (const id of orphanSectionIds) secMap.set(id, target.section.id);
		for (const id of orphanColumnIds) colMap.set(id, target.column.id);
	}

	const affectedIds = new Set(affected.map((c) => c.id));
	// Survivor pool = connections that won't be touched, used for dedup matching.
	const survivorPool = allConns.filter((c) => !affectedIds.has(c.id));

	for (const conn of affected) {
		if (connChoice === 'delete' || !target) {
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		const newFrom = remapEndpoint(connEndpoint(conn, 'from'), segMap, secMap, colMap);
		const newTo = remapEndpoint(connEndpoint(conn, 'to'), segMap, secMap, colMap);

		// Self-loop: both ends collapsed to the same target — meaningless, drop it.
		if (sameEndpoint(newFrom, newTo)) {
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		// Duplicate of an existing surviving connection? Fold into it.
		const dup = survivorPool.find((s) =>
			endpointsKeyEqual(newFrom, newTo, connEndpoint(s, 'from'), connEndpoint(s, 'to'))
		);
		if (dup) {
			const set = {};
			if (conn.note) {
				// Connection Quick Notes share the same cap — truncate on overflow.
				const mergedNote = dup.note ? `${dup.note}\n${conn.note}` : conn.note;
				set.note = truncateNote(mergedNote);
			}
			if (conn.commentary) {
				set.commentary = dup.commentary ? `${dup.commentary}\n${conn.commentary}` : conn.commentary;
			}
			if (Object.keys(set).length > 0) {
				set.updatedAt = new Date();
				await tx.update(segmentConnection).set(set).where(eq(segmentConnection.id, dup.id));
				if ('note' in set) dup.note = set.note;
				if ('commentary' in set) dup.commentary = set.commentary;
			}
			await tx.delete(segmentConnection).where(eq(segmentConnection.id, conn.id));
			continue;
		}

		// No duplicate: re-anchor this row's endpoints in place.
		await tx
			.update(segmentConnection)
			.set({
				...endpointColumns('from', newFrom),
				...endpointColumns('to', newTo),
				updatedAt: new Date()
			})
			.where(eq(segmentConnection.id, conn.id));
		// This row now occupies its new shape — include it in the survivor pool so
		// later affected connections can dedup against it.
		survivorPool.push({
			...conn,
			...endpointColumns('from', newFrom),
			...endpointColumns('to', newTo)
		});
	}
}

/**
 * Re-anchor the very first column/section/segment of a passage to `newFirst`.
 *
 * Used when the passage's start moves (verses added before the old start, or
 * trimmed up to a new start). The leading column/section/segment must always
 * begin at the new first word so no structure dangles outside the range, so the
 * anchors are set unconditionally (skipping the write only when already equal).
 */
async function reanchorFirst(tx, passageId, newFirst) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) return;
	const firstColumn = tree[0];
	const firstSection = firstColumn.sections[0];
	const firstSegment = firstSection ? firstSection.segments[0] : null;
	const now = new Date();

	if (firstColumn.startingWordId !== newFirst) {
		await tx
			.update(passageColumn)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageColumn.id, firstColumn.id));
	}
	if (firstSection && firstSection.startingWordId !== newFirst) {
		await tx
			.update(passageSection)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageSection.id, firstSection.id));
	}
	if (firstSegment && firstSegment.startingWordId !== newFirst) {
		await tx
			.update(passageSegment)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageSegment.id, firstSegment.id));
	}
}

/* ------------------------------------------------------------------ */
/* Default-structure creation (transaction-aware)                      */
/* ------------------------------------------------------------------ */

async function createDefaultStructureTx(tx, passageId, firstWord) {
	const now = new Date();
	const columnId = uuidv4();
	await tx
		.insert(passageColumn)
		.values({ id: columnId, passageId, startingWordId: firstWord, createdAt: now, updatedAt: now });
	const sectionId = uuidv4();
	await tx
		.insert(passageSection)
		.values({
			id: sectionId,
			passageColumnId: columnId,
			startingWordId: firstWord,
			color: 'blue',
			createdAt: now,
			updatedAt: now
		});
	await tx
		.insert(passageSegment)
		.values({
			id: uuidv4(),
			passageSectionId: sectionId,
			startingWordId: firstWord,
			createdAt: now,
			updatedAt: now
		});
}

/* ------------------------------------------------------------------ */
/* Edge applicators                                                    */
/* ------------------------------------------------------------------ */

async function applyAddStart(tx, passageId, newFirst, placement, inheritColor) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) {
		await createDefaultStructureTx(tx, passageId, newFirst);
		return;
	}
	const firstColumn = tree[0];
	const firstSection = firstColumn.sections[0];
	const now = new Date();
	const color = inheritColor || (firstSection ? firstSection.color : 'blue');

	if (placement === 'extend' || !placement) {
		await reanchorFirst(tx, passageId, newFirst);
		return;
	}

	if (placement === 'segment') {
		// New leading segment in the existing first section; move section + column
		// anchors back to newFirst.
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: firstSection.id,
				startingWordId: newFirst,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.update(passageSection)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageSection.id, firstSection.id));
		await tx
			.update(passageColumn)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageColumn.id, firstColumn.id));
		return;
	}

	if (placement === 'section') {
		const newSectionId = uuidv4();
		await tx
			.insert(passageSection)
			.values({
				id: newSectionId,
				passageColumnId: firstColumn.id,
				startingWordId: newFirst,
				color,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: newSectionId,
				startingWordId: newFirst,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.update(passageColumn)
			.set({ startingWordId: newFirst, updatedAt: now })
			.where(eq(passageColumn.id, firstColumn.id));
		return;
	}

	if (placement === 'column') {
		const newColumnId = uuidv4();
		const newSectionId = uuidv4();
		await tx
			.insert(passageColumn)
			.values({
				id: newColumnId,
				passageId,
				startingWordId: newFirst,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSection)
			.values({
				id: newSectionId,
				passageColumnId: newColumnId,
				startingWordId: newFirst,
				color,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: newSectionId,
				startingWordId: newFirst,
				createdAt: now,
				updatedAt: now
			});
		return;
	}
}

async function applyAddEnd(tx, passageId, firstAddedWord, placement, inheritColor) {
	const tree = await loadTree(tx, passageId);
	if (tree.length === 0) {
		await createDefaultStructureTx(tx, passageId, firstAddedWord);
		return;
	}
	const lastColumn = tree[tree.length - 1];
	const lastSection = lastColumn.sections[lastColumn.sections.length - 1];
	const now = new Date();
	const color = inheritColor || (lastSection ? lastSection.color : 'blue');

	if (placement === 'extend' || !placement) {
		// Last segment has no stored end — new verses flow in automatically.
		return;
	}

	if (placement === 'segment') {
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: lastSection.id,
				startingWordId: firstAddedWord,
				createdAt: now,
				updatedAt: now
			});
		return;
	}

	if (placement === 'section') {
		const newSectionId = uuidv4();
		await tx
			.insert(passageSection)
			.values({
				id: newSectionId,
				passageColumnId: lastColumn.id,
				startingWordId: firstAddedWord,
				color,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: newSectionId,
				startingWordId: firstAddedWord,
				createdAt: now,
				updatedAt: now
			});
		return;
	}

	if (placement === 'column') {
		const newColumnId = uuidv4();
		const newSectionId = uuidv4();
		await tx
			.insert(passageColumn)
			.values({
				id: newColumnId,
				passageId,
				startingWordId: firstAddedWord,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSection)
			.values({
				id: newSectionId,
				passageColumnId: newColumnId,
				startingWordId: firstAddedWord,
				color,
				createdAt: now,
				updatedAt: now
			});
		await tx
			.insert(passageSegment)
			.values({
				id: uuidv4(),
				passageSectionId: newSectionId,
				startingWordId: firstAddedWord,
				createdAt: now,
				updatedAt: now
			});
		return;
	}
}

/**
 * Apply one removal edge ('start' or 'end') honoring per-item decisions.
 *
 * `decision` is a per-edge bundle with ONE choice per entity kind; that choice
 * applies to every orphaned item of that kind:
 *   {
 *     segments:    'merge'|'delete',
 *     sections:    'merge'|'delete',
 *     columns:     'merge'|'delete',
 *     connections: 'reanchor'|'delete'
 *   }
 * Any kind not present defaults to the non-destructive choice (merge/reanchor).
 * Items that physically can't honor a merge/reanchor (no surviving target, or a
 * connection that would become a self-loop) fall back to delete automatically.
 *
 * Order matters:
 *   1. Fold orphan segment/section/column content into the surviving target.
 *   2. Reconcile connections (re-anchor or delete) BEFORE deleting segments, so
 *      FK cascade doesn't remove a connection we mean to re-home.
 *   3. Delete the orphan segments, prune emptied containers, re-anchor the start.
 *
 * @param {'start'|'end'} side
 * @param {string} boundaryWord
 * @param {Object} decision - per-edge group-level decision bundle
 */
async function applyRemovalEdge(tx, studyId, passageId, side, boundaryWord, decision = {}) {
	const tree = await loadTree(tx, passageId);
	const flat = flattenSegments(tree);
	if (flat.length === 0) {
		if (side === 'start') await reanchorFirst(tx, passageId, boundaryWord);
		return;
	}

	const sets = computeRemovalSets(tree, flat, side, boundaryWord);
	const { orphanEntries, target, orphanSections, orphanColumns } = sets;

	if (orphanEntries.length === 0) {
		// Nothing orphaned (start edge landed inside the first segment): re-anchor.
		if (side === 'start') await reanchorFirst(tx, passageId, boundaryWord);
		return;
	}

	// Group-level decisions (one choice applies to every item of that kind).
	const segChoice = decision.segments || 'merge';
	const secChoice = decision.sections || 'merge';
	const colChoice = decision.columns || 'merge';
	const connChoice = decision.connections || 'reanchor';

	// 1a. Fold orphan SEGMENT content (only when merging and a target exists).
	if (target && segChoice === 'merge') {
		for (const entry of orphanEntries) {
			await foldSegmentContent(tx, entry.segment, target.segment);
		}
	}
	// 1b. Fold orphan SECTION commentary.
	if (target && secChoice === 'merge') {
		for (const sec of orphanSections) {
			if (sec.id === target.section.id) continue;
			await foldCommentarySubject(tx, passageSection, 'section', sec, target.section);
		}
	}
	// 1c. Fold orphan COLUMN commentary.
	if (target && colChoice === 'merge') {
		for (const col of orphanColumns) {
			if (col.id === target.column.id) continue;
			await foldCommentarySubject(tx, passageColumn, 'column', col, target.column);
		}
	}

	// 2. Reconcile connections BEFORE deleting segments.
	await reanchorOrphanConnections(
		tx,
		studyId,
		orphanEntries.map((e) => e.segment.id),
		orphanSections.map((s) => s.id),
		orphanColumns.map((c) => c.id),
		target,
		connChoice
	);

	// 3. Delete the orphan segments, prune emptied containers, re-anchor.
	await deleteSegments(
		tx,
		orphanEntries.map((e) => e.segment.id)
	);
	await pruneEmptyContainers(tx, passageId);
	if (side === 'start') await reanchorFirst(tx, passageId, boundaryWord);
}

/**
 * Replace a passage's entire structure (used when book/testament changes).
 * Deleting the columns cascade-deletes their sections, segments, and any
 * connections that referenced them.
 */
async function applyReplace(tx, passageId, newFirstWord) {
	const tree = await loadTree(tx, passageId);
	const columnIds = tree.map((column) => column.id);

	if (columnIds.length > 0) {
		await tx.delete(passageColumn).where(inArray(passageColumn.id, columnIds));
	}
	await createDefaultStructureTx(tx, passageId, newFirstWord);
}

/* ------------------------------------------------------------------ */
/* Public: apply a single passage's range change                        */
/* ------------------------------------------------------------------ */

/**
 * Per-edge removal decision bundle — ONE choice per entity kind, applied to
 * every orphaned item of that kind. Absent entries default to the
 * non-destructive choice ('merge' / 'reanchor').
 * @typedef {Object} RemovalDecision
 * @property {string} [segments]    - 'merge'|'delete'
 * @property {string} [sections]    - 'merge'|'delete'
 * @property {string} [columns]     - 'merge'|'delete'
 * @property {string} [connections] - 'reanchor'|'delete'
 */

/**
 * @typedef {Object} PassageDecision
 * @property {string} [addStartPlacement] - 'extend'|'segment'|'section'|'column'
 * @property {string} [addEndPlacement]   - 'extend'|'segment'|'section'|'column'
 * @property {RemovalDecision} [removeStart]
 * @property {RemovalDecision} [removeEnd]
 */

/**
 * Apply an old → new range change for one passage inside a transaction.
 * @param {Object} tx
 * @param {string} studyId
 * @param {Object} old - DB passage row
 * @param {NewPassage} next
 * @param {PassageDecision} decision
 */
export async function applyPassageRangeChange(tx, studyId, old, next, decision = {}) {
	const edges = computeEdges(old, next);

	if (edges.replace) {
		const newFirst = rangeFirstWordId({
			testament: next.testament,
			bookId: next.book,
			fromChapter: next.fromChapter,
			fromVerse: next.fromVerse
		});
		await applyReplace(tx, next.id, newFirst);
		return;
	}

	// Apply start edge
	if (edges.addStart) {
		await applyAddStart(
			tx,
			next.id,
			edges.addStart.newFirst,
			decision.addStartPlacement || 'extend'
		);
	} else if (edges.removeStart) {
		await applyRemovalEdge(
			tx,
			studyId,
			next.id,
			'start',
			edges.removeStart.newFirst,
			decision.removeStart || {}
		);
	}

	// Apply end edge
	if (edges.addEnd) {
		await applyAddEnd(
			tx,
			next.id,
			edges.addEnd.firstAddedWord,
			decision.addEndPlacement || 'extend'
		);
	} else if (edges.removeEnd) {
		await applyRemovalEdge(
			tx,
			studyId,
			next.id,
			'end',
			edges.removeEnd.newEnd,
			decision.removeEnd || {}
		);
	}
}

export { getBookMeta, rangeFirstWordId, createDefaultStructureTx };
