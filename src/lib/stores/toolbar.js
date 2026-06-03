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
 * @property {boolean} canToggleComparison - Whether Comparison toggle should be enabled
 * @property {boolean} canToggleConnections - Whether Connections toggle should be enabled
 * @property {boolean} canToggleHeadings - Whether Headings toggle should be enabled
 * @property {boolean} canToggleNotes - Whether Notes toggle should be enabled (document supports notes)
 * @property {boolean} canToggleComment - Whether Comment toggle should be enabled (document supports comment)
 * @property {boolean} canToggleReferences - Whether References toggle should be enabled
 * @property {boolean} canToggleVerses - Whether Verses toggle should be enabled (document has verses)
 * @property {boolean} canToggleParagraphBreaks - Whether Paragraph Breaks toggle should be enabled
 * @property {boolean} canToggleWide - Whether Wide layout toggle should be enabled
 * @property {boolean} canToggleOverview - Whether Overview toggle should be enabled
 * @property {boolean} canSwitchMode - Whether mode switcher (Analyze/Document) should be enabled
 * @property {boolean} isStudyRoute - Whether the current route is a study/document route
 * @property {boolean} canZoom - Whether Zoom menu should be enabled
 * @property {boolean} canStructure - Whether Structure menu should be enabled
 * @property {boolean} canHeading - Whether Headings menu should be enabled
 * @property {boolean} canColor - Whether Color menu should be enabled
 * @property {boolean} canUseStructureItems - Whether Structure menu items should be enabled
 * @property {boolean} canUseHeadingItems - Whether Heading menu items should be enabled
 * @property {boolean} canUseColorItems - Whether Color menu items should be enabled
 * @property {boolean} studiesPanelOpen - Whether the studies panel is open
 * @property {boolean} commentaryPanelOpen - Whether the commentary panel is open
 * @property {boolean} comparisonsVisible - Whether comparisons are visible
 * @property {boolean} headingsVisible - Whether headings are visible in segments
 * @property {boolean} connectionsVisible - Whether connections are visible (master toggle)
 * @property {boolean} columnConnectionsVisible - Whether column connections are visible
 * @property {boolean} sectionConnectionsVisible - Whether section connections are visible
 * @property {boolean} segmentConnectionsVisible - Whether segment connections are visible
 * @property {boolean} notesVisible - Whether quick notes are visible in segments
 * @property {boolean} referencesVisible - Whether scripture references are visible in headings
 * @property {boolean} versesVisible - Whether verse numbers are visible in the analyze view
 * @property {boolean} paragraphBreaksVisible - Whether translator paragraph break markers are visible
 * @property {boolean} wideLayout - Whether wide layout is active (wider passage columns)
 * @property {boolean} overviewMode - Whether overview mode is active (hides passage text, shows only structure)
 * @property {number} zoomLevel - Current zoom level as percentage (25-400)
 * @property {'percentage'|'fit-width'|'fit-study'} zoomMode - Zoom mode: percentage-based or a fit mode
 * @property {Selection|null} selectedItem - Currently selected item(s) from studies panel
 * @property {boolean} hasWordSelection - Whether a word has been selected in the passage
 * @property {boolean} hasActiveSegment - Whether a segment is currently active
 * @property {string|null} activeSegmentId - The ID of the currently active segment
 * @property {boolean} activeSegmentHasHeadingOne - Whether active segment has a heading one
 * @property {boolean} activeSegmentHasHeadingTwo - Whether active segment has a heading two
 * @property {boolean} activeSegmentHasHeadingThree - Whether active segment has a heading three
 * @property {boolean} activeSegmentHasNote - Whether active segment has a note
 * @property {boolean} hasActiveSection - Whether a section is currently active (for color mode)
 * @property {string|null} activeSectionId - The ID of the currently active section
 * @property {boolean} hasActiveColumn - Whether a column is currently active
 * @property {string|null} activeColumnId - The ID of the currently active column
 * @property {boolean} canInsertColumn - Whether Insert Column button should be enabled
 * @property {boolean} canInsertConnection - Whether Insert Connection button should be enabled
 * @property {boolean} canRemoveConnection - Whether Remove Connection button should be enabled
 * @property {boolean} hasActiveConnection - Whether one or more connection lines are currently selected
 * @property {string[]} activeConnectionIds - The IDs of the currently selected connections
 * @property {boolean} hasActiveHeadingOrNoteEditor - Whether a heading or note editor is in input mode
 * @property {string|null} activeHeadingOrNoteType - Which editor is active: 'one', 'two', 'three', 'note', or null
 */

/**
 * Default toolbar state - most buttons disabled until document is open
 * @type {ToolbarState}
 */
const defaultState = {
	canDelete: false,
	canEdit: false,
	canFormat: false,
	canToggleComparison: false,
	canToggleConnections: false,
	canToggleHeadings: false,
	canToggleNotes: false,
	canToggleComment: false,
	canToggleReferences: false,
	canToggleVerses: false,
	canToggleParagraphBreaks: false,
	canToggleWide: false,
	canToggleOverview: false,
	canSwitchMode: false,
	isStudyRoute: false,
	canZoom: false,
	zoomMode: 'percentage',
	canStructure: false,
	canHeading: false,
	canColor: false,
	canUseStructureItems: false,
	canUseHeadingItems: false,
	canUseColorItems: false,
	studiesPanelOpen: true,
	commentaryPanelOpen: false,
	headingsVisible: true,
	comparisonsVisible: false,
	columnConnectionsVisible: true,
	sectionConnectionsVisible: true,
	segmentConnectionsVisible: true,
	connectionsVisible: true,
	notesVisible: true,
	referencesVisible: false,
	versesVisible: false,
	paragraphBreaksVisible: false,
	wideLayout: false,
	overviewMode: false,
	zoomLevel: 100,
	selectedItem: null,
	hasWordSelection: false,
	hasActiveSegment: false,
	activeSegmentId: null,
	activeSegmentHasHeadingOne: false,
	activeSegmentHasHeadingTwo: false,
	activeSegmentHasHeadingThree: false,
	activeSegmentHasNote: false,
	hasActiveSection: false,
	activeSectionId: null,
	hasActiveColumn: false,
	activeColumnId: null,
	canInsertColumn: false,
	canInsertConnection: false,
	canRemoveConnection: false,
	hasActiveConnection: false,
	activeConnectionIds: [],
	hasActiveHeadingOrNoteEditor: false,
	activeHeadingOrNoteType: null
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
	const isAnalyzeRoute = pathname.includes('/study/') && 
	                       !pathname.includes('/study-group') && 
	                       (pathname.endsWith('/analyze') || pathname.includes('/analyze/'));
	const isStudyGroupRoute = pathname.includes('/study-group/');
	const isSettingsRoute = pathname === '/settings';
	const isNewRoute = pathname === '/new-study' || pathname === '/new-study-group';

	toolbarStateStore.update(state => {
		// On document/study pages, most tools should be available
		// Note: canEdit and canDelete are controlled by selection state, not route
		if (isDocumentRoute) {
			return {
				...state,
				isStudyRoute: true,
				canFormat: true,
				canToggleConnections: true,
				canToggleHeadings: true,
				// canToggleNotes is intentionally omitted here — it is controlled
				// entirely by the analyze page's $effect that checks whether any
				// quick notes actually exist in the study's segment data.
				canToggleComment: isAnalyzeRoute, // Only enable on analyze pages
				canToggleReferences: true,
				canToggleVerses: true,
				canToggleWide: true,
				canToggleOverview: true,
				canSwitchMode: true,
				canZoom: true,
				canStructure: true,
				canHeading: true,
				canColor: true,
				canUseStructureItems: true,
				canUseHeadingItems: true,
				canUseColorItems: true,
				commentaryPanelOpen: state.commentaryPanelOpen // Preserve across all study routes; only close on non-study pages
			};
		}

	// On study-group pages, canSwitchMode is controlled by selection state only
	if (isStudyGroupRoute) {
		return {
			...state,
			isStudyRoute: false,
			canFormat: false,
			canToggleComparison: false,
			canToggleConnections: false,
			canToggleNotes: false,
			canToggleComment: false,
			canToggleReferences: false,
			canToggleVerses: false,
			canToggleWide: false,
			canToggleOverview: false,
			canSwitchMode: false, // Disabled by default, enabled only when studies are selected
			canZoom: false,
			canStructure: false,
			canHeading: false,
			canColor: false,
			canUseStructureItems: false,
			canUseHeadingItems: false,
			canUseColorItems: false,
			commentaryPanelOpen: false // Close commentary panel on study-group pages
		};
	}

	// On utility pages (settings, new), enable menu buttons but disable menu items
	// Note: canEdit and canDelete remain controlled by selection state
	if (isSettingsRoute || isNewRoute) {
		return {
			...state,
			isStudyRoute: false,
			canFormat: false,
			canToggleComparison: false,
			canToggleConnections: false,
			canToggleNotes: false,
			canToggleComment: false,
			canToggleReferences: false,
			canToggleVerses: false,
			canToggleWide: false,
			canToggleOverview: false,
			canSwitchMode: false,
			canZoom: false,
			canStructure: true,
			canHeading: true,
			canColor: true,
			canUseStructureItems: false, // Menu button enabled, items disabled
			canUseHeadingItems: false, // Menu button enabled, items disabled
			canUseColorItems: false, // Menu button enabled, items disabled
			commentaryPanelOpen: false // Close commentary panel on settings/new pages
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
		canToggleConnections: true,
		canToggleNotes: true,
		canToggleComment: true,
		canToggleReferences: true,
		canToggleVerses: true,
		canToggleWide: true,
		canToggleOverview: true,
		canSwitchMode: true,
		canZoom: true,
		canStructure: true,
		canHeading: true,
		canColor: true,
		canUseStructureItems: true,
		canUseHeadingItems: true,
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
		canToggleComparison: false,
		canToggleConnections: false,
		canToggleNotes: false,
		canToggleComment: false,
		canToggleReferences: false,
		canToggleVerses: false,
		canToggleWide: false,
		canToggleOverview: false,
		canSwitchMode: false,
		canZoom: false,
		canStructure: false,
		canHeading: false,
		canColor: false,
		canUseStructureItems: false,
		canUseHeadingItems: false,
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
 * Set the studies panel to a specific open/closed state
 * @param {boolean} newState - Whether the panel should be open
 * @returns {Promise<void>}
 */
export async function setStudiesPanelOpen(newState) {
	const currentState = get(toolbarStateStore);
	
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
 * Toggle the studies panel open/closed
 */
export async function toggleStudiesPanel() {
	const currentState = get(toolbarStateStore);
	const newState = !currentState.studiesPanelOpen;
	await setStudiesPanelOpen(newState);
}

/**
 * Toggle comparisons visibility
 */
export function toggleComparison() {
	console.log('🔘 [TOOLBAR] toggleComparison called');
	toolbarStateStore.update(state => {
		const newValue = !state.comparisonsVisible;
		console.log('🔘 [TOOLBAR] comparisonsVisible changing from', state.comparisonsVisible, 'to', newValue);
		return {
			...state,
			comparisonsVisible: newValue
		};
	});
}

/**
 * Toggle headings visibility
 */
export function toggleHeadings() {
	toolbarStateStore.update(state => ({
		...state,
		headingsVisible: !state.headingsVisible
	}));
}

/**
 * Toggle all connections visibility (master toggle).
 * When turning off: unchecks all three individual types.
 * When turning on: checks all three individual types.
 * connectionsVisible is true only when ALL three individual types are on.
 */
export function toggleConnections() {
	toolbarStateStore.update(state => {
		// If all three are on, turn everything off; otherwise turn everything on
		const newValue = !state.connectionsVisible;
		return {
			...state,
			connectionsVisible: newValue,
			columnConnectionsVisible: newValue,
			sectionConnectionsVisible: newValue,
			segmentConnectionsVisible: newValue
		};
	});
}

/**
 * Toggle column connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleColumnConnections() {
	toolbarStateStore.update(state => {
		const newCol = !state.columnConnectionsVisible;
		return {
			...state,
			columnConnectionsVisible: newCol,
			connectionsVisible: newCol && state.sectionConnectionsVisible && state.segmentConnectionsVisible
		};
	});
}

/**
 * Toggle section connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleSectionConnections() {
	toolbarStateStore.update(state => {
		const newSec = !state.sectionConnectionsVisible;
		return {
			...state,
			sectionConnectionsVisible: newSec,
			connectionsVisible: state.columnConnectionsVisible && newSec && state.segmentConnectionsVisible
		};
	});
}

/**
 * Toggle segment connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleSegmentConnections() {
	toolbarStateStore.update(state => {
		const newSeg = !state.segmentConnectionsVisible;
		return {
			...state,
			segmentConnectionsVisible: newSeg,
			connectionsVisible: state.columnConnectionsVisible && state.sectionConnectionsVisible && newSeg
		};
	});
}

/**
 * Toggle notes visibility
 */
export function toggleNotes() {
	toolbarStateStore.update(state => ({
		...state,
		notesVisible: !state.notesVisible
	}));
}

/**
 * Toggle references visibility
 */
export function toggleReferences() {
	toolbarStateStore.update(state => ({
		...state,
		referencesVisible: !state.referencesVisible
	}));
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
 * Toggle paragraph breaks visibility
 */
export function toggleParagraphBreaks() {
	toolbarStateStore.update(state => ({
		...state,
		paragraphBreaksVisible: !state.paragraphBreaksVisible
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
 * Automatically closes commentary panel when enabling overview mode
 */
export function toggleOverview() {
	toolbarStateStore.update(state => {
		// If turning overview ON and commentary is open, close commentary first
		const newOverviewMode = !state.overviewMode;
		const shouldCloseCommentary = newOverviewMode && state.commentaryPanelOpen;
		
		return {
			...state,
			overviewMode: newOverviewMode,
			commentaryPanelOpen: shouldCloseCommentary ? false : state.commentaryPanelOpen,
			// Automatically ensure headings are visible when entering overview mode
			headingsVisible: newOverviewMode ? true : state.headingsVisible
		};
	});
}

/**
 * Set the commentary panel to a specific open/closed state
 * @param {boolean} newState - Whether the panel should be open
 * @returns {Promise<void>}
 */
export async function setCommentaryPanelOpen(newState) {
	const currentState = get(toolbarStateStore);

	// Update local state immediately
	toolbarStateStore.update(state => ({
		...state,
		commentaryPanelOpen: newState
	}));

	// Persist to database
	try {
		await fetch('/api/user/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ commentaryPanelOpen: newState })
		});
	} catch (error) {
		console.error('Error persisting commentary panel state:', error);
		// Revert on error
		toolbarStateStore.update(state => ({
			...state,
			commentaryPanelOpen: currentState.commentaryPanelOpen
		}));
	}
}

/**
 * Toggle the commentary panel open/closed
 */
export async function toggleCommentary() {
	const currentState = get(toolbarStateStore);
	const newState = !currentState.commentaryPanelOpen;
	await setCommentaryPanelOpen(newState);
}

/**
 * Set zoom level (also resets zoomMode to 'percentage')
 * @param {number} level - Zoom level as percentage (25-400)
 */
export function setZoomLevel(level) {
	toolbarStateStore.update(state => ({
		...state,
		zoomLevel: level,
		zoomMode: 'percentage'
	}));
}

/**
 * Set the zoom mode without changing the numeric zoom level
 * @param {'percentage'|'fit-width'|'fit-study'} mode - The zoom mode to activate
 */
export function setZoomMode(mode) {
	toolbarStateStore.update(state => ({
		...state,
		zoomMode: mode
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
		// Enabled if a study is selected OR if a study route is currently active
		canSwitchMode: state.isStudyRoute || (selection !== null && selection.hasStudies)
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
		// Keep enabled if a study route is currently active (study open but nothing selected)
		canSwitchMode: state.isStudyRoute
	}));
}

/**
 * Set word selection state
 * @param {boolean} hasSelection - Whether a word is currently selected
 */
export function setWordSelection(hasSelection) {
	toolbarStateStore.update(state => ({
		...state,
		hasWordSelection: hasSelection
	}));
}

/**
 * Set active segment state
 * @param {boolean} hasSegment - Whether a segment is currently active
 * @param {string|null} segmentId - The ID of the active segment (optional)
 * @param {Object} [options] - Optional segment status information
 * @param {boolean} [options.hasHeadingOne] - Whether segment has heading one
 * @param {boolean} [options.hasHeadingTwo] - Whether segment has heading two
 * @param {boolean} [options.hasHeadingThree] - Whether segment has heading three
 * @param {boolean} [options.hasNote] - Whether segment has a note
 */
export function setActiveSegment(hasSegment, segmentId = null, options) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveSegment: hasSegment,
		activeSegmentId: segmentId,
		activeSegmentHasHeadingOne: options?.hasHeadingOne || false,
		activeSegmentHasHeadingTwo: options?.hasHeadingTwo || false,
		activeSegmentHasHeadingThree: options?.hasHeadingThree || false,
		activeSegmentHasNote: options?.hasNote || false,
		// Deselect any connection when a segment becomes active
		hasActiveConnection: hasSegment ? false : state.hasActiveConnection,
		activeConnectionIds: hasSegment ? [] : state.activeConnectionIds
	}));
}

/**
 * Set Insert Column availability state
 * @param {boolean} canInsert - Whether Insert Column should be enabled
 */
export function setCanInsertColumn(canInsert) {
	toolbarStateStore.update(state => ({
		...state,
		canInsertColumn: canInsert
	}));
}

/**
 * Set active column state
 * @param {boolean} hasColumn - Whether a column is currently active
 * @param {string|null} columnId - The ID of the active column (optional)
 */
export function setActiveColumn(hasColumn, columnId = null) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveColumn: hasColumn,
		activeColumnId: columnId
	}));
}

/**
 * Set active section state
 * @param {boolean} hasSection - Whether a section is currently active
 * @param {string|null} sectionId - The ID of the active section (optional)
 */
export function setActiveSection(hasSection, sectionId = null) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveSection: hasSection,
		activeSectionId: sectionId
	}));
}

/**
 * Set multi-select mode state (enables Compare button when multiple items selected).
 * The Compare button also stays active when connection lines are selected
 * (handled via state.hasActiveConnection so the analyze page never needs to read the
 * store reactively, which would cause a reactive loop).
 * @param {boolean} isMultiSelect - Whether multiple items are currently selected
 */
export function setMultiSelectMode(isMultiSelect) {
	toolbarStateStore.update(state => ({
		...state,
		// Keep Compare button enabled if: multi-selecting, a connection is selected, or already in compare mode
		canToggleComparison: isMultiSelect || state.hasActiveConnection || state.comparisonsVisible
	}));
}

/**
 * Set connection button availability states
 * @param {boolean} canInsert - Whether Insert Connection should be enabled
 * @param {boolean} canRemove - Whether Remove Connection should be enabled
 */
export function setConnectionButtonStates(canInsert, canRemove) {
	toolbarStateStore.update(state => ({
		...state,
		canInsertConnection: canInsert,
		canRemoveConnection: canRemove
	}));
}

/**
 * Set whether a heading or note editor is currently in input mode.
 * Used to enable the Delete button only when the user is actively editing a specific
 * heading or note. Also tracks which type is active so only that one is deleted.
 * @param {boolean} isActive - Whether a heading/note editor is in edit mode
 * @param {string|null} type - Which type is active: 'one', 'two', 'three', 'note', or null
 */
export function setHeadingOrNoteEditorActive(isActive, type = null) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveHeadingOrNoteEditor: isActive,
		activeHeadingOrNoteType: isActive ? type : null
	}));
}

/**
 * Set the active connection(s) (selected connection lines).
 * Clears the active segment so the commentary panel switches context.
 * Also enables the Compare button when connections are selected so the user can
 * enter compare mode to view the connected elements side-by-side.
 * @param {boolean} hasConnection - Whether one or more connections are currently selected
 * @param {string[]} connectionIds - The IDs of the selected connections
 */
export function setActiveConnection(hasConnection, connectionIds = []) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveConnection: hasConnection,
		activeConnectionIds: connectionIds,
		// Deselect segment when a connection is selected, and vice versa
		hasActiveSegment: hasConnection ? false : state.hasActiveSegment,
		activeSegmentId: hasConnection ? null : state.activeSegmentId,
		// Enable Compare button when connections are selected; keep it enabled if already in compare mode
		canToggleComparison: hasConnection ? true : state.comparisonsVisible
	}));
}
