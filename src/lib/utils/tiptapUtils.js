/**
 * TipTap Utility Functions
 * 
 * Helper functions for working with TipTap editor.
 */

/**
 * Get the range of a mark at a given position
 * 
 * Traverses the document tree to find the complete range of a mark (like a link)
 * starting from a given position.
 * 
 * @param {any} resolvedPos - Resolved position from ProseMirror
 * @param {any} type - Mark type from schema (e.g., schema.marks.link)
 * @returns {{from: number, to: number} | null} - Range or null if not found
 */
export function getMarkRange(resolvedPos, type) {
	const start = resolvedPos.parent.childAfter(resolvedPos.parentOffset);
	if (!start.node) {
		return null;
	}

	const mark = start.node.marks.find(m => m.type === type);
	if (!mark) {
		return null;
	}

	let startIndex = resolvedPos.index();
	let startPos = resolvedPos.start() + start.offset;
	let endIndex = startIndex + 1;
	let endPos = startPos + start.node.nodeSize;

	// Find the start of the mark
	while (startIndex > 0 && mark.isInSet(resolvedPos.parent.child(startIndex - 1).marks)) {
		startIndex -= 1;
		startPos -= resolvedPos.parent.child(startIndex).nodeSize;
	}

	// Find the end of the mark
	while (endIndex < resolvedPos.parent.childCount && mark.isInSet(resolvedPos.parent.child(endIndex).marks)) {
		endPos += resolvedPos.parent.child(endIndex).nodeSize;
		endIndex += 1;
	}

	return { from: startPos, to: endPos };
}

/**
 * Validate if a string is a valid URL
 * 
 * @param {string} url - URL string to validate
 * @returns {boolean} - True if valid URL, false otherwise
 */
export function isValidUrl(url) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}
