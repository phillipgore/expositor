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

	// Parse with a HIGHER priority than the stock `@tiptap/extension-highlight`
	// (default 100). Highlight's parse rule is a bare `{ tag: 'mark' }`, which
	// also matches the `<mark class="tagged-highlight" data-term-id="...">`
	// elements we emit. Without a higher priority, on reload the generic
	// Highlight rule can claim our band first — and since our mark carries no
	// `data-color`/inline background, it resolves to no color and renders as the
	// browser's default yellow. A higher priority ensures our specific
	// `mark.tagged-highlight` / `mark[data-term-id]` rules win.
	priority: 200,

	// Keep this mark from bleeding onto text typed at its edges so the band has
	// crisp, intentional boundaries.
	inclusive: false,

	// Tagged highlights always win over regular highlights. Declaring the
	// exclusion here means:
	//  (a) applying a tagged highlight strips any regular `highlight` mark in its
	//      range, and
	//  (b) a regular highlight applied over an existing tagged band is rejected
	//      on the tagged positions (it still applies to the rest of the
	//      selection, flowing around the band) — so the two never stack into
	//      nested <mark>s with doubled padding/ambiguous color.
	// Listing 'taggedHighlight' keeps the default self-exclusion (two tagged
	// bands won't stack their marks).
	excludes: 'highlight taggedHighlight',



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
