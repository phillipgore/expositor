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
					disabledCheck: (state) => !state.canStructure || state.overviewMode || state.focusMode
				},
				{
					type: 'menu',
					iconId: 'connect',
					menuId: 'MenuConnect',
					underLabel: 'Connect',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) => !state.canStructure || state.overviewMode || state.focusMode
				},
				{
					type: 'menu',
					iconId: 'paintbrush',
					menuId: 'MenuColor',
					underLabel: 'Color',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					// On the read-only Document view a selected SECTION or SEGMENT can't be
					// recolored, so disable Color when either is active there. (Analyze is
					// unaffected, and column selections on Document still allow coloring.)
					disabledCheck: (state, view) =>
						!state.canColor ||
						state.overviewMode ||
						(view === 'document' && (state.hasActiveSection || state.hasActiveSegment))

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
					// The View button stays enabled on the dashboard, glossary, and
					// study-group pages; on those routes every item inside the View menu is
					// disabled instead (the canToggle* flags are all false there).
					disabledCheck: () => false
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
			// Fixed spacer separating Zoom from Export within the view cluster.
			type: 'spacer',
			variant: 'fixed',
		},
		{
			type: 'section',
			id: 'export',
			items: [
				{
					// Output menu: Print the current view (Document prints the live
					// page; Analyze prints its raster capture) and/or Export the
					// visual Analyze view (the .analyze-content) to an image/PDF
					// file. Only meaningful on a study route, where the view page is
					// mounted to receive the print/export request.
					//
					// Also disabled while a SERIES row is selected in the Finder: a
					// series is a container (SERIES_PLAN §4), not a rendered view — it
					// has no Document/Analyze output of its own to print or export. A
					// series PART is a study and keeps Output enabled.
					type: 'menu',
					iconId: 'export',
					menuId: 'MenuExport',
					underLabel: 'Output',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledCheck: (state) =>
						!state.isStudyRoute || Boolean(state.selectedItem?.hasSeries)
				}
			]
		},


		{
			type: 'spacer',
			variant: 'flex'
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
					iconId: 'plus-circle',
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
						// `segment-split`, NOT the bare `split` this read as until now. That id
						// does not exist in icons.json, so the button rendered blank space:
						// Icon.svelte falls back to an empty `d` path, warning to the console but
						// throwing nothing. Same command as MenuStructure's "Split Segment", which
						// already used the qualified id — so the menu drew an icon and the toolbar
						// drew nothing.
						//
						// Do not "fix" this by adding a bare `split` to the registry: a bare verb
						// at segment level is ambiguous with the column- and section-level Split
						// commands beside it. See SERIES_PLAN.md §3 and trap 13.
						//
						// (The Join half of this note no longer applies — the three per-tier Join
						// buttons are now the single `join-up` / `join-down` pair below, whose ids
						// are verb-then-direction because the tier comes from the selection.)
						iconId: 'segment-split',
						title: 'Split Segment',
						disabledCheck: (state) => !state.hasWordSelection
					},
					{
						// ── Join Up / Join Down, replacing three per-tier Join buttons ──
						//
						// There used to be `segment-join` here, `section-join` under 'connections' and
						// `column-join' under 'columns' — three buttons in three groups, each joining
						// only backwards. The tier is now inferred from the selection (Column ⊃ Section
						// ⊃ Segment, matching MenuStructure's `joinGranularity`), so one pair covers all
						// three tiers in both directions.
						//
						// Needs a structural selection AND something to join into: a join folds two
						// items together, so with no neighbour in that direction the command has no
						// meaning. `hasJoinPredecessor` / `hasJoinSuccessor` are resolved against the
						// whole study's structure, so the first item disables Up and the last
						// disables Down.
						//
						// (Cross-part joins can reach beyond a study edge; that extra allowance lives
						// in MenuStructure, which has the series context this config does not.)
						iconId: 'join-up',
						title: 'Join Selected Up',
						disabledCheck: (state) =>
							(!state.hasActiveSegment && !state.hasActiveSection && !state.hasActiveColumn) ||
							!state.hasJoinPredecessor
					},
					{
						iconId: 'join-down',
						title: 'Join Selected Down',
						disabledCheck: (state) =>
							(!state.hasActiveSegment && !state.hasActiveSection && !state.hasActiveColumn) ||
							!state.hasJoinSuccessor
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
						// `text-up` / `text-down`, not the bare `arrow-up` / `arrow-down` these used
						// to be. The generic arrows are the app's all-purpose direction glyphs (the
						// series nav uses them), so beside Join Up / Join Down they read as a second
						// pair of the same command. These two carry a text mark, which is what
						// actually distinguishes moving TEXT from joining STRUCTURE.
						iconId: 'text-up',
						title: 'Move Text Up',
						disabledCheck: (state) => !state.hasWordSelection
					},
					{
						iconId: 'text-down',
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
					// Join Section removed — covered by Join Up / Join Down above, which resolve the
					// section tier from the selection.
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
					// Join Column removed — covered by Join Up / Join Down above.
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
