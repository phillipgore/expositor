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
				}
			]
		},
		{
			type: 'section',
			id: 'actions',
			items: [
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
			id: 'zoom',
			items: [
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
			variant: 'fixed',
			classes: 'hide-at-narrower'
		},
		{
			type: 'spacer',
			variant: 'flex',
			classes: 'show-at-narrower'
		},
		{
			type: 'spacer',
			variant: 'flex'
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
					iconId: 'outline-section',
					menuId: 'MenuStructure',
					underLabel: 'Structure',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode
				},
				{
					type: 'menu',
					iconId: 'outline-unit',
					menuId: 'MenuOutline',
					underLabel: 'Outline',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode
				},
				{
					type: 'menu',
					iconId: 'literary-chiasim',
					menuId: 'MenuLiterary',
					underLabel: 'Literary',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canLiterary || state.overviewMode
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
			variant: 'flex',
		},
		{
			type: 'section',
			id: 'toggles',
			items: [
				{
					type: 'toggle',
					iconId: 'note',
					underLabel: 'Notes',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					activeStateProp: 'notesVisible',
					toggleHandler: 'toggleNotes',
					disabledStateProp: 'canToggleNotes'
				},
				{
					type: 'toggle',
					iconId: 'reference',
					underLabel: 'Verses',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					activeStateProp: 'versesVisible',
					toggleHandler: 'toggleVerses',
					disabledStateProp: 'canToggleVerses'
				},
				{
					type: 'toggle',
					iconId: 'wide',
					underLabel: 'Wide',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					activeStateProp: 'wideLayout',
					toggleHandler: 'toggleWide',
					disabledStateProp: 'canToggleWide'
				},
				{
					type: 'toggle',
					iconId: 'binoculars',
					underLabel: 'Overview',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					activeStateProp: 'overviewMode',
					toggleHandler: 'toggleOverview',
					disabledStateProp: 'canToggleOverview'
				}
			]
		},
		{
			type: 'spacer',
			variant: 'fixed',
			classes: 'hide-at-narrow'
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
						{ id: 'analyze', iconId: 'structure', label: 'Analyze' },
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
			type: 'spacer',
			variant: 'flex'
		},
		{
			type: 'section',
			id: 'toggles',
			items: [
				{
					type: 'toggle',
					iconId: 'commentary',
					underLabel: 'Commentary',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					activeStateProp: 'commentaryPanelOpen',
					toggleHandler: 'toggleCommentary',
					disabledStateProp: 'canToggleComment'
				},
			]
		},
		{
			type: 'spacer',
			variant: 'flex'
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
						title: 'Insert Segment',
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
						title: 'Note',
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
						iconId: 'outline-disconnect',
						title: 'Disconnect Segment',
						disabledCheck: (state) => !state.hasActiveSegment
					},
					{
						iconId: 'outline-connect',
						title: 'Connect Segment',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			},
			{
				id: 'columns',
				buttons: [
					{
						iconId: 'column-insert',
						title: 'Insert Column',
						disabledCheck: (state) => !state.canInsertColumn
					},
					{
						iconId: 'column-remove',
						title: 'Join Column',
						disabledCheck: (state) => !state.hasActiveSegment
					}
				]
			}
		],
		literary: [
			{
				iconId: 'literary-chiasim',
				title: 'Chiasim'
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
