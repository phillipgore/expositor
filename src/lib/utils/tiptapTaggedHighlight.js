/**
 * Custom Tiptap TaggedHighlight Mark
 *
 * A highlight "band" that tints a run of selected commentary text with a soft
 * shade of a glossary term's category color. It is applied together with an
 * inline GlossaryTerm pill inserted at the END of the selection, so the pill
 * renders INSIDE the same tinted band (marks naturally wrap inline atom nodes
 * that fall within their range).
 *
 * Storage model:
 * - We persist only the term id (`termId`). The visible band COLOR is resolved
 *   LIVE from the glossary by id at render time (via category → color), so
 *   edits/renames in glossary.json propagate to existing highlights.
 *
 * This is purely visual prose decoration: it lives inside the commentary HTML
 * (saved via the editor's onUpdate). It is NOT persisted in any database table
 * and has no analytics/usage implications.
 */
import { Mark, mergeAttributes } from '@tiptap/core';
import { getColorForTermId } from '$lib/data/glossaryIndex.js';

export const TaggedHighlight = Mark.create({
	name: 'taggedHighlight',

	// Keep this mark from bleeding onto text typed at its edges so the band has
	// crisp, intentional boundaries.
	inclusive: false,

	addAttributes() {
		return {
			termId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-term-id'),
				renderHTML: (attributes) => {
					if (!attributes.termId) return {};
					return { 'data-term-id': attributes.termId };
				}
			}
		};
	},

	parseHTML() {
		return [
			{
				tag: 'mark.tagged-highlight'
			},
			{
				tag: 'mark[data-term-id]'
			}
		];
	},

	renderHTML({ mark, HTMLAttributes }) {
		const color = getColorForTermId(mark.attrs.termId);
		return [
			'mark',
			mergeAttributes(HTMLAttributes, {
				class: `tagged-highlight ${color}`
			}),
			0
		];
	},

	addCommands() {
		return {
			setTaggedHighlight:
				(attributes) =>
				({ commands }) => {
					return commands.setMark(this.name, attributes);
				},
			unsetTaggedHighlight:
				() =>
				({ commands }) => {
					return commands.unsetMark(this.name);
				}
		};
	}
});
