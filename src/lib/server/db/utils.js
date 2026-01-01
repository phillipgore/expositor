import { db } from '$lib/server/db/index.js';
import { studyGroup, passage, passageColumn, passageSection, passageSegment } from '$lib/server/db/schema.js';
import { eq, and, inArray, asc } from 'drizzle-orm';
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
 * Create default column, section, and segment for a passage
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
	
	// Create default section (blue color)
	const sectionId = uuidv4();
	await db.insert(passageSection).values({
		id: sectionId,
		passageColumnId: columnId,
		startingWordId: firstWordId,
		color: 'blue',
		createdAt: now,
		updatedAt: now
	});
	
	// Create default segment (no headings)
	await db.insert(passageSegment).values({
		id: uuidv4(),
		passageSectionId: sectionId,
		startingWordId: firstWordId,
		headingOne: null,
		headingTwo: null,
		headingThree: null,
		createdAt: now,
		updatedAt: now
	});
}

/**
 * Compare two word IDs to determine their order
 * Word ID format: BOOK-CHAPTER-VERSE-WORD (e.g., "JN-001-001-005")
 * @param {string} wordId1 - First word ID
 * @param {string} wordId2 - Second word ID
 * @returns {number} Negative if wordId1 < wordId2, 0 if equal, positive if wordId1 > wordId2
 */
export function compareWordIds(wordId1, wordId2) {
	if (!wordId1 || !wordId2) return 0;
	
	const parts1 = wordId1.split('-');
	const parts2 = wordId2.split('-');
	
	// Compare chapter, verse, and word number (indices 1, 2, 3)
	for (let i = 1; i < 4; i++) {
		const num1 = parseInt(parts1[i], 10);
		const num2 = parseInt(parts2[i], 10);
		const diff = num1 - num2;
		if (diff !== 0) return diff;
	}
	
	return 0;
}

/**
 * Get the next item in an array based on the current item
 * @param {Array} array - Array of items
 * @param {Object} currentItem - Current item
 * @returns {Object|null} Next item or null if current is last
 */
function getNextItem(array, currentItem) {
	const index = array.indexOf(currentItem);
	if (index === -1 || index === array.length - 1) return null;
	return array[index + 1];
}

/**
 * Load passage structure with all columns, sections, and segments
 * @param {Object} dbInstance - Database instance
 * @param {string} passageId - Passage ID
 * @returns {Promise<Object>} Passage structure with nested columns, sections, segments
 */
async function loadPassageStructure(dbInstance, passageId) {
	// Load all columns for the passage
	const columns = await dbInstance
		.select()
		.from(passageColumn)
		.where(eq(passageColumn.passageId, passageId))
		.orderBy(asc(passageColumn.startingWordId));
	
	// Load all sections for these columns
	const columnIds = columns.map(c => c.id);
	const sections = columnIds.length > 0 
		? await dbInstance
			.select()
			.from(passageSection)
			.where(inArray(passageSection.passageColumnId, columnIds))
			.orderBy(asc(passageSection.startingWordId))
		: [];
	
	// Load all segments for these sections
	const sectionIds = sections.map(s => s.id);
	const segments = sectionIds.length > 0
		? await dbInstance
			.select()
			.from(passageSegment)
			.where(inArray(passageSegment.passageSectionId, sectionIds))
			.orderBy(asc(passageSegment.startingWordId))
		: [];
	
	// Build nested structure
	const structure = {
		columns: columns.map(column => ({
			...column,
			sections: sections
				.filter(section => section.passageColumnId === column.id)
				.map(section => ({
					...section,
					segments: segments.filter(segment => segment.passageSectionId === section.id)
				}))
		}))
	};
	
	return structure;
}

/**
 * Validate the insertion point for a new column
 * @param {Object} structure - Passage structure
 * @param {string} insertionWordId - Word ID where column should be inserted
 * @returns {Object} Validation result with valid flag and details
 */
function validateInsertionPoint(structure, insertionWordId) {
	let sourceColumn = null;
	let sourceSection = null;
	let sourceSegment = null;
	
	// Find which column contains the insertion point
	for (const column of structure.columns) {
		// Check if insertion is at column start (not allowed)
		if (column.startingWordId === insertionWordId) {
			return { 
				valid: false, 
				error: 'Cannot insert column at the beginning of an existing column' 
			};
		}
		
		// Check if insertion point is within this column
		const nextColumn = getNextItem(structure.columns, column);
		const wordIsInColumn = nextColumn 
			? compareWordIds(insertionWordId, column.startingWordId) > 0 &&
			  compareWordIds(insertionWordId, nextColumn.startingWordId) < 0
			: compareWordIds(insertionWordId, column.startingWordId) > 0;
		
		if (wordIsInColumn) {
			sourceColumn = column;
			
			// Find which section contains the insertion point
			for (const section of column.sections) {
				const nextSection = getNextItem(column.sections, section);
				const wordIsInSection = nextSection
					? compareWordIds(insertionWordId, section.startingWordId) >= 0 &&
					  compareWordIds(insertionWordId, nextSection.startingWordId) < 0
					: compareWordIds(insertionWordId, section.startingWordId) >= 0;
				
				if (wordIsInSection) {
					sourceSection = section;
					
					// Find which segment contains the insertion point
					for (const segment of section.segments) {
						const nextSegment = getNextItem(section.segments, segment);
						const wordIsInSegment = nextSegment
							? compareWordIds(insertionWordId, segment.startingWordId) >= 0 &&
							  compareWordIds(insertionWordId, nextSegment.startingWordId) < 0
							: compareWordIds(insertionWordId, segment.startingWordId) >= 0;
						
						if (wordIsInSegment) {
							sourceSegment = segment;
							break;
						}
					}
					break;
				}
			}
			break;
		}
	}
	
	if (!sourceColumn || !sourceSection || !sourceSegment) {
		return { valid: false, error: 'Invalid insertion point' };
	}
	
	return { 
		valid: true, 
		sourceColumn, 
		sourceSection, 
		sourceSegment 
	};
}

/**
 * Insert a new column at the specified word ID
 * @param {Object} dbInstance - Database instance
 * @param {string} userId - User ID for authorization
 * @param {string} passageId - Passage ID
 * @param {string} columnId - Source column ID
 * @param {string} sectionId - Source section ID
 * @param {string} segmentId - Source segment ID
 * @param {string} insertionWordId - Word ID where column should be inserted
 * @returns {Promise<void>}
 */
export async function insertColumn(dbInstance, userId, passageId, columnId, sectionId, segmentId, insertionWordId) {
	// Import study table for the join
	const { study: studyTable } = await import('$lib/server/db/schema.js');
	
	// 1. Verify ownership
	const passageData = await dbInstance
		.select({
			passageId: passage.id,
			userId: studyTable.userId
		})
		.from(passage)
		.innerJoin(studyTable, eq(passage.studyId, studyTable.id))
		.where(eq(passage.id, passageId))
		.limit(1);
	
	if (passageData.length === 0 || passageData[0].userId !== userId) {
		throw new Error('Unauthorized');
	}
	
	// 2. Verify the column, section, and segment exist and get their data
	const sectionData = await dbInstance
		.select({
			sectionId: passageSection.id,
			startingWordId: passageSection.startingWordId,
			color: passageSection.color
		})
		.from(passageSection)
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.where(and(
			eq(passageSection.id, sectionId),
			eq(passageColumn.id, columnId),
			eq(passageColumn.passageId, passageId)
		))
		.limit(1);
	
	if (sectionData.length === 0) {
		throw new Error('Section not found or does not belong to this passage');
	}
	
	const sourceSection = sectionData[0];
	
	// 3. Check if insertion is at column start (not allowed)
	const columnData = await dbInstance
		.select({ startingWordId: passageColumn.startingWordId })
		.from(passageColumn)
		.where(eq(passageColumn.id, columnId))
		.limit(1);
	
	if (columnData.length > 0 && columnData[0].startingWordId === insertionWordId) {
		throw new Error('Cannot insert column at the beginning of an existing column');
	}
	
	// 4. Perform insertion in transaction
	await dbInstance.transaction(async (tx) => {
		const now = new Date();
		
		// Create new column
		const [newColumn] = await tx.insert(passageColumn).values({
			id: uuidv4(),
			passageId: passageId,
			startingWordId: insertionWordId,
			createdAt: now,
			updatedAt: now
		}).returning();
		
		// Determine if we're inserting mid-section
		const isMidSection = sourceSection.startingWordId !== insertionWordId;
		
		if (isMidSection) {
			// Create new section with same color as source
			const [newSection] = await tx.insert(passageSection).values({
				id: uuidv4(),
				passageColumnId: newColumn.id,
				startingWordId: insertionWordId,
				color: sourceSection.color,
				createdAt: now,
				updatedAt: now
			}).returning();
			
			// Get the source segment starting word
			const segmentData = await tx
				.select({ startingWordId: passageSegment.startingWordId })
				.from(passageSegment)
				.where(eq(passageSegment.id, segmentId))
				.limit(1);
			
			// Determine if we're inserting mid-segment
			const isMidSegment = segmentData.length > 0 && segmentData[0].startingWordId !== insertionWordId;
			
			if (isMidSegment) {
				// Create new segment with no headings
				await tx.insert(passageSegment).values({
					id: uuidv4(),
					passageSectionId: newSection.id,
					startingWordId: insertionWordId,
					headingOne: null,
					headingTwo: null,
					headingThree: null,
					createdAt: now,
					updatedAt: now
				});
			}
			
			// Transfer segments that start at or after insertion point from the source section
			const segmentsToTransfer = await tx
				.select()
				.from(passageSegment)
				.where(eq(passageSegment.passageSectionId, sectionId))
				.orderBy(asc(passageSegment.startingWordId));
			
			const segmentsToMove = segmentsToTransfer.filter(
				seg => compareWordIds(seg.startingWordId, insertionWordId) >= 0
			);
			
			if (segmentsToMove.length > 0) {
				await tx.update(passageSegment)
					.set({ 
						passageSectionId: newSection.id,
						updatedAt: now
					})
					.where(inArray(passageSegment.id, segmentsToMove.map(s => s.id)));
			}
		}
		
		// Transfer sections that start at or after insertion point from the source column
		const sectionsToTransfer = await tx
			.select()
			.from(passageSection)
			.where(eq(passageSection.passageColumnId, columnId))
			.orderBy(asc(passageSection.startingWordId));
		
		const sectionsToMove = sectionsToTransfer.filter(
			section => compareWordIds(section.startingWordId, insertionWordId) >= 0
		);
		
		if (sectionsToMove.length > 0) {
			await tx.update(passageSection)
				.set({ 
					passageColumnId: newColumn.id,
					updatedAt: now
				})
				.where(inArray(passageSection.id, sectionsToMove.map(s => s.id)));
		}
	});
}

/**
 * Insert a new section at the specified word ID
 * @param {Object} dbInstance - Database instance
 * @param {string} userId - User ID for authorization
 * @param {string} passageId - Passage ID
 * @param {string} columnId - Column ID where section should be inserted
 * @param {string} sectionId - Source section ID
 * @param {string} segmentId - Source segment ID
 * @param {string} insertionWordId - Word ID where section should be inserted
 * @returns {Promise<void>}
 */
export async function insertSection(dbInstance, userId, passageId, columnId, sectionId, segmentId, insertionWordId) {
	// Import study table for the join
	const { study: studyTable } = await import('$lib/server/db/schema.js');
	
	// 1. Verify ownership
	const passageData = await dbInstance
		.select({
			passageId: passage.id,
			userId: studyTable.userId
		})
		.from(passage)
		.innerJoin(studyTable, eq(passage.studyId, studyTable.id))
		.where(eq(passage.id, passageId))
		.limit(1);
	
	if (passageData.length === 0 || passageData[0].userId !== userId) {
		throw new Error('Unauthorized');
	}
	
	// 2. Verify the section exists and get its color
	const sectionData = await dbInstance
		.select({
			sectionId: passageSection.id,
			startingWordId: passageSection.startingWordId,
			color: passageSection.color
		})
		.from(passageSection)
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.where(and(
			eq(passageSection.id, sectionId),
			eq(passageColumn.id, columnId),
			eq(passageColumn.passageId, passageId)
		))
		.limit(1);
	
	if (sectionData.length === 0) {
		throw new Error('Section not found or does not belong to this passage');
	}
	
	const sourceSection = sectionData[0];
	
	// 3. Check if insertion is at section start (not allowed)
	if (sourceSection.startingWordId === insertionWordId) {
		throw new Error('Cannot insert section at the beginning of an existing section');
	}
	
	// 4. Perform insertion in transaction
	await dbInstance.transaction(async (tx) => {
		const now = new Date();
		
		// Create new section with inherited color
		const [newSection] = await tx.insert(passageSection).values({
			id: uuidv4(),
			passageColumnId: columnId,
			startingWordId: insertionWordId,
			color: sourceSection.color,
			createdAt: now,
			updatedAt: now
		}).returning();
		
		// Get the source segment starting word
		const segmentData = await tx
			.select({ startingWordId: passageSegment.startingWordId })
			.from(passageSegment)
			.where(eq(passageSegment.id, segmentId))
			.limit(1);
		
		// Determine if we're inserting mid-segment
		const isMidSegment = segmentData.length > 0 && segmentData[0].startingWordId !== insertionWordId;
		
		if (isMidSegment) {
			// Create new segment with no headings in the new section
			await tx.insert(passageSegment).values({
				id: uuidv4(),
				passageSectionId: newSection.id,
				startingWordId: insertionWordId,
				headingOne: null,
				headingTwo: null,
				headingThree: null,
				createdAt: now,
				updatedAt: now
			});
		}
		
		// Transfer segments that start at or after insertion point from the source section
		const segmentsToTransfer = await tx
			.select()
			.from(passageSegment)
			.where(eq(passageSegment.passageSectionId, sectionId))
			.orderBy(asc(passageSegment.startingWordId));
		
		const segmentsToMove = segmentsToTransfer.filter(
			seg => compareWordIds(seg.startingWordId, insertionWordId) >= 0
		);
		
		if (segmentsToMove.length > 0) {
			await tx.update(passageSegment)
				.set({ 
					passageSectionId: newSection.id,
					updatedAt: now
				})
				.where(inArray(passageSegment.id, segmentsToMove.map(s => s.id)));
		}
	});
}

/**
 * Insert a new segment at the specified word ID within a specific section
 * @param {Object} dbInstance - Database instance
 * @param {string} userId - User ID for authorization
 * @param {string} passageId - Passage ID
 * @param {string} sectionId - Section ID where segment should be inserted
 * @param {string} insertionWordId - Word ID where segment should be inserted
 * @returns {Promise<void>}
 */
export async function insertSegment(dbInstance, userId, passageId, sectionId, insertionWordId) {
	// Import study table for the join
	const { study: studyTable } = await import('$lib/server/db/schema.js');
	
	// 1. Verify ownership using a join
	const passageData = await dbInstance
		.select({
			passageId: passage.id,
			userId: studyTable.userId
		})
		.from(passage)
		.innerJoin(studyTable, eq(passage.studyId, studyTable.id))
		.where(eq(passage.id, passageId))
		.limit(1);
	
	if (passageData.length === 0 || passageData[0].userId !== userId) {
		throw new Error('Unauthorized');
	}
	
	// 2. Verify the section exists and belongs to this passage
	const sectionData = await dbInstance
		.select({
			sectionId: passageSection.id,
			startingWordId: passageSection.startingWordId
		})
		.from(passageSection)
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.where(and(
			eq(passageSection.id, sectionId),
			eq(passageColumn.passageId, passageId)
		))
		.limit(1);
	
	if (sectionData.length === 0) {
		throw new Error('Section not found or does not belong to this passage');
	}
	
	const section = sectionData[0];
	
	// 3. Check if insertion is at section start (not allowed)
	if (section.startingWordId === insertionWordId) {
		throw new Error('Cannot insert segment at the beginning of a section');
	}
	
	// 4. Check if insertion is at an existing segment start (not allowed)
	const segments = await dbInstance
		.select()
		.from(passageSegment)
		.where(eq(passageSegment.passageSectionId, sectionId))
		.orderBy(asc(passageSegment.startingWordId));
	
	for (const segment of segments) {
		if (segment.startingWordId === insertionWordId) {
			throw new Error('Cannot insert segment at the beginning of an existing segment');
		}
	}
	
	// 5. Create new segment
	const now = new Date();
	await dbInstance.insert(passageSegment).values({
		id: uuidv4(),
		passageSectionId: sectionId,
		startingWordId: insertionWordId,
		headingOne: null,
		headingTwo: null,
		headingThree: null,
		createdAt: now,
		updatedAt: now
	});
}

/**
 * Update a segment's heading
 * @param {Object} dbInstance - Database instance
 * @param {string} userId - User ID for authorization
 * @param {string} segmentId - Segment ID to update
 * @param {string} headingType - Type of heading: 'one', 'two', or 'three'
 * @param {string|null} headingText - Heading text or null to remove
 * @returns {Promise<void>}
 */
export async function updateSegmentHeading(dbInstance, userId, segmentId, headingType, headingText) {
	// Import study table for the join
	const { study: studyTable } = await import('$lib/server/db/schema.js');
	
	// 1. Verify segment exists and get passage for ownership check
	const segmentData = await dbInstance
		.select({
			segmentId: passageSegment.id,
			userId: studyTable.userId
		})
		.from(passageSegment)
		.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.innerJoin(studyTable, eq(passage.studyId, studyTable.id))
		.where(eq(passageSegment.id, segmentId))
		.limit(1);
	
	if (segmentData.length === 0) {
		throw new Error('Segment not found');
	}
	
	if (segmentData[0].userId !== userId) {
		throw new Error('User not authorized to update this segment');
	}
	
	// 2. Determine which heading field to update
	const headingField = headingType === 'one' ? 'headingOne' :
	                     headingType === 'two' ? 'headingTwo' :
	                     'headingThree';
	
	// 3. Update the heading
	const now = new Date();
	const updateData = {
		[headingField]: headingText || null,
		updatedAt: now
	};
	
	await dbInstance
		.update(passageSegment)
		.set(updateData)
		.where(eq(passageSegment.id, segmentId));
}

/**
 * Update a segment's note
 * @param {Object} dbInstance - Database instance
 * @param {string} userId - User ID for authorization
 * @param {string} segmentId - Segment ID to update
 * @param {string|null} noteText - Note text or null to remove
 * @returns {Promise<void>}
 */
export async function updateSegmentNote(dbInstance, userId, segmentId, noteText) {
	// Import study table for the join
	const { study: studyTable } = await import('$lib/server/db/schema.js');
	
	// 1. Verify segment exists and get passage for ownership check
	const segmentData = await dbInstance
		.select({
			segmentId: passageSegment.id,
			userId: studyTable.userId
		})
		.from(passageSegment)
		.innerJoin(passageSection, eq(passageSegment.passageSectionId, passageSection.id))
		.innerJoin(passageColumn, eq(passageSection.passageColumnId, passageColumn.id))
		.innerJoin(passage, eq(passageColumn.passageId, passage.id))
		.innerJoin(studyTable, eq(passage.studyId, studyTable.id))
		.where(eq(passageSegment.id, segmentId))
		.limit(1);
	
	if (segmentData.length === 0) {
		throw new Error('Segment not found');
	}
	
	if (segmentData[0].userId !== userId) {
		throw new Error('User not authorized to update this segment');
	}
	
	// 2. Update the note
	const now = new Date();
	const updateData = {
		note: noteText || null,
		updatedAt: now
	};
	
	await dbInstance
		.update(passageSegment)
		.set(updateData)
		.where(eq(passageSegment.id, segmentId));
}
