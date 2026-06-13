/**
 * Custom Tiptap GlossaryTerm Extension
 *
 * Inserts an inline, rounded badge representing a glossary term into commentary
 * prose. Modeled on the Footnote extension (inline atom node).
 *
 * Storage model:
 * - We persist only the term id (`termId`) plus a denormalized `label` (used as
 *   a graceful fallback if the term is ever removed from glossary.json).
 * - The visible label and the badge COLOR are resolved LIVE from the glossary by
 *   id at render time, so edits/renames in glossary.json propagate to all
 *   existing badges.
 *
 * Hover tooltips are NOT wired here (Tiptap renders raw DOM). The editor host
 * attaches delegated mouseenter/leave listeners on `.glossary-term` elements and
 * drives the global tooltip store. See CommentaryEditor.svelte.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { getTermById, getColorForTermId, shapeForDomain } from '$lib/data/glossaryIndex.js';

export const GlossaryTerm = Node.create({
	name: 'glossaryTerm',

	group: 'inline',

	inline: true,

	atom: true,

	selectable: true,

	addAttributes() {
		return {
			termId: {
				default: null,
				parseHTML: (element) => element.getAttribute('data-term-id'),
				renderHTML: (attributes) => {
					if (!attributes.termId) return {};
					return { 'data-term-id': attributes.termId };
				}
			},
			label: {
				default: '',
				parseHTML: (element) => element.getAttribute('data-term-label') || element.textContent,
				renderHTML: (attributes) => {
					if (!attributes.label) return {};
					return { 'data-term-label': attributes.label };
				}
			}
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span.glossary-term',
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						termId: dom.getAttribute('data-term-id'),
						label: dom.getAttribute('data-term-label') || dom.textContent
					};
				}
			},
			{
				tag: 'span[data-term-id]',
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						termId: dom.getAttribute('data-term-id'),
						label: dom.getAttribute('data-term-label') || dom.textContent
					};
				}
			}
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		const termId = node.attrs.termId;
		// Resolve live label + color; fall back to stored label for orphans.
		const entry = termId ? getTermById(termId) : null;
		const label = entry?.term || node.attrs.label || 'Unknown term';
		const color = getColorForTermId(termId);
		// Shape distinguishes the domain: exegesis = pill, homiletics = rounded
		// rectangle. Resolved live from the term's domain (falls back to pill).
		const shape = entry?.shape || shapeForDomain(entry?.domain);

		// The pill carries a remove (×) button. It is rendered for every pill but
		// only made visible inside the editable editor via CSS (.tiptap-editor),
		// so read-only renders never show it. Clicking it is handled by delegated
		// listeners in CommentaryEditor.svelte (which also clears any surrounding
		// tagged-highlight band).
		return [
			'span',
			mergeAttributes(HTMLAttributes, {
				class: `glossary-term ${color} shape-${shape}`
			}),
			['span', { class: 'glossary-term-label' }, label],
			[
				'span',
				{
					class: 'glossary-term-remove',
					'data-glossary-remove': 'true',
					'aria-hidden': 'true'
				},
				'×'
			]
		];
	},


	addCommands() {
		return {
			setGlossaryTerm:
				(attributes) =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs: attributes
					});
				}
		};
	}
});
