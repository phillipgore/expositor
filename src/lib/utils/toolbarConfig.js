/**
 * Toolbar Configuration Module
 * 
 * Centralized configuration for toolbar layouts.
 * This is the single source of truth for toolbar button behavior, state management,
 * and layout. The toolbar component is a pure renderer that reads this configuration.
 * 
 * ## Configuration Properties
 * 
 * ### Common to all button types:
 * - type: 'icon' | 'menu' | 'toggle' | 'grouped'
 * - iconId: Icon identifier (optional for some types)
 * - underLabel: Label displayed under the button
 * - classes: CSS classes for the button
 * - underLabelClasses: CSS classes for the label
 * 
 * ### Menu buttons (type: 'menu'):
 * - menuId: ID of the associated popover menu
 * - dynamicLabel: true if label comes from component state (e.g., zoom level)
 * - disabledCheck: Function (state) => boolean for complex disable logic
 * - disabledStateProp: String property name in toolbarState for simple disable check
 * 
 * ### Toggle buttons (type: 'toggle'):
 * - activeStateProp: Property name in toolbarState for active state
 * - toggleHandler: Handler function name (from handlers map)
 * - disabledStateProp: Property name in toolbarState for disable check
 * 
 * ### Grouped buttons (type: 'grouped'):
 * - buttons: Array of button definitions
 * - defaultActive: Initial active button ID
 * - buttonClasses: CSS classes for grouped buttons
 * - disabledStateProp: Property name in toolbarState for disable check
 * 
 * @module toolbarConfig
 */

/**
 * Configuration for the main application toolbar (authenticated users).
 * 
 * @returns {Array} Array of toolbar section configurations
 */
export function getAppToolbarConfig() {
	return [
		{
			type: 'section',
			id: 'documents',
			items: [
				{
					type: 'toggle',
					iconId: 'finder',
					underLabel: 'Finder',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					activeStateProp: 'studiesPanelOpen',
					toggleHandler: 'toggleStudiesPanel'
				},
				{
					type: 'menu',
					iconId: 'book',
					menuId: 'MenuActions',
					underLabel: 'Studies',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed',
		},
		{
			type: 'section',
			id: 'actions',
			items: [
				{
					type: 'action',
					iconId: 'pencil',
					actionHandler: 'handleEdit',
					underLabel: 'Edit',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canEdit'
				},
				{
					type: 'action',
					iconId: 'trashcan',
					actionHandler: 'handleDelete',
					underLabel: 'Delete',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => {
						// Enabled only when something that CAN be deleted is active:
						// 1. Studies or groups selected in the Finder
						const hasStudiesDelete = state.canDelete && state.selectedItem !== null;
						// 2. A connection line is actively selected (not just canRemoveConnection)
						const hasConnectionDelete = state.hasActiveConnection;
						// 3. The user has clicked inside a heading or note to edit it
						//    (segment/column/section being active alone is not enough)
						const hasSegmentDelete = state.hasActiveHeadingOrNoteEditor;
						return !hasStudiesDelete && !hasConnectionDelete && !hasSegmentDelete;
					}
				}
			]
		},
		{
			type: 'spacer',
			variant: 'flex',
		},
		{
			type: 'spacer',
			variant: 'fixed',
		},
		{
			type: 'section',
			id: 'formatting',
			items: [
				{
					type: 'menu',
					iconId: 'section',
					menuId: 'MenuStructure',
					underLabel: 'Structure',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode
				},
				{
					type: 'menu',
					iconId: 'headings',
					menuId: 'MenuOutline',
					underLabel: 'Markup',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode
				},
				{
					type: 'menu',
					iconId: 'drafting-compass',
					menuId: 'MenuLayout',
					underLabel: 'Layout',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode || state.comparisonsVisible || state.focusMode
				},
				{
					type: 'menu',
					iconId: 'paintbrush',
					menuId: 'MenuColor',
					underLabel: 'Color',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canColor || state.overviewMode
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed',
		},
		{
			type: 'section',
			id: 'reading-aids',
			items: [
				{
					type: 'toggle',
					iconId: 'compare',
					underLabel: 'Compare',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					activeStateProp: 'comparisonsVisible',
					toggleHandler: 'toggleComparison',
					disabledStateProp: 'canToggleComparison'
				},
				{
					type: 'toggle',
					iconId: 'glasses',
					underLabel: 'Focus',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					activeStateProp: 'focusMode',
					toggleHandler: 'toggleFocus',
					disabledStateProp: 'canToggleFocus'
				},
				{
					type: 'toggle',
					iconId: 'commentary',
					underLabel: 'Comment',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					activeStateProp: 'commentaryPanelOpen',
					toggleHandler: 'toggleCommentary',
					disabledStateProp: 'canToggleComment'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed',
		},
		{
			type: 'section',
			id: 'view',
			items: [
				{
					type: 'menu',
					iconId: 'eye',
					menuId: 'MenuView',
					underLabel: 'View',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					// Disabled on the glossary reference page (reference mode)
					disabledCheck: (state) => state.isGlossaryRoute
				},

				{
					type: 'menu',
					menuId: 'MenuZoom',
					underLabel: 'Zoom',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					dynamicLabel: true, // Indicates label comes from state
					disabledStateProp: 'canZoom'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'flex'
		},
		{
			type: 'section',
			id: 'modes',
			items: [
				{
					type: 'grouped',
					buttons: [
						{ id: 'analyze', iconId: 'analyze', label: 'Analyze' },
						{ id: 'document', iconId: 'document', label: 'Document' }
					],
					defaultActive: 'analyze',
					buttonClasses: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canSwitchMode'
				}
			]
		},
		{
			type: 'section',
			id: 'glossary',
			items: [
				{
					// Navigation link to the standalone Glossary reference page.
					// Uses the 'icon' button type's href support (like the auth Home button),
					// so it needs no extra wiring in ToolbarApp.
					type: 'icon',
					iconId: 'glossary',
					underLabel: 'Glossary',
					href: '/glossary',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed'
		},
		{
			type: 'section',
			id: 'settings',
			items: [
				{
					type: 'menu',
					iconId: 'account',
					menuId: 'MenuSettings',
					underLabel: 'Account',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		}

	];
}

/**
 * Configuration for the authentication toolbar (non-authenticated users).
 * 
 * @returns {Array} Array of toolbar section configurations
 */
export function getAuthToolbarConfig() {
	return [
		{
			type: 'section',
			id: 'navigation',
			items: [
				{
					type: 'icon',
					iconId: 'home',
					underLabel: 'Home',
					href: '/',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed'
		},
		{
			type: 'section',
			id: 'auth',
			items: [
				{
					type: 'icon',
					iconId: 'account',
					underLabel: 'Sign In',
					href: '/signin',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				},
				{
					type: 'icon',
					iconId: 'plus',
					underLabel: 'Sign Up',
					href: '/signup',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'flex'
		},
		{
			type: 'section',
			id: 'password',
			items: [
				{
					type: 'icon',
					iconId: 'lock',
					underLabel: 'Password',
					href: '/password',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				}
			]
		}
	];
}

/**
 * Configuration for the passage toolbar (outline buttons).
 * Used in PassageToolbar component that appears when segments are active.
 * 
 * @returns {Object} Object with button groups organized by toolbar mode
 */
export function getPassageToolbarConfig() {
	return {
		outline: [
			{
				id: 'text-operations',
				buttons: [
					{
						iconId: 'split',
						title: 'Split Segment',
						disabledCheck: (state) => !state.hasWordSelection
					},
					{
						iconId: 'join',
						title: 'Join Segment',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			},
			{
				id: 'headings',
				buttons: [
					{
						iconId: 'heading-one',
						title: 'Heading One',
						disabledCheck: (state) => !state.hasActiveSegment
					},
					{
						iconId: 'heading-two',
						title: 'Heading Two',
						disabledCheck: (state) => !state.hasActiveSegment
					},
					{
						iconId: 'heading-three',
						title: 'Heading Three',
						disabledCheck: (state) => !state.hasActiveSegment
					},
					{
						iconId: 'note',
						title: 'Quick Note',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			},
			{
				id: 'movement',
				buttons: [
					{
						iconId: 'arrow-up',
						title: 'Move Text Up',
						disabledCheck: (state) => !state.hasWordSelection
					},
					{
						iconId: 'arrow-down',
						title: 'Move Text Down',
						disabledCheck: (state) => !state.hasWordSelection
					}
				]
			},
			{
				id: 'connections',
				buttons: [
					{
						iconId: 'section-split',
						title: 'Split Section',
						disabledCheck: (state) => !state.hasActiveSegment
					},
					{
						iconId: 'section-join',
						title: 'Join Section',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			},
			{
				id: 'columns',
				buttons: [
					{
						iconId: 'column-split',
						title: 'Split Column',
						disabledCheck: (state) => !state.canInsertColumn
					},
					{
						iconId: 'column-join',
						title: 'Join Column',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			}
		],
		literary: [
			{
				iconId: 'literary-chiasm',
				title: 'Chiasm'
			},
			{
				iconId: 'literary-paralell',
				title: 'Paralell'
			},
			{
				iconId: 'literary-repeat',
				title: 'Repitition'
			},
			{
				iconId: 'literary-intensify',
				title: 'Intensification'
			}
		],
		color: [
			{
				iconId: 'circle',
				title: 'Red',
				classes: 'icon-fill-red'
			},
			{
				iconId: 'circle',
				title: 'Orange',
				classes: 'icon-fill-orange'
			},
			{
				iconId: 'circle',
				title: 'Yellow',
				classes: 'icon-fill-yellow'
			},
			{
				iconId: 'circle',
				title: 'Green',
				classes: 'icon-fill-green'
			},
			{
				iconId: 'circle',
				title: 'Aqua',
				classes: 'icon-fill-aqua'
			},
			{
				iconId: 'circle',
				title: 'Blue',
				classes: 'icon-fill-blue'
			},
			{
				iconId: 'circle',
				title: 'Purple',
				classes: 'icon-fill-purple'
			},
			{
				iconId: 'circle',
				title: 'Pink',
				classes: 'icon-fill-pink'
			}
		]
	};
}
