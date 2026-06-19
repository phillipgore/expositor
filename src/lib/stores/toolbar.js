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
 * Persist one or more preference key/value pairs to the database.
 * Fire-and-forget: errors are logged but the store is not reverted,
 * since view toggle preferences are low-stakes and easily re-toggled.
 * @param {Record<string, boolean|number|string>} updates - Key/value pairs to persist
 */
async function persistPreference(updates) {

	try {
		await fetch('/api/user/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
	} catch (error) {
		console.error('Error persisting view preference:', error);
	}
}

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
 * @property {boolean} canToggleFocus - Whether Focus toggle should be enabled
 * @property {boolean} canToggleConnections - Whether Connections toggle should be enabled
 * @property {boolean} canToggleHeadings - Whether Headings toggle should be enabled
 * @property {boolean} canToggleNotes - Whether Notes toggle should be enabled (document supports notes)
 * @property {boolean} canToggleComment - Whether Comment toggle should be enabled (document supports comment)
 * @property {boolean} canToggleReferences - Whether References toggle should be enabled
 * @property {boolean} canToggleVerses - Whether Verses toggle should be enabled (document has verses)
 * @property {boolean} canToggleParagraphBreaks - Whether Paragraph Breaks toggle should be enabled
 * @property {boolean} canToggleWide - Whether Wide layout toggle should be enabled
 * @property {boolean} canToggleOverview - Whether Overview toggle should be enabled
 * @property {boolean} canTogglePassageDividers - Whether the Passage Dividers toggle should be enabled (study has 2+ passages)
 * @property {boolean} canSwitchMode - Whether mode switcher (Analyze/Document) should be enabled
 * @property {boolean} isStudyRoute - Whether the current route is a study/document route
 * @property {boolean} isGlossaryRoute - Whether the current route is the glossary reference page
 * @property {boolean} isDashboardRoute - Whether the current route is the dashboard page
 * @property {boolean} isStudyGroupRoute - Whether the current route is a study-group page
 * @property {boolean} isStudyEditRoute - Whether the current route is a study edit/review page (Analyze/Document switching is disabled here)
 * @property {'document'|'analyze'} lastStudyView - The last study view (document or analyze) the user was in; used to restore the same view when navigating back into a study from another page (glossary, new study, etc.)
 * @property {boolean} canZoom - Whether Zoom menu should be enabled

 * @property {boolean} canStructure - Whether Structure menu should be enabled
 * @property {boolean} canHeading - Whether Headings menu should be enabled
 * @property {boolean} canColor - Whether Color menu should be enabled
 * @property {boolean} canUseStructureItems - Whether Structure menu items should be enabled
 * @property {boolean} canUseHeadingItems - Whether Heading menu items should be enabled
 * @property {boolean} canUseColorItems - Whether Color menu items should be enabled
 * @property {boolean} studiesPanelOpen - Whether the studies panel is open
 * @property {boolean} commentaryPanelOpen - Whether the commentary panel is open
 * @property {boolean} focusMode - Whether focus mode is active
 * @property {boolean} headingsVisible - Whether headings are visible in segments
 * @property {boolean} connectionsVisible - Whether connections are visible (master toggle)
 * @property {boolean} columnConnectionsVisible - Whether column connections are visible
 * @property {boolean} sectionConnectionsVisible - Whether section connections are visible
 * @property {boolean} segmentConnectionsVisible - Whether segment connections are visible
 * @property {boolean} crossItemConnectionsVisible - Whether cross-item (different-kind) connections are visible
 * @property {boolean} notesVisible - Whether all quick notes are visible (master toggle; true when both passage and connection notes are on)
 * @property {boolean} passageNotesVisible - Whether passage (inline segment) quick notes are visible
 * @property {boolean} connectionNotesVisible - Whether connection quick notes are visible
 * @property {boolean} referencesVisible - Whether scripture references are visible in headings
 * @property {boolean} versesVisible - Whether verse numbers are visible in the analyze view
 * @property {boolean} paragraphBreaksVisible - Whether translator paragraph break markers are visible
 * @property {boolean} wideLayout - Whether wide layout is active (wider passage columns)
 * @property {boolean} overviewMode - Whether overview mode is active (hides passage text, shows only structure)
 * @property {boolean} selectorsVisible - Whether the Column/Section selector buttons are shown without holding Command/Ctrl
 * @property {boolean} layoutControlsVisible - Whether the Column/Section/Segment layout handles (reposition/resize) are shown without hovering
 * @property {boolean} passageDividersVisible - Whether the vertical divider line between adjacent passages is shown (also controls whether the cross-passage gap is double width)
 * @property {number} analyzeZoomLevel - Analyze view's zoom level as percentage (25-400)
 * @property {'percentage'|'fit-width'|'fit-study'} analyzeZoomMode - Analyze view's zoom mode
 * @property {number} documentZoomLevel - Document view's zoom level as percentage (25-400)
 * @property {'percentage'|'fit-width'|'fit-study'} documentZoomMode - Document view's zoom mode
 * @property {boolean} documentHeadingsVisible - (Document view) Whether headings are visible
 * @property {boolean} documentNotesVisible - (Document view) Whether all quick notes are visible (master toggle)
 * @property {boolean} documentPassageNotesVisible - (Document view) Whether passage quick notes are visible
 * @property {boolean} documentConnectionNotesVisible - (Document view) Whether connection quick notes are visible
 * @property {boolean} documentConnectionsVisible - (Document view) Whether connections are visible (master toggle)
 * @property {boolean} documentColumnConnectionsVisible - (Document view) Whether column connections are visible
 * @property {boolean} documentSectionConnectionsVisible - (Document view) Whether section connections are visible
 * @property {boolean} documentSegmentConnectionsVisible - (Document view) Whether segment connections are visible
 * @property {boolean} documentCrossItemConnectionsVisible - (Document view) Whether cross-item connections are visible
 * @property {boolean} documentVersesVisible - (Document view) Whether verse notations are visible
 * @property {boolean} documentParagraphBreaksVisible - (Document view) Whether paragraph break markers are visible
 * @property {boolean} documentCommentariesVisible - (Document view) Whether commentaries are shown in the document (NOT the commentary editor slide-out)

 * @property {Selection|null} selectedItem - Currently selected item(s) from studies panel

 * @property {boolean} hasWordSelection - Whether a word has been selected in the passage
 * @property {boolean} hasActiveSegment - Whether a segment is currently active
 * @property {string|null} activeSegmentId - The ID of the currently active segment
 * @property {string[]} activeSegmentSectionIds - The IDs of the section(s) the currently selected segment(s) belong to (for Color)
 * @property {number} activeSegmentCount - Number of segments currently selected
 * @property {boolean} canLinkSegmentHeight - Whether the "Link Segment Height" action is available (2+ segments selected that aren't already all in one group)
 * @property {boolean} canUnlinkSegmentHeight - Whether the "Unlink Segment Height" action is available (selection includes a linked segment)
 * @property {boolean} activeSegmentHasHeadingOne - Whether active segment has a heading one
 * @property {boolean} activeSegmentHasHeadingTwo - Whether active segment has a heading two
 * @property {boolean} activeSegmentHasHeadingThree - Whether active segment has a heading three
 * @property {boolean} activeSegmentHasNote - Whether active segment has a note
 * @property {boolean} isActiveSegmentFirstInPassage - Whether the active segment is the first segment in its passage
 * @property {boolean} hasActiveSection - Whether a section is currently active (for color mode)
 * @property {string|null} activeSectionId - The ID of the currently active section
 * @property {string[]} activeSectionIds - The IDs of ALL currently selected sections (for multi-select Color)
 * @property {boolean} isActiveSectionFirstInPassage - Whether the active section is the first section in its passage
 * @property {boolean} hasActiveColumn - Whether a column is currently active
 * @property {string|null} activeColumnId - The ID of the currently active column
 * @property {string[]} activeColumnIds - The IDs of ALL currently selected columns (for multi-select Color)

 * @property {boolean} isActiveColumnFirstInPassage - Whether the active column is the first column in its passage
 * @property {boolean} canInsertColumn - Whether Insert Column button should be enabled
 * @property {boolean} canInsertConnection - Whether Insert Connection button should be enabled
 * @property {boolean} canRemoveConnection - Whether Remove Connection button should be enabled
 * @property {boolean} hasActiveConnection - Whether one or more connection lines are currently selected
 * @property {string[]} activeConnectionIds - The IDs of the currently selected connections
 * @property {boolean} activeConnectionHasNote - Whether the currently selected connection has a quick note
 * @property {number} activeConnectionNoteCount - How many of the currently selected connections have a quick note (drives multi-select note-placement actions)
 * @property {boolean} hasActiveHeading - Whether a heading (passage_heading row) is currently selected for commentary
 * @property {string|null} activeHeadingId - The ID of the currently selected heading row
 * @property {boolean} hasActiveHeadingOrNoteEditor - Whether a heading or note editor is in input mode

 * @property {string|null} activeHeadingOrNoteType - Which editor is active: 'one', 'two', 'three', 'note', or null
 * @property {string|null} activeHeadingOrNoteEditorKey - Unique key of the active editor (e.g. `${segmentId}-${type}`); identifies the specific owning editor so a stale editor's cleanup can't clear another editor's state

 * @property {boolean} isWordInFirstSegment - Whether the selected word is in the first segment of its passage
 * @property {boolean} isWordInLastSegment - Whether the selected word is in the last segment of its passage
 * @property {boolean} isCaretAtSegmentStart - Whether the caret is before the first word of its segment (nothing to move up)
 * @property {boolean} isCaretAtSegmentEnd - Whether the caret is after the last word of its segment (nothing to move down)
 */

/**
 * Default toolbar state - most buttons disabled until document is open
 * @type {ToolbarState}
 */
const defaultState = {
	canDelete: false,
	canEdit: false,
	canFormat: false,
	canToggleFocus: false,
	canToggleConnections: false,
	canToggleHeadings: false,
	canToggleNotes: false,
	canToggleComment: false,
	canToggleReferences: false,
	canToggleVerses: false,
	canToggleParagraphBreaks: false,
	canToggleWide: false,
	canToggleOverview: false,
	canTogglePassageDividers: false,
	canSwitchMode: false,
	isStudyRoute: false,
	isGlossaryRoute: false,
	isDashboardRoute: false,
	isStudyGroupRoute: false,
	isStudyEditRoute: false,
	lastStudyView: 'analyze',
	canZoom: false,
	analyzeZoomMode: 'percentage',
	documentZoomMode: 'percentage',
	canStructure: false,

	canHeading: false,
	canColor: false,
	canUseStructureItems: false,
	canUseHeadingItems: false,
	canUseColorItems: false,
	studiesPanelOpen: true,
	commentaryPanelOpen: false,
	headingsVisible: true,
	focusMode: false,
	columnConnectionsVisible: true,
	sectionConnectionsVisible: true,
	segmentConnectionsVisible: true,
	crossItemConnectionsVisible: true,
	connectionsVisible: true,
	notesVisible: true,
	passageNotesVisible: true,
	connectionNotesVisible: true,
	referencesVisible: false,
	versesVisible: false,
	paragraphBreaksVisible: false,
	wideLayout: false,
	overviewMode: false,
	selectorsVisible: false,
	layoutControlsVisible: false,
	passageDividersVisible: true,
	// Document view's OWN copy of the visibility toggles (independent of the
	// Analyze toggles above), so changing a toggle on one view never affects the
	// other. Defaults mirror Analyze except documentCommentariesVisible, which is
	// on by default so commentaries print in the document by default.
	documentHeadingsVisible: true,
	documentNotesVisible: true,
	documentPassageNotesVisible: true,
	documentConnectionNotesVisible: true,
	documentConnectionsVisible: true,
	documentColumnConnectionsVisible: true,
	documentSectionConnectionsVisible: true,
	documentSegmentConnectionsVisible: true,
	documentCrossItemConnectionsVisible: true,
	documentVersesVisible: false,
	documentParagraphBreaksVisible: false,
	documentCommentariesVisible: true,
	analyzeZoomLevel: 100,
	documentZoomLevel: 100,

	selectedItem: null,

	hasWordSelection: false,
	hasActiveSegment: false,
	activeSegmentId: null,
	activeSegmentSectionIds: [],
	activeSegmentCount: 0,
	canLinkSegmentHeight: false,
	canUnlinkSegmentHeight: false,
	activeSegmentHasHeadingOne: false,
	activeSegmentHasHeadingTwo: false,
	activeSegmentHasHeadingThree: false,
	activeSegmentHasNote: false,
	isActiveSegmentFirstInPassage: false,
	hasActiveSection: false,
	activeSectionId: null,
	activeSectionIds: [],
	isActiveSectionFirstInPassage: false,
	hasActiveColumn: false,
	activeColumnId: null,
	activeColumnIds: [],
	isActiveColumnFirstInPassage: false,
	canInsertColumn: false,
	canInsertConnection: false,
	canRemoveConnection: false,
	hasActiveConnection: false,
	activeConnectionIds: [],
	activeConnectionHasNote: false,
	activeConnectionNoteCount: 0,
	// A heading (passage_heading row) selected via its hover select button, for
	// attaching commentary. Independent of the heading EDITOR (edit-the-text) state.
	hasActiveHeading: false,
	activeHeadingId: null,
	hasActiveHeadingOrNoteEditor: false,

	activeHeadingOrNoteType: null,
	activeHeadingOrNoteEditorKey: null,
	isWordInFirstSegment: false,

	isWordInLastSegment: false,
	isCaretAtSegmentStart: false,
	isCaretAtSegmentEnd: false
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
	// Explicit Document view route (distinct from the broad isDocumentRoute, which is
	// also true for the bare /study/[id] pass-through). Used to record lastStudyView
	// ONLY when the user is genuinely on a /document or /analyze view, so the bare
	// route never clobbers the remembered view.
	const isDocumentView = pathname.includes('/study/') &&
	                       !pathname.includes('/study-group') &&
	                       (pathname.endsWith('/document') || pathname.includes('/document/'));

	// Study edit/review flow (e.g. /study/[id]/edit, /study/[id]/edit/review). While
	// editing a study the Analyze/Document mode switcher must stay disabled so the user
	// can't jump out of the edit flow via those buttons.
	const isStudyEditRoute = pathname.includes('/study/') &&
	                         !pathname.includes('/study-group') &&
	                         (pathname.endsWith('/edit') || pathname.includes('/edit/'));
	const isStudyGroupRoute = pathname.includes('/study-group/');
	const isSettingsRoute = pathname === '/settings';
	const isNewRoute = pathname === '/new-study' || pathname === '/new-study-group';
	const isGlossaryRoute = pathname === '/glossary';
	const isDashboardRoute = pathname === '/dashboard';

	toolbarStateStore.update(state => {
		// Dashboard landing page: the Finder is forced open and the commentary panel
		// is closed. The Structure, Markup, Layout, Color, and View menu BUTTONS remain
		// enabled (via canStructure/canColor and the View config no longer disabling on
		// the dashboard), but every item inside those dropdown menus stays disabled
		// because there is no active study/document here — the item-level flags
		// (canUseStructureItems, hasActiveSegment, hasActiveSection, canToggle*, etc.)
		// are all false.
		if (isDashboardRoute) {
			return {
				...state,
				isStudyRoute: false,
				isGlossaryRoute: false,
				isDashboardRoute: true,
				isStudyGroupRoute: false,
				isStudyEditRoute: false,
				canFormat: false,
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
				canZoom: false,
				// Menu buttons enabled, but their dropdown items remain disabled
				canStructure: true,
				canHeading: true,
				canColor: true,
				canUseStructureItems: false,
				canUseHeadingItems: false,
				canUseColorItems: false,
				studiesPanelOpen: true, // Force the Finder open on the dashboard
				commentaryPanelOpen: false // Commentary is disabled on the dashboard

			};
		}


		// Glossary reference page: a read-only "reference mode" where only Finder,
		// Studies, and the Analyze/Document switcher remain usable. The Structure,
		// Markup, Layout, Color, and View menu BUTTONS stay enabled, but every item
		// inside those dropdown menus is disabled (no active document here) — the
		// item-level flags (canUse*Items, hasActive*, canToggle*) are all false.
		if (isGlossaryRoute) {
			return {
				...state,
				isStudyRoute: false,
				isGlossaryRoute: true,
				isDashboardRoute: false,
				isStudyGroupRoute: false,
				isStudyEditRoute: false,
				canFormat: false,

				canToggleConnections: false,
				canToggleHeadings: false,
				canToggleNotes: false,
				canToggleComment: false,
				canToggleReferences: false,
				canToggleVerses: false,
				canToggleParagraphBreaks: false,
				canToggleWide: false,
				canToggleOverview: false,
				// Analyze/Document switcher: enabled only when a study is selected in
				// the Finder (so the user can jump back into a study from here).
				canSwitchMode: state.selectedItem !== null && state.selectedItem.hasStudies,
				canZoom: false,
				// Menu buttons enabled, but their dropdown items remain disabled
				canStructure: true,
				canHeading: true,
				canColor: true,
				canUseStructureItems: false,
				canUseHeadingItems: false,
				canUseColorItems: false,
				commentaryPanelOpen: false
			};
		}



		// Study edit/review flow: the user is editing a study. The Analyze/Document
		// mode switcher must stay disabled here (canSwitchMode + isStudyRoute false) so
		// the user can't jump out of the edit flow via those buttons. This must be
		// checked BEFORE isDocumentRoute, since edit routes also contain '/study/'.
		if (isStudyEditRoute) {
			return {
				...state,
				isStudyRoute: false,
				isGlossaryRoute: false,
				isDashboardRoute: false,
				isStudyGroupRoute: false,
				isStudyEditRoute: true,
				// Disable Edit and Delete while editing: even though the study being
				// edited is auto-selected in the Finder, the user shouldn't be able to
				// re-edit or delete it mid-edit. (On the create page nothing is selected,
				// so these are naturally off — match that here.)
				canEdit: false,
				canDelete: false,
				canFormat: false,
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
				canZoom: false,
				// Menu buttons enabled, but their dropdown items remain disabled
				canStructure: true,
				canHeading: true,
				canColor: true,
				canUseStructureItems: false,
				canUseHeadingItems: false,
				canUseColorItems: false,
				commentaryPanelOpen: false
			};
		}


		// On document/study pages, most tools should be available
		// Note: canEdit and canDelete are controlled by selection state, not route
		if (isDocumentRoute) {
			// Remember which study view the user is in (document vs analyze) so that
			// navigating away (glossary, new study, edit-save redirect, etc.) and back
			// into a study returns them to the same view. isDocumentRoute is ALSO true
			// for the bare /study/[id] pass-through (which has neither suffix) — in that
			// case we must PRESERVE the existing remembered view rather than clobber it,
			// so only record when explicitly on an /analyze or /document view route.
			const newStudyView = isAnalyzeRoute
				? 'analyze'
				: isDocumentView
					? 'document'
					: state.lastStudyView;
			// Persist (fire-and-forget) only when the remembered view actually changes,
			// so it survives hard reloads / cold starts too. No write on the bare-route
			// pass-through or when re-entering the same view.
			if (newStudyView !== state.lastStudyView) {
				persistPreference({ lastStudyView: newStudyView });
			}
			return {
				...state,
				isStudyRoute: true,
				isGlossaryRoute: false,
				isDashboardRoute: false,
				isStudyGroupRoute: false,
				isStudyEditRoute: false,
				// Recompute Edit/Delete from the preserved Finder selection. These can't
				// simply be carried over via `...state`: arriving here after SAVING an edit
				// (e.g. /study/[id]/edit → /study/[id]/analyze, same study id) leaves them
				// stuck at the `false` the edit branch forced, because the study id hasn't
				// changed so the Finder's auto-select effect never re-runs setSelectedItem.
				// Deriving them from the selection here guarantees a still-selected study
				// re-enables Edit/Delete the moment we return to the study view.
				canEdit: state.selectedItem !== null && state.selectedItem.count > 0,
				canDelete: state.selectedItem !== null && state.selectedItem.count > 0,
				lastStudyView: newStudyView,
				canFormat: true,

				canToggleConnections: true,

				canToggleHeadings: true,
				canToggleNotes: true,
				// Comment button = the commentary editor slide-out, which is an ANALYZE-ONLY
				// authoring affordance. Enabled only on the Analyze view; on the Document
				// view the slide-out is always hidden and its button is DISABLED (the
				// read-only document has nothing to author). NOTE: this gates the slide-out
				// button specifically — the Document view's separate "Commentary" toggle
				// (which shows/hides commentary PROSE in the read-only document) lives in
				// the View menu and is gated there on the view, not on this flag.
				canToggleComment: isAnalyzeRoute,

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
				// Commentary is an Analyze-only feature: keep the panel's open state while
				// on the Analyze view, but force it closed on the Document view (where the
				// Comment toggle is also disabled via canToggleComment above). Without this,
				// a panel opened on Analyze would remain visible after switching to Document
				// even though its toggle button is disabled there.
				commentaryPanelOpen: isAnalyzeRoute ? state.commentaryPanelOpen : false
			};
		}


	// On study-group pages, canSwitchMode is controlled by selection state only.
	// The Structure, Markup, Layout, Color, and View menu BUTTONS stay enabled, but
	// every item inside those dropdown menus is disabled (no active document here) —
	// the item-level flags (canUse*Items, hasActive*, canToggle*) are all false.
	if (isStudyGroupRoute) {
		return {
			...state,
			isStudyRoute: false,
			isGlossaryRoute: false,
			isDashboardRoute: false,
			isStudyGroupRoute: true,
			isStudyEditRoute: false,
			canFormat: false,
			canToggleConnections: false,
			canToggleHeadings: false,
			canToggleNotes: false,
			canToggleComment: false,
			canToggleReferences: false,
			canToggleVerses: false,
			canToggleParagraphBreaks: false,
			canToggleWide: false,
			canToggleOverview: false,
			canSwitchMode: false, // Disabled by default, enabled only when studies are selected

			canZoom: false,
			// Menu buttons enabled, but their dropdown items remain disabled
			canStructure: true,
			canHeading: true,
			canColor: true,
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
			isGlossaryRoute: false,
			isDashboardRoute: false,
			isStudyGroupRoute: false,
			isStudyEditRoute: false,
			canFormat: false,
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
 * @param {boolean|number|string|null} value - New value for the property
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
 * Toggle focus mode.
 * Focus hides everything except the selected item(s) and their containers/children,
 * letting the user compare one or more selections side-by-side. Enabled whenever at
 * least one item (or connection) is selected, except when the selection would reveal
 * every segment in the study ("All of them").
 */
export function toggleFocus() {
	toolbarStateStore.update(state => ({
		...state,
		focusMode: !state.focusMode
	}));
}

/**
 * Toggle headings visibility
 */
export function toggleHeadings() {
	const newValue = !get(toolbarStateStore).headingsVisible;
	toolbarStateStore.update(state => ({ ...state, headingsVisible: newValue }));
	persistPreference({ headingsVisible: newValue });
}

/**
 * Ensure headings are visible. Used when the user adds a heading so the new
 * heading is immediately visible. No-op if headings are already shown.
 * Persists the preference.
 */
export function showHeadings() {
	const state = get(toolbarStateStore);
	if (state.headingsVisible) return;
	toolbarStateStore.update(s => ({ ...s, headingsVisible: true }));
	persistPreference({ headingsVisible: true });
}

/**
 * Toggle all connections visibility (master toggle).
 * When turning off: unchecks all three individual types.
 * When turning on: checks all three individual types.
 * connectionsVisible is true only when ALL three individual types are on.
 */
export function toggleConnections() {
	const newValue = !get(toolbarStateStore).connectionsVisible;
	toolbarStateStore.update(state => ({
		...state,
		connectionsVisible: newValue,
		columnConnectionsVisible: newValue,
		sectionConnectionsVisible: newValue,
		segmentConnectionsVisible: newValue,
		crossItemConnectionsVisible: newValue
	}));
	persistPreference({
		connectionsVisible: newValue,
		columnConnectionsVisible: newValue,
		sectionConnectionsVisible: newValue,
		segmentConnectionsVisible: newValue,
		crossItemConnectionsVisible: newValue
	});
}

/**
 * Toggle column connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleColumnConnections() {
	const state = get(toolbarStateStore);
	const newCol = !state.columnConnectionsVisible;
	const newConnectionsVisible = newCol && state.sectionConnectionsVisible && state.segmentConnectionsVisible && state.crossItemConnectionsVisible;
	toolbarStateStore.update(s => ({
		...s,
		columnConnectionsVisible: newCol,
		connectionsVisible: newConnectionsVisible
	}));
	persistPreference({ columnConnectionsVisible: newCol, connectionsVisible: newConnectionsVisible });
}

/**
 * Toggle section connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleSectionConnections() {
	const state = get(toolbarStateStore);
	const newSec = !state.sectionConnectionsVisible;
	const newConnectionsVisible = state.columnConnectionsVisible && newSec && state.segmentConnectionsVisible && state.crossItemConnectionsVisible;
	toolbarStateStore.update(s => ({
		...s,
		sectionConnectionsVisible: newSec,
		connectionsVisible: newConnectionsVisible
	}));
	persistPreference({ sectionConnectionsVisible: newSec, connectionsVisible: newConnectionsVisible });
}

/**
 * Toggle segment connections visibility.
 * Auto-updates the master connectionsVisible based on whether all three are now on.
 */
export function toggleSegmentConnections() {
	const state = get(toolbarStateStore);
	const newSeg = !state.segmentConnectionsVisible;
	const newConnectionsVisible = state.columnConnectionsVisible && state.sectionConnectionsVisible && newSeg && state.crossItemConnectionsVisible;
	toolbarStateStore.update(s => ({
		...s,
		segmentConnectionsVisible: newSeg,
		connectionsVisible: newConnectionsVisible
	}));
	persistPreference({ segmentConnectionsVisible: newSeg, connectionsVisible: newConnectionsVisible });
}

/**
 * Toggle cross-item connections visibility (connections between items of a
 * different kind, e.g. Column↔Segment). These render with the dash-dot line style.
 * Auto-updates the master connectionsVisible based on whether all four are now on.
 */
export function toggleCrossItemConnections() {
	const state = get(toolbarStateStore);
	const newCross = !state.crossItemConnectionsVisible;
	const newConnectionsVisible = state.columnConnectionsVisible && state.sectionConnectionsVisible && state.segmentConnectionsVisible && newCross;
	toolbarStateStore.update(s => ({
		...s,
		crossItemConnectionsVisible: newCross,
		connectionsVisible: newConnectionsVisible
	}));
	persistPreference({ crossItemConnectionsVisible: newCross, connectionsVisible: newConnectionsVisible });
}

/**
 * Toggle all quick notes visibility (master toggle).
 * When turning off: hides both passage and connection notes.
 * When turning on: shows both passage and connection notes.
 * notesVisible is true only when BOTH individual types are on.
 */
export function toggleNotes() {
	const newValue = !get(toolbarStateStore).notesVisible;
	toolbarStateStore.update(state => ({
		...state,
		notesVisible: newValue,
		passageNotesVisible: newValue,
		connectionNotesVisible: newValue
	}));
	persistPreference({
		notesVisible: newValue,
		passageNotesVisible: newValue,
		connectionNotesVisible: newValue
	});
}

/**
 * Toggle passage (inline segment) quick notes visibility.
 * Auto-updates the master notesVisible based on whether both types are now on.
 */
export function togglePassageNotes() {
	const state = get(toolbarStateStore);
	const newPassage = !state.passageNotesVisible;
	const newNotesVisible = newPassage && state.connectionNotesVisible;
	toolbarStateStore.update(s => ({
		...s,
		passageNotesVisible: newPassage,
		notesVisible: newNotesVisible
	}));
	persistPreference({ passageNotesVisible: newPassage, notesVisible: newNotesVisible });
}

/**
 * Toggle connection quick notes visibility.
 * Auto-updates the master notesVisible based on whether both types are now on.
 */
export function toggleConnectionNotes() {
	const state = get(toolbarStateStore);
	const newConnection = !state.connectionNotesVisible;
	const newNotesVisible = state.passageNotesVisible && newConnection;
	toolbarStateStore.update(s => ({
		...s,
		connectionNotesVisible: newConnection,
		notesVisible: newNotesVisible
	}));
	persistPreference({ connectionNotesVisible: newConnection, notesVisible: newNotesVisible });
}

/**
 * Ensure passage (inline segment) quick notes are visible.
 * Used when the user adds a passage quick note so the new note is immediately
 * visible. No-op if they are already shown. Recomputes the master notesVisible
 * (true only when both passage and connection notes are on) and persists.
 */
export function showPassageNotes() {
	const state = get(toolbarStateStore);
	if (state.passageNotesVisible) return;
	const newNotesVisible = state.connectionNotesVisible; // passage now true
	toolbarStateStore.update(s => ({
		...s,
		passageNotesVisible: true,
		notesVisible: newNotesVisible
	}));
	persistPreference({ passageNotesVisible: true, notesVisible: newNotesVisible });
}

/**
 * Ensure connection quick notes are visible.
 * Used when the user adds a connection quick note so the new note is immediately
 * visible. No-op if they are already shown. Recomputes the master notesVisible
 * (true only when both passage and connection notes are on) and persists.
 */
export function showConnectionNotes() {
	const state = get(toolbarStateStore);
	if (state.connectionNotesVisible) return;
	const newNotesVisible = state.passageNotesVisible; // connection now true
	toolbarStateStore.update(s => ({
		...s,
		connectionNotesVisible: true,
		notesVisible: newNotesVisible
	}));
	persistPreference({ connectionNotesVisible: true, notesVisible: newNotesVisible });
}

/**
 * Ensure the connection-visibility toggle for a connection of the given from/to
 * types is on. Used when the user adds a connection (or a connection quick note)
 * so the new connection is immediately visible. Mirrors the type→toggle mapping
 * used to render connections:
 *   - different types (cross-item) → crossItemConnectionsVisible
 *   - section ↔ section            → sectionConnectionsVisible
 *   - column ↔ column              → columnConnectionsVisible
 *   - segment ↔ segment            → segmentConnectionsVisible
 * No-op if the relevant toggle is already on. Recomputes the master
 * connectionsVisible (true only when all four are on) and persists.
 * @param {string} fromType - 'segment' | 'section' | 'column'
 * @param {string} toType - 'segment' | 'section' | 'column'
 */
export function showConnectionsForTypes(fromType, toType) {
	// Determine which individual toggle governs this connection's visibility.
	/** @type {'segmentConnectionsVisible'|'sectionConnectionsVisible'|'columnConnectionsVisible'|'crossItemConnectionsVisible'} */
	let key;
	if (fromType !== toType) {
		key = 'crossItemConnectionsVisible';
	} else if (fromType === 'section') {
		key = 'sectionConnectionsVisible';
	} else if (fromType === 'column') {
		key = 'columnConnectionsVisible';
	} else {
		key = 'segmentConnectionsVisible';
	}

	const state = get(toolbarStateStore);
	if (state[key]) return; // already visible

	// Recompute the master toggle (true only when all four individual types are on).
	const next = { ...state, [key]: true };
	const newConnectionsVisible =
		next.columnConnectionsVisible &&
		next.sectionConnectionsVisible &&
		next.segmentConnectionsVisible &&
		next.crossItemConnectionsVisible;

	toolbarStateStore.update(s => ({
		...s,
		[key]: true,
		connectionsVisible: newConnectionsVisible
	}));
	persistPreference({ [key]: true, connectionsVisible: newConnectionsVisible });
}

/**
 * Toggle references visibility
 */
export function toggleReferences() {


	const newValue = !get(toolbarStateStore).referencesVisible;
	toolbarStateStore.update(state => ({ ...state, referencesVisible: newValue }));
	persistPreference({ referencesVisible: newValue });
}

/**
 * Toggle verses visibility
 */
export function toggleVerses() {
	const newValue = !get(toolbarStateStore).versesVisible;
	toolbarStateStore.update(state => ({ ...state, versesVisible: newValue }));
	persistPreference({ versesVisible: newValue });
}

/**
 * Toggle paragraph breaks visibility
 */
export function toggleParagraphBreaks() {
	const newValue = !get(toolbarStateStore).paragraphBreaksVisible;
	toolbarStateStore.update(state => ({ ...state, paragraphBreaksVisible: newValue }));
	persistPreference({ paragraphBreaksVisible: newValue });
}

/**
 * Toggle wide layout
 */
export function toggleWide() {
	const newValue = !get(toolbarStateStore).wideLayout;
	toolbarStateStore.update(state => ({ ...state, wideLayout: newValue }));
	persistPreference({ wideLayout: newValue });
}

/**
 * Toggle overview mode.
 * Automatically closes the commentary panel and forces headings visible when enabling.
 * Persists all affected preferences to the database.
 */
export function toggleOverview() {
	const state = get(toolbarStateStore);
	const newOverviewMode = !state.overviewMode;
	const shouldCloseCommentary = newOverviewMode && state.commentaryPanelOpen;
	const newHeadingsVisible = newOverviewMode ? true : state.headingsVisible;

	toolbarStateStore.update(s => ({
		...s,
		overviewMode: newOverviewMode,
		commentaryPanelOpen: shouldCloseCommentary ? false : s.commentaryPanelOpen,
		headingsVisible: newHeadingsVisible
	}));

	// Persist all values that may have changed
	const updates = { overviewMode: newOverviewMode };
	if (shouldCloseCommentary) updates.commentaryPanelOpen = false;
	if (newOverviewMode) updates.headingsVisible = true;
	persistPreference(updates);
}

/**
 * Toggle the Column/Section selector buttons.
 * When on, the structural selector buttons are shown in the Analyze view without
 * requiring the Command/Ctrl key to be held. Replaces the prior behaviour where the
 * selectors were only revealed while Command/Ctrl was pressed (the key still works
 * for adding to / removing from a multi-selection).
 */
export function toggleSelectors() {
	const newValue = !get(toolbarStateStore).selectorsVisible;
	toolbarStateStore.update(state => ({ ...state, selectorsVisible: newValue }));
	persistPreference({ selectorsVisible: newValue });
}

/**
 * Toggle the Column/Section/Segment layout handles.
 * When on, the layout reposition/resize handles are shown in the Analyze view
 * without requiring the user to hover over them. When off, they revert to the
 * prior behaviour of appearing only on hover.
 */
export function toggleLayoutControls() {
	const newValue = !get(toolbarStateStore).layoutControlsVisible;
	toolbarStateStore.update(state => ({ ...state, layoutControlsVisible: newValue }));
	persistPreference({ layoutControlsVisible: newValue });
}

/**
 * Toggle the passage dividers.
 * When on (the default), the vertical divider line between adjacent passages is
 * drawn and the cross-passage gap is double width (a gap slot on each side of the
 * divider). When off, the divider is hidden and the gap collapses to single width.
 */
export function togglePassageDividers() {
	const newValue = !get(toolbarStateStore).passageDividersVisible;
	toolbarStateStore.update(state => ({ ...state, passageDividersVisible: newValue }));
	persistPreference({ passageDividersVisible: newValue });
}

/* ============================================================
   DOCUMENT-VIEW TOGGLES
   ------------------------------------------------------------
   The Document view has its OWN copy of the visibility toggles (the document*
   fields), independent of the Analyze toggles, so changing a toggle on one view
   never affects the other. Each function mirrors its Analyze counterpart above but
   reads/writes the document* field and persists the matching document_* column.
   The MenuView component is view-aware and calls these (instead of the Analyze
   functions) when it is rendered for the Document view.
   ============================================================ */

/** Toggle headings visibility (Document view). */
export function toggleDocumentHeadings() {
	const newValue = !get(toolbarStateStore).documentHeadingsVisible;
	toolbarStateStore.update(state => ({ ...state, documentHeadingsVisible: newValue }));
	persistPreference({ documentHeadingsVisible: newValue });
}

/** Toggle verse notations visibility (Document view). */
export function toggleDocumentVerses() {
	const newValue = !get(toolbarStateStore).documentVersesVisible;
	toolbarStateStore.update(state => ({ ...state, documentVersesVisible: newValue }));
	persistPreference({ documentVersesVisible: newValue });
}

/** Toggle paragraph break markers visibility (Document view). */
export function toggleDocumentParagraphBreaks() {
	const newValue = !get(toolbarStateStore).documentParagraphBreaksVisible;
	toolbarStateStore.update(state => ({ ...state, documentParagraphBreaksVisible: newValue }));
	persistPreference({ documentParagraphBreaksVisible: newValue });
}

/**
 * Toggle whether the commentaries are shown IN the document (Document view).
 * This controls the commentary PROSE rendered inline within the document page —
 * NOT the Analyze view's commentary editor slide-out panel (that is the separate
 * commentaryPanelOpen state, which has no meaning on the read-only Document page).
 */
export function toggleDocumentCommentaries() {
	const newValue = !get(toolbarStateStore).documentCommentariesVisible;
	toolbarStateStore.update(state => ({ ...state, documentCommentariesVisible: newValue }));
	persistPreference({ documentCommentariesVisible: newValue });
}

/**
 * Toggle all connections visibility (Document view master toggle).
 * Mirrors toggleConnections but on the document* fields.
 */
export function toggleDocumentConnections() {
	const newValue = !get(toolbarStateStore).documentConnectionsVisible;
	toolbarStateStore.update(state => ({
		...state,
		documentConnectionsVisible: newValue,
		documentColumnConnectionsVisible: newValue,
		documentSectionConnectionsVisible: newValue,
		documentSegmentConnectionsVisible: newValue,
		documentCrossItemConnectionsVisible: newValue
	}));
	persistPreference({
		documentConnectionsVisible: newValue,
		documentColumnConnectionsVisible: newValue,
		documentSectionConnectionsVisible: newValue,
		documentSegmentConnectionsVisible: newValue,
		documentCrossItemConnectionsVisible: newValue
	});
}

/** Toggle column connections visibility (Document view). */
export function toggleDocumentColumnConnections() {
	const state = get(toolbarStateStore);
	const newCol = !state.documentColumnConnectionsVisible;
	const newAll = newCol && state.documentSectionConnectionsVisible && state.documentSegmentConnectionsVisible && state.documentCrossItemConnectionsVisible;
	toolbarStateStore.update(s => ({ ...s, documentColumnConnectionsVisible: newCol, documentConnectionsVisible: newAll }));
	persistPreference({ documentColumnConnectionsVisible: newCol, documentConnectionsVisible: newAll });
}

/** Toggle section connections visibility (Document view). */
export function toggleDocumentSectionConnections() {
	const state = get(toolbarStateStore);
	const newSec = !state.documentSectionConnectionsVisible;
	const newAll = state.documentColumnConnectionsVisible && newSec && state.documentSegmentConnectionsVisible && state.documentCrossItemConnectionsVisible;
	toolbarStateStore.update(s => ({ ...s, documentSectionConnectionsVisible: newSec, documentConnectionsVisible: newAll }));
	persistPreference({ documentSectionConnectionsVisible: newSec, documentConnectionsVisible: newAll });
}

/** Toggle segment connections visibility (Document view). */
export function toggleDocumentSegmentConnections() {
	const state = get(toolbarStateStore);
	const newSeg = !state.documentSegmentConnectionsVisible;
	const newAll = state.documentColumnConnectionsVisible && state.documentSectionConnectionsVisible && newSeg && state.documentCrossItemConnectionsVisible;
	toolbarStateStore.update(s => ({ ...s, documentSegmentConnectionsVisible: newSeg, documentConnectionsVisible: newAll }));
	persistPreference({ documentSegmentConnectionsVisible: newSeg, documentConnectionsVisible: newAll });
}

/** Toggle cross-item connections visibility (Document view). */
export function toggleDocumentCrossItemConnections() {
	const state = get(toolbarStateStore);
	const newCross = !state.documentCrossItemConnectionsVisible;
	const newAll = state.documentColumnConnectionsVisible && state.documentSectionConnectionsVisible && state.documentSegmentConnectionsVisible && newCross;
	toolbarStateStore.update(s => ({ ...s, documentCrossItemConnectionsVisible: newCross, documentConnectionsVisible: newAll }));
	persistPreference({ documentCrossItemConnectionsVisible: newCross, documentConnectionsVisible: newAll });
}

/** Toggle all quick notes visibility (Document view master toggle). */
export function toggleDocumentNotes() {
	const newValue = !get(toolbarStateStore).documentNotesVisible;
	toolbarStateStore.update(state => ({
		...state,
		documentNotesVisible: newValue,
		documentPassageNotesVisible: newValue,
		documentConnectionNotesVisible: newValue
	}));
	persistPreference({
		documentNotesVisible: newValue,
		documentPassageNotesVisible: newValue,
		documentConnectionNotesVisible: newValue
	});
}

/** Toggle passage (text) quick notes visibility (Document view). */
export function toggleDocumentPassageNotes() {
	const state = get(toolbarStateStore);
	const newPassage = !state.documentPassageNotesVisible;
	const newAll = newPassage && state.documentConnectionNotesVisible;
	toolbarStateStore.update(s => ({ ...s, documentPassageNotesVisible: newPassage, documentNotesVisible: newAll }));
	persistPreference({ documentPassageNotesVisible: newPassage, documentNotesVisible: newAll });
}

/** Toggle connection quick notes visibility (Document view). */
export function toggleDocumentConnectionNotes() {
	const state = get(toolbarStateStore);
	const newConnection = !state.documentConnectionNotesVisible;
	const newAll = state.documentPassageNotesVisible && newConnection;
	toolbarStateStore.update(s => ({ ...s, documentConnectionNotesVisible: newConnection, documentNotesVisible: newAll }));
	persistPreference({ documentConnectionNotesVisible: newConnection, documentNotesVisible: newAll });
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
 * Set the zoom level for a specific view (also resets that view's zoomMode to
 * 'percentage'). The Analyze and Document views keep INDEPENDENT zoom, so the caller
 * must say which view is being zoomed; only that view's level/mode pair is written and
 * persisted (fire-and-forget) so it survives reloads.
 * @param {number} level - Zoom level as percentage (25-400)
 * @param {'analyze'|'document'} view - Which view's zoom to set
 */
export function setZoomLevel(level, view) {
	const levelKey = view === 'document' ? 'documentZoomLevel' : 'analyzeZoomLevel';
	const modeKey = view === 'document' ? 'documentZoomMode' : 'analyzeZoomMode';
	toolbarStateStore.update(state => ({
		...state,
		[levelKey]: level,
		[modeKey]: 'percentage'
	}));
	persistPreference({ [levelKey]: level, [modeKey]: 'percentage' });
}

/**
 * Set the zoom mode for a specific view without changing its numeric zoom level.
 * Only the given view's mode is written and persisted, keeping Analyze and Document
 * zoom independent.
 * @param {'percentage'|'fit-width'|'fit-study'} mode - The zoom mode to activate
 * @param {'analyze'|'document'} view - Which view's zoom mode to set
 */
export function setZoomMode(mode, view) {
	const modeKey = view === 'document' ? 'documentZoomMode' : 'analyzeZoomMode';
	toolbarStateStore.update(state => ({
		...state,
		[modeKey]: mode
	}));
	persistPreference({ [modeKey]: mode });
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
		// On the study edit/review route, Edit, Delete, and the mode switcher must stay
		// disabled even though the study being edited is auto-selected in the Finder —
		// otherwise selecting it would let the user re-edit/delete or jump out mid-edit.
		canEdit: !state.isStudyEditRoute && selection !== null && selection.count > 0,
		canDelete: !state.isStudyEditRoute && selection !== null && selection.count > 0,
		// Enabled if a study is selected OR if a study route is currently active.
		canSwitchMode: !state.isStudyEditRoute && (state.isStudyRoute || (selection !== null && selection.hasStudies))
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
 * @param {boolean} [options.isFirst] - Whether the segment is the first segment in its passage
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
		isActiveSegmentFirstInPassage: hasSegment ? (options?.isFirst || false) : false,
		// Deselect any connection when a segment becomes active
		hasActiveConnection: hasSegment ? false : state.hasActiveConnection,
		activeConnectionIds: hasSegment ? [] : state.activeConnectionIds,
		// Deselect any heading when a segment becomes active
		hasActiveHeading: hasSegment ? false : state.hasActiveHeading,
		activeHeadingId: hasSegment ? null : state.activeHeadingId
	}));
}


/**
 * Set the parent-section IDs of ALL currently selected segments (deduped), for Color.
 *
 * This is intentionally SEPARATE from setActiveSegment because that setter is only
 * called in pure-segment mode (and is also called by the heading/note editors, which
 * don't know the selection's section IDs). In a MIXED multi-select — segments selected
 * alongside columns and/or other sections — the gated `hasActiveSegment` effect takes
 * its else-branch and would otherwise clear this, so Color couldn't recolor the sections
 * containing the selected segments. The analyze page keeps this current via a dedicated,
 * always-on effect over `activeSegments`.
 * @param {string[]} sectionIds - The deduped parent-section IDs of the selected segments
 */
export function setActiveSegmentSectionIds(sectionIds = []) {
	toolbarStateStore.update(state => ({
		...state,
		activeSegmentSectionIds: sectionIds
	}));
}

/**
 * Set segment-height link/unlink availability based on the current segment selection.
 * Driven by the analyze page's selection effect.
 * @param {number} count - Number of segments currently selected
 * @param {boolean} canLink - Whether linking the selection's heights is available (2+ segments not already all linked together)
 * @param {boolean} canUnlink - Whether unlinking is available (selection includes a linked segment)
 */
export function setSegmentHeightLinkState(count, canLink, canUnlink) {
	toolbarStateStore.update(state => ({
		...state,
		activeSegmentCount: count,
		canLinkSegmentHeight: canLink,
		canUnlinkSegmentHeight: canUnlink
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
 * @param {boolean} isFirst - Whether the active column is the first column in its passage
 * @param {string[]} [columnIds] - The IDs of ALL currently selected columns (for multi-select Color)
 */
export function setActiveColumn(hasColumn, columnId = null, isFirst = false, columnIds = []) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveColumn: hasColumn,
		activeColumnId: columnId,
		activeColumnIds: hasColumn ? columnIds : [],
		isActiveColumnFirstInPassage: hasColumn ? isFirst : false,
		// Deselect any heading when a column becomes active
		hasActiveHeading: hasColumn ? false : state.hasActiveHeading,
		activeHeadingId: hasColumn ? null : state.activeHeadingId
	}));
}


/**
 * Set active section state
 * @param {boolean} hasSection - Whether a section is currently active
 * @param {string|null} sectionId - The ID of the active section (optional)
 * @param {boolean} isFirst - Whether the active section is the first section in its passage
 * @param {string[]} [sectionIds] - The IDs of ALL explicitly-selected sections (for multi-select Color)
 */
export function setActiveSection(hasSection, sectionId = null, isFirst = false, sectionIds = []) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveSection: hasSection,
		activeSectionId: sectionId,
		activeSectionIds: hasSection ? sectionIds : [],
		isActiveSectionFirstInPassage: hasSection ? isFirst : false
	}));
}

/**
 * Set whether the current selection can enter Focus mode (enables the Focus button).
 * Focus is enabled whenever the user has a "focusable" selection — at least one item
 * (or connection) selected, but NOT a selection that would reveal every segment in the
 * study ("All of them"). The analyze page computes this and passes it in. The button
 * also stays enabled while focus mode is already active so the user can toggle it off.
 * @param {boolean} isFocusable - Whether the current selection can enter focus mode
 */
export function setFocusEnabled(isFocusable) {
	toolbarStateStore.update(state => ({
		...state,
		// Keep Focus button enabled if: the selection is focusable, or focus mode is already active
		canToggleFocus: isFocusable || state.focusMode
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
 * heading or note. Also tracks which type is active so only that one is deleted, and
 * (optionally) a unique editor key identifying the specific owning editor instance.
 * @param {boolean} isActive - Whether a heading/note editor is in edit mode
 * @param {string|null} type - Which type is active: 'one', 'two', 'three', 'note', 'connection-note', or null
 * @param {string|null} [key] - Unique key for the specific editor instance (e.g. `${segmentId}-${type}`)
 */
export function setHeadingOrNoteEditorActive(isActive, type = null, key = null) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveHeadingOrNoteEditor: isActive,
		activeHeadingOrNoteType: isActive ? type : null,
		activeHeadingOrNoteEditorKey: isActive ? key : null
	}));
}

/**
 * Clear the active heading/note editor state, but ONLY if the currently-active
 * editor key matches the one being cleared.
 *
 * The three HeadingEditors (one/two/three) and the NoteEditor (in every segment), plus
 * the connection-note editor, all write to the same shared `hasActiveHeadingOrNoteEditor`
 * fields. Each editor's effect-cleanup would otherwise reset those fields to false/null.
 * When focus moves from one editor to another, Svelte flushes the effects, so a stale
 * editor's cleanup (running after the newly-activated editor set its state) could clobber
 * the fresh active state — leaving the Delete button disabled until the user clicks out
 * and back in. This is visible both when switching between different heading types AND
 * when rapidly adding the SAME heading type across multiple segments (where a type-only
 * guard isn't unique enough). Scoping the clear to the unique editor KEY ensures a stale
 * editor can only clear the store if it still owns the active editor.
 * @param {string|null} key - The unique editor key whose state should be cleared
 */
export function clearHeadingOrNoteEditorActiveKey(key) {
	toolbarStateStore.update(state => {
		if (state.activeHeadingOrNoteEditorKey !== key) return state;
		return {
			...state,
			hasActiveHeadingOrNoteEditor: false,
			activeHeadingOrNoteType: null,
			activeHeadingOrNoteEditorKey: null
		};
	});
}



/**
 * Set the active heading (a passage_heading row selected via its hover select
 * button, for attaching commentary). Selecting a heading clears the active
 * segment/section/column/connection so the commentary panel switches context to
 * the heading. Passing `false` clears the heading selection.
 * @param {boolean} hasHeading - Whether a heading is currently selected
 * @param {string|null} headingId - The ID of the selected passage_heading row
 */
export function setActiveHeading(hasHeading, headingId = null) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveHeading: hasHeading,
		activeHeadingId: hasHeading ? headingId : null,
		// A heading is its own commentary subject — clear the other subjects so the
		// panel's priority resolution lands on the heading.
		hasActiveSegment: hasHeading ? false : state.hasActiveSegment,
		activeSegmentId: hasHeading ? null : state.activeSegmentId,
		hasActiveSection: hasHeading ? false : state.hasActiveSection,
		activeSectionId: hasHeading ? null : state.activeSectionId,
		hasActiveColumn: hasHeading ? false : state.hasActiveColumn,
		activeColumnId: hasHeading ? null : state.activeColumnId,
		hasActiveConnection: hasHeading ? false : state.hasActiveConnection,
		activeConnectionIds: hasHeading ? [] : state.activeConnectionIds
	}));
}

/**
 * Set whether the selected word is in the first or last segment of its passage.
 * Used to disable "Move Text Up" when in the first segment and
 * "Move Text Down" when in the last segment.
 * @param {boolean} isFirst - Whether the word is in the first segment
 * @param {boolean} isLast - Whether the word is in the last segment
 */
export function setWordSegmentPosition(isFirst, isLast) {

	toolbarStateStore.update(state => ({
		...state,
		isWordInFirstSegment: isFirst,
		isWordInLastSegment: isLast
	}));
}

/**
 * Set whether the caret is at the start or end of its segment.
 * Used to disable "Move Text Up" when the caret is before the first word of the segment
 * (nothing to move up) and "Move Text Down" when the caret is after the last word
 * (nothing to move down).
 * @param {boolean} atStart - Whether the caret is before the segment's first word
 * @param {boolean} atEnd - Whether the caret is after the segment's last word
 */
export function setCaretSegmentBoundary(atStart, atEnd) {
	toolbarStateStore.update(state => ({
		...state,
		isCaretAtSegmentStart: atStart,
		isCaretAtSegmentEnd: atEnd
	}));
}

/**
 * Set the active connection(s) (selected connection lines).
 * Clears the active segment so the commentary panel switches context.
 *
 * Note: this intentionally does NOT touch `canToggleFocus`. Focus enablement is owned
 * entirely by the `setFocusEnabled` effect on the analyze page (driven by the
 * `isFocusableSelection` derived, which already accounts for selected connections). If
 * this function also wrote `canToggleFocus`, it would clobber that flag every time a
 * structural item is (de)selected — breaking Focus for multi-item / mixed-type
 * selections where `isFocusableSelection` stays `true` and the effect doesn't re-run.
 * @param {boolean} hasConnection - Whether one or more connections are currently selected
 * @param {string[]} connectionIds - The IDs of the selected connections
 * @param {boolean} [hasNote] - Whether the selected connection(s) have a quick note (single-select gate for "Connection Quick Note")
 * @param {number} [noteCount] - How many of the selected connections have a quick note (drives multi-select note-placement actions)
 */
export function setActiveConnection(hasConnection, connectionIds = [], hasNote = false, noteCount = 0) {
	toolbarStateStore.update(state => ({
		...state,
		hasActiveConnection: hasConnection,
		activeConnectionIds: connectionIds,
		activeConnectionHasNote: hasConnection ? hasNote : false,
		activeConnectionNoteCount: hasConnection ? noteCount : 0,
		// Deselect segment when a connection is selected, and vice versa
		hasActiveSegment: hasConnection ? false : state.hasActiveSegment,
		activeSegmentId: hasConnection ? null : state.activeSegmentId,
		// Deselect any heading when a connection is selected
		hasActiveHeading: hasConnection ? false : state.hasActiveHeading,
		activeHeadingId: hasConnection ? null : state.activeHeadingId
	}));
}

