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
 * @typedef {Object} SelectedItem
 * @property {string} type - Type of selected item ('group' or 'study')
 * @property {string} id - ID of selected item
 * @property {Object} data - Full data of selected item
 */

/**
 * @typedef {Object} Selection
 * @property {Array<SelectedItem>} items - Array of selected items
 * @property {number} count - Number of selected items
 * @property {boolean} hasGroups - Whether selection includes groups
 * @property {boolean} hasStudies - Whether selection includes studies
 */

/**
 * @typedef {Object} ToolbarState
 * @property {boolean} canDelete - Whether Delete button should be enabled (has document open)
 * @property {boolean} canEdit - Whether Edit button should be enabled (has selected item)
 * @property {boolean} canFormat - Whether formatting buttons should be enabled (has content/selection)
 * @property {boolean} canToggleNotes - Whether Notes toggle should be enabled (document supports notes)
 * @property {boolean} canToggleVerses - Whether Verses toggle should be enabled (document has verses)
 * @property {boolean} canToggleWide - Whether Wide layout toggle should be enabled
 * @property {boolean} canToggleOverview - Whether Overview toggle should be enabled
 * @property {boolean} canSwitchMode - Whether mode switcher (Analyze/Document) should be enabled
 * @property {boolean} canZoom - Whether Zoom menu should be enabled
 * @property {boolean} canStructure - Whether Outline menu should be enabled
 * @property {boolean} canText - Whether Text menu should be enabled
 * @property {boolean} canLiterary - Whether Literary menu should be enabled
 * @property {boolean} canColor - Whether Color menu should be enabled
 * @property {boolean} canUseStructureItems - Whether Structure menu items should be enabled
 * @property {boolean} canUseTextItems - Whether Text menu items should be enabled
 * @property {boolean} canUseLiteraryItems - Whether Literary menu items should be enabled
 * @property {boolean} canUseColorItems - Whether Color menu items should be enabled
 * @property {boolean} studiesPanelOpen - Whether the studies panel is open
 * @property {boolean} versesVisible - Whether verse numbers are visible in the analyze view
 * @property {boolean} wideLayout - Whether wide layout is active (wider passage columns)
 * @property {boolean} overviewMode - Whether overview mode is active (hides passage text, shows only structure)
 * @property {number} zoomLevel - Current zoom level as percentage (25-400, or 0 for fit)
 * @property {Selection|null} selectedItem - Currently selected item(s) from studies panel
 */

/**
 * Default toolbar state - most buttons disabled until document is open
 * @type {ToolbarState}
 */
const defaultState = {
	canDelete: false,
	canEdit: false,
	canFormat: false,
	canToggleNotes: false,
	canToggleVerses: false,
	canToggleWide: false,
	canToggleOverview: false,
	canSwitchMode: false,
	canZoom: false,
	canStructure: false,
	canText: false,
	canLiterary: false,
	canColor: false,
	canUseStructureItems: false,
	canUseTextItems: false,
	canUseLiteraryItems: false,
	canUseColorItems: false,
	studiesPanelOpen: true,
	versesVisible: false,
	wideLayout: false,
	overviewMode: false,
	zoomLevel: 100,
	selectedItem: null
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
	const isDocumentRoute = pathname.includes('/document') || (pathname.includes('/study/') && !pathname.includes('/study-group'));
	const isStudyGroupRoute = pathname.includes('/study-group/');
	const isSettingsRoute = pathname === '/settings';
	const isNewRoute = pathname === '/new-study' || pathname === '/new-study-group';

	toolbarStateStore.update(state => {
		// On document/study pages, most tools should be available
		// Note: canEdit and canDelete are controlled by selection state, not route
		if (isDocumentRoute) {
			return {
				...state,
				canFormat: true,
				canToggleNotes: true,
				canToggleVerses: true,
				canToggleWide: true,
				canToggleOverview: true,
				canSwitchMode: true,
				canZoom: true,
				canStructure: true,
				canText: true,
				canLiterary: true,
				canColor: true,
				canUseStructureItems: true,
				canUseTextItems: true,
				canUseLiteraryItems: true,
				canUseColorItems: true
			};
		}

	// On study-group pages, canSwitchMode is controlled by selection state only
	if (isStudyGroupRoute) {
		return {
			...state,
			canFormat: false,
			canToggleNotes: false,
			canToggleVerses: false,
			canToggleWide: false,
			canToggleOverview: false,
			canSwitchMode: false, // Disabled by default, enabled only when studies are selected
			canZoom: false,
			canStructure: false,
			canText: false,
			canLiterary: false,
			canColor: false,
			canUseStructureItems: false,
			canUseTextItems: false,
			canUseLiteraryItems: false,
			canUseColorItems: false
		};
	}

	// On utility pages (settings, new), enable menu buttons but disable menu items
	// Note: canEdit and canDelete remain controlled by selection state
	if (isSettingsRoute || isNewRoute) {
		return {
			...state,
			canFormat: false,
			canToggleNotes: false,
			canToggleVerses: false,
			canToggleWide: false,
			canToggleOverview: false,
			canSwitchMode: false,
			canZoom: false,
			canStructure: true,
			canText: true,
			canLiterary: true,
			canColor: true,
			canUseStructureItems: false, // Menu button enabled, items disabled
			canUseTextItems: false, // Menu button enabled, items disabled
			canUseLiteraryItems: false, // Menu button enabled, items disabled
			canUseColorItems: false // Menu button enabled, items disabled
		};
	}

		// Default: keep current state
		return state;
	});
}

/**
 * Update toolbar state when a document is opened
 * Enables document-specific tools
 * Note: canEdit and canDelete are controlled by selection state
 */
export function onDocumentOpen() {
	toolbarStateStore.update(state => ({
		...state,
		canFormat: true,
		canToggleNotes: true,
		canToggleVerses: true,
		canToggleWide: true,
		canToggleOverview: true,
		canSwitchMode: true,
		canZoom: true,
		canStructure: true,
		canText: true,
		canLiterary: true,
		canColor: true,
		canUseStructureItems: true,
		canUseTextItems: true,
		canUseLiteraryItems: true,
		canUseColorItems: true
	}));
}

/**
 * Update toolbar state when a document is closed
 * Disables document-specific tools
 * Note: canEdit and canDelete are controlled by selection state
 */
export function onDocumentClose() {
	toolbarStateStore.update(state => ({
		...state,
		canFormat: false,
		canToggleNotes: false,
		canToggleVerses: false,
		canToggleWide: false,
		canToggleOverview: false,
		canSwitchMode: false,
		canZoom: false,
		canStructure: false,
		canText: false,
		canLiterary: false,
		canColor: false,
		canUseStructureItems: false,
		canUseTextItems: false,
		canUseLiteraryItems: false,
		canUseColorItems: false
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

/**
 * Toggle the studies panel open/closed
 */
export async function toggleStudiesPanel() {
	const currentState = get(toolbarStateStore);
	const newState = !currentState.studiesPanelOpen;
	
	// Update local state immediately
	toolbarStateStore.update(state => ({
		...state,
		studiesPanelOpen: newState
	}));
	
	// Persist to database
	try {
		await fetch('/api/user/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ studiesPanelOpen: newState })
		});
	} catch (error) {
		console.error('Error persisting panel state:', error);
		// Revert on error
		toolbarStateStore.update(state => ({
			...state,
			studiesPanelOpen: currentState.studiesPanelOpen
		}));
	}
}

/**
 * Toggle verses visibility
 */
export function toggleVerses() {
	toolbarStateStore.update(state => ({
		...state,
		versesVisible: !state.versesVisible
	}));
}

/**
 * Toggle wide layout
 */
export function toggleWide() {
	toolbarStateStore.update(state => ({
		...state,
		wideLayout: !state.wideLayout
	}));
}

/**
 * Toggle overview mode
 */
export function toggleOverview() {
	toolbarStateStore.update(state => ({
		...state,
		overviewMode: !state.overviewMode
	}));
}

/**
 * Set zoom level
 * @param {number} level - Zoom level as percentage (25-400) or 0 for fit
 */
export function setZoomLevel(level) {
	toolbarStateStore.update(state => ({
		...state,
		zoomLevel: level
	}));
}

/**
 * Set the selected item(s) in the studies panel
 * @param {object} selection - Selection object with items array
 * @param {Array} selection.items - Array of selected items with type, id, and data
 * @param {number} selection.count - Number of selected items
 * @param {boolean} selection.hasGroups - Whether selection includes groups
 * @param {boolean} selection.hasStudies - Whether selection includes studies
 */
export function setSelectedItem(selection) {
	toolbarStateStore.update(state => ({
		...state,
		selectedItem: selection,
		canEdit: selection !== null && selection.count > 0,
		canDelete: selection !== null && selection.count > 0,
		canSwitchMode: selection !== null && selection.hasStudies
	}));
}

/**
 * Clear the selected item
 */
export function clearSelectedItem() {
	toolbarStateStore.update(state => ({
		...state,
		selectedItem: null,
		canEdit: false,
		canDelete: false,
		canSwitchMode: false
	}));
}
