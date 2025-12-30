/**
 * Custom Tiptap Footnote Extension
 * 
 * Creates inline footnotes with editable fields at bottom
 * Footnotes are stored as custom nodes in the content
 * 
 * Features:
 * - Copy/paste support with attribute preservation
 * - Visual feedback when selected
 * - Inline deletion (can be deleted with Backspace/Delete like normal text)
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const Footnote = Node.create({
	name: 'footnote',

	group: 'inline',

	inline: true,

	atom: true,

	selectable: true,

	addAttributes() {
		return {
			id: {
				default: null,
				parseHTML: element => element.getAttribute('data-footnote-id'),
				renderHTML: attributes => {
					if (!attributes.id) {
						return {};
					}
					return {
						'data-footnote-id': attributes.id
					};
				}
			},
			content: {
				default: '',
				parseHTML: element => element.getAttribute('data-footnote-content'),
				renderHTML: attributes => {
					if (!attributes.content) {
						return {};
					}
					return {
						'data-footnote-content': attributes.content
					};
				}
			}
		};
	},

	parseHTML() {
		return [
			{
				tag: 'span.footnote-marker',
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						id: dom.getAttribute('data-footnote-id'),
						content: dom.getAttribute('data-footnote-content')
					};
				}
			},
			{
				tag: 'span[data-footnote-id]',
				getAttrs: (dom) => {
					if (!(dom instanceof HTMLElement)) return false;
					return {
						id: dom.getAttribute('data-footnote-id'),
						content: dom.getAttribute('data-footnote-content')
					};
				}
			}
		];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			'span',
			mergeAttributes(HTMLAttributes, { class: 'footnote-marker' }),
			['sup', {}, node.attrs.id || '?']
		];
	},

	addCommands() {
		return {
			setFootnote:
				(attributes) =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs: attributes
					});
				},
			unsetFootnote:
				() =>
				({ commands }) => {
					return commands.deleteSelection();
				}
		};
	}
});
