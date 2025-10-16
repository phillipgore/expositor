/**
 * Toolbar Configuration Module
 * 
 * Centralized configuration for toolbar layouts.
 * Makes it easy to modify, reorder, or add/remove toolbar items.
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
					underLabelClasses: 'light'
				},
				{
					type: 'menu',
					iconId: 'plus',
					menuId: 'MenuNew',
					underLabel: 'New',
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
					type: 'icon',
					iconId: 'pencil',
					underLabel: 'Edit',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				},
				{
					type: 'icon',
					iconId: 'trashcan',
					underLabel: 'Delete',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
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
					underLabelClasses: 'light'
				},
				{
					type: 'menu',
					iconId: 'text-join',
					menuId: 'MenuText',
					underLabel: 'Text',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				},
				{
					type: 'menu',
					iconId: 'literary-chiasim',
					menuId: 'MenuLiterary',
					underLabel: 'Literary',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
				},
				{
					type: 'menu',
					iconId: 'paintbrush',
					menuId: 'MenuColor',
					underLabel: 'Color',
					classes: 'toolbar-dark',
					underLabelClasses: 'light'
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
					underLabelClasses: 'light hide-at-narrow'
				},
				{
					type: 'toggle',
					iconId: 'reference',
					underLabel: 'Verses',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow'
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
			type: 'section',
			id: 'layout',
			items: [
				{
					type: 'toggle',
					iconId: 'wide',
					underLabel: 'Wide',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow'
				},
				{
					type: 'toggle',
					iconId: 'outline',
					underLabel: 'Overview',
					classes: 'toolbar-dark hide-at-narrow',
					underLabelClasses: 'light hide-at-narrow'
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
			id: 'zoom',
			items: [
				{
					type: 'menu',
					menuId: 'MenuZoom',
					underLabel: 'Zoom',
					classes: 'toolbar-dark',
					underLabelClasses: 'light',
					dynamicLabel: true // Indicates label comes from state
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
					iconId: 'gear',
					menuId: 'MenuSettings',
					underLabel: 'Settings',
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
