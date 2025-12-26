/**
 * Custom Tiptap Footnote Extension
 * 
 * Creates inline footnotes with popover display
 * Footnotes are stored as custom nodes in the content
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const Footnote = Node.create({
	name: 'footnote',

	group: 'inline',

	inline: true,

	atom: true,

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
				tag: 'span[data-footnote-id]'
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
