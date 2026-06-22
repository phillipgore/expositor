<script>
	/**
	 * MenuView Component
	 *
	 * View overlay toggles for controlling which annotations and overlays are visible
	 * on the passage, as well as text display options and layout modes. Provides
	 * persistent toggle items that keep the menu open so the user can enable or
	 * disable multiple options in a single session.
	 *
	 * VIEW-AWARE: the same menu serves both the Analyze and Document views, but each
	 * view keeps its OWN visibility settings (see the document* fields in the toolbar
	 * store). The `view` prop selects which set of state + toggle functions this menu
	 * reads/writes:
	 *  - 'analyze'  → the Analyze toggles (headingsVisible, versesVisible, …)
	 *  - 'document' → the Document toggles (documentHeadingsVisible, …)
	 *
	 * The menu always renders the SAME set of items in both views — items that aren't
	 * meaningful in the current view are DISABLED, not hidden, so the menu's shape stays
	 * stable as the user switches modes (a toggle never disappears from under the
	 * cursor). The Analyze-only items (Passage Dividers, References, Wide View, Outline
	 * View, Selection Controls, Layout Controls) are disabled when view === 'document';
	 * the Document-only "Commentary" toggle — which shows/hides the commentary PROSE
	 * rendered inline in the document, NOT the Analyze commentary editor slide-out — is
	 * disabled when view === 'analyze'.


	 *
	 * Order flows from what is printed on the text → annotations layered on top →
	 * how the whole view is laid out.
	 *
	 * Usage:
	 * ```svelte
	 * <MenuView menuId="MenuView" view={activeModeButton} />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuView') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view's toggles to drive
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import MenuToggleItem from '$lib/componentElements/buttons/MenuToggleItem.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import {
		toolbarState,
		toggleHeadings,
		toggleNotes,
		togglePassageNotes,
		toggleConnectionNotes,
		toggleConnections,
		toggleColumnConnections,
		toggleSectionConnections,
		toggleSegmentConnections,
		toggleCrossItemConnections,
		toggleReferences,
		toggleVerses,
		toggleParagraphBreaks,
		toggleWide,
		toggleOverview,
		togglePassageDividers,
		toggleSelectors,
		toggleLayoutControls,
		toggleDocumentHeadings,
		toggleDocumentNotes,
		toggleDocumentPassageNotes,
		toggleDocumentConnectionNotes,
		toggleDocumentConnections,
		toggleDocumentColumnConnections,
		toggleDocumentSectionConnections,
		toggleDocumentSegmentConnections,
		toggleDocumentCrossItemConnections,
		toggleDocumentVerses,
		toggleDocumentParagraphBreaks,
		toggleDocumentCommentaries
	} from '$lib/stores/toolbar.js';

	let { menuId = 'MenuView', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');

	// Resolve the active state field + toggle function for each item based on `view`.
	// Document items read/write the document* fields; Analyze items use the originals.
	// Built as a derived map so the menu re-resolves when the view switches.
	let cfg = $derived(
		isDocument
			? {
					headings: { active: $toolbarState.documentHeadingsVisible, toggle: toggleDocumentHeadings },
					verses: { active: $toolbarState.documentVersesVisible, toggle: toggleDocumentVerses },
					paragraphs: { active: $toolbarState.documentParagraphBreaksVisible, toggle: toggleDocumentParagraphBreaks },
					allConnections: { active: $toolbarState.documentConnectionsVisible, toggle: toggleDocumentConnections },
					columnConnections: { active: $toolbarState.documentColumnConnectionsVisible, toggle: toggleDocumentColumnConnections },
					sectionConnections: { active: $toolbarState.documentSectionConnectionsVisible, toggle: toggleDocumentSectionConnections },
					segmentConnections: { active: $toolbarState.documentSegmentConnectionsVisible, toggle: toggleDocumentSegmentConnections },
					crossItemConnections: { active: $toolbarState.documentCrossItemConnectionsVisible, toggle: toggleDocumentCrossItemConnections },
					allNotes: { active: $toolbarState.documentNotesVisible, toggle: toggleDocumentNotes },
					passageNotes: { active: $toolbarState.documentPassageNotesVisible, toggle: toggleDocumentPassageNotes },
					connectionNotes: { active: $toolbarState.documentConnectionNotesVisible, toggle: toggleDocumentConnectionNotes },
					commentaries: { active: $toolbarState.documentCommentariesVisible, toggle: toggleDocumentCommentaries }
				}
			: {
					headings: { active: $toolbarState.headingsVisible, toggle: toggleHeadings },
					verses: { active: $toolbarState.versesVisible, toggle: toggleVerses },
					paragraphs: { active: $toolbarState.paragraphBreaksVisible, toggle: toggleParagraphBreaks },
					allConnections: { active: $toolbarState.connectionsVisible, toggle: toggleConnections },
					columnConnections: { active: $toolbarState.columnConnectionsVisible, toggle: toggleColumnConnections },
					sectionConnections: { active: $toolbarState.sectionConnectionsVisible, toggle: toggleSectionConnections },
					segmentConnections: { active: $toolbarState.segmentConnectionsVisible, toggle: toggleSegmentConnections },
					crossItemConnections: { active: $toolbarState.crossItemConnectionsVisible, toggle: toggleCrossItemConnections },
					allNotes: { active: $toolbarState.notesVisible, toggle: toggleNotes },
					passageNotes: { active: $toolbarState.passageNotesVisible, toggle: togglePassageNotes },
					connectionNotes: { active: $toolbarState.connectionNotesVisible, toggle: toggleConnectionNotes },
					commentaries: { active: false, toggle: () => {} }
				}
	);

	// Connections/verses/headings disabling: on Analyze these depend on overviewMode;
	// the Document view has no overview mode, so they are only gated by capability.
	let headingsDisabled = $derived(!$toolbarState.canToggleHeadings || (!isDocument && $toolbarState.overviewMode));
	let versesDisabled = $derived(!$toolbarState.canToggleVerses || (!isDocument && $toolbarState.overviewMode));
	let paragraphsDisabled = $derived(!$toolbarState.canToggleParagraphBreaks || (!isDocument && $toolbarState.overviewMode));
	// In the Document view connections are no longer toggleable from here — they render
	// in a fixed appendix at the END of the study — so the five connection items (All /
	// Column / Section / Segment / Cross-Item) are DISABLED there. In Analyze they keep
	// their capability + overview-mode gating.
	let connectionsDisabled = $derived(isDocument || !$toolbarState.canToggleConnections || (!isDocument && $toolbarState.overviewMode));

	let notesDisabled = $derived(!$toolbarState.canToggleNotes);

	// View-specific items are always RENDERED but DISABLED when they don't apply to the
	// active view, so the menu keeps a stable shape across mode switches. Analyze-only
	// items are disabled in the Document view; the Document-only Commentaries item is
	// disabled in the Analyze view. Each also respects its own capability flag.
	let passageDividersDisabled = $derived(isDocument || !$toolbarState.canTogglePassageDividers);
	let referencesDisabled = $derived(isDocument || !$toolbarState.canToggleReferences);
	// The Document-only "Commentary" toggle shows/hides commentary PROSE in the
	// read-only document. It is meaningful ONLY in the Document view, so it's enabled
	// there and disabled in Analyze. Deliberately NOT gated on canToggleComment — that
	// flag governs the separate commentary-editor SLIDE-OUT button (Analyze-only), which
	// is a different control entirely.
	let commentaryDisabled = $derived(!isDocument);

	let wideDisabled = $derived(isDocument || !$toolbarState.canToggleWide);
	let overviewDisabled = $derived(isDocument || !$toolbarState.canToggleOverview);
	let selectorsDisabled = $derived(
		isDocument || !$toolbarState.canToggleOverview || $toolbarState.overviewMode
	);
	let layoutControlsDisabled = $derived(
		isDocument || !$toolbarState.canToggleOverview || $toolbarState.overviewMode
	);
</script>


<Menu {menuId} ariaLabel="View options">
	<MenuToggleItem
		label="Headings"
		isActive={cfg.headings.active}
		onToggle={cfg.headings.toggle}
		isDisabled={headingsDisabled}
	/>
	<MenuToggleItem
		label="Passage Dividers"
		isActive={$toolbarState.passageDividersVisible}
		onToggle={togglePassageDividers}
		isDisabled={passageDividersDisabled}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="References"
		isActive={$toolbarState.referencesVisible}
		onToggle={toggleReferences}
		isDisabled={referencesDisabled}
	/>
	<MenuToggleItem
		label="Notations"

		isActive={cfg.verses.active}
		onToggle={cfg.verses.toggle}
		isDisabled={versesDisabled}
	/>
	<MenuToggleItem
		label="Paragraphs"
		isActive={cfg.paragraphs.active}
		onToggle={cfg.paragraphs.toggle}
		isDisabled={paragraphsDisabled}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="All Connections"
		isActive={cfg.allConnections.active}
		onToggle={cfg.allConnections.toggle}
		isDisabled={connectionsDisabled}
	/>
	<MenuToggleItem
		label="Column Connections"
		isActive={cfg.columnConnections.active}
		onToggle={cfg.columnConnections.toggle}
		isDisabled={connectionsDisabled}
	/>
	<MenuToggleItem
		label="Section Connections"
		isActive={cfg.sectionConnections.active}
		onToggle={cfg.sectionConnections.toggle}
		isDisabled={connectionsDisabled}
	/>
	<MenuToggleItem
		label="Segment Connections"
		isActive={cfg.segmentConnections.active}
		onToggle={cfg.segmentConnections.toggle}
		isDisabled={connectionsDisabled}
	/>
	<MenuToggleItem
		label="Cross-Item Connections"
		isActive={cfg.crossItemConnections.active}
		onToggle={cfg.crossItemConnections.toggle}
		isDisabled={connectionsDisabled}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="All Quick Notes"
		isActive={cfg.allNotes.active}
		onToggle={cfg.allNotes.toggle}
		isDisabled={notesDisabled}
	/>
	<MenuToggleItem
		label="Text Quick Notes"
		isActive={cfg.passageNotes.active}
		onToggle={cfg.passageNotes.toggle}
		isDisabled={notesDisabled}
	/>
	<MenuToggleItem
		label="Connection Quick Notes"
		isActive={cfg.connectionNotes.active}
		onToggle={cfg.connectionNotes.toggle}
		isDisabled={notesDisabled}
	/>

	<DividerHorizontal />

	<!-- Commentary (Document-only) — shows/hides commentary PROSE in the read-only
	     document. Disabled in the Analyze view, where the separate commentary editor
	     slide-out (not this prose toggle) governs commentary. -->
	<MenuToggleItem
		label="Commentary"
		isActive={cfg.commentaries.active}
		onToggle={cfg.commentaries.toggle}
		isDisabled={commentaryDisabled}
	/>


	<DividerHorizontal />

	<!-- Layout/canvas items (Analyze-only) — disabled in the Document view, whose
	     paginated read-only layout has no wide/outline/selection/layout affordances. -->
	<MenuToggleItem
		label="Wide View"
		isActive={$toolbarState.wideLayout}
		onToggle={toggleWide}
		isDisabled={wideDisabled}
	/>
	<MenuToggleItem
		label="Outline View"
		isActive={$toolbarState.overviewMode}
		onToggle={toggleOverview}
		isDisabled={overviewDisabled}
	/>

	<DividerHorizontal />

	<MenuToggleItem
		label="Selection Controls"
		isActive={$toolbarState.selectorsVisible}
		onToggle={toggleSelectors}
		isDisabled={selectorsDisabled}
	/>
	<MenuToggleItem
		label="Layout Controls"
		isActive={$toolbarState.layoutControlsVisible}
		onToggle={toggleLayoutControls}
		isDisabled={layoutControlsDisabled}
	/>
</Menu>

