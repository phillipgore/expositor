import { db } from '$lib/server/db/index.js';
import { studyGroup, passageColumn, passageSplit, passageSegment } from '$lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import bibleData from '$lib/data/bible.json';

/**
 * Expand a group and all its ancestor groups by setting isCollapsed to false
 * @param {string} groupId - The ID of the group to start from
 * @param {string} userId - The user ID for verification
 * @returns {Promise<void>}
 */
export async function expandGroupAncestors(groupId, userId) {
	if (!groupId) return;
	
	let currentGroupId = groupId;
	
	while (currentGroupId) {
		// Get current group
		const groups = await db
			.select()
			.from(studyGroup)
			.where(and(
				eq(studyGroup.id, currentGroupId),
				eq(studyGroup.userId, userId)
			))
			.limit(1);
		
		if (groups.length === 0) break;
		
		const group = groups[0];
		
		// Expand if collapsed
		if (group.isCollapsed) {
			await db
				.update(studyGroup)
				.set({ 
					isCollapsed: false, 
					updatedAt: new Date() 
				})
				.where(eq(studyGroup.id, currentGroupId));
		}
		
		// Move to parent
		currentGroupId = group.parentGroupId;
	}
}

/**
 * Generate the first word ID for a passage
 * @param {string} testamentId - The testament ID (e.g., 'ot', 'nt')
 * @param {string} bookId - The book ID
 * @param {number} chapter - The starting chapter
 * @param {number} verse - The starting verse
 * @returns {string} The first word ID (e.g., 'GEN-001-001-001')
 */
function getFirstWordId(testamentId, bookId, chapter, verse) {
	// Find the book to get its abbreviation
	const testament = bibleData[0].testamentData.find(t => t._id === testamentId);
	if (!testament) {
		const bookAbbrUpper = bookId.toUpperCase();
		return `${bookAbbrUpper}-${String(chapter).padStart(3, '0')}-${String(verse).padStart(3, '0')}-001`;
	}
	
	const book = testament.bookData.find(b => b._id === bookId);
	const bookAbbr = book?.titleShortAbbreviation || bookId;
	
	// Format: BOOKABBR-CHAPTER-VERSE-WORD (e.g., 'GEN-001-001-001')
	const bookAbbrUpper = bookAbbr.toUpperCase();
	const chapterPadded = String(chapter).padStart(3, '0');
	const versePadded = String(verse).padStart(3, '0');
	
	return `${bookAbbrUpper}-${chapterPadded}-${versePadded}-001`;
}

/**
 * Create default column, split, and segment for a passage
 * @param {string} passageId - The passage ID
 * @param {string} testamentId - The testament ID
 * @param {string} bookId - The book ID
 * @param {number} fromChapter - The starting chapter
 * @param {number} fromVerse - The starting verse
 * @returns {Promise<void>}
 */
export async function createDefaultPassageStructure(passageId, testamentId, bookId, fromChapter, fromVerse) {
	const now = new Date();
	const firstWordId = getFirstWordId(testamentId, bookId, fromChapter, fromVerse);
	
	// Create default column
	const columnId = uuidv4();
	await db.insert(passageColumn).values({
		id: columnId,
		passageId: passageId,
		startingWordId: firstWordId,
		createdAt: now,
		updatedAt: now
	});
	
	// Create default split (blue color)
	const splitId = uuidv4();
	await db.insert(passageSplit).values({
		id: splitId,
		passageColumnId: columnId,
		startingWordId: firstWordId,
		color: 'blue',
		createdAt: now,
		updatedAt: now
	});
	
	// Create default segment (no headings)
	await db.insert(passageSegment).values({
		id: uuidv4(),
		passageSplitId: splitId,
		startingWordId: firstWordId,
		headingOne: null,
		headingTwo: null,
		headingThree: null,
		createdAt: now,
		updatedAt: now
	});
}
