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
					iconId: 'book',
					underLabel: 'Studies',
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
					iconId: 'gear',
					menuId: 'MenuActions',
					underLabel: 'Actions',
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
			type: 'section',
			id: 'formatting',
			items: [
				{
					type: 'menu',
					iconId: 'pin',
					menuId: 'MenuStructure',
					underLabel: 'Outline',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canStructure'
				},
				{
					type: 'menu',
					iconId: 'text-join',
					menuId: 'MenuText',
					underLabel: 'Text',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canText'
				},
				{
					type: 'menu',
					iconId: 'literary-chiasim',
					menuId: 'MenuLiterary',
					underLabel: 'Literary',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canLiterary'
				},
				{
					type: 'menu',
					iconId: 'paintbrush',
					menuId: 'MenuColor',
					underLabel: 'Color',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					disabledStateProp: 'canColor'
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
					type: 'menu',
					iconId: 'outline',
					menuId: 'MenuView',
					underLabel: 'View',
					classes: 'toolbar-dark show-at-narrow',
					underLabelClasses: 'light show-at-narrow'
				},
				{
					type: 'toggle',
					iconId: 'note',
					underLabel: 'Notes',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					disabledStateProp: 'canToggleNotes'
				},
				{
					type: 'toggle',
					iconId: 'reference',
					underLabel: 'Verses',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					disabledStateProp: 'canToggleVerses'
				},
				{
					type: 'toggle',
					iconId: 'wide',
					underLabel: 'Wide',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
					disabledStateProp: 'canToggleWide'
				},
				{
					type: 'toggle',
					iconId: 'outline',
					underLabel: 'Overview',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow',
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
