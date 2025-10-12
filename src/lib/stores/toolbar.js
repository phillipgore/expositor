/**
 * Toolbar State Store
 * 
 * Manages the enabled/disabled state of toolbar buttons based on:
 * - Current route/page context
 * - Document state (open, has content, etc.)
 * - User actions (selection, editing, etc.)
 * 
 * Built with Svelte 5 reactive patterns.
 */

import { writable, get } from 'svelte/store';

/**
 * @typedef {Object} ToolbarState
 * @property {boolean} canDelete - Whether Delete button should be enabled (has document open)
 * @property {boolean} canFormat - Whether formatting buttons should be enabled (has content/selection)
 * @property {boolean} canToggleNotes - Whether Notes toggle should be enabled (document supports notes)
 * @property {boolean} canToggleVerses - Whether Verses toggle should be enabled (document has verses)
 * @property {boolean} canToggleWide - Whether Wide layout toggle should be enabled
 * @property {boolean} canToggleOverview - Whether Overview toggle should be enabled
 * @property {boolean} canZoom - Whether Zoom menu should be enabled
 * @property {boolean} canStructure - Whether Outline menu should be enabled
 * @property {boolean} canText - Whether Text menu should be enabled
 * @property {boolean} canLiterary - Whether Literary menu should be enabled
 * @property {boolean} canColor - Whether Color menu should be enabled
 */

/**
 * Default toolbar state - most buttons disabled until document is open
 * @type {ToolbarState}
 */
const defaultState = {
	canDelete: false,
	canFormat: false,
	canToggleNotes: false,
	canToggleVerses: false,
	canToggleWide: false,
	canToggleOverview: false,
	canZoom: false,
	canStructure: false,
	canText: false,
	canLiterary: false,
	canColor: false
};

/**
 * Internal writable store
 * @type {import('svelte/store').Writable<ToolbarState>}
 */
const toolbarStateStore = writable(defaultState);

/**
 * Exported readonly store that components can subscribe to
 */
export const toolbarState = {
	subscribe: toolbarStateStore.subscribe
};

/**
 * Update toolbar state based on current route
 * @param {string} pathname - Current route pathname
 */
export function updateToolbarForRoute(pathname) {
	// Route-based rules
	const isDocumentRoute = pathname.includes('/document') || pathname.includes('/study');
	const isSettingsRoute = pathname === '/settings';
	const isNewRoute = pathname === '/new';
	const isOpenRoute = pathname === '/open';

	toolbarStateStore.update(state => {
		// On document/study pages, most tools should be available
		if (isDocumentRoute) {
			return {
				...state,
				canDelete: true,
				canFormat: true,
				canToggleNotes: true,
				canToggleVerses: true,
				canToggleWide: true,
				canToggleOverview: true,
				canZoom: true,
				canStructure: true,
				canText: true,
				canLiterary: true,
				canColor: true
			};
		}

		// On utility pages (settings, new, open), disable document-specific tools
		if (isSettingsRoute || isNewRoute || isOpenRoute) {
			return {
				...state,
				canDelete: false,
				canFormat: false,
				canToggleNotes: false,
				canToggleVerses: false,
				canToggleWide: false,
				canToggleOverview: false,
				canZoom: false,
				canStructure: false,
				canText: false,
				canLiterary: false,
				canColor: false
			};
		}

		// Default: keep current state
		return state;
	});
}

/**
 * Update toolbar state when a document is opened
 * Enables document-specific tools
 */
export function onDocumentOpen() {
	toolbarStateStore.update(state => ({
		...state,
		canDelete: true,
		canFormat: true,
		canToggleNotes: true,
		canToggleVerses: true,
		canToggleWide: true,
		canToggleOverview: true,
		canZoom: true,
		canStructure: true,
		canText: true,
		canLiterary: true,
		canColor: true
	}));
}

/**
 * Update toolbar state when a document is closed
 * Disables document-specific tools
 */
export function onDocumentClose() {
	toolbarStateStore.update(state => ({
		...state,
		canDelete: false,
		canFormat: false,
		canToggleNotes: false,
		canToggleVerses: false,
		canToggleWide: false,
		canToggleOverview: false,
		canZoom: false,
		canStructure: false,
		canText: false,
		canLiterary: false,
		canColor: false
	}));
}

/**
 * Update toolbar state based on content selection
 * @param {boolean} hasSelection - Whether user has selected content
 */
export function onSelectionChange(hasSelection) {
	toolbarStateStore.update(state => ({
		...state,
		canFormat: hasSelection
	}));
}

/**
 * Manually set a specific toolbar state property
 * @param {keyof ToolbarState} key - State property to update
 * @param {boolean} value - New value for the property
 */
export function setToolbarState(key, value) {
	toolbarStateStore.update(state => ({
		...state,
		[key]: value
	}));
}

/**
 * Reset toolbar state to defaults
 */
export function resetToolbarState() {
	toolbarStateStore.set(defaultState);
}

/**
 * Get current toolbar state (useful for non-reactive contexts)
 * @returns {ToolbarState}
 */
export function getToolbarState() {
	return get(toolbarStateStore);
}
