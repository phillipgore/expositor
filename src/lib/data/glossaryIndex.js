/**
 * Glossary Index & Search
 *
 * Flattens the categorized `glossary.json` into a single searchable list and
 * provides lookup/search helpers plus a category → badge-color map.
 *
 * The glossary is STATIC (bundled JSON). Everywhere in the app we reference a
 * term by its `_id` ("termId") and resolve the display label, definition, and
 * examples live from here — so a rename/edit in glossary.json propagates to all
 * existing inline badges and bottom tags automatically.
 */
import glossary from './glossary.json';

/**
 * Map each glossary category id to a Badge color.
 * Badge supports: gray | red | orange | yellow | green | aqua | blue | purple | pink
 * (yellow/gray intentionally avoided for contrast/neutral reasons).
 * @type {Record<string, string>}
 */
export const CATEGORY_COLORS = {
	'literary-structures': 'blue',
	'figures-of-speech': 'purple',
	'rhetorical-devices': 'green',
	'narrative-elements': 'orange',
	genres: 'aqua',
	'hermeneutical-terms': 'red',
	'specialized-terms': 'pink'
};

const DEFAULT_COLOR = 'gray';

/**
 * Normalize a term's example data into a single array of strings.
 * The source JSON uses `example` (string) or `examples` (string) inconsistently.
 * @param {any} term
 * @returns {string[]}
 */
function normalizeExamples(term) {
	const examples = [];
	if (typeof term.example === 'string' && term.example.trim()) {
		examples.push(term.example.trim());
	}
	if (typeof term.examples === 'string' && term.examples.trim()) {
		examples.push(term.examples.trim());
	}
	if (Array.isArray(term.examples)) {
		for (const ex of term.examples) {
			if (typeof ex === 'string' && ex.trim()) examples.push(ex.trim());
		}
	}
	return examples;
}

/**
 * Determine whether a term used the PLURAL `examples` key in the source JSON.
 * Drives the tooltip label ("Examples:" vs "Example:").
 * @param {any} term
 * @returns {boolean}
 */
function usesPluralExamples(term) {
	return (
		Array.isArray(term.examples) ||
		(typeof term.examples === 'string' && term.examples.trim().length > 0)
	);
}

/**
 * @typedef {Object} GlossaryEntry
 * @property {string} _id - Stable term id (e.g. "ls-chiasm")
 * @property {string} term - Display label
 * @property {string} definition
 * @property {string[]} examples
 * @property {boolean} examplesPlural - True when the source used the `examples` key
 * @property {string} category - Human-readable category title
 * @property {string} categoryId - Category `_id`
 * @property {string} color - Badge color for this category
 */

/**
 * Flattened, denormalized list of every glossary term.
 * @type {GlossaryEntry[]}
 */
export const glossaryIndex = glossary.flatMap((category) =>
	(category.terms || []).map((term) => ({
		_id: term._id,
		term: term.term,
		definition: term.definition || '',
		examples: normalizeExamples(term),
		examplesPlural: usesPluralExamples(term),
		category: category.title,
		categoryId: category._id,
		color: CATEGORY_COLORS[category._id] || DEFAULT_COLOR
	}))
);


/**
 * Fast id → entry lookup.
 * @type {Map<string, GlossaryEntry>}
 */
const indexById = new Map(glossaryIndex.map((entry) => [entry._id, entry]));

/**
 * Resolve a glossary entry by its id.
 * @param {string} id
 * @returns {GlossaryEntry | undefined}
 */
export function getTermById(id) {
	return indexById.get(id);
}

/**
 * Get the badge color for a term id (falls back to gray for orphans).
 * @param {string} id
 * @returns {string}
 */
export function getColorForTermId(id) {
	return indexById.get(id)?.color || DEFAULT_COLOR;
}

/**
 * Case-insensitive search over term label and definition.
 * Returns all entries (in source order) when the query is empty.
 * @param {string} query
 * @returns {GlossaryEntry[]}
 */
export function searchGlossary(query) {
	const q = (query || '').trim().toLowerCase();
	if (!q) return glossaryIndex;
	return glossaryIndex.filter(
		(entry) =>
			entry.term.toLowerCase().includes(q) ||
			entry.definition.toLowerCase().includes(q) ||
			entry.category.toLowerCase().includes(q)
	);
}

/**
 * Group a list of entries by their category title, preserving category order.
 * @param {GlossaryEntry[]} entries
 * @returns {{ category: string, categoryId: string, color: string, entries: GlossaryEntry[] }[]}
 */
export function groupByCategory(entries) {
	/** @type {Map<string, { category: string, categoryId: string, color: string, entries: GlossaryEntry[] }>} */
	const groups = new Map();
	for (const entry of entries) {
		if (!groups.has(entry.categoryId)) {
			groups.set(entry.categoryId, {
				category: entry.category,
				categoryId: entry.categoryId,
				color: entry.color,
				entries: []
			});
		}
		groups.get(entry.categoryId).entries.push(entry);
	}
	return Array.from(groups.values());
}

/**
 * Build tooltip HTML (definition + examples) for a term.
 * Safe-ish: escapes the dynamic text since the tooltip renders with allowHtml.
 * @param {string} id
 * @returns {string}
 */
export function getTooltipHtml(id) {
	const entry = indexById.get(id);
	if (!entry) {
		return '<span class="glossary-tooltip-missing">Definition unavailable</span>';
	}
	const esc = (s) =>
		String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

	let html = `<div class="glossary-tooltip">`;
	html += `<div class="glossary-tooltip-term">${esc(entry.term)}</div>`;
	html += `<div class="glossary-tooltip-def">${esc(entry.definition)}</div>`;
	if (entry.examples.length) {
		const label = entry.examplesPlural ? 'Examples:' : 'Example:';
		html += `<hr class="glossary-tooltip-divider" />`;
		html += `<div class="glossary-tooltip-example"><strong class="glossary-tooltip-example-label">${label}</strong> <em>${esc(entry.examples.join('; '))}</em></div>`;
	}
	html += `</div>`;
	return html;
}

