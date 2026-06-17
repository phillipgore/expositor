<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';

	import Heading from '$lib/componentElements/Heading.svelte';
	import Segment from '$lib/componentWidgets/Segment.svelte';
	import ConnectionsOverlay from '$lib/componentWidgets/ConnectionsOverlay.svelte';
	import ToolbarColumn from '$lib/componentWidgets/ToolbarColumn.svelte';
	import ToolbarSection from '$lib/componentWidgets/ToolbarSection.svelte';
	import ResizeTooltip from '$lib/componentElements/ResizeTooltip.svelte';
	import SetSegmentHeightModal from '$lib/componentWidgets/modals/SetSegmentHeightModal.svelte';
	import SetSectionSpacingModal from '$lib/componentWidgets/modals/SetSectionSpacingModal.svelte';
	import SetColumnSpacingModal from '$lib/componentWidgets/modals/SetColumnSpacingModal.svelte';
	import SetColumnWidthModal from '$lib/componentWidgets/modals/SetColumnWidthModal.svelte';
	import JoinConfirmationModal from '$lib/componentWidgets/modals/JoinConfirmationModal.svelte';


	import { useSegmentResize } from '$lib/composables/useSegmentResize.svelte.js';
	import { useSectionReposition } from '$lib/composables/useSectionReposition.svelte.js';
	import { useColumnReposition } from '$lib/composables/useColumnReposition.svelte.js';
	import { useColumnResize, BASE_WIDTH_WIDE } from '$lib/composables/useColumnResize.svelte.js';





	import { exportAnalyzeView } from '$lib/utils/exportAnalyze.js';
	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';


	import { formatScriptureReference } from '$lib/utils/bibleData.js';
	import {
		buildVerseSectionMap,
		generateVerseSuffix,
		getParsedPassage,
		extractSegmentText
	} from '$lib/utils/passageText.js';
	import { toolbarState, setWordSelection, setActiveSegment, setActiveSection, setCanInsertColumn, setActiveColumn, setFocusEnabled, setToolbarState, setConnectionButtonStates, setActiveConnection, setWordSegmentPosition, setCaretSegmentBoundary, setHeadingOrNoteEditorActive, showConnectionsForTypes, showHeadings, setSegmentHeightLinkState } from '$lib/stores/toolbar.js';

	import { setStudyContentLoading, studyContentLoading } from '$lib/stores/loading.js';




	let { data: rawData } = $props();

	// The heavy passage text/structure + connections are streamed from the server
	// (see +layout.server.js) so the page shell, toolbar, and sidebar render
	// instantly even for large studies on slow connections. We resolve the streamed
	// promise into local state and expose a derived `data` that merges it back in,
	// so every existing `data.passagesWithText` / `data.connections` reference in
	// this (large) component keeps working unchanged — those reads simply see
	// `undefined`/`[]` until the stream lands, which all the existing guards handle.
	let streamedContent = $state(/** @type {{ passagesWithText: any[], connections: any[] } | null} */ (null));

	$effect(() => {
		// Re-runs whenever a navigation hands us a new streamed promise. Clear the
		// previous study's resolved content immediately and flag the global loader so
		// the single navigation Spinner stays up continuously until the new stream
		// lands (rather than handing off to a separate in-page spinner).
		const promise = rawData.streamed?.content;
		streamedContent = null;
		setStudyContentLoading(true);

		let cancelled = false;
		promise?.then((c) => {
			if (!cancelled) {
				streamedContent = c;
				setStudyContentLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	});

	// Clear the global loading flag if this page is torn down mid-stream (e.g. the
	// user navigates away before the content resolves), so the overlay never sticks.
	onMount(() => () => setStudyContentLoading(false));

	let data = $derived({
		...rawData,
		passagesWithText: streamedContent?.passagesWithText,
		connections: streamedContent?.connections
	});

	// ─── Segment height resize ────────────────────────────────────────────────
	// Lives at page level so it can see all .segment elements (for cross-page
	// snapping) and the current zoom scale. getScale/getContainer are lazy closures
	// over reactive state declared later in this module.
	const segmentResize = useSegmentResize({
		getScale: () => currentScale,
		getContainer: () => analyzeContentRef,
		onPersist: () => invalidate('app:studies')
	});

	// Attach window mousemove/mouseup listeners only while a resize drag is active.
	$effect(() => segmentResize.setupResizeListeners());

	// Observe linked segments for content-size changes so a group auto-grows to the
	// tallest member when text/headings/notes are added. Re-runs when the rendered
	// passage content changes (segments mount/unmount or links change).
	$effect(() => {
		const _dep = data.passagesWithText; // re-run when content changes
		// Wait for the DOM to settle so [data-height-group-id] elements exist.
		let cleanup;
		tick().then(() => {
			cleanup = segmentResize.observeGroups();
		});
		return () => cleanup?.();
	});

	// Gate the Layout → Link / Unlink Segment Height buttons on the current selection:
	//  - Link  : 2+ segments selected that aren't already all in the SAME group.
	//  - Unlink: the selection includes at least one linked segment.
	$effect(() => {
		const segs = activeSegments;
		const count = segs.length;

		// Read each selected segment's heightGroupId from the loaded structure.
		const groupIds = segs.map((s) => {
			const el = document.querySelector(`[data-segment-id="${s.segmentId}"]`);
			return el?.getAttribute('data-height-group-id') || null;
		});
		const hasLinked = groupIds.some((g) => !!g);
		const allSameGroup =
			count >= 2 && groupIds.every((g) => g && g === groupIds[0]);

		const canLink = count >= 2 && !allSameGroup;
		const canUnlink = hasLinked;
		setSegmentHeightLinkState(count, canLink, canUnlink);
	});


	// ─── Section reposition (vertical spacing) ────────────────────────────────
	// Lives at page level so it can see all .section/.segment elements (for
	// cross-column snapping) and the current zoom scale. Adjusts the gap ABOVE a
	// section (distance from previous section, or from the top of the column for
	// the first section), with the current default spacing as the floor.
	const sectionReposition = useSectionReposition({
		getScale: () => currentScale,
		getContainer: () => analyzeContentRef,
		onPersist: () => invalidate('app:studies')
	});

	// Attach window mousemove/mouseup listeners only while a reposition drag is active.
	$effect(() => sectionReposition.setupRepositionListeners());

	// ─── Column reposition (horizontal spacing) ───────────────────────────────
	// Lives at page level so it can see all .column elements and the current zoom
	// scale. Adjusts the gap to the LEFT of a column (distance from the previous
	// column); the first column in a passage has no left gap and never gets a handle.
	// The total gap has no upper limit — viewers can add as much space as they like.
	const columnReposition = useColumnReposition({
		getScale: () => currentScale,
		onPersist: () => invalidate('app:studies')
	});

	// Attach window mousemove/mouseup listeners only while a column drag is active.
	$effect(() => columnReposition.setupRepositionListeners());

	// ─── Column width resize ──────────────────────────────────────────────────
	// Lives at page level so it can see all .column elements (for cross-column edge
	// snapping) and the current zoom scale. Drags the RIGHT edge of a column to widen
	// or narrow it, with a minimum readable width floor. This is the horizontal
	// counterpart to the segment height resize.
	const columnResize = useColumnResize({
		getScale: () => currentScale,
		getContainer: () => analyzeContentRef,
		onPersist: () => invalidate('app:studies')
	});

	// Attach window mousemove/mouseup listeners only while a width drag is active.
	$effect(() => columnResize.setupResizeListeners());


	// ─── Set-height modal (bulk uniform height for selected segments) ──────────



	// Opened from Structure → Set Height. Measures the current selection to seed
	// the default value (tallest current height) and the minimum allowed value
	// (tallest natural/content height) before showing the modal.
	let setHeightModalOpen = $state(false);
	let setHeightSegmentIds = $state(/** @type {string[]} */ ([]));
	let setHeightTallest = $state(0);
	let setHeightMin = $state(0);

	/**
	 * Measure the selected segments and open the Set Height modal.
	 * - tallest = max current rendered height (÷ scale → CSS px) → default value
	 * - min     = max natural/content height (÷ scale → CSS px)  → floor
	 */
	function openSetHeightModal() {
		const ids = activeSegments.map((s) => s.segmentId);
		if (ids.length === 0) return;

		const scale = currentScale || 1;
		let tallest = 0;
		let minFloor = 0;

		for (const id of ids) {
			const el = /** @type {HTMLElement|null} */ (
				document.querySelector(`[data-segment-id="${id}"]`)
			);
			if (!el) continue;

			// Current rendered height (includes any applied min-height).
			const current = el.getBoundingClientRect().height / scale;
			if (current > tallest) tallest = current;

			// Natural content height: momentarily clear inline min-height to measure.
			const prevMinHeight = el.style.minHeight;
			el.style.minHeight = '0px';
			const natural = el.getBoundingClientRect().height / scale;
			el.style.minHeight = prevMinHeight;
			if (natural > minFloor) minFloor = natural;
		}

		setHeightSegmentIds = ids;
		setHeightTallest = Math.round(tallest);
		setHeightMin = Math.ceil(minFloor);
		setHeightModalOpen = true;
	}

	/**
	 * Persist a uniform height across the selected segments via the batch endpoint,
	 * then refresh loaded data so the new heights survive reload.
	 * @param {number} height
	 */
	async function applySetHeight(height) {
		const ids = setHeightSegmentIds;
		setHeightModalOpen = false;
		if (ids.length === 0) return;

		try {
			await fetch('/api/segments/batch-height', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids, height })
			});
			await invalidate('app:studies');
		} catch (error) {
			console.error('Failed to set segment heights:', error);
		}
	}

	/**
	 * Restore the selected segments to their natural (flexible) height by clearing
	 * any fixed height override (height = null) via the batch endpoint.
	 */
	async function restoreSegmentHeight() {
		const ids = activeSegments.map((s) => s.segmentId);
		if (ids.length === 0) return;

		try {
			await fetch('/api/segments/batch-height', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids, height: null })
			});
			await invalidate('app:studies');
		} catch (error) {
			console.error('Failed to restore segment heights:', error);
		}
	}

	/**
	 * Link the heights of the selected segments. Measures the tallest current rendered
	 * height across the selection (÷ scale → CSS px) and seeds every member to it so
	 * they immediately jump to match the tallest one. The server assigns a shared
	 * height-group id; thereafter they resize together and grow to the tallest member.
	 */
	async function linkSegmentHeight() {
		const ids = activeSegments.map((s) => s.segmentId);
		if (ids.length < 2) return;

		const scale = currentScale || 1;
		let tallest = 0;
		for (const id of ids) {
			const el = /** @type {HTMLElement|null} */ (
				document.querySelector(`[data-segment-id="${id}"]`)
			);
			if (!el) continue;
			const current = el.getBoundingClientRect().height / scale;
			if (current > tallest) tallest = current;
		}

		try {
			await fetch('/api/segments/link-height', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids, height: tallest > 0 ? Math.round(tallest) : null })
			});
			await invalidate('app:studies');
		} catch (error) {
			console.error('Failed to link segment heights:', error);
		}
	}

	/**
	 * Unlink the heights of the selected segments. The server clears the shared
	 * height-group id on every member of the affected groups; each segment keeps its
	 * current height but is no longer kept in sync with the others.
	 */
	async function unlinkSegmentHeight() {
		const ids = activeSegments.map((s) => s.segmentId);
		if (ids.length === 0) return;

		try {
			await fetch('/api/segments/unlink-height', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			await invalidate('app:studies');
		} catch (error) {
			console.error('Failed to unlink segment heights:', error);
		}
	}


	// ─── Set-spacing modal (bulk uniform TOTAL gap for selected sections) ──────
	// Opened from Structure → Set Section Spacing. Measures the current selection to
	// seed the default value (first section's current total gap) and the minimum
	// allowed value (largest default gap among the selected sections) before showing
	// the modal. Mirrors the segment Set-Height flow but for vertical section spacing.
	let setSpacingModalOpen = $state(false);
	let setSpacingSectionIds = $state(/** @type {string[]} */ ([]));
	let setSpacingCurrent = $state(0);
	let setSpacingMin = $state(0);

	/**
	 * Collect the currently selected section IDs. A selected COLUMN implies all of its
	 * sections; explicitly selected sections are included directly. (Spacing has no
	 * meaning for a segment selection, so segments are ignored here.)
	 * @returns {string[]}
	 */
	function getSelectedSectionIds() {
		const ids = new Set();
		activeSections.forEach((id) => ids.add(id));
		activeColumns.forEach((colId) => {
			getAllSectionIdsInColumn(colId).forEach((sId) => ids.add(sId));
		});
		return Array.from(ids);
	}

	/**
	 * Measure the selected sections and open the Set Section Spacing modal.
	 * - current = the first selected section's current total gap → default value
	 * - min     = the largest default gap among the selection    → floor
	 */
	function openSetSpacingModal() {
		const ids = getSelectedSectionIds();
		if (ids.length === 0) return;

		let minFloor = 0;
		for (const id of ids) {
			const def = sectionReposition.measureDefaultGap(id);
			if (def > minFloor) minFloor = def;
		}

		setSpacingSectionIds = ids;
		setSpacingCurrent = Math.round(sectionReposition.measureCurrentGap(ids[0]));
		setSpacingMin = Math.ceil(minFloor);
		setSpacingModalOpen = true;
	}

	/**
	 * Persist a uniform TOTAL gap across the selected sections (converted per-section
	 * into the stored extra offset by the composable), then refresh loaded data.
	 * @param {number} gap
	 */
	async function applySetSpacing(gap) {
		const ids = setSpacingSectionIds;
		setSpacingModalOpen = false;
		if (ids.length === 0) return;
		await sectionReposition.setSpacing(ids, gap);
	}

	/**
	 * Reset the spacing of all currently selected sections back to their defaults.
	 */
	async function resetSectionSpacing() {
		const ids = getSelectedSectionIds();
		if (ids.length === 0) return;
		await sectionReposition.resetSpacing(ids);
	}

	// ─── Set-column-spacing modal (bulk uniform TOTAL left gap for selected columns) ─
	// Opened from Layout → Set Column Spacing. Columns that are first in their passage
	// have no adjustable left gap and are excluded. Seeds the default value from the
	// first adjustable selected column's current gap and the minimum from the largest
	// default gap among the selection. There is no maximum — viewers can add as much
	// space as they like.
	let setColumnSpacingModalOpen = $state(false);
	let setColumnSpacingIds = $state(/** @type {string[]} */ ([]));
	let setColumnSpacingCurrent = $state(0);
	let setColumnSpacingMin = $state(0);

	/**
	 * Collect the currently selected column IDs that have an adjustable left gap.
	 * Every column is adjustable EXCEPT the study's very first column (the first column
	 * of the first passage): non-first columns adjust their within-passage gap, while a
	 * passage's first column (other than the study's first) adjusts the cross-passage
	 * gap that spans the divider.
	 * @returns {string[]}
	 */
	function getAdjustableColumnIds() {
		return activeColumns.filter((columnId) => {
			const colEl = document.querySelector(`[data-column-id="${columnId}"]`);
			if (!colEl) return false;
			const prevEl = colEl.previousElementSibling;
			// Within-passage column (has a previous column sibling) → always adjustable.
			if (prevEl && prevEl.classList.contains('column')) return true;
			// First column in its passage → adjustable only if a previous passage exists
			// (i.e. it is NOT the study's first column). The element before the passage is
			// a .passage-divider; the study's first passage has no preceding divider.
			const passageEl = colEl.closest('.passage');
			const prevDivider = passageEl?.previousElementSibling;
			return !!prevDivider && prevDivider.classList.contains('passage-divider');
		});
	}


	/**
	 * Measure the selected columns and open the Set Column Spacing modal.
	 */
	function openSetColumnSpacingModal() {
		const ids = getAdjustableColumnIds();
		if (ids.length === 0) return;

		let minFloor = 0;
		for (const id of ids) {
			const def = columnReposition.measureDefaultGap(id);
			if (def > minFloor) minFloor = def;
		}

		setColumnSpacingIds = ids;
		setColumnSpacingCurrent = Math.round(columnReposition.measureCurrentGap(ids[0]));
		setColumnSpacingMin = Math.ceil(minFloor);
		setColumnSpacingModalOpen = true;
	}

	/**
	 * Persist a uniform TOTAL left gap across the selected columns, then refresh data.
	 * @param {number} gap
	 */
	async function applySetColumnSpacing(gap) {
		const ids = setColumnSpacingIds;
		setColumnSpacingModalOpen = false;
		if (ids.length === 0) return;
		await columnReposition.setSpacing(ids, gap);
	}

	/**
	 * Reset the horizontal spacing of all currently selected columns back to defaults.
	 */
	async function resetColumnSpacing() {
		const ids = getAdjustableColumnIds();
		if (ids.length === 0) return;
		await columnReposition.resetSpacing(ids);
	}

	// ─── Set-column-width modal (bulk uniform width for selected columns) ──────
	// Opened from Layout → Set Column Width. Measures the current selection to seed the
	// default value (first selected column's current rendered width) and the minimum
	// allowed value (the composable's readable minimum-width floor) before showing the
	// modal. Mirrors the segment Set-Height flow but for horizontal column width.
	let setColumnWidthModalOpen = $state(false);
	let setColumnWidthIds = $state(/** @type {string[]} */ ([]));
	let setColumnWidthCurrent = $state(0);
	let setColumnWidthMin = $state(0);

	/**
	 * Measure the selected columns and open the Set Column Width modal.
	 * Every selected column is adjustable (unlike spacing, width has no first-column rule).
	 */
	function openSetColumnWidthModal() {
		const ids = [...activeColumns];
		if (ids.length === 0) return;

		setColumnWidthIds = ids;
		setColumnWidthCurrent = Math.round(columnResize.measureCurrentWidth(ids[0]));
		setColumnWidthMin = Math.ceil(columnResize.minWidth);
		setColumnWidthModalOpen = true;
	}

	/**
	 * Persist a uniform WIDTH across the selected columns, then refresh data.
	 * @param {number} width
	 */
	async function applySetColumnWidth(width) {
		const ids = setColumnWidthIds;
		setColumnWidthModalOpen = false;
		if (ids.length === 0) return;
		await columnResize.setWidth(ids, width);
	}

	/**
	 * Reset the width of all currently selected columns back to the default.
	 */
	async function resetColumnWidth() {
		const ids = [...activeColumns];
		if (ids.length === 0) return;
		await columnResize.resetWidth(ids);
	}






	/**
	 * Compare two word IDs to determine their order (client-side version)

	 * Word ID format: BOOK-CHAPTER-VERSE-WORD (e.g., "JN-001-001-005")
	 * @param {string} wordId1 - First word ID
	 * @param {string} wordId2 - Second word ID
	 * @returns {number} Negative if wordId1 < wordId2, 0 if equal, positive if wordId1 > wordId2
	 */
	function compareWordIds(wordId1, wordId2) {
		if (!wordId1 || !wordId2) return 0;
		
		const parts1 = wordId1.split('-');
		const parts2 = wordId2.split('-');
		
		// Compare chapter, verse, and word number (indices 1, 2, 3)
		for (let i = 1; i < 4; i++) {
			const num1 = parseInt(parts1[i], 10);
			const num2 = parseInt(parts2[i], 10);
			const diff = num1 - num2;
			if (diff !== 0) return diff;
		}
		
		return 0;
	}

	// Word selection state
	let hoveredWord = $state(null); // { passageIndex, wordId }
	let selectedWord = $state(null); // { passageIndex, wordId, position }
	let suppressHoverCaret = $state(null); // { passageIndex, wordId } - suppress hover caret after deselection
	
	// Drag detection state
	let dragStartPos = $state(null); // { x, y } - mouse position on mousedown
	let isDragging = $state(false); // Whether user is dragging (text selection mode)
	let dragJustCompleted = $state(false); // Flag to prevent click processing after drag

	// Click debouncing for separating single clicks from double/triple clicks
	let clickTimeout = $state(null); // Timeout ID for delayed single-click processing

	// Command key detection for multi-select mode
	let isCommandKeyHeld = $state(false);

	// Multi-selection state (replaces single selection)
	let activeSegments = $state([]); // Array of { passageIndex, segmentIndex, segmentId, generation }
	let activeColumns = $state([]); // Array of columnId strings
	let activeSections = $state([]); // Array of sectionId strings
	let segmentClickGeneration = $state(0); // Increments on every segment click to force toolbar remount

	// Compare mode state
	let isCompareMode = $state(false);
	let compareModeEnteredViaConnections = $state(false); // true when compare mode was entered by selecting a connection line
	let originalComparisonSelection = $state({ columns: [], sections: [], segments: [] });
	let compareActiveColumns = $state([]);
	let compareActiveSections = $state([]);
	let compareActiveSegments = $state([]);
	let visibleColumnIds = $state(new Set());
	let visibleSectionIds = $state(new Set());
	let visibleSegmentIds = $state(new Set());

	// Focus mode state. Focus hides everything except the selected item(s) and their
	// containers/children, supporting any number of selections (this absorbed the former
	// "Compare" feature). focusEnteredViaConnections is true when focus was entered from
	// a connection-line selection, so on exit we restore the connection (not the derived
	// structural endpoints).
	let isFocusMode = $state(false);
	let focusEnteredViaConnections = $state(false);
	let originalFocusSelection = $state({ columns: [], sections: [], segments: [] });

	// True whenever items should be hidden based on the visible Sets — i.e. in either
	// compare mode or focus mode (both reuse the same visibility filtering mechanism).
	let isHideMode = $derived(isCompareMode || isFocusMode);



	// Derived state: Check if we're in multi-select mode (more than 1 item selected)
	let isInMultiSelectMode = $derived.by(() => {
		// Use compare-mode selections if in compare mode, otherwise use normal selections
		const selections = isCompareMode
			? { columns: compareActiveColumns, sections: compareActiveSections, segments: compareActiveSegments }
			: { columns: activeColumns, sections: activeSections, segments: activeSegments };
		
		const totalSelected = selections.columns.length + selections.sections.length + selections.segments.length;
		return totalSelected > 1;
	});

	// Derived state: whether multiple structural items (columns and/or sections) are selected.
	// When true, we keep ALL column/section selection controls visible (even without the
	// Command/Ctrl key) so the user can easily add to or remove from the multi-selection.
	let hasMultipleStructuralSelections = $derived.by(() => {
		const selections = isCompareMode
			? { columns: compareActiveColumns, sections: compareActiveSections }
			: { columns: activeColumns, sections: activeSections };

		return (selections.columns.length + selections.sections.length) > 1;
	});

	// Derived state: while a Column, Section, or Segment is selected, holding the
	// Command/Ctrl key temporarily reveals EVERY column/section selection control so
	// the user can easily add to / remove from the selection. Releasing the key hides
	// them again (reverting to showing only the active selection's controls).
	// Gated on an existing selection so pressing the key with nothing selected does
	// not flash the controls.
	let showAllSelectorsViaCommand = $derived(
		isCommandKeyHeld &&
		(activeColumns.length > 0 || activeSections.length > 0 || activeSegments.length > 0)
	);


	// Derived state: whether the current selection can enter Focus mode (enables the
	// Focus button). Focus hides everything except the selected item(s) and their
	// containers/children, so it makes sense for ANY selection of one or more items —
	// EXCEPT a selection that would leave every segment in the study visible
	// ("All of them"). That happens when all columns, all sections, or all segments are
	// selected. We measure this by segment coverage: if the segments revealed by the
	// current selection equal the study's total segment count, Focus is disabled.
	// A selected connection also enables Focus (entered via its structural endpoints).
	let isFocusableSelection = $derived.by(() => {
		const hasStructuralSelection =
			activeColumns.length > 0 || activeSections.length > 0 || activeSegments.length > 0;

		// A selected connection can always be focused (it never covers every segment).
		if (!hasStructuralSelection) {
			return $toolbarState.hasActiveConnection;
		}

		const totalSegments = getTotalSegmentCountInStudy();
		if (totalSegments === 0) return false;

		// Reuse the same visibility engine focus mode uses to determine coverage.
		const visible = calculateVisibleItems({
			columns: activeColumns,
			sections: activeSections,
			segments: activeSegments
		});

		// Disabled when the selection would reveal every segment (i.e. "All of them").
		return visible.segments.size < totalSegments;
	});


	// Sync word selection state to toolbar store
	$effect(() => {
		setWordSelection(selectedWord !== null);
	});

	// Sync active segment state to toolbar store
	// Only set hasActiveSegment to true when neither column nor section mode is active
	$effect(() => {
		if (activeSegments.length > 0 && activeColumns.length === 0 && activeSections.length === 0) {
			// Only set active segment in store when in pure segment mode (not column/section mode)
			// Use the first active segment for toolbar state
			const firstSegment = activeSegments[0];
			
			// Look up segment data to pass heading/note status
			const segmentElement = document.querySelector(`[data-segment-id="${firstSegment.segmentId}"]`);
			let hasHeadingOne = false;
			let hasHeadingTwo = false;
			let hasHeadingThree = false;
			let hasNote = false;
			
			if (segmentElement) {
				// Check for heading elements in the DOM
				hasHeadingOne = !!segmentElement.querySelector('.heading-one, .heading-one-input');
				hasHeadingTwo = !!segmentElement.querySelector('.heading-two, .heading-two-input');
				hasHeadingThree = !!segmentElement.querySelector('.heading-three, .heading-three-input');
				hasNote = !!segmentElement.querySelector('.note, .note-input');
			}
			
			// Determine whether this segment is the first segment in its passage
			let isFirstSegment = false;
			if (data.passagesWithText) {
				for (const passage of data.passagesWithText) {
					if (!passage.structure?.columns?.length) continue;
					const allPassageSegments = passage.structure.columns.flatMap(col => col.sections.flatMap(sec => sec.segments));
					if (allPassageSegments.length > 0 && allPassageSegments[0].id === firstSegment.segmentId) {
						isFirstSegment = true;
					}
					// Stop looking once we've found which passage contains the segment
					if (allPassageSegments.some(seg => seg.id === firstSegment.segmentId)) break;
				}
			}

			setActiveSegment(true, firstSegment.segmentId, {
				hasHeadingOne,
				hasHeadingTwo,
				hasHeadingThree,
				hasNote,
				isFirst: isFirstSegment
			});
		} else {
			setActiveSegment(false, null);
		}
	});

	// Sync active column state to toolbar store
	$effect(() => {
		if (activeColumns.length > 0) {
			const activeColumnId = activeColumns[0];

			// Determine whether this column is the first column in its passage
			let isFirstColumn = false;
			if (data.passagesWithText) {
				for (const passage of data.passagesWithText) {
					if (passage.structure?.columns?.length > 0) {
						const colIndex = passage.structure.columns.findIndex(c => c.id === activeColumnId);
						if (colIndex !== -1) {
							isFirstColumn = colIndex === 0;
							break;
						}
					}
				}
			}

			setActiveColumn(true, activeColumnId, isFirstColumn);
		} else {
			setActiveColumn(false, null);
		}
	});

	// Sync active section state to toolbar store
	// Set to true when column OR section is active (for color menu)
	$effect(() => {
		const hasActiveSection = activeColumns.length > 0 || activeSections.length > 0;
		if (hasActiveSection) {
			// Get section ID from the active column or section
			let sectionId = null;
			if (activeSections.length > 0) {
				sectionId = activeSections[0];
			} else if (activeColumns.length > 0) {
				// Get section ID from column element
				const columnElement = document.querySelector(`[data-column-id="${activeColumns[0]}"]`);
				const sectionElement = columnElement?.querySelector('.section');
				sectionId = sectionElement?.dataset?.sectionId || null;
			}

			// Determine whether this section is the first section in its passage.
			// Only meaningful when a section is explicitly selected (not when a column activates one).
			let isFirstSection = false;
			if (activeSections.length > 0 && sectionId && data.passagesWithText) {
				for (const passage of data.passagesWithText) {
					if (!passage.structure?.columns?.length) continue;
					let found = false;
					let isFirst = true;
					for (const column of passage.structure.columns) {
						for (const section of column.sections) {
							if (section.id === sectionId) {
								isFirstSection = isFirst;
								found = true;
								break;
							}
							isFirst = false;
						}
						if (found) break;
					}
					if (found) break;
				}
			}

			setActiveSection(true, sectionId, isFirstSection);
		} else {
			setActiveSection(false, null);
		}
	});

	// Sync the "can this selection enter Focus?" flag to the toolbar store. Enables the
	// Focus button whenever one or more items (or a connection) are selected, EXCEPT when
	// the selection would reveal every segment in the study ("All of them"). See the
	// isFocusableSelection derived for the full rule. setFocusEnabled also keeps the
	// button enabled while focus mode is already active so the user can toggle it off.
	$effect(() => {
		setFocusEnabled(isFocusableSelection);
	});

	// Clear active segments and word selection when overview mode is enabled.
	// Guards prevent unnecessary reactive assignments (which would create new array
	// references and trigger a sync-effect → store-update → clear-effect cycle).
	$effect(() => {
		if ($toolbarState.overviewMode) {
			if (activeSegments.length > 0) activeSegments = [];
			if (activeColumns.length > 0) activeColumns = [];
			if (activeSections.length > 0) activeSections = [];
			if (selectedWord !== null) selectedWord = null;
			if (suppressHoverCaret !== null) suppressHoverCaret = null;
		}
	});

	// When a connection arc or connection note is activated, clear all structural visual
	// selections so nothing else appears selected/highlighted simultaneously.
	// Clearing activeSegments causes isActive=false on all Segment components, which
	// triggers NoteEditor's "$effect(() => { if (!isActive && isInputMode) commitChanges(); })"
	// and automatically closes any open passage quick note editors.
	$effect(() => {
		const isConnectionNoteActive =
			$toolbarState.hasActiveHeadingOrNoteEditor &&
			$toolbarState.activeHeadingOrNoteType === 'connection-note';
		if ($toolbarState.hasActiveConnection || isConnectionNoteActive) {
			if (activeSegments.length > 0) activeSegments = [];
			if (activeColumns.length > 0) activeColumns = [];
			if (activeSections.length > 0) activeSections = [];
			if (selectedWord !== null) { selectedWord = null; suppressHoverCaret = null; }
		}
	});

	/**
	 * Scroll the scroll container so the given structural selection is centered as much
	 * as possible. Used when exiting Focus/Compare mode to bring the restored selection
	 * back into view. Falls back to scrolling to the top-left when nothing is found.
	 * @param {{ columns: string[], sections: string[], segments: Array<{segmentId: string}> }} selection
	 */
	function scrollSelectionIntoView(selection) {
		const container = analyzeContentRef;
		if (!container) return;

		// Gather the DOM elements for the restored selection
		const elements = [];
		selection.segments.forEach(seg => {
			const el = container.querySelector(`[data-segment-id="${seg.segmentId}"]`);
			if (el) elements.push(el);
		});
		selection.sections.forEach(id => {
			const el = container.querySelector(`[data-section-id="${id}"]`);
			if (el) elements.push(el);
		});
		selection.columns.forEach(id => {
			const el = container.querySelector(`[data-column-id="${id}"]`);
			if (el) elements.push(el);
		});

		// Nothing to focus on — fall back to top-left
		if (elements.length === 0) {
			container.scrollTo(0, 0);
			return;
		}

		const containerRect = container.getBoundingClientRect();

		// Compute the combined bounding box of all selected elements, in content
		// coordinates (relative to the scrollable content, accounting for current scroll).
		let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
		for (const el of elements) {
			const r = el.getBoundingClientRect();
			const left = r.left - containerRect.left + container.scrollLeft;
			const top = r.top - containerRect.top + container.scrollTop;
			minLeft = Math.min(minLeft, left);
			minTop = Math.min(minTop, top);
			maxRight = Math.max(maxRight, left + r.width);
			maxBottom = Math.max(maxBottom, top + r.height);
		}

		const boxWidth = maxRight - minLeft;
		const boxHeight = maxBottom - minTop;
		const viewportWidth = container.clientWidth;
		const viewportHeight = container.clientHeight;

		// Center the box within the viewport (top-left aligned when larger than viewport),
		// then clamp to the valid scroll range to avoid overscrolling.
		const targetLeft = minLeft + boxWidth / 2 - viewportWidth / 2;
		const targetTop = minTop + boxHeight / 2 - viewportHeight / 2;

		const maxScrollLeft = container.scrollWidth - viewportWidth;
		const maxScrollTop = container.scrollHeight - viewportHeight;

		const clampedLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));
		const clampedTop = Math.max(0, Math.min(targetTop, maxScrollTop));

		container.scrollTo(clampedLeft, clampedTop);
	}

	// Focus mode toggle logic. Focus hides everything except the selected item(s) and
	// their containers/children. It supports ANY number of selected items (or a selected
	// connection), and reuses the visibleColumnIds/SectionIds/SegmentIds Sets and the
	// `compare-hidden` CSS mechanism to perform the hiding. (This absorbed the former
	// "Compare" feature — the two were merged into a single Focus control.)
	$effect(() => {
		if ($toolbarState.focusMode && !isFocusMode) {
			// ENTERING FOCUS MODE

			// 1. Save the current selection so it can be restored on exit.
			//    When connection lines are selected, derive the focused items from their
			//    endpoints rather than from the structural selection. Connections and
			//    structural selections are mutually exclusive, so only one path has data.
			if ($toolbarState.hasActiveConnection && $toolbarState.activeConnectionIds.length > 0) {
				originalFocusSelection = buildSelectionFromConnections();
				focusEnteredViaConnections = true;
			} else {
				originalFocusSelection = {
					columns: [...activeColumns],
					sections: [...activeSections],
					segments: [...activeSegments]
				};
				focusEnteredViaConnections = false;
			}

			// 2. Calculate which items remain visible (containers + children of selection)
			const visible = calculateVisibleItems(originalFocusSelection);
			visibleColumnIds = new Set(visible.columns);
			visibleSectionIds = new Set(visible.sections);
			visibleSegmentIds = new Set(visible.segments);

			// 3. Clear word selection and visual structural selection
			selectedWord = null;
			suppressHoverCaret = null;
			activeColumns = [];
			activeSections = [];
			activeSegments = [];

			// 4. Mark we're in focus mode
			isFocusMode = true;

			// 5. Reset scroll to the top-left corner
			tick().then(() => analyzeContentRef?.scrollTo(0, 0));

		} else if (!$toolbarState.focusMode && isFocusMode) {
			// EXITING FOCUS MODE

			// 1. Clear visibility filters (show all)
			visibleColumnIds = new Set();
			visibleSectionIds = new Set();
			visibleSegmentIds = new Set();

			// 2. Restore the original selection — but only for structural selections.
			//    When focus was entered via a connection selection, the connection remains
			//    selected in the toolbar store; we must NOT restore the derived structural
			//    endpoint items, so structural selections stay empty.
			if (focusEnteredViaConnections) {
				activeColumns = [];
				activeSections = [];
				activeSegments = [];
			} else {
				activeColumns = [...originalFocusSelection.columns];
				activeSections = [...originalFocusSelection.sections];
				activeSegments = [...originalFocusSelection.segments];
			}

			// 3. Clear saved selection and exit focus mode
			const restoredSelection = {
				columns: [...activeColumns],
				sections: [...activeSections],
				segments: [...activeSegments]
			};
			originalFocusSelection = { columns: [], sections: [], segments: [] };
			focusEnteredViaConnections = false;
			isFocusMode = false;

			// 4. Scroll the restored selection into view, as centered as possible
			tick().then(() => scrollSelectionIntoView(restoredSelection));
		}
	});


	// Apply dynamic classes for first/last visible elements in compare/focus mode
	$effect(() => {
		// Force reactivity by reading from the Sets
		const _cols = Array.from(visibleColumnIds);
		const _secs = Array.from(visibleSectionIds);
		const _segs = Array.from(visibleSegmentIds);
		
		// Wait for DOM to update before applying classes
		tick().then(() => {
			// Clear all compare position classes first
			document.querySelectorAll('.compare-first-segment, .compare-last-segment, .compare-first-section').forEach(el => {
				el.classList.remove('compare-first-segment', 'compare-last-segment', 'compare-first-section');
			});
			
			// Only apply classes when in compare or focus mode
			if (!isHideMode) return;
			
			// Process each column
			document.querySelectorAll('.column').forEach(column => {
				// Skip hidden columns
				if (column.classList.contains('compare-hidden')) return;
				
				// Get all visible sections in this column
				const visibleSections = Array.from(column.querySelectorAll('.section')).filter(
					section => !section.classList.contains('compare-hidden')
				);
				
				// Mark first visible section
				if (visibleSections.length > 0) {
					visibleSections[0].classList.add('compare-first-section');
				}
				
				// Process each visible section
				visibleSections.forEach(section => {
					// Get all visible segments in this section
					const visibleSegments = Array.from(section.querySelectorAll('.segment')).filter(
						segment => !segment.classList.contains('compare-hidden')
					);
					
					// Mark first and last visible segments
					if (visibleSegments.length > 0) {
						visibleSegments[0].classList.add('compare-first-segment');
						visibleSegments[visibleSegments.length - 1].classList.add('compare-last-segment');
					}
				});
			});
		});
	});

	// Console logger for multi-select state tracking
	$effect(() => {
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('📊 MULTI-SELECT STATE TRACKER');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log(`📦 Columns (${activeColumns.length}):`, activeColumns.length > 0 ? activeColumns : '(none)');
		console.log(`📄 Sections (${activeSections.length}):`, activeSections.length > 0 ? activeSections : '(none)');
		console.log(`✂️  Segments (${activeSegments.length}):`, activeSegments.length > 0 ? activeSegments.map(s => s.segmentId) : '(none)');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	});

	// Validate Insert Column availability based on word selection
	$effect(() => {
		if (!selectedWord || !data.passagesWithText || data.passagesWithText.length === 0) {
			setCanInsertColumn(false);
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !passageText.structure || !passageText.structure.columns) {
			setCanInsertColumn(false);
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			const wordElement = document.querySelector(
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
			);
			
			if (wordElement) {
				// Find next word sibling in the DOM
				let nextElement = wordElement.nextElementSibling;
				while (nextElement) {
					if (nextElement.classList.contains('selectable-word')) {
						insertionWordId = nextElement.dataset.wordId;
						break;
					}
					nextElement = nextElement.nextElementSibling;
				}
			}
		}

		if (!insertionWordId) {
			// No valid insertion point (e.g., after last word)
			setCanInsertColumn(false);
			return;
		}

		// Check if insertion point is at the beginning of a column
		const columns = passageText.structure.columns;
		for (const column of columns) {
			if (column.startingWordId === insertionWordId) {
				// Cannot insert at column start
				setCanInsertColumn(false);
				return;
			}
		}

		// Valid insertion point
		setCanInsertColumn(true);
	});

	// Determine whether the selected word is in the first or last segment of its passage.
	// Used to disable "Move Text Up" (first segment) and "Move Text Down" (last segment).
	$effect(() => {
		if (!selectedWord || !data.passagesWithText || data.passagesWithText.length === 0) {
			setWordSegmentPosition(false, false);
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !passageText.structure?.columns) {
			setWordSegmentPosition(false, false);
			return;
		}

		// Flatten all segments across all columns/sections in document order
		const allSegments = [];
		for (const column of passageText.structure.columns) {
			for (const section of column.sections) {
				for (const segment of section.segments) {
					allSegments.push(segment);
				}
			}
		}

		if (allSegments.length === 0) {
			setWordSegmentPosition(false, false);
			return;
		}

		// Find which segment contains the selected word.
		// A segment owns the word if: wordId >= segment.startingWordId AND
		// wordId < nextSegment.startingWordId (or it's the last segment).
		let wordSegmentIndex = -1;
		for (let i = 0; i < allSegments.length; i++) {
			const afterStart = compareWordIds(selectedWord.wordId, allSegments[i].startingWordId) >= 0;
			const isLast = i === allSegments.length - 1;
			const beforeNext = isLast || compareWordIds(selectedWord.wordId, allSegments[i + 1].startingWordId) < 0;

			if (afterStart && beforeNext) {
				wordSegmentIndex = i;
				break;
			}
		}

		if (wordSegmentIndex === -1) {
			setWordSegmentPosition(false, false);
			return;
		}

		setWordSegmentPosition(
			wordSegmentIndex === 0,
			wordSegmentIndex === allSegments.length - 1
		);
	});

	// Determine whether the caret is at the very start or end of its segment.
	// Move Text Up is disabled when the caret is before the segment's first word
	// (there is nothing before the caret to move up).
	// Move Text Down is disabled when the caret is after the segment's last word
	// (there is nothing after the caret to move down).
	$effect(() => {
		if (!selectedWord) {
			setCaretSegmentBoundary(false, false);
			return;
		}

		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);

		if (!wordElement) {
			setCaretSegmentBoundary(false, false);
			return;
		}

		const currentSegmentEl = wordElement.closest('.segment');
		if (!currentSegmentEl) {
			setCaretSegmentBoundary(false, false);
			return;
		}

		// Caret at segment start: position='before' and this word is the first in the segment
		let isAtStart = false;
		if (selectedWord.position === 'before') {
			const firstWordInSegment = currentSegmentEl.querySelector('.selectable-word');
			isAtStart = /** @type {HTMLElement|null} */ (firstWordInSegment)?.dataset?.wordId === selectedWord.wordId;
		}

		// Caret at segment end: position='after' and the next selectable-word is in a different segment
		let isAtEnd = false;
		if (selectedWord.position === 'after') {
			let nextEl = wordElement.nextElementSibling;
			while (nextEl) {
				if (nextEl.classList.contains('selectable-word')) break;
				nextEl = nextEl.nextElementSibling;
			}

			if (!nextEl) {
				// No next word at all — at the very end of the passage
				isAtEnd = true;
			} else {
				const nextSegmentEl = nextEl.closest('.segment');
				isAtEnd = nextSegmentEl !== currentSegmentEl;
			}
		}

		setCaretSegmentBoundary(isAtStart, isAtEnd);
	});

	// ─── Connection helpers ───────────────────────────────────────────────────

	/**
	 * Build a { columns, sections, segments } selection from the endpoints of all
	 * currently-selected connection lines.  This is used when entering compare mode
	 * via a connection selection rather than a structural selection.
	 * @returns {{ columns: string[], sections: string[], segments: Array }}
	 */
	function buildSelectionFromConnections() {
		const allConnections = data.connections || [];
		const selectedIds = $toolbarState.activeConnectionIds;
		const selectedConns = allConnections.filter(c => selectedIds.includes(c.id));

		/** @type {string[]} */
		const columns = [];
		/** @type {string[]} */
		const sections = [];
		/** @type {Array<{segmentId:string,passageIndex:number,segmentIndex:number,activateSection:boolean,generation:number}>} */
		const segments = [];

		for (const conn of selectedConns) {
			// from-end
			if (conn.fromType === 'column' && conn.fromColumnId && !columns.includes(conn.fromColumnId)) {
				columns.push(conn.fromColumnId);
			} else if (conn.fromType === 'section' && conn.fromSectionId && !sections.includes(conn.fromSectionId)) {
				sections.push(conn.fromSectionId);
			} else if (conn.fromType === 'segment' && conn.fromSegmentId && !segments.some(s => s.segmentId === conn.fromSegmentId)) {
				segments.push({ segmentId: conn.fromSegmentId, passageIndex: 0, segmentIndex: 0, activateSection: false, generation: 0 });
			}
			// to-end
			if (conn.toType === 'column' && conn.toColumnId && !columns.includes(conn.toColumnId)) {
				columns.push(conn.toColumnId);
			} else if (conn.toType === 'section' && conn.toSectionId && !sections.includes(conn.toSectionId)) {
				sections.push(conn.toSectionId);
			} else if (conn.toType === 'segment' && conn.toSegmentId && !segments.some(s => s.segmentId === conn.toSegmentId)) {
				segments.push({ segmentId: conn.toSegmentId, passageIndex: 0, segmentIndex: 0, activateSection: false, generation: 0 });
			}
		}

		return { columns, sections, segments };
	}

	/**
	 * Get the element ID for the from-end of a connection based on its fromType.
	 * @param {object} c - Connection record
	 * @returns {string|null}
	 */
	function getConnectionFromId(c) {
		if (c.fromType === 'segment') return c.fromSegmentId;
		if (c.fromType === 'section') return c.fromSectionId;
		return c.fromColumnId;
	}

	/**
	 * Get the element ID for the to-end of a connection based on its toType.
	 * @param {object} c - Connection record
	 * @returns {string|null}
	 */
	function getConnectionToId(c) {
		if (c.toType === 'segment') return c.toSegmentId;
		if (c.toType === 'section') return c.toSectionId;
		return c.toColumnId;
	}

	/**
	 * Collect the current selection as a flat list of { type, id } items.
	 * @returns {Array<{type: string, id: string}>}
	 */
	function getSelectedItems() {
		return [
			...activeSegments.map(s => ({ type: 'segment', id: s.segmentId })),
			...activeSections.map(id => ({ type: 'section', id })),
			...activeColumns.map(id => ({ type: 'column', id }))
		];
	}

	/**
	 * Find an existing connection between two items (direction-agnostic).
	 * @param {object[]} connections
	 * @param {{type:string, id:string}} itemA
	 * @param {{type:string, id:string}} itemB
	 * @returns {object|undefined}
	 */
	function findExistingConnection(connections, itemA, itemB) {
		return connections.find(c => {
			const fromId = getConnectionFromId(c);
			const toId   = getConnectionToId(c);
			const forwardMatch  = c.fromType === itemA.type && fromId === itemA.id && c.toType === itemB.type && toId === itemB.id;
			const reverseMatch  = c.fromType === itemB.type && fromId === itemB.id && c.toType === itemA.type && toId === itemA.id;
			return forwardMatch || reverseMatch;
		});
	}

	// Update Insert/Remove Connection button states when selection changes.
	// Activates when exactly 2 items total are selected (any combination of types).
	$effect(() => {
		const connections = data.connections || [];
		const selected = getSelectedItems();

		if (selected.length !== 2) {
			setConnectionButtonStates(false, false);
			return;
		}

		const [itemA, itemB] = selected;
		const existing = findExistingConnection(connections, itemA, itemB);
		setConnectionButtonStates(!existing, !!existing);
	});

	/**
	 * Handle Insert Connection action.
	 * fromType/toType are inferred from the selection (any type combination allowed).
	 */
	async function handleInsertConnection() {
		const selected = getSelectedItems();
		if (selected.length !== 2) return;

		const [itemA, itemB] = selected;

		const body = {
			studyId: data.study.id,
			fromType: itemA.type,
			toType:   itemB.type,
			fromSegmentId: itemA.type === 'segment' ? itemA.id : undefined,
			fromSectionId: itemA.type === 'section' ? itemA.id : undefined,
			fromColumnId:  itemA.type === 'column'  ? itemA.id : undefined,
			toSegmentId:   itemB.type === 'segment' ? itemB.id : undefined,
			toSectionId:   itemB.type === 'section' ? itemB.id : undefined,
			toColumnId:    itemB.type === 'column'  ? itemB.id : undefined,
		};

		try {
			const response = await fetch('/api/segments/connections', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (response.ok) {
				// Auto-show the connection-visibility toggle that governs this connection's
				// type (segment/section/column or cross-item) so the newly created connection
				// is immediately visible even if its View-menu toggle was previously off.
				showConnectionsForTypes(itemA.type, itemB.type);
				await invalidate('app:studies');
			} else {
				const err = await response.json();
				console.error('Insert connection error:', err);
			}
		} catch (error) {
			console.error('Insert connection network error:', error);
		}
	}


	/**
	 * Handle Remove Connection action.
	 * Finds and deletes the existing connection between the two selected items.
	 */
	async function handleRemoveConnection() {
		// Fast-path: connection lines selected directly via the overlay — IDs are known
		if ($toolbarState.hasActiveConnection && $toolbarState.activeConnectionIds.length > 0) {
			try {
				await Promise.all(
					$toolbarState.activeConnectionIds.map(id =>
						fetch(`/api/segments/connections/${id}`, { method: 'DELETE' })
					)
				);
				// Clear connection selection so the Delete button disables immediately
				setActiveConnection(false, []);
				await invalidate('app:studies');
			} catch (error) {
				console.error('Remove connection network error:', error);
			}
			return;
		}

		// Legacy path: two segments selected via the Structure menu flow
		const connections = data.connections || [];
		const selected = getSelectedItems();
		if (selected.length !== 2) return;

		const [itemA, itemB] = selected;
		const existing = findExistingConnection(connections, itemA, itemB);
		if (!existing) return;

		try {
			const response = await fetch(`/api/segments/connections/${existing.id}`, { method: 'DELETE' });
			if (response.ok) {
				await invalidate('app:studies');
			} else {
				const err = await response.json();
				console.error('Remove connection error:', err);
			}
		} catch (error) {
			console.error('Remove connection network error:', error);
		}
	}

	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
		
		// Listen for insert column event from MenuStructure
		const handleInsertColumnEvent = () => {
			handleInsertColumn();
		};
		
		// Listen for insert section event from MenuStructure
		const handleInsertSectionEvent = () => {
			handleInsertSection();
		};
		
		// Listen for insert segment event from MenuStructure
		const handleInsertSegmentEvent = () => {
			handleInsertSegment();
		};

		// Listen for join column/section/segment events from MenuStructure. Each
		// resolves the currently-active item and hands off to the join flow, which
		// dry-runs first and only shows the confirm modal when content is affected.
		const handleJoinColumnEvent = () => {
			if (activeColumns.length > 0) handleJoin('column', activeColumns[0]);
		};
		const handleJoinSectionEvent = () => {
			if (activeSections.length > 0) handleJoin('section', activeSections[0]);
		};
		const handleJoinSegmentEvent = () => {
			if (activeSegments.length > 0) handleJoin('segment', activeSegments[0].segmentId);
		};

		
		// Listen for insert heading one event from MenuStructure
		const handleInsertHeadingOneFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-one', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for insert heading two event from MenuStructure
		const handleInsertHeadingTwoFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				// Auto-show headings if hidden, so the new heading is visible.
				showHeadings();
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-two', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};

		
		// Listen for insert heading three event from MenuStructure
		const handleInsertHeadingThreeFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				// Auto-show headings if hidden, so the new heading is visible.
				showHeadings();
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-heading-three', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};

		
		// Listen for insert note event from MenuStructure
		const handleInsertNoteFromMenuEvent = () => {
			// Find the first active segment and dispatch event with its ID
			if (activeSegments.length > 0) {
				const firstSegment = activeSegments[0];
				window.dispatchEvent(new CustomEvent('insert-note', {
					detail: { segmentId: firstSegment.segmentId }
				}));
			}
		};
		
		// Listen for select-column event from ToolbarStructure
		const handleSelectColumnEvent = (event) => {
			const { columnId } = event.detail;
			
			// Always clear connections and connection notes when any structural item is selected,
			// regardless of whether cmd is held (single or multi-select structural mode).
			setActiveConnection(false, []);
			setHeadingOrNoteEditorActive(false, null);
			
			if (!isCommandKeyHeld && !hasMultipleStructuralSelections) {
				// Normal click with no existing multi-selection: replace selection with just this column
				if (isCompareMode) {
					compareActiveColumns = [columnId];
					compareActiveSections = [];
					compareActiveSegments = [];
				} else {
					activeColumns = [columnId];
					activeSections = [];
					activeSegments = [];
				}
			} else {
				// Cmd/Ctrl held, or a multi-selection already exists: use hierarchical
				// selection handler (additive/toggle) so the click adds to the selection.
				const newState = handleSelection('column', columnId);
				
				// Update the appropriate state based on compare mode
				if (isCompareMode) {
					compareActiveColumns = newState.columns;
					compareActiveSections = newState.sections;
					compareActiveSegments = newState.segments;
				} else {
					activeColumns = newState.columns;
					activeSections = newState.sections;
					activeSegments = newState.segments;
				}
			}
		};
		
		// Listen for deselect-column event from ToolbarStructure
		const handleDeselectColumnEvent = (event) => {
			const { columnId } = event.detail;
			
			// Use hierarchical selection handler (same as select - it toggles)
			const newState = handleSelection('column', columnId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		// Listen for select-section event from ToolbarStructure
		const handleSelectSectionEvent = (event) => {
			const { sectionId } = event.detail;
			
			// Always clear connections and connection notes when any structural item is selected,
			// regardless of whether cmd is held (single or multi-select structural mode).
			setActiveConnection(false, []);
			setHeadingOrNoteEditorActive(false, null);
			
			if (!isCommandKeyHeld && !hasMultipleStructuralSelections) {
				// Normal click with no existing multi-selection: replace selection with just this section
				if (isCompareMode) {
					compareActiveColumns = [];
					compareActiveSections = [sectionId];
					compareActiveSegments = [];
				} else {
					activeColumns = [];
					activeSections = [sectionId];
					activeSegments = [];
				}
			} else {
				// Cmd/Ctrl held, or a multi-selection already exists: use hierarchical
				// selection handler (additive/toggle) so the click adds to the selection.
				const newState = handleSelection('section', sectionId);
				
				// Update the appropriate state based on compare mode
				if (isCompareMode) {
					compareActiveColumns = newState.columns;
					compareActiveSections = newState.sections;
					compareActiveSegments = newState.segments;
				} else {
					activeColumns = newState.columns;
					activeSections = newState.sections;
					activeSegments = newState.segments;
				}
			}
		};
		
		// Listen for deselect-section event from ToolbarStructure
		const handleDeselectSectionEvent = (event) => {
			const { sectionId } = event.detail;
			
			// Use hierarchical selection handler (same as select - it toggles)
			const newState = handleSelection('section', sectionId);
			
			// Update the appropriate state based on compare mode
			if (isCompareMode) {
				compareActiveColumns = newState.columns;
				compareActiveSections = newState.sections;
				compareActiveSegments = newState.segments;
			} else {
				activeColumns = newState.columns;
				activeSections = newState.sections;
				activeSegments = newState.segments;
			}
		};
		
		// Listen for select-all-columns / select-all-sections events from MenuStructure.
		// These select every column / every section across the study, which puts the app
		// into multi-select mode (the derived isInMultiSelectMode/hasMultipleStructuralSelections
		// flip to true automatically since 2+ items become selected).
		const handleSelectAllColumnsEvent = () => {
			handleSelectAllColumns();
		};
		const handleSelectAllSectionsEvent = () => {
			handleSelectAllSections();
		};
		const handleSelectAllSegmentsEvent = () => {
			handleSelectAllSegments();
		};

		// Listen for move-text-up event from MenuStructure
		const handleMoveTextUpEvent = () => {
			handleMoveTextUp();
		};

		// Listen for move-text-down event from MenuStructure
		const handleMoveTextDownEvent = () => {
			handleMoveTextDown();
		};

		// Listen for studies panel clearing all analyze selections.
		// StudiesPanel calls store functions to clear connections/notes, but cannot
		// directly clear local arrays. This event bridges that gap.
		const handleClearAnalyzeSelections = () => {
			activeSegments = [];
			activeColumns = [];
			activeSections = [];
			selectedWord = null;
			suppressHoverCaret = null;
		};

		const handleInsertConnectionEvent = () => handleInsertConnection();
		const handleRemoveConnectionEvent = () => handleRemoveConnection();
		const handleSetSegmentHeightEvent = () => openSetHeightModal();
		const handleRestoreSegmentHeightEvent = () => restoreSegmentHeight();
		const handleLinkSegmentHeightEvent = () => linkSegmentHeight();
		const handleUnlinkSegmentHeightEvent = () => unlinkSegmentHeight();

		// Reset a section's vertical reposition offset back to the default spacing.
		const handleResetSectionPositionEvent = (event) => {
			const sectionId = event.detail?.sectionId;
			if (sectionId) sectionReposition.resetPosition(sectionId);
		};
		// Section spacing (Structure menu): open the modal / reset the selection.
		const handleSetSectionSpacingEvent = () => openSetSpacingModal();
		const handleResetSectionSpacingEvent = () => resetSectionSpacing();
		// Column spacing (Layout menu): open the modal / reset the selection.
		const handleSetColumnSpacingEvent = () => openSetColumnSpacingModal();
		const handleResetColumnSpacingEvent = () => resetColumnSpacing();
		// Column width (Layout menu): open the modal / reset the selection.
		const handleSetColumnWidthEvent = () => openSetColumnWidthModal();
		const handleResetColumnWidthEvent = () => resetColumnWidth();

		// Export (Export menu): capture the visual analyze content (the zoom-transformed
		// .analyze-content-inner) to the requested format and download it. The util
		// temporarily neutralizes the zoom transform so the FULL study is exported at
		// natural resolution regardless of the current zoom level or scroll position.
		const handleExportAnalyzeEvent = (event) => {
			const format = event.detail?.format;
			if (!format) return;
			exportAnalyzeView({
				element: contentInnerRef,
				title: data.study?.title,
				format
			}).catch((error) => {
				console.error('Export failed:', error);
				alert(`Export failed: ${error?.message || 'Unknown error'}`);
			});
		};

		window.addEventListener('clear-analyze-selections', handleClearAnalyzeSelections);

		window.addEventListener('export-analyze', handleExportAnalyzeEvent);

		window.addEventListener('set-segment-height', handleSetSegmentHeightEvent);

		window.addEventListener('restore-segment-height', handleRestoreSegmentHeightEvent);
		window.addEventListener('link-segment-height', handleLinkSegmentHeightEvent);
		window.addEventListener('unlink-segment-height', handleUnlinkSegmentHeightEvent);
		window.addEventListener('reset-section-position', handleResetSectionPositionEvent);

		window.addEventListener('set-section-spacing', handleSetSectionSpacingEvent);
		window.addEventListener('reset-section-spacing', handleResetSectionSpacingEvent);
		window.addEventListener('set-column-spacing', handleSetColumnSpacingEvent);
		window.addEventListener('reset-column-spacing', handleResetColumnSpacingEvent);
		window.addEventListener('set-column-width', handleSetColumnWidthEvent);
		window.addEventListener('reset-column-width', handleResetColumnWidthEvent);

		window.addEventListener('insert-connection', handleInsertConnectionEvent);

		window.addEventListener('remove-connection', handleRemoveConnectionEvent);
		window.addEventListener('insert-column', handleInsertColumnEvent);
		window.addEventListener('insert-section', handleInsertSectionEvent);
		window.addEventListener('insert-segment', handleInsertSegmentEvent);
		window.addEventListener('join-column', handleJoinColumnEvent);
		window.addEventListener('join-section', handleJoinSectionEvent);
		window.addEventListener('join-segment', handleJoinSegmentEvent);
		window.addEventListener('move-text-up', handleMoveTextUpEvent);

		window.addEventListener('move-text-down', handleMoveTextDownEvent);
		window.addEventListener('insert-heading-one-from-menu', handleInsertHeadingOneFromMenuEvent);
		window.addEventListener('insert-heading-two-from-menu', handleInsertHeadingTwoFromMenuEvent);
		window.addEventListener('insert-heading-three-from-menu', handleInsertHeadingThreeFromMenuEvent);
		window.addEventListener('insert-note-from-menu', handleInsertNoteFromMenuEvent);
		window.addEventListener('select-column', handleSelectColumnEvent);
		window.addEventListener('deselect-column', handleDeselectColumnEvent);
		window.addEventListener('select-section', handleSelectSectionEvent);
		window.addEventListener('deselect-section', handleDeselectSectionEvent);
		window.addEventListener('select-all-columns', handleSelectAllColumnsEvent);
		window.addEventListener('select-all-sections', handleSelectAllSectionsEvent);
		window.addEventListener('select-all-segments', handleSelectAllSegmentsEvent);
		
		// Set up ResizeObserver to recompute fit scale when the viewport dimensions change
		// (e.g. user resizes the window or toggles the studies/commentary panels)
		let resizeObserver = null;
		if (analyzeContentRef) {
			resizeObserver = new ResizeObserver(() => {
				computeFitScale();
			});
			resizeObserver.observe(analyzeContentRef);
		}

		return () => {
			window.removeEventListener('clear-analyze-selections', handleClearAnalyzeSelections);
			window.removeEventListener('export-analyze', handleExportAnalyzeEvent);
			window.removeEventListener('set-segment-height', handleSetSegmentHeightEvent);

			window.removeEventListener('restore-segment-height', handleRestoreSegmentHeightEvent);
			window.removeEventListener('link-segment-height', handleLinkSegmentHeightEvent);
			window.removeEventListener('unlink-segment-height', handleUnlinkSegmentHeightEvent);
			window.removeEventListener('reset-section-position', handleResetSectionPositionEvent);
			window.removeEventListener('set-section-spacing', handleSetSectionSpacingEvent);
			window.removeEventListener('reset-section-spacing', handleResetSectionSpacingEvent);
			window.removeEventListener('set-column-spacing', handleSetColumnSpacingEvent);
			window.removeEventListener('reset-column-spacing', handleResetColumnSpacingEvent);
			window.removeEventListener('set-column-width', handleSetColumnWidthEvent);
			window.removeEventListener('reset-column-width', handleResetColumnWidthEvent);
			window.removeEventListener('insert-connection', handleInsertConnectionEvent);





			window.removeEventListener('remove-connection', handleRemoveConnectionEvent);
			window.removeEventListener('insert-column', handleInsertColumnEvent);
			window.removeEventListener('insert-section', handleInsertSectionEvent);
			window.removeEventListener('insert-segment', handleInsertSegmentEvent);
			window.removeEventListener('join-column', handleJoinColumnEvent);
			window.removeEventListener('join-section', handleJoinSectionEvent);
			window.removeEventListener('join-segment', handleJoinSegmentEvent);
			window.removeEventListener('move-text-up', handleMoveTextUpEvent);

			window.removeEventListener('move-text-down', handleMoveTextDownEvent);
			window.removeEventListener('insert-heading-one-from-menu', handleInsertHeadingOneFromMenuEvent);
			window.removeEventListener('insert-heading-two-from-menu', handleInsertHeadingTwoFromMenuEvent);
			window.removeEventListener('insert-heading-three-from-menu', handleInsertHeadingThreeFromMenuEvent);
			window.removeEventListener('insert-note-from-menu', handleInsertNoteFromMenuEvent);
			window.removeEventListener('select-column', handleSelectColumnEvent);
			window.removeEventListener('deselect-column', handleDeselectColumnEvent);
			window.removeEventListener('select-section', handleSelectSectionEvent);
			window.removeEventListener('deselect-section', handleDeselectSectionEvent);
			window.removeEventListener('select-all-columns', handleSelectAllColumnsEvent);
			window.removeEventListener('select-all-sections', handleSelectAllSectionsEvent);
			window.removeEventListener('select-all-segments', handleSelectAllSegmentsEvent);
			resizeObserver?.disconnect();
		};
	});

	// ─── Join Column / Section / Segment ──────────────────────────────────────
	// Join collapses the active item INTO the one immediately preceding it. The flow
	// dry-runs first: an empty item is joined silently, while an item carrying authored
	// content or affected connections opens a confirm modal offering Merge vs Delete.
	let joinModalOpen = $state(false);
	let joinModalType = $state(/** @type {'column'|'section'|'segment'} */ ('segment'));
	let joinModalSummary = $state('');
	// Heads-up flag: the merge would push the resulting Quick Note over the cap,
	// so it will be truncated. Surfaced by the confirm modal (see analyzeJoin).
	let joinModalNoteWillTruncate = $state(false);
	let joinPending = $state(/** @type {{ type: string, id: string } | null} */ (null));

	const JOIN_ENDPOINT = {
		column: '/api/passages/columns/join',
		section: '/api/passages/sections/join',
		segment: '/api/passages/segments/join'
	};

	/** Build the join request body for a given item type/id. */
	function joinBody(type, id, extra = {}) {
		const key = type === 'column' ? 'columnId' : type === 'section' ? 'sectionId' : 'segmentId';
		return { [key]: id, ...extra };
	}

	/**
	 * Entry point for a Join action. Dry-runs to learn whether content/connections are
	 * affected: if not, the join runs immediately; if so, the confirm modal opens so the
	 * user can choose Merge (default) or Delete.
	 * @param {'column'|'section'|'segment'} type
	 * @param {string} id
	 */
	async function handleJoin(type, id) {
		try {
			const dryRes = await fetch(JOIN_ENDPOINT[type], {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(joinBody(type, id, { dryRun: true }))
			});

			if (!dryRes.ok) {
				const error = await dryRes.json();
				console.error('Join dry-run error:', error);
				alert(`Error: ${error.error || `Failed to join ${type}`}`);
				return;
			}

			const { needsDecision, summary, noteWillTruncate } = await dryRes.json();
			if (needsDecision) {
				// Defer to the modal: the user picks Merge or Delete.
				joinModalType = type;
				joinModalSummary = summary || '';
				joinModalNoteWillTruncate = !!noteWillTruncate;
				joinPending = { type, id };
				joinModalOpen = true;
			} else {
				// Nothing of value would be folded — join straight away (defaults to merge).
				await runJoin(type, id, 'merge');
			}
		} catch (error) {
			console.error('Join network error:', error);
			alert(`Error: ${error.message || `Failed to join ${type}`}`);
		}
	}

	/**
	 * Execute the join for real, then clear selections and refresh.
	 * @param {'column'|'section'|'segment'} type
	 * @param {string} id
	 * @param {'merge'|'delete'} decision
	 */
	async function runJoin(type, id, decision) {
		const response = await fetch(JOIN_ENDPOINT[type], {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(joinBody(type, id, { decision }))
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || `Failed to join ${type}`);
		}

		// Clear all selections — the joined item no longer exists.
		selectedWord = null;
		activeSegments = [];
		activeColumns = [];
		activeSections = [];
		suppressHoverCaret = null;
		await invalidate('app:studies');
	}

	/**
	 * Confirm handler for the Join modal. Runs the pending join with the chosen decision,
	 * then closes the modal. Errors propagate to the modal so it can show them inline.
	 * @param {'merge'|'delete'} decision
	 */
	async function confirmJoin(decision) {
		if (!joinPending) return;
		await runJoin(joinPending.type, joinPending.id, decision);
		joinModalOpen = false;
		joinPending = null;
	}

	/**
	 * Handle Insert Column button click
	 */
	async function handleInsertColumn() {

		console.log('handleInsertColumn called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent elements
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find parent structural elements
		const segmentElement = wordElement.closest('.segment');
		const sectionElement = wordElement.closest('.section');
		const columnElement = wordElement.closest('.column');
		
		if (!segmentElement || !sectionElement || !columnElement) {
			console.log('Parent structural elements not found');
			return;
		}
		
		// Extract IDs from data attributes
		const columnId = columnElement.dataset.columnId;
		const sectionId = sectionElement.dataset.sectionId;
		const segmentId = segmentElement.dataset.segmentId;
		
		if (!columnId || !sectionId || !segmentId) {
			console.log('Missing structural IDs');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting column at:', insertionWordId, 'in column:', columnId, 'section:', sectionId, 'segment:', segmentId);

		try {
			const response = await fetch('/api/passages/columns/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					columnId: columnId,
					sectionId: sectionId,
					segmentId: segmentId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Column inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert column error response:', error);
				alert(`Error: ${error.error || 'Failed to insert column'}`);
			}
		} catch (error) {
			console.error('Insert column network error:', error);
			alert(`Error: ${error.message || 'Failed to insert column'}`);
		}
	}

	/**
	 * Handle Split Section button click (splits a section at the selected word)
	 */
	async function handleInsertSection() {
		console.log('handleInsertSection called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent elements
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find parent structural elements
		const segmentElement = wordElement.closest('.segment');
		const sectionElement = wordElement.closest('.section');
		const columnElement = wordElement.closest('.column');
		
		if (!segmentElement || !sectionElement || !columnElement) {
			console.log('Parent structural elements not found');
			return;
		}
		
		// Extract IDs from data attributes
		const columnId = columnElement.dataset.columnId;
		const sectionId = sectionElement.dataset.sectionId;
		const segmentId = segmentElement.dataset.segmentId;
		
		if (!columnId || !sectionId || !segmentId) {
			console.log('Missing structural IDs');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting section at:', insertionWordId, 'in column:', columnId, 'section:', sectionId, 'segment:', segmentId);

		try {
			const response = await fetch('/api/passages/sections/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					columnId: columnId,
					sectionId: sectionId,
					segmentId: segmentId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Section inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert section error response:', error);
				alert(`Error: ${error.error || 'Failed to insert section'}`);
			}
		} catch (error) {
			console.error('Insert section network error:', error);
			alert(`Error: ${error.message || 'Failed to insert section'}`);
		}
	}

	/**
	 * Handle Insert Segment button click
	 */
	async function handleInsertSegment() {
		console.log('handleInsertSegment called');
		
		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Get the word element to find its parent section
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);
		
		if (!wordElement) {
			console.log('Word element not found');
			return;
		}
		
		// Find the parent section element
		const sectionElement = wordElement.closest('.section');
		if (!sectionElement) {
			console.log('No parent section found');
			return;
		}
		
		// Extract section ID from the data attribute
		const sectionId = sectionElement.dataset.sectionId;
		if (!sectionId) {
			console.log('No section ID found on element');
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found');
			return;
		}

		console.log('Inserting segment at:', insertionWordId, 'in section:', sectionId, 'for passage:', passageText.structure.passageId);

		try {
			const response = await fetch('/api/passages/segments/insert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					sectionId: sectionId,
					insertionWordId: insertionWordId
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Segment inserted successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;
				
				// Refresh data using the dependency key from the layout
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Insert segment error response:', error);
				alert(`Error: ${error.error || 'Failed to insert segment'}`);
			}
		} catch (error) {
			console.error('Insert segment network error:', error);
			alert(`Error: ${error.message || 'Failed to insert segment'}`);
		}
	}

	/**
	 * Handle Move Text Up button click.
	 * Moves all text in the active segment before the caret up into the preceding segment
	 * by updating the current segment's startingWordId to the caret position.
	 */
	async function handleMoveTextUp() {
		console.log('handleMoveTextUp called');

		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Find the selected word element in the DOM
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);

		if (!wordElement) {
			console.log('Word element not found');
			return;
		}

		// Find the parent segment element to get the segmentId
		const segmentElement = wordElement.closest('.segment');
		if (!segmentElement) {
			console.log('No parent segment found');
			return;
		}

		const segmentId = segmentElement.dataset.segmentId;
		if (!segmentId) {
			console.log('No segment ID found on element');
			return;
		}

		// Determine the insertion word ID based on caret position
		// insertionWordId = the first word that stays in the current segment after the move
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Caret is before the selected word — that word stays in the current segment
			insertionWordId = selectedWord.wordId;
		} else {
			// Caret is after the selected word — next word stays in the current segment
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found (caret may be at end of passage)');
			return;
		}

		console.log('Moving text up: segment', segmentId, 'new start', insertionWordId);

		try {
			const response = await fetch('/api/passages/segments/move-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					segmentId: segmentId,
					insertionWordId: insertionWordId,
					direction: 'up'
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Text moved up successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;

				// Refresh data
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Move text up error response:', error);
				alert(`Error: ${error.error || 'Failed to move text up'}`);
			}
		} catch (error) {
			console.error('Move text up network error:', error);
			alert(`Error: ${error.message || 'Failed to move text up'}`);
		}
	}

	/**
	 * Handle Move Text Down button click.
	 * Moves all text in the active segment after the caret down into the next segment
	 * by updating the next segment's startingWordId to the caret position.
	 */
	async function handleMoveTextDown() {
		console.log('handleMoveTextDown called');

		if (!selectedWord || !data.passagesWithText) {
			console.log('No selected word or passages');
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !('structure' in passageText) || !passageText.structure) {
			console.log('No passage text or structure');
			return;
		}

		// Find the selected word element in the DOM
		const wordElement = document.querySelector(
			`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
		);

		if (!wordElement) {
			console.log('Word element not found');
			return;
		}

		// Find the parent segment element to get the segmentId
		const segmentElement = wordElement.closest('.segment');
		if (!segmentElement) {
			console.log('No parent segment found');
			return;
		}

		const segmentId = segmentElement.dataset.segmentId;
		if (!segmentId) {
			console.log('No segment ID found on element');
			return;
		}

		// Determine the insertion word ID based on caret position
		// insertionWordId = the first word that moves down into the next segment
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Caret is before the selected word — that word moves down
			insertionWordId = selectedWord.wordId;
		} else {
			// Caret is after the selected word — next word moves down
			let nextElement = wordElement.nextElementSibling;
			while (nextElement) {
				if (nextElement.classList && nextElement.classList.contains('selectable-word')) {
					insertionWordId = nextElement.dataset?.wordId || null;
					break;
				}
				nextElement = nextElement.nextElementSibling;
			}
		}

		if (!insertionWordId) {
			console.log('No insertion word ID found (caret may be at end of passage)');
			return;
		}

		console.log('Moving text down: next segment new start', insertionWordId, 'in segment', segmentId);

		try {
			const response = await fetch('/api/passages/segments/move-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					passageId: passageText.structure.passageId,
					segmentId: segmentId,
					insertionWordId: insertionWordId,
					direction: 'down'
				})
			});

			console.log('Response status:', response.status);

			if (response.ok) {
				console.log('Text moved down successfully');
				// Clear selection
				selectedWord = null;
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
				suppressHoverCaret = null;

				// Refresh data
				await invalidate('app:studies');
			} else {
				const error = await response.json();
				console.error('Move text down error response:', error);
				alert(`Error: ${error.error || 'Failed to move text down'}`);
			}
		} catch (error) {
			console.error('Move text down network error:', error);
			alert(`Error: ${error.message || 'Failed to move text down'}`);
		}
	}

	/**
	 * Check if a segment is in a column
	 * @param {Object} column - Column object
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {boolean} True if segment is in column
	 */
	function isSegmentInColumn(column, segmentId) {
		return column.sections.some(section => 
			section.segments.some(segment => segment.id === segmentId)
		);
	}

	/**
	 * Check if a segment is in a section
	 * @param {Object} section - Section object
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {boolean} True if segment is in section
	 */
	function isSegmentInSection(section, segmentId) {
		return section.segments.some(segment => segment.id === segmentId);
	}

	// ============================================================
	// COMPARE MODE HELPER FUNCTIONS
	// ============================================================

	/**
	 * Calculate which columns, sections, and segments should be visible in compare mode
	 * based on the original selection. Respects hierarchical containment rules.
	 * 
	 * Key behavior:
	 * - Selected segments → Show ONLY those segments (+ parent section/column as containers)
	 * - Selected sections → Show section + ALL its segments (+ parent column as container)
	 * - Selected columns → Show column + ALL its sections + ALL their segments
	 * 
	 * @param {Object} selection - Original selection { columns: [], sections: [], segments: [] }
	 * @returns {Object} Visible items { columns: Set, sections: Set, segments: Set }
	 */
	function calculateVisibleItems(selection) {
		const columns = new Set();
		const sections = new Set();
		const segments = new Set();
		
		// Add selected segments and their parent sections/columns (but NOT sibling segments)
		selection.segments.forEach(seg => {
			segments.add(seg.segmentId);
			const sectionId = getSectionIdFromSegmentId(seg.segmentId);
			const columnId = getColumnIdFromSegmentId(seg.segmentId);
			if (sectionId) sections.add(sectionId);
			if (columnId) columns.add(columnId);
		});
		
		// Add selected sections, their parent columns, and ALL their segments
		selection.sections.forEach(sectionId => {
			sections.add(sectionId);
			const columnId = getColumnIdFromSectionId(sectionId);
			if (columnId) columns.add(columnId);
			// Add all segments in this section
			getAllSegmentIdsInSection(sectionId).forEach(segId => segments.add(segId));
		});
		
		// Add selected columns and ALL their sections and segments
		selection.columns.forEach(columnId => {
			columns.add(columnId);
			// Add all sections in this column
			getAllSectionIdsInColumn(columnId).forEach(secId => sections.add(secId));
			// Add all segments in this column
			getAllSegmentIdsInColumn(columnId).forEach(segId => segments.add(segId));
		});
		
		return { columns, sections, segments };
	}

	// ============================================================
	// HIERARCHICAL SELECTION HELPER FUNCTIONS
	// ============================================================

	/**
	 * Get the column ID that contains a given section ID
	 * @param {string} sectionId - Section ID to search for
	 * @returns {string|null} Column ID or null if not found
	 */
	function getColumnIdFromSectionId(sectionId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				if (column.sections.some(section => section.id === sectionId)) {
					return column.id;
				}
			}
		}
		return null;
	}

	/**
	 * Get the column ID that contains a given segment ID
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {string|null} Column ID or null if not found
	 */
	function getColumnIdFromSegmentId(segmentId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					if (section.segments.some(segment => segment.id === segmentId)) {
						return column.id;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Get the section ID that contains a given segment ID
	 * @param {string} segmentId - Segment ID to search for
	 * @returns {string|null} Section ID or null if not found
	 */
	function getSectionIdFromSegmentId(segmentId) {
		if (!data.passagesWithText) return null;
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					if (section.segments.some(segment => segment.id === segmentId)) {
						return section.id;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Get all section IDs in a given column
	 * @param {string} columnId - Column ID
	 * @returns {string[]} Array of section IDs
	 */
	function getAllSectionIdsInColumn(columnId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			const column = passageText.structure.columns.find(col => col.id === columnId);
			if (column) {
				return column.sections.map(section => section.id);
			}
		}
		return [];
	}

	/**
	 * Get all segment IDs in a given section
	 * @param {string} sectionId - Section ID
	 * @returns {string[]} Array of segment IDs
	 */
	function getAllSegmentIdsInSection(sectionId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			for (const column of passageText.structure.columns) {
				const section = column.sections.find(sec => sec.id === sectionId);
				if (section) {
					return section.segments.map(segment => segment.id);
				}
			}
		}
		return [];
	}

	/**
	 * Check if a passage has any visible items in compare mode.
	 * Returns true if any column, section, or segment in the passage is in the visible sets.
	 * @param {Object} passageText - Passage data object with structure
	 * @returns {boolean} True if the passage has at least one visible item
	 */
	function passageHasVisibleItems(passageText) {
		if (!passageText.structure?.columns) return false;
		for (const column of passageText.structure.columns) {
			if (visibleColumnIds.has(column.id)) return true;
			for (const section of column.sections) {
				if (visibleSectionIds.has(section.id)) return true;
				for (const segment of section.segments) {
					if (visibleSegmentIds.has(segment.id)) return true;
				}
			}
		}
		return false;
	}

	/**
	 * Get all segment IDs in a given column (across all its sections)
	 * @param {string} columnId - Column ID
	 * @returns {string[]} Array of segment IDs
	 */
	function getAllSegmentIdsInColumn(columnId) {
		if (!data.passagesWithText) return [];
		
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			
			const column = passageText.structure.columns.find(col => col.id === columnId);
			if (column) {
				const segmentIds = [];
				for (const section of column.sections) {
					segmentIds.push(...section.segments.map(segment => segment.id));
				}
				return segmentIds;
			}
		}
		return [];
	}

	/**
	 * Get all column IDs across every passage in the study, in document order.
	 * @returns {string[]} Array of column IDs
	 */
	function getAllColumnIdsInStudy() {
		if (!data.passagesWithText) return [];
		const ids = [];
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			for (const column of passageText.structure.columns) {
				ids.push(column.id);
			}
		}
		return ids;
	}

	/**
	 * Get all section IDs across every passage/column in the study, in document order.
	 * @returns {string[]} Array of section IDs
	 */
	function getAllSectionIdsInStudy() {
		if (!data.passagesWithText) return [];
		const ids = [];
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					ids.push(section.id);
				}
			}
		}
		return ids;
	}

	/**
	 * Get every segment across every passage/column/section in the study, in document
	 * order, as the segment objects that activeSegments expects.
	 * segmentIndex is a running index within each passage (matching the DOM order of
	 * .segment elements, flattened across columns/sections) so rendered segments match.
	 * @returns {Array<{passageIndex:number, segmentIndex:number, segmentId:string, activateSection:boolean, generation:number}>}
	 */
	function getAllSegmentsInStudy() {
		if (!data.passagesWithText) return [];
		const segments = [];
		data.passagesWithText.forEach((passageText, passageIndex) => {
			if (!passageText.structure?.columns) return;
			let segmentIndex = 0;
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					for (const segment of section.segments) {
						segments.push({
							passageIndex,
							segmentIndex: segmentIndex++,
							segmentId: segment.id,
							activateSection: false,
							generation: segmentClickGeneration
						});
					}
				}
			}
		});
		return segments;
	}

	/**
	 * Count every segment across every passage/column/section in the study.
	 * Used to decide whether a selection covers "All of them" (which disables Focus):
	 * if the segments revealed by a selection equal this total, focusing would show the
	 * entire study, so the Focus button is disabled.
	 * @returns {number} Total number of segments in the study
	 */
	function getTotalSegmentCountInStudy() {
		if (!data.passagesWithText) return 0;
		let count = 0;
		for (const passageText of data.passagesWithText) {
			if (!passageText.structure?.columns) continue;
			for (const column of passageText.structure.columns) {
				for (const section of column.sections) {
					count += section.segments.length;
				}
			}
		}
		return count;
	}

	/**
	 * Select every column in the study at once. Clears any section/segment selection
	 * (columns sit at the top of the hierarchy) plus connection and word selections.
	 * Respects compare mode by writing to the compare-mode selection arrays instead.
	 */
	function handleSelectAllColumns() {
		// Clear connections / open editors when a structural selection is made.
		setActiveConnection(false, []);
		setHeadingOrNoteEditorActive(false, null);

		const ids = getAllColumnIdsInStudy();
		if (isCompareMode) {
			compareActiveColumns = ids;
			compareActiveSections = [];
			compareActiveSegments = [];
		} else {
			activeColumns = ids;
			activeSections = [];
			activeSegments = [];
		}
		selectedWord = null;
		suppressHoverCaret = null;
	}

	/**
	 * Select every section in the study at once. Clears any column/segment selection
	 * plus connection and word selections. Respects compare mode.
	 */
	function handleSelectAllSections() {
		setActiveConnection(false, []);
		setHeadingOrNoteEditorActive(false, null);

		const ids = getAllSectionIdsInStudy();
		if (isCompareMode) {
			compareActiveColumns = [];
			compareActiveSections = ids;
			compareActiveSegments = [];
		} else {
			activeColumns = [];
			activeSections = ids;
			activeSegments = [];
		}
		selectedWord = null;
		suppressHoverCaret = null;
	}

	/**
	 * Select every segment in the study at once. Clears any column/section selection
	 * plus connection and word selections. Respects compare mode.
	 */
	function handleSelectAllSegments() {
		setActiveConnection(false, []);
		setHeadingOrNoteEditorActive(false, null);

		const segments = getAllSegmentsInStudy();
		if (isCompareMode) {
			compareActiveColumns = [];
			compareActiveSections = [];
			compareActiveSegments = segments;
		} else {
			activeColumns = [];
			activeSections = [];
			activeSegments = segments;
		}
		selectedWord = null;
		suppressHoverCaret = null;
	}

	// ============================================================
	// HIERARCHICAL SELECTION HANDLER
	// ============================================================

	/**
	 * Handle hierarchical selection logic for columns, sections, and segments
	 * Implements all 7 scenarios from the Multi-Select Scenarios document
	 * Works with both normal and compare mode selections
	 * @param {string} type - Type of item: 'column', 'section', or 'segment'
	 * @param {string} id - ID of the item being selected
	 * @param {Object} segmentData - Additional data for segment selection (passageIndex, segmentIndex, generation)
	 * @returns {Object} New state: { columns: [], sections: [], segments: [] }
	 */
	function handleSelection(type, id, segmentData = null) {
		console.log(`[SELECTION] Handling ${type} selection:`, id, 'Compare mode:', isCompareMode);
		
		// Use compare-mode selections if in compare mode
		const currentColumns = isCompareMode ? compareActiveColumns : activeColumns;
		const currentSections = isCompareMode ? compareActiveSections : activeSections;
		const currentSegments = isCompareMode ? compareActiveSegments : activeSegments;
		
		console.log('[SELECTION] Current state - Columns:', currentColumns, 'Sections:', currentSections, 'Segments:', currentSegments.map(s => s.segmentId));
		
		let newColumns = [...currentColumns];
		let newSections = [...currentSections];
		let newSegments = [...currentSegments];
		
		// SCENARIO ROUTING
		if (type === 'column') {
			// Check if this column is already selected (toggle/deselect)
			if (newColumns.includes(id)) {
				console.log('[SELECTION] Column already selected - removing');
				newColumns = newColumns.filter(c => c !== id);
			} else {
				// Column not selected - add it
				// Remove any sections that are in this column
				const sectionsInColumn = getAllSectionIdsInColumn(id);
				newSections = newSections.filter(s => !sectionsInColumn.includes(s));
				
				// Remove any segments that are in this column
				const segmentsInColumn = getAllSegmentIdsInColumn(id);
				newSegments = newSegments.filter(seg => !segmentsInColumn.includes(seg.segmentId));
				
				newColumns.push(id);
				console.log('[SELECTION] Added column, removed its sections/segments');
			}
		}
		else if (type === 'section') {
			const parentColumnId = getColumnIdFromSectionId(id);
			
			// Check if this section is already selected (toggle/deselect)
			if (newSections.includes(id)) {
				console.log('[SELECTION] Section already selected - removing');
				newSections = newSections.filter(s => s !== id);
			} else {
				// Section not selected - add it
				// If parent column is selected, remove it
				if (parentColumnId && newColumns.includes(parentColumnId)) {
					newColumns = newColumns.filter(c => c !== parentColumnId);
					console.log('[SELECTION] Removed parent column');
				}
				
				// Remove any segments that are in this section
				const segmentsInSection = getAllSegmentIdsInSection(id);
				newSegments = newSegments.filter(seg => !segmentsInSection.includes(seg.segmentId));
				
				newSections.push(id);
				console.log('[SELECTION] Added section, removed its segments');
			}
		}
		else if (type === 'segment') {
			// Check if this segment is already selected (toggle/deselect)
			if (newSegments.some(seg => seg.segmentId === id)) {
				console.log('[SELECTION] Segment already selected - removing');
				newSegments = newSegments.filter(seg => seg.segmentId !== id);
			} else {
				// Segment not selected - add it
				const parentSectionId = getSectionIdFromSegmentId(id);
				const parentColumnId = getColumnIdFromSegmentId(id);
				
				// If parent section is selected, remove it
				if (parentSectionId && newSections.includes(parentSectionId)) {
					newSections = newSections.filter(s => s !== parentSectionId);
					console.log('[SELECTION] Removed parent section');
				}
				
				// If parent column is selected, remove it
				if (parentColumnId && newColumns.includes(parentColumnId)) {
					newColumns = newColumns.filter(c => c !== parentColumnId);
					console.log('[SELECTION] Removed parent column');
				}
				
				// Add the segment
				if (segmentData) {
				newSegments.push({
					passageIndex: segmentData.passageIndex,
					segmentIndex: segmentData.segmentIndex,
					segmentId: id,
					activateSection: false,
					generation: segmentData.generation
				});
			} else {
				// Fallback if segmentData not provided
				newSegments.push({
					passageIndex: 0,
					segmentIndex: 0,
					segmentId: id,
					activateSection: false,
					generation: segmentClickGeneration
				});
			}
			console.log('[SELECTION] Added segment');
			}
		}
		
		console.log('[SELECTION] New state - Columns:', newColumns, 'Sections:', newSections, 'Segments:', newSegments.map(s => s.segmentId));
		
		return {
			columns: newColumns,
			sections: newSections,
			segments: newSegments
		};
	}

	/**
	 * Build a map of segmentId -> sectionEndIdx (index one past the last segment in the section).
	 * Used to enforce section boundaries when calculating heading references.
	 * @param {Array} columns - Passage structure columns array
	 * @returns {Map<string, number>} Map of segmentId to sectionEndIdx
	 */
	function buildSegmentSectionEndIdxMap(columns) {
		const map = new Map();
		let globalIdx = 0;
		for (const col of columns) {
			for (const section of col.sections) {
				const sectionEndIdx = globalIdx + section.segments.length;
				for (const seg of section.segments) {
					map.set(seg.id, sectionEndIdx);
				}
				globalIdx = sectionEndIdx;
			}
		}
		return map;
	}

	/**
	 * Construct the exclusive end word ID for a passage (used as the boundary when a reference
	 * extends to the end of the passage and there is no next segment to borrow a word ID from).
	 * Uses passageData.toChapter and passageData.toVerse + 1 as the exclusive boundary.
	 * @param {Array} allSegments - All segments in the passage (flat array)
	 * @param {Object} passageData - Passage DB record with toChapter, toVerse
	 * @returns {string|null} Exclusive end word ID or null if not computable
	 */
	function getPassageEndWordId(allSegments, passageData) {
		if (!allSegments.length || !passageData) return null;
		const firstWordId = allSegments[0].startingWordId;
		if (!firstWordId) return null;
		const parts = firstWordId.split('-');
		if (parts.length < 4) return null;
		const bookAbbr = parts[0];
		const chapterPadLen = parts[1].length;
		const versePadLen = parts[2].length;
		const chapStr = String(passageData.toChapter).padStart(chapterPadLen, '0');
		// toVerse + 1 is the exclusive boundary; formatScriptureReference will subtract 1 to get toVerse
		const verseStr = String(passageData.toVerse + 1).padStart(versePadLen, '0');
		return `${bookAbbr}-${chapStr}-${verseStr}-001`;
	}

	/**
	 * Calculate scripture references for headings in all segments.
	 * Rules:
	 *   - Heading One   → spans to next H1 within section, or section end
	 *   - Heading Two   → spans to next H1 within section, or section end (NOT next H2)
	 *   - Heading Three → spans to next H3 within section, or section end (NOT H1/H2)
	 *   - Segment ref   → spans only the current segment
	 * @param {Array} allSegments - Flat array of all segments in document order
	 * @param {Object} verseSectionMap - Map of verseId -> count of segments containing that verse
	 * @param {Map<string, number>} segmentSectionEndIdxMap - Map of segmentId -> sectionEndIdx
	 * @param {string|null} passageEndWordId - Exclusive end word ID for the passage boundary
	 * @returns {Object} Map of segmentId -> { heading1Ref, heading2Ref, heading3Ref, segmentRef }
	 */
	function calculateHeadingReferences(allSegments, verseSectionMap, segmentSectionEndIdxMap = null, passageEndWordId = null) {
		const references = {};
		
		// Track verse subdivision occurrences for calculating suffixes
		const verseOccurrenceTracker = {};
		
		for (let i = 0; i < allSegments.length; i++) {
			const segment = allSegments[i];
			references[segment.id] = {
				heading1Ref: null,
				heading2Ref: null,
				heading3Ref: null,
				segmentRef: null
			};

			// Section boundary: index one past the last segment of this segment's section
			const sectionEndIdx = segmentSectionEndIdxMap?.get(segment.id) ?? allSegments.length;
			
			// Get verse ID from starting word ID for suffix calculation
			const startParts = segment.startingWordId?.split('-');
			const startVerseId = startParts?.length >= 3 ? startParts.slice(0, 3).join('-') : null;
			
			// Calculate starting verse suffix
			let startSuffix = '';
			if (startVerseId && verseSectionMap && verseSectionMap[startVerseId] > 1) {
				// This verse is subdivided - calculate which occurrence this is
				if (verseOccurrenceTracker[startVerseId] === undefined) {
					verseOccurrenceTracker[startVerseId] = 0;
				}
				startSuffix = generateVerseSuffix(verseOccurrenceTracker[startVerseId]);
				verseOccurrenceTracker[startVerseId]++;
			}
			
			// Calculate Heading One reference (if exists)
			// Spans to next H1 within section, or section end — whichever is first
			if (segment.headingOne) {
				let endIdx = i + 1;
				while (endIdx < sectionEndIdx && !allSegments[endIdx].headingOne) {
					endIdx++;
				}
				const { endWordId } = calculateEndReference(allSegments, i, endIdx, verseSectionMap, verseOccurrenceTracker, passageEndWordId);
				references[segment.id].heading1Ref = formatScriptureReference(segment.startingWordId, endWordId, '', '');
			}
			
			// Calculate Heading Two reference (if exists)
			// Spans to next H1 within section, or section end — NOT stopped by H2
			if (segment.headingTwo) {
				let endIdx = i + 1;
				while (endIdx < sectionEndIdx && !allSegments[endIdx].headingOne) {
					endIdx++;
				}
				const { endWordId } = calculateEndReference(allSegments, i, endIdx, verseSectionMap, verseOccurrenceTracker, passageEndWordId);
				references[segment.id].heading2Ref = formatScriptureReference(segment.startingWordId, endWordId, '', '');
			}
			
			// Calculate Heading Three reference (if exists)
			// Spans to next H3 within section, or section end — NOT stopped by H1/H2
			if (segment.headingThree) {
				let endIdx = i + 1;
				while (endIdx < sectionEndIdx && !allSegments[endIdx].headingThree) {
					endIdx++;
				}
				const { endWordId, endSuffix } = calculateEndReference(allSegments, i, endIdx, verseSectionMap, verseOccurrenceTracker, passageEndWordId);
				references[segment.id].heading3Ref = formatScriptureReference(segment.startingWordId, endWordId, startSuffix, endSuffix);
			}
			
		// Calculate segment reference (spans only this segment).
		// Special rules vs heading refs:
		// - Only apply startSuffix when the NEXT segment is in the SAME verse (subdivision context).
		//   If the next segment is in a different verse, this segment covers "all that remains of
		//   its starting verse" and no subdivision suffix is needed (e.g. a 26b segment shows
		//   "Matthew 7:26" not "7:26b").
		// - When the next segment IS in the same verse, use (startVerse + 1) as the exclusive end
		//   boundary instead of nextSegment.startingWordId, to avoid a backwards range
		//   (actualEndVerse = nextVerse − 1 would give the PREVIOUS verse, e.g. "25a-24a").
		{
			const nextSeg = allSegments[i + 1];
			const nextParts = nextSeg?.startingWordId?.split('-');
			const nextVerseId = nextParts?.length >= 3 ? nextParts.slice(0, 3).join('-') : null;
			const sameVerseNext = nextVerseId !== null && nextVerseId === startVerseId;

			// Show subdivision suffix for ALL segments of a split verse.
		// startSuffix is already '' for non-subdivided verses, so this is safe unconditionally.
			const segmentStartSuffix = startSuffix;

			let segEndWordId;
			if (sameVerseNext && startParts && startParts.length >= 3) {
				// Next segment is in same verse → construct (startVerse + 1) as the exclusive end
				// so actualEndVerse = startVerse (collapses to a single-verse reference)
				const verse = parseInt(startParts[2], 10);
				const verseStr = String(verse + 1).padStart(startParts[2].length, '0');
				segEndWordId = `${startParts[0]}-${startParts[1]}-${verseStr}-001`;
			} else if (i + 1 < allSegments.length) {
				segEndWordId = allSegments[i + 1].startingWordId;
			} else {
				segEndWordId = passageEndWordId;
			}

			// No endSuffix for segment refs — just show the verse number(s) covered
			references[segment.id].segmentRef = formatScriptureReference(segment.startingWordId, segEndWordId, segmentStartSuffix, '');
		}
		}
		
		return references;
	}
	
	/**
	 * Calculate the end word ID and suffix for a reference range.
	 * Returns the starting word of the segment at endIdx as an exclusive boundary.
	 * @param {Array} allSegments - All segments
	 * @param {number} currentIdx - Current segment index
	 * @param {number} endIdx - Index of next segment with heading (or end of array)
	 * @param {Object} verseSectionMap - Map of verse subdivisions
	 * @param {Object} verseOccurrenceTracker - Tracker for verse occurrences
	 * @param {string|null} passageEndWordId - Exclusive end word ID for end-of-passage boundary
	 * @returns {Object} { endWordId, endSuffix }
	 */
	function calculateEndReference(allSegments, currentIdx, endIdx, verseSectionMap, verseOccurrenceTracker, passageEndWordId = null) {
		// If there's no next segment, the range extends to the end of the passage
		if (endIdx >= allSegments.length) {
			return { endWordId: passageEndWordId, endSuffix: '' };
		}
		
		// Get the segment just before the next heading (the last segment in our range)
		const lastSegmentInRange = allSegments[endIdx - 1];
		
	// The end word ID is the starting word of the NEXT segment (exclusive boundary).
	// Use `let` so we can correct for multi-column verse inversion below.
	let endWordId = allSegments[endIdx].startingWordId;

	// Guard against multi-column verse inversion: in passages with non-contiguous columns,
	// the segment immediately after a section boundary can start at an EARLIER verse than the
	// last segment of the current range (e.g. column 2 covers verses 7–10 while column 1 ends
	// at verses 11–12). Using that earlier word ID as the exclusive boundary would produce an
	// inverted/garbled reference. Detect this and substitute (lastVerse + 1) instead.
	const lastRangeParts = lastSegmentInRange?.startingWordId?.split('-');
	const nextBoundaryParts = endWordId?.split('-');
	if (lastRangeParts && nextBoundaryParts && lastRangeParts.length >= 3 && nextBoundaryParts.length >= 3) {
		const lastChapter = parseInt(lastRangeParts[1], 10);
		const lastVerse  = parseInt(lastRangeParts[2], 10);
		const nextChapter = parseInt(nextBoundaryParts[1], 10);
		const nextVerse  = parseInt(nextBoundaryParts[2], 10);
		if (nextChapter < lastChapter || (nextChapter === lastChapter && nextVerse <= lastVerse)) {
			const verseStr = String(lastVerse + 1).padStart(lastRangeParts[2].length, '0');
			endWordId = `${lastRangeParts[0]}-${lastRangeParts[1]}-${verseStr}-001`;
		}
	}

	// Calculate the ending verse suffix
	// We need to know which subdivision the last segment's ending verse is in
	let endSuffix = '';
	const endParts = lastSegmentInRange.startingWordId?.split('-');
		const endVerseId = endParts?.length >= 3 ? endParts.slice(0, 3).join('-') : null;
		
		if (endVerseId && verseSectionMap && verseSectionMap[endVerseId] > 1) {
			// Find which occurrence this is by counting segments up to lastSegmentInRange
			let occurrenceCount = 0;
			for (let i = 0; i <= endIdx - 1; i++) {
				const segParts = allSegments[i].startingWordId?.split('-');
				const segVerseId = segParts?.length >= 3 ? segParts.slice(0, 3).join('-') : null;
				if (segVerseId === endVerseId) {
					occurrenceCount++;
				}
			}
			// Use the last occurrence's suffix (occurrenceCount - 1 because we're 0-indexed)
			endSuffix = generateVerseSuffix(occurrenceCount - 1);
		}
		
		return { endWordId, endSuffix };
	}

	/**
	 * Handle mouse down - track position for drag detection
	 */
	function handleMouseDown(event) {
		// Only track for left-click
		if (event.button === 0) {
			dragStartPos = { x: event.clientX, y: event.clientY };
			isDragging = false;
		}
	}

	/**
	 * Handle mouse move - detect if user is dragging
	 */
	function handleMouseMove(event) {
		if (dragStartPos) {
			// Calculate distance moved from drag start position
			const distance = Math.sqrt(
				Math.pow(event.clientX - dragStartPos.x, 2) + 
				Math.pow(event.clientY - dragStartPos.y, 2)
			);
			// If moved more than 3px, consider it a drag
			if (distance > 3) {
				// Check if drag is happening inside an input/textarea
				const isInInput = event.target.closest('input, textarea');
				
				isDragging = true;
				dragJustCompleted = true; // Mark that a drag occurred
				// Clear custom selections immediately when drag is detected
				selectedWord = null;
				suppressHoverCaret = null;
				
				// Only clear active segments if NOT dragging in an input
				if (!isInInput) {
					activeSegments = [];
					activeColumns = [];
					activeSections = [];
				}
			}
		}
	}

	/**
	 * Handle mouse up - reset drag state
	 */
	function handleMouseUp() {
		// Reset drag state
		dragStartPos = null;
		isDragging = false;
	}

	/**
	 * Handle word hover
	 * Disabled when dragging
	 */
	function handleWordHover(event) {
		// Don't process word hover when dragging
		if (isDragging) return;
		
		const target = event.target;
		if (target.classList.contains('selectable-word')) {
			hoveredWord = {
				passageIndex: parseInt(target.dataset.passageIndex),
				wordId: target.dataset.wordId
			};
		}
	}

	/**
	 * Handle word hover end - also clears hover caret suppression
	 */
	function handleWordHoverEnd() {
		
		hoveredWord = null;
		suppressHoverCaret = null; // Clear suppression when mouse leaves
	}

	/**
	 * Handle word click with three-state selection
	 * - Click 1: Caret before word
	 * - Click 2 (same word): Caret after word
	 * - Click 3 (same word): Deselect
	 * - Shift+Click: Jump directly to "after" position
	 * 
	 * Also handles segment activation
	 * 
	 * Only active when not dragging
	 */
	function handleWordClick(event) {
		// Check if browser has an active text selection
		const selection = window.getSelection();
		const hasTextSelection = selection && selection.toString().length > 0;
		
		// If Shift is held AND there's an active text selection, 
		// let browser handle it to extend selection
		if (event.shiftKey && hasTextSelection) {
			console.log('[CLICK] Shift+click with active selection - allowing browser to extend');
			return; // Don't process - let browser extend selection
		}
		
		// Check if a drag just completed - if so, ignore this click
		if (dragJustCompleted) {
			dragJustCompleted = false; // Reset flag
			return;
		}
		
		// Don't process word selection when dragging (text selection)
		if (isDragging) {
			// Reset drag state
			dragStartPos = null;
			isDragging = false;
			return;
		}

		// Don't allow segment/section activation in overview mode
		if ($toolbarState.overviewMode) {
			return;
		}
		
		// Allow native browser double/triple-click behavior
		// detail: 1 = single click, 2 = double-click, 3 = triple-click
		if (event.detail >= 2) {
			// Clear any pending single-click timeout
			if (clickTimeout) {
				clearTimeout(clickTimeout);
				clickTimeout = null;
			}
			// Clear any custom word selections
			selectedWord = null;
			suppressHoverCaret = null;
			// Allow text selection in input fields without deactivating segment
			const isInInput = event.target.closest('input, textarea');
			if (!isInInput) {
				// Only clear active segments if NOT clicking in an input
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
			}
			return; // Let browser handle double/triple-click text selection
		}
		
		// Capture event data before async timeout
		const clickedSegment = event.target.closest('.segment');
		const target = event.target;
		
		// Don't process word selection or segment activation if clicking in an input field
		const isInInput = target.closest('input, textarea');
		if (isInInput) {
			// Reset drag state but don't process further
			dragStartPos = null;
			isDragging = false;
			return;
		}
		
		// Handle segment/section activation IMMEDIATELY (no delay)
		// This makes the toolbar appear instantly without waiting for debounce
		if (clickedSegment) {
			// Find passage and segment indices
			const passageElement = clickedSegment.closest('.passage');
			if (passageElement) {
				const allPassages = Array.from(document.querySelectorAll('.passage'));
				const passageIndex = allPassages.indexOf(passageElement);
				
				const allSegments = Array.from(passageElement.querySelectorAll('.segment'));
				const segmentIndex = allSegments.indexOf(clickedSegment);
				
				// Capture the segment ID from the DOM
				const segmentId = clickedSegment.dataset.segmentId;
				console.log('[CLICK] Captured segment ID:', segmentId, 'from element:', clickedSegment);
				
				if (passageIndex !== -1 && segmentIndex !== -1 && segmentId) {
					// Increment generation counter to force toolbar remount
					segmentClickGeneration++;
					
					// Check if Command/Ctrl key is held for multi-select mode (directly from event)
					const isMultiSelectMode = event.metaKey || event.ctrlKey;
					
					if (isMultiSelectMode) {
						console.log('[CLICK] Command/Ctrl held - using hierarchical selection');
						// Multi-select mode: use hierarchical selection handler
						const newState = handleSelection('segment', segmentId, {
							passageIndex,
							segmentIndex,
							generation: segmentClickGeneration
						});
						activeColumns = newState.columns;
						activeSections = newState.sections;
						activeSegments = newState.segments;
					} else {
						// Normal mode: replace selection with single segment
						console.log('[CLICK] Normal click - replacing selection');
						// Clear any active column/section selections
						activeColumns = [];
						activeSections = [];
						// Activate the segment with generation
						activeSegments = [{ passageIndex, segmentIndex, segmentId, activateSection: false, generation: segmentClickGeneration }];
					}
				}
			}
		} else {
			// Clicked outside any segment - clear active state (unless Command/Ctrl is held)
			const isMultiSelectMode = event.metaKey || event.ctrlKey;
			if (!isMultiSelectMode) {
				activeSegments = [];
				activeColumns = [];
				activeSections = [];
			}
		}
		
		// Clear any existing timeout to prevent duplicate processing
		if (clickTimeout) {
			clearTimeout(clickTimeout);
			clickTimeout = null;
		}
		
		// Delay word selection processing to allow double/triple-clicks to work
		clickTimeout = setTimeout(() => {
			// Block word selection in compare mode
			if (isCompareMode) {
				console.log('[CLICK] Word selection blocked in compare mode');
				clickTimeout = null;
				return;
			}
			
			// Handle word selection
			if (target.classList.contains('selectable-word')) {
				const passageIndex = parseInt(target.dataset.passageIndex);
				const wordId = target.dataset.wordId;
				
				// Check if clicking the same word
				const isSameWord = selectedWord?.passageIndex === passageIndex && 
				                   selectedWord?.wordId === wordId;
				
				if (isSameWord) {
					// Clicking same word: cycle through states
					if (selectedWord.position === 'before') {
						// Before -> After
						selectedWord = { passageIndex, wordId, position: 'after' };
						suppressHoverCaret = null; // Clear suppression
					} else {
						// After -> Deselect (suppress hover caret until mouse out)
						selectedWord = null;
						suppressHoverCaret = { passageIndex, wordId };
						activeSegments = []; // Also deactivate segments
					}
				} else {
					// Clicking different word: start with "before"
					selectedWord = { passageIndex, wordId, position: 'before' };
					suppressHoverCaret = null; // Clear suppression
				}
			} else {
				// Clear selection when clicking outside of a word
				selectedWord = null;
				suppressHoverCaret = null;
			}
			
			// Clear timeout reference
			clickTimeout = null;
		}, 200); // 200ms delay - enough to detect double/triple clicks
		
		// Reset drag state
		dragStartPos = null;
		isDragging = false;
	}

	/**
	 * Handle global key down events
	 * - ESC: Clear word selections and browser text selections
	 * - Command/Ctrl: Enable multi-select mode
	 */
	function handleKeyDown(event) {
		if (event.key === 'Escape') {
			selectedWord = null;
			hoveredWord = null;
			// Clear browser's text selection
			window.getSelection()?.removeAllRanges();
		}
		
		// Detect Command (Mac) or Ctrl (Windows/Linux) key
		if (event.key === 'Meta' || event.key === 'Control') {
			isCommandKeyHeld = true;
			console.log('[KEY] Command/Ctrl key pressed - multi-select mode enabled');
		}
	}
	
	/**
	 * Handle global key up events
	 * - Command/Ctrl release: Disable multi-select mode
	 */
	function handleKeyUp(event) {
		// Detect Command (Mac) or Ctrl (Windows/Linux) key release
		if (event.key === 'Meta' || event.key === 'Control') {
			isCommandKeyHeld = false;
			console.log('[KEY] Command/Ctrl key released - multi-select mode disabled');
		}
	}

	/**
	 * Reset the held Command/Ctrl state.
	 * If the window loses focus (or the tab is hidden) while Command/Ctrl is held, the
	 * matching keyup is delivered elsewhere and never fires here, leaving
	 * isCommandKeyHeld stuck true (and the selection controls stuck visible). Both the
	 * window `blur` and document `visibilitychange` events call this as a safeguard —
	 * some OS/browser combos (e.g. Mission Control / Spaces switches) fire
	 * `visibilitychange` but not `blur`, so we cover both.
	 */
	function resetCommandKeyHeld() {
		if (isCommandKeyHeld) {
			isCommandKeyHeld = false;
			console.log('[KEY] Focus/visibility lost - resetting multi-select mode');
		}
	}

	/**
	 * Document visibilitychange handler — reset the held-key state when the tab becomes
	 * hidden (covers cases where `blur` does not fire).
	 */
	function handleVisibilityChange() {
		if (document.hidden) {
			resetCommandKeyHeld();
		}
	}



	/**
	 * Update DOM elements with data-selected, data-position, and data-suppress-hover-caret attributes when selection changes
	 */
	$effect(() => {
		// Remove data-selected, data-position, and data-suppress-hover-caret from all words
		const allWords = document.querySelectorAll('.selectable-word');
		allWords.forEach(word => {
			word.removeAttribute('data-selected');
			word.removeAttribute('data-position');
			word.removeAttribute('data-suppress-hover-caret');
		});

		// Add data-selected and data-position to the selected word
		if (selectedWord) {
			const selectedElement = document.querySelector(
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
			);
			if (selectedElement) {
				selectedElement.setAttribute('data-selected', 'true');
				selectedElement.setAttribute('data-position', selectedWord.position);
			}
		}
		
		// Add data-suppress-hover-caret to the word where hover caret should be suppressed
		if (suppressHoverCaret) {
			const suppressElement = document.querySelector(
				`.selectable-word[data-passage-index="${suppressHoverCaret.passageIndex}"][data-word-id="${suppressHoverCaret.wordId}"]`
			);
			if (suppressElement) {
				suppressElement.setAttribute('data-suppress-hover-caret', 'true');
			}
		}
	});

	/**
	 * Update DOM elements with active class when active segment/column/section changes
	 */
	$effect(() => {
		// Remove active class from all segments, sections, and columns
		const allSegments = document.querySelectorAll('.segment');
		allSegments.forEach(segment => {
			segment.classList.remove('active');
		});
		const allSections = document.querySelectorAll('.section');
		allSections.forEach(section => {
			section.classList.remove('active');
		});
		const allColumns = document.querySelectorAll('.column');
		allColumns.forEach(column => {
			column.classList.remove('active');
		});

		// Add active class to all selected columns
		if (activeColumns.length > 0) {
			activeColumns.forEach(columnId => {
				const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
				if (columnElement) {
					columnElement.classList.add('active');
					console.log('[EFFECT] Activated column:', columnId);
				}
			});
		}
		
		// Add active class to all selected sections
		if (activeSections.length > 0) {
			activeSections.forEach(sectionId => {
				const sectionElement = document.querySelector(`[data-section-id="${sectionId}"]`);
				if (sectionElement) {
					sectionElement.classList.add('active');
					console.log('[EFFECT] Activated section:', sectionId);
				}
			});
		}
		
		// Add active class to all selected segments
		if (activeSegments.length > 0) {
			activeSegments.forEach(segment => {
				const segmentElement = document.querySelector(`[data-segment-id="${segment.segmentId}"]`);
				if (segmentElement) {
					if (segment.activateSection) {
						// Activate the section (color mode)
						const sectionElement = segmentElement.closest('.section');
						if (sectionElement) {
							sectionElement.classList.add('active');
						}
					} else {
						// Activate the segment (outline and literary modes)
						segmentElement.classList.add('active');
					}
				}
			});
		}
	});



	// Get translation abbreviation
	let translationAbbr = $derived.by(() => {
		const metadata = getTranslationMetadata(data.study.translation || 'esv');
		return metadata?.abbreviation || data.study.translation?.toUpperCase() || 'ESV';
	});

	/**
	 * Format a passage reference for display
	 * @param {Object} passage
	 * @returns {string}
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}

	// Ref to inner content wrapper for measuring dimensions
	let contentInnerRef = $state(null);

	/** Reference to the scrollable .analyze-content container (used for fit-scale calculations) */
	let analyzeContentRef = $state(null);

	/** Dynamically computed scale factor for fit-width and fit-study zoom modes */
	let fitScale = $state(1);

	// Track previous zoom level to detect actual changes
	let previousZoomLevel = $state($toolbarState.zoomLevel);

	/**
	 * Maintain center point when zoom level changes.
	 * Only runs for percentage-to-percentage transitions; fit modes manage their own scroll.
	 */
	$effect(() => {
		const currentZoomLevel = $toolbarState.zoomLevel;
		const zoomMode = $toolbarState.zoomMode;

		// Skip scroll centering when in or transitioning from a fit mode
		if (zoomMode !== 'percentage') {
			previousZoomLevel = currentZoomLevel;
			return;
		}

		// Only adjust if zoom level actually changed and we have a previous zoom level
		if (currentZoomLevel !== previousZoomLevel && previousZoomLevel !== null) {
			// Get the actual scroll container (.analyze-content)
			const scrollContainer = contentInnerRef?.parentElement?.parentElement;
			if (scrollContainer) {
				// Get current viewport state
				const viewportWidth = scrollContainer.clientWidth;
				const viewportHeight = scrollContainer.clientHeight;
				const scrollLeft = scrollContainer.scrollLeft;
				const scrollTop = scrollContainer.scrollTop;
				
				// Calculate center point in content coordinates (at old scale)
				const centerX = scrollLeft + viewportWidth / 2;
				const centerY = scrollTop + viewportHeight / 2;
				
				// Calculate scale ratio
				const oldScale = previousZoomLevel / 100;
				const newScale = currentZoomLevel / 100;
				const scaleRatio = newScale / oldScale;
				
				// Calculate where the center point is now (at new scale)
				const newCenterX = centerX * scaleRatio;
				const newCenterY = centerY * scaleRatio;
				
				// Set scroll to keep center point centered
				const newScrollLeft = newCenterX - viewportWidth / 2;
				const newScrollTop = newCenterY - viewportHeight / 2;
				
				scrollContainer.scrollTo(newScrollLeft, newScrollTop);
			}
			
			previousZoomLevel = currentZoomLevel;
		} else if (previousZoomLevel === null) {
			// First time initialization - just update the previous zoom level
			previousZoomLevel = currentZoomLevel;
		}
	});

	/**
	 * Reset scroll position when study changes.
	 *
	 * Track the previous study ID so this only fires on a REAL study switch.
	 * `data` is a reactive prop replaced with a brand-new object every time the
	 * page `load` re-runs (e.g. after `invalidate('app:studies')` on a Quick Note
	 * auto-save). Without the ID guard the effect would re-run on every such
	 * invalidation — even though the study is unchanged — and jump the user back
	 * to the top of the passage while they're editing a note.
	 */
	let previousScrollStudyId = $state(null);
	$effect(() => {
		const studyId = data.study?.id;
		// Reset scroll to top only when the study ID actually changes
		if (studyId && studyId !== previousScrollStudyId) {
			previousScrollStudyId = studyId;
			// Get the actual scroll container (.analyze-content)
			const scrollContainer = contentInnerRef?.parentElement?.parentElement;
			if (scrollContainer) {
				scrollContainer.scrollTo(0, 0);
			}
		}
	});


	/**
	 * Determine if header should be visible based on zoom level or fit scale
	 * @returns {boolean} True if zoom >= 100% or fit scale >= 1
	 */
	let showHeader = $derived.by(() => {
		if ($toolbarState.zoomMode !== 'percentage') {
			return fitScale >= 1;
		}
		return $toolbarState.zoomLevel >= 100;
	});

	/**
	 * Get current scale factor — uses fitScale when in a fit mode
	 * @returns {number} Current scale
	 */
	let currentScale = $derived.by(() => {
		if ($toolbarState.zoomMode === 'fit-width' || $toolbarState.zoomMode === 'fit-study') {
			return fitScale;
		}
		// Convert percentage to decimal (e.g., 150% = 1.5)
		return $toolbarState.zoomLevel / 100;
	});

	/**
	 * Calculate zoom transform based on zoom level
	 * @returns {string} CSS transform value
	 */
	let zoomTransform = $derived.by(() => {
		return `scale(${currentScale})`;
	});

	/**

	 * Explicit scroll-area size for the wrapper div.
	 * CSS transform (scale) does not affect layout dimensions, so we must
	 * manually set the wrapper's width/height to match the visual (scaled) size.
	 * We use $state + $effect + tick() rather than $derived because:
	 *   - $derived runs during Svelte's render phase, before the browser has
	 *     finished computing layout; scrollWidth/scrollHeight may be stale or 0.
	 *   - $effect runs after the DOM is fully updated; tick() additionally flushes
	 *     all pending Svelte batch updates so measurements are guaranteed accurate.
	 */
	let wrapperDimensions = $state('');

	$effect(() => {
		const scale = currentScale;          // reactive: re-run on zoom change
		const ref   = contentInnerRef;       // reactive: re-run when element mounts
		const _dep  = data.passagesWithText; // reactive: re-run when content changes

		if (!ref) { wrapperDimensions = ''; return; }

		tick().then(() => {
			if (!ref) return;
			// Temporarily remove transform so scrollWidth/scrollHeight reflect
			// the natural (un-scaled) layout dimensions.
			const saved = ref.style.transform;
			ref.style.transform = 'none';
			const width  = ref.scrollWidth;
			const height = ref.scrollHeight;
			ref.style.transform = saved;

			if (width > 0 && height > 0) {
				wrapperDimensions = `width: ${width * scale}px; height: ${height * scale}px;`;
			}
		});
	});

	/**
	 * Compute the scale factor for fit-width and fit-study modes.
	 * Temporarily removes the CSS transform to measure natural content dimensions.
	 *
	 * Viewport height is derived from the element's position in the browser window
	 * (window.innerHeight - rect.top) rather than clientHeight, which can be unreliable
	 * inside nested scroll containers with percentage heights.
	 */
	function computeFitScale() {
		if (!contentInnerRef || !analyzeContentRef) return;

		// Use getBoundingClientRect for reliable viewport dimensions.
		// viewportHeight = space from the element's top edge to the bottom of the browser window.
		const rect = analyzeContentRef.getBoundingClientRect();
		const viewportWidth = rect.width;
		const viewportHeight = window.innerHeight - rect.top;

		if (viewportWidth === 0 || viewportHeight === 0) return;

		// scrollWidth/scrollHeight reflect the CSS layout dimensions and are NOT affected
		// by CSS transforms, so we can measure them without touching the transform.
		const naturalWidth = contentInnerRef.scrollWidth;
		const naturalHeight = contentInnerRef.scrollHeight;

		if (naturalWidth === 0 || naturalHeight === 0) return;

		const mode = $toolbarState.zoomMode;
		if (mode === 'fit-width') {
			fitScale = viewportWidth / naturalWidth;
		} else if (mode === 'fit-study') {
			// Scale so that BOTH dimensions fit within the available viewport.
			fitScale = Math.min(
				viewportWidth / naturalWidth,
				viewportHeight / naturalHeight
			);
		}
	}

	/**
	 * Recompute fit scale whenever zoomMode changes to a fit mode or passage data changes.
	 * For fit-study, also scrolls to the top-left corner so the full study is visible.
	 */
	$effect(() => {
		const mode = $toolbarState.zoomMode;
		if (mode !== 'fit-width' && mode !== 'fit-study') return;

		// Access passagesWithText to re-run this effect when content changes
		const _dep = data.passagesWithText;

		tick().then(() => {
			computeFitScale();
			if (mode === 'fit-study' && analyzeContentRef) {
				analyzeContentRef.scrollTo(0, 0);
			}
		});
	});

	/**
	 * Derived: whether any passage text contains a paragraph break marker.
	 * Re-evaluates whenever data.passagesWithText changes.
	 */
	let hasAnyParagraphBreaks = $derived.by(() => {
		if (!data.passagesWithText) return false;
		return data.passagesWithText.some(passageText =>
			typeof passageText.text === 'string' &&
			passageText.text.includes('paragraph-break-marker')
		);
	});

	/**
	 * Keep the Paragraphs toggle in sync with whether any paragraph break markers exist.
	 * - No markers → disable the toggle and ensure it is turned off.
	 * - Markers exist → ensure the toggle is enabled.
	 */
	$effect(() => {
		if (!hasAnyParagraphBreaks) {
			setToolbarState('canToggleParagraphBreaks', false);
			setToolbarState('paragraphBreaksVisible', false);
		} else {
			setToolbarState('canToggleParagraphBreaks', true);
		}
	});
</script>

<svelte:window on:keydown={handleKeyDown} on:keyup={handleKeyUp} on:blur={resetCommandKeyHeld} />
<svelte:document on:visibilitychange={handleVisibilityChange} />



<div class="container">
	<!-- Analyze View Content -->
	<div
		bind:this={analyzeContentRef}
		class="analyze-content"
		class:hide-notes={!$toolbarState.passageNotesVisible}
		class:hide-verses={!$toolbarState.versesVisible}
		class:hide-paragraph-breaks={!$toolbarState.paragraphBreaksVisible}
		class:wide-layout={$toolbarState.wideLayout} 
		class:overview-mode={$toolbarState.overviewMode}
		class:show-layout-controls={$toolbarState.layoutControlsVisible}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseover={handleWordHover}
		onmouseleave={handleWordHoverEnd}
		onclick={handleWordClick}
	>
		<div class="analyze-content-wrapper" style="{wrapperDimensions}">
			<div bind:this={contentInnerRef} class="analyze-content-inner" style="transform: {zoomTransform}; transform-origin: top left;">
				<!-- Connections overlay: SVG arcs between connected segments, drawn in the
				     same coordinate space as the content. It is a DIRECT child of
				     .analyze-content-inner (which carries NO padding) so its absolute
				     inset:0 origin coincides with the inner's border box — and, because the
				     inner has no padding, with its padding box too. The visual spacing now
				     lives on .analyze-content-padded below, NOT on the inner, so the overlay
				     SVG and the html-to-image export clone (which resolves the cloned SVG at
				     the border box) share a single origin and the exported anchors/lines
				     stay aligned with their elements. See exportAnalyze.js.
				     position:absolute also keeps it out of the flex flow, so it never
				     contributes a gap slot between study-header and passage-wrapper. -->
				<div class="connections-container">
					<ConnectionsOverlay connections={data.connections || []} scale={currentScale} />
				</div>

				<!-- Padded content column: the padding + flex gap that used to live on
				     .analyze-content-inner moved here so they no longer offset the overlay's
				     coordinate origin (see the connections-container comment above). -->
				<div class="analyze-content-padded">
				{#if showHeader}
					<!-- Title + subtitle form a single titling block. The subtitle is a
					     tagline for the title, NOT a new outline section, so it lives in an
					     <hgroup> as a <p> rather than a heading. This keeps the study's
					     accessible outline clean: the title is the page's single <h1>, and
					     the next real heading is the passage reference (<h2>) below. The
					     visual appearance is unchanged. -->
					<hgroup class="study-header">
						<Heading heading="h1" classes="h3 heading" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
						{#if data.study.subtitle}
							<p class="subheading">{data.study.subtitle}</p>
						{/if}
					</hgroup>
				{/if}

				<!-- While the streamed content resolves, the single global
				     NavigationIndicator overlay covers the wait (see stores/loading.js),
				     so there is no in-page spinner here. -->
				<div class="passage-wrapper">

					{#if streamedContent && data.passagesWithText && data.passagesWithText.length > 0}
						{#each data.passagesWithText as passageText, passageIndex}
							{@const firstColumn = ('structure' in passageText) ? passageText.structure?.columns?.[0] : null}
							{@const referenceOffset = firstColumn ? (columnReposition.getLiveOffset(firstColumn.id) ?? firstColumn.leftOffset ?? 0) : 0}
							<div class="passage" style:--reference-offset="{referenceOffset}px" class:compare-hidden={isHideMode && !passageHasVisibleItems(passageText)}>

								{#if passageText.error}
									<div class="error-message">
										<Alert color="red" look="subtle" message={`Error loading ${passageText.reference}`} />
									</div>
								{:else if passageText.text && passageText.structure}
									<!-- Passage reference is the top-level heading of the document body
									     (directly under the study title h1), so it is an <h2>. The visual
									     size is unchanged — it comes from the `reference` class (see the
									     h2.reference rule in the styles below). -->
									<Heading heading="h2" classes="reference">{passageText.reference} [{translationAbbr}]</Heading>
									<div class="passage-container">
										{#if passageText.structure.columns && passageText.structure.columns.length > 0}
											{@const allSegments = passageText.structure.columns.flatMap(col => col.sections.flatMap(section => section.segments))}
											{@const segmentCount = allSegments.length}
											{@const structureKey = `${passageText.structure.passageId}-${segmentCount}`}
											{#key structureKey}
											{@const passageSegmentIndexTracker = { current: 0 }}
										{@const verseSectionMap = buildVerseSectionMap(allSegments)}
										{@const verseOccurrences = Object.keys(verseSectionMap).filter(verseId => verseSectionMap[verseId] >= 2).reduce((acc, verseId) => ({ ...acc, [verseId]: 0 }), {})}
										{@const segmentSectionEndIdxMap = buildSegmentSectionEndIdxMap(passageText.structure.columns)}
										{@const passageEndWordId = getPassageEndWordId(allSegments, data.passages[passageIndex])}
										{@const headingReferences = calculateHeadingReferences(allSegments, verseSectionMap, segmentSectionEndIdxMap, passageEndWordId)}
											{#each passageText.structure.columns as column, columnIndex}
												{@const columnOffset = columnReposition.getLiveOffset(column.id) ?? column.leftOffset ?? 0}
												{@const columnLiveWidth = columnResize.getLiveWidth(column.id)}
												{@const columnResolvedWidth = columnLiveWidth ?? column.width ?? null}
												<!-- Wide View acts as a MINIMUM width: columns narrower than the wide base
												     are lifted to it, while wider per-column overrides are preserved. The
												     stored width is never mutated. While THIS column is actively being
												     dragged, use the raw live width so the resize tracks the cursor 1:1
												     (the floor re-applies on release). A null width falls through to the
												     CSS default, which the `.wide-layout .column` rule already widens. -->
												{@const columnWidth = columnResize.activeColumnId === column.id
													? columnLiveWidth
													: (columnResolvedWidth == null
														? null
														: ($toolbarState.wideLayout ? Math.max(columnResolvedWidth, BASE_WIDTH_WIDE) : columnResolvedWidth))}
												<div
													class="column"
													class:not-first-column={columnIndex > 0}
													class:cross-passage-column={passageIndex > 0 && columnIndex === 0}
													class:is-repositioning={columnReposition.activeColumnId === column.id}
													class:is-resizing={columnResize.activeColumnId === column.id}
													data-column-id="{column.id}"

													class:compare-hidden={isHideMode && !visibleColumnIds.has(column.id)}
													style:--column-offset="{columnOffset}px"
													style:width={columnWidth != null ? `${columnWidth}px` : null}
												>

													{#if column.sections && column.sections.length > 0}


														{#each column.sections as section, sectionIndex}
															{@const sectionOffset = sectionReposition.getLiveOffset(section.id) ?? section.topOffset ?? 0}
															<div
																class="section {section.color}"
																data-section-id="{section.id}"
																class:compare-hidden={isHideMode && !visibleSectionIds.has(section.id)}
																class:is-repositioning={sectionReposition.activeSectionId === section.id}
																style:--reposition-offset="{sectionOffset}px"
															>
																{#if section.segments && section.segments.length > 0}


																	{#each section.segments as segment, segmentIndex}
																		{@const domSegmentIndex = passageSegmentIndexTracker.current}
																		{@const _segIncrement = (passageSegmentIndexTracker.current++, null)}
																		{@const nextSegment = section.segments[segmentIndex + 1]}
																		{@const nextSection = column.sections[sectionIndex + 1]}
																		{@const nextColumn = passageText.structure.columns[columnIndex + 1]}
																		{@const endWordId = nextSegment?.startingWordId || 
																							nextSection?.segments[0]?.startingWordId || 
																							nextColumn?.sections[0]?.segments[0]?.startingWordId || 
																							null}
																		{@const segmentStartVerseId = segment.startingWordId ? segment.startingWordId.split('-').slice(0, 3).join('-') : null}
																		{@const isVerseSubdivided = segmentStartVerseId ? (verseSectionMap[segmentStartVerseId] || 0) > 1 : false}
																		{@const segmentHtml = extractSegmentText(
																			passageText.text,
																			segment.startingWordId,
																			endWordId,
																			passageIndex,
																			verseSectionMap,
																			verseOccurrences
																		)}
																		<Segment 
																			heading1={segment.headingOne}
																			heading2={segment.headingTwo}
																			heading3={segment.headingThree}
																			heading1Ref={headingReferences[segment.id]?.heading1Ref}
																			heading2Ref={headingReferences[segment.id]?.heading2Ref}
																			heading3Ref={headingReferences[segment.id]?.heading3Ref}
																			segmentRef={headingReferences[segment.id]?.segmentRef}
																			note={segment.note}
																			text={segmentHtml}
																			{passageIndex}
																			isActive={activeSegments.some(s => s.passageIndex === passageIndex && s.segmentIndex === domSegmentIndex)}
																			segmentId={segment.id}
																			generation={activeSegments.find(s => s.passageIndex === passageIndex && s.segmentIndex === domSegmentIndex)?.generation || 0}
																			isCompareHidden={isHideMode && !visibleSegmentIds.has(segment.id)}
																			{isVerseSubdivided}
																			prevSegmentHasHeading={!!(section.segments[segmentIndex - 1]?.headingOne || section.segments[segmentIndex - 1]?.headingTwo || section.segments[segmentIndex - 1]?.headingThree)}
																			nextSegmentHasHeading={!!(section.segments[segmentIndex + 1]?.headingOne || section.segments[segmentIndex + 1]?.headingTwo || section.segments[segmentIndex + 1]?.headingThree)}
																			prevVisibleSegmentHasBorderBottom={!!(section.segments[segmentIndex - 1]?.headingOne || section.segments[segmentIndex - 1]?.headingTwo || section.segments[segmentIndex - 1]?.headingThree || section.segments[segmentIndex - 1]?.note)}
																			prevSegmentHasRef={!!(headingReferences[section.segments[segmentIndex - 1]?.id]?.segmentRef)}
																			isFirstInSection={segmentIndex === 0}
																			isFirstVisibleInSection={segmentIndex === 0}
																			height={segmentResize.getEffectiveHeight(segment.id, segment.height ?? null)}
																			resizeEnabled={!$toolbarState.overviewMode && !isHideMode}
																			isResizing={segmentResize.activeSegmentId === segment.id}
																			onResizeStart={segmentResize.handleResizeStart}
																			heightGroupId={segment.heightGroupId ?? null}
																			linkHovered={segmentResize.isGroupHovered(segment.heightGroupId ?? null)}
																			onHandleEnter={segmentResize.handleHandleEnter}
																			onHandleLeave={segmentResize.handleHandleLeave}
																		/>

																	{/each}
																{/if}
																
															<!-- Section toolbar: Command (held while a Column/Section/Segment is selected, or
															     multiple column/section selections) shows all even with no single selection;
															     single-select shows controls only for the active column in this column. -->
															{#if $toolbarState.selectorsVisible
															     || showAllSelectorsViaCommand
															     || hasMultipleStructuralSelections
															     || (!isInMultiSelectMode && ((activeSegments.length > 0 && activeSegments.some(seg => isSegmentInColumn(column, seg.segmentId))) || activeSections.some(sId => getColumnIdFromSectionId(sId) === column.id) || activeColumns.includes(column.id)))}
																<ToolbarSection 

																	sectionId={section.id}
																	isActive={activeSections.includes(section.id)}
																/>
															{/if}

															<!-- Reposition handle: a narrow strip over the TOP border. Hovering
															     shows a grab cursor and a dotted indicator; mousedown begins a
															     vertical reposition drag. Rendered LAST (it is position:absolute,
															     so DOM order is irrelevant visually) to avoid becoming the
															     section's :first-child, which would break the first segment's
															     top-border CSS selectors. Disabled in overview/compare/focus modes. -->
															{#if !$toolbarState.overviewMode && !isHideMode}
																<div
																	class="reposition-handle"
																	role="separator"
																	aria-label="Reposition section"
																	aria-orientation="horizontal"
																	onmousedown={(e) => sectionReposition.handleRepositionStart(e, section.id)}
																>
																	<span class="reposition-indicator">
																		<span class="reposition-dot"></span>
																		<span class="reposition-dot"></span>
																		<span class="reposition-dot"></span>
																	</span>
																</div>

															{/if}
															</div>

														{/each}
													{/if}

													<!-- Column toolbar: Command (held while a Column/Section/Segment is selected, or
													     multiple column/section selections) shows all even with no single selection;
													     single-select shows controls only for the active column in this column. -->
													{#if $toolbarState.selectorsVisible
													     || showAllSelectorsViaCommand
													     || hasMultipleStructuralSelections
													     || (!isInMultiSelectMode && ((activeSegments.length > 0 && activeSegments.some(seg => isSegmentInColumn(column, seg.segmentId))) || activeSections.some(sId => getColumnIdFromSectionId(sId) === column.id) || activeColumns.includes(column.id)))}
														<ToolbarColumn 

															columnId={column.id} 
															isActive={activeColumns.includes(column.id)}
															sectionColor={column.sections[0]?.color}
														/>
													{/if}

												<!-- Column reposition handle: a narrow strip over the LEFT border of
												     every column EXCEPT the first in its passage, anchored near the top
												     of the column — sitting on the same side as the gap it controls.
												     Hovering shows a grab cursor and a vertical three-dot
												     indicator; mousedown begins a horizontal reposition drag that widens
												     the gap on this column's LEFT side (the column visually slides right).
													     Rendered LAST (it is position:absolute, so DOM order is irrelevant
													     visually) so it never becomes the column's first child and disturb the
													     first section's :first-of-type margin. Disabled in
													     overview/compare/focus modes. -->
													{#if !(passageIndex === 0 && columnIndex === 0) && !$toolbarState.overviewMode && !isHideMode}
														<div
															class="column-reposition-handle"
															role="separator"
															aria-label="Adjust column spacing"
															aria-orientation="vertical"
															onmousedown={(e) => columnReposition.handleRepositionStart(e, column.id)}
														>


															<span class="column-reposition-indicator">
																<span class="column-reposition-dot"></span>
																<span class="column-reposition-dot"></span>
																<span class="column-reposition-dot"></span>
															</span>
														</div>
													{/if}

													<!-- Column width resize handle: a narrow strip over the RIGHT edge of
													     every column. Hovering shows an ew-resize cursor and a vertical bar;
													     mousedown begins a horizontal resize drag that widens or narrows this
													     column (down to a readable minimum width). Horizontal counterpart to
													     the segment height resize handle. Disabled in overview/compare/focus
													     modes (same gating as the reposition handle). -->
													{#if !$toolbarState.overviewMode && !isHideMode}
														<div
															class="column-resize-handle"
															role="separator"
															aria-label="Resize column width"
															aria-orientation="vertical"
															onmousedown={(e) => columnResize.handleResizeStart(e, column.id)}
														>
															<span class="column-resize-indicator"></span>
														</div>
													{/if}
												</div>
											{/each}


											{/key}
										{/if}
									</div>
								{/if}
							</div>
							{@const nextPassage = data.passagesWithText[passageIndex + 1]}
							{@const nextFirstColumn = (nextPassage && 'structure' in nextPassage) ? nextPassage.structure?.columns?.[0] : null}
							{@const dividerOffset = nextFirstColumn ? (columnReposition.getLiveOffset(nextFirstColumn.id) ?? nextFirstColumn.leftOffset ?? 0) : 0}

							<div class="passage-divider" style:--divider-offset="{dividerOffset}px" class:compare-hidden={isHideMode && (!passageHasVisibleItems(passageText) || data.passagesWithText.slice(passageIndex + 1).every(p => !passageHasVisibleItems(p)))}></div>

						{/each}
					{:else if !streamedContent}
						<!-- Still streaming: render nothing. The global NavigationIndicator
						     overlay covers this wait; showing the "No passages available"
						     placeholder here would flash misleading text before the content
						     lands. -->
					{:else}
						<p class="placeholder-text">No passages available for this study.</p>
					{/if}
				</div>
				</div>
			</div>
		</div>


		<!-- Copyright Notice — required Scripture attribution. Rendered in normal flow at
		     the bottom of the scroll container (OUTSIDE the zoom-transformed
		     .analyze-content-inner) so it stays a constant, readable size at any zoom
		     level. The .analyze-content flex column + the wrapper's flex-grow make this a
		     sticky footer: it pins to the bottom of the viewport for short studies and
		     scrolls below the content for tall ones — never overlapping the scripture. -->
		{#if streamedContent && data.passagesWithText && data.passagesWithText.length > 0}
			<div class="copyright-notice">
				{#if data.study.translation === 'esv'}
					<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. <a href="https://www.esv.org" target="_blank" rel="noopener noreferrer">www.esv.org</a></p>
				{:else if data.study.translation === 'net'}
					<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved. <a href="https://netbible.org" target="_blank" rel="noopener noreferrer">netbible.org</a></p>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Streamed-content loading overlay. SERVER-RENDERED so on a fresh load / refresh

	     the spinner is present in the very first paint — before client JS hydrates and
	     before `$navigating`/`studyContentLoading` (which the global NavigationIndicator
	     depends on) exist. That closes the Safari first-load "blank, no spinner" gap on
	     large studies. Placed here as a sibling of `.analyze-content` (outside the
	     zoom-transformed inner wrapper) so it is never scaled and stays centered.
	     Suppressed while `$navigating` OR the global content loader is active, so in-app
	     navigations show only the single global overlay rather than two spinners. -->
	{#if !streamedContent && !$navigating && !$studyContentLoading}
		<div class="content-loading">
			<Spinner size="lg" label="Loading study…" />
		</div>
	{/if}

	<!-- Segment resize snap guide: a yellow line spanning the content width, shown
	     while a resize drag is snapping to another segment's edge. Fixed-positioned
	     because the composable computes its geometry in viewport coordinates. -->

	{#if segmentResize.guideLine.visible}
		<div
			class="resize-snap-guide"
			style:top="{segmentResize.guideLine.top}px"
			style:left="{segmentResize.guideLine.left}px"
			style:width="{segmentResize.guideLine.width}px"
		></div>
	{/if}

	<!-- Section reposition snap guide: a yellow line spanning the content width, shown
	     while a reposition drag is snapping to another section/segment's top/bottom edge
	     in a different column. Fixed-positioned (viewport coordinates). -->
	{#if sectionReposition.guideLine.visible}
		<div
			class="resize-snap-guide"
			style:top="{sectionReposition.guideLine.top}px"
			style:left="{sectionReposition.guideLine.left}px"
			style:width="{sectionReposition.guideLine.width}px"
		></div>
	{/if}


	<!-- Live height tooltip(s) following the resize drag, shown above each segment's
	     bottom drag indicator. A single tooltip for an unlinked segment; one per member
	     for a linked group, each labeled "Linked: [height]px". -->
	{#each segmentResize.dragTooltips as tip (tip.segmentId)}
		<ResizeTooltip x={tip.x} y={tip.y} height={tip.height} label={tip.label} />
	{/each}

	<!-- Hover tooltips for a linked group (no drag in progress): one "Linked" label per
	     member, anchored to each member's bottom edge, shown when hovering any member's
	     resize handle. -->
	{#each segmentResize.hoverTooltips as tip (tip.segmentId)}
		<ResizeTooltip x={tip.x} y={tip.y} label={tip.label} />
	{/each}


	<!-- Live spacing tooltip following a section reposition drag. Reuses the same
	     ResizeTooltip component as segment resize; here `height` is the total vertical
	     gap (px) above the section. -->
	{#if sectionReposition.dragTooltip.visible}
		<ResizeTooltip
			x={sectionReposition.dragTooltip.x}
			y={sectionReposition.dragTooltip.y}
			height={sectionReposition.dragTooltip.height}
		/>
	{/if}

	<!-- Live spacing tooltip following a column reposition drag. Reuses the same
	     ResizeTooltip component; here `height` is the total horizontal gap (px) to the
	     LEFT of the dragged column. -->
	{#if columnReposition.dragTooltip.visible}
		<ResizeTooltip
			x={columnReposition.dragTooltip.x}
			y={columnReposition.dragTooltip.y}
			height={columnReposition.dragTooltip.height}
		/>
	{/if}

	<!-- Column width resize snap guide: a yellow VERTICAL line spanning the content
	     height, shown while a width drag is snapping to another column's left/right edge.
	     Fixed-positioned because the composable computes its geometry in viewport
	     coordinates. Reuses .resize-snap-guide but overrides to a vertical orientation. -->
	{#if columnResize.guideLine.visible}
		<div
			class="resize-snap-guide resize-snap-guide-vertical"
			style:top="{columnResize.guideLine.top}px"
			style:left="{columnResize.guideLine.left}px"
			style:height="{columnResize.guideLine.height}px"
		></div>
	{/if}

	<!-- Live width tooltip following a column width drag. Reuses the ResizeTooltip
	     component; here `height` carries the CSS-px WIDTH being applied. -->
	{#if columnResize.dragTooltip.visible}
		<ResizeTooltip
			x={columnResize.dragTooltip.x}
			y={columnResize.dragTooltip.y}
			height={columnResize.dragTooltip.height}
			label={columnResize.dragTooltip.label}
		/>
	{/if}




	<!-- Bulk "Set Height" modal (Structure → Set Height). Applies a uniform height

	     across all selected segments, never smaller than the tallest text floor. -->
	<SetSegmentHeightModal
		isOpen={setHeightModalOpen}
		segmentCount={setHeightSegmentIds.length}
		tallestHeight={setHeightTallest}
		minHeight={setHeightMin}
		onApply={applySetHeight}
		onClose={() => (setHeightModalOpen = false)}
	/>

	<!-- Bulk "Set Section Spacing" modal (Structure → Set Section Spacing). Applies a
	     uniform TOTAL gap above all selected sections, never tighter than each
	     section's default spacing. -->
	<SetSectionSpacingModal
		isOpen={setSpacingModalOpen}
		sectionCount={setSpacingSectionIds.length}
		currentGap={setSpacingCurrent}
		minGap={setSpacingMin}
		onApply={applySetSpacing}
		onClose={() => (setSpacingModalOpen = false)}
	/>

	<!-- Bulk "Set Column Spacing" modal (Layout → Set Column Spacing). Applies a uniform
	     TOTAL gap to the LEFT of all selected (non-first) columns, never tighter than each
	     column's default spacing. There is no upper limit on the spacing. -->
	<SetColumnSpacingModal
		isOpen={setColumnSpacingModalOpen}
		columnCount={setColumnSpacingIds.length}
		currentGap={setColumnSpacingCurrent}
		minGap={setColumnSpacingMin}
		onApply={applySetColumnSpacing}
		onClose={() => (setColumnSpacingModalOpen = false)}
	/>

	<!-- Bulk "Set Column Width" modal (Layout → Set Column Width). Applies a uniform
	     WIDTH to all selected columns, never narrower than the readable minimum width. -->
	<SetColumnWidthModal
		isOpen={setColumnWidthModalOpen}
		columnCount={setColumnWidthIds.length}
		currentWidth={setColumnWidthCurrent}
		minWidth={setColumnWidthMin}
		onApply={applySetColumnWidth}
		onClose={() => (setColumnWidthModalOpen = false)}
	/>




	<!-- Join confirmation modal (Structure → Join Column/Section/Segment). Only shown
	     when the joined item carries authored content or affected connections; offers
	     Merge (fold content onto the previous item) or Delete (discard the joined item's
	     own content). Empty items are joined silently without this modal. -->
	<JoinConfirmationModal
		isOpen={joinModalOpen}
		type={joinModalType}
		summary={joinModalSummary}
		noteWillTruncate={joinModalNoteWillTruncate}
		onConfirm={confirmJoin}
		onClose={() => { joinModalOpen = false; joinPending = null; }}
	/>
</div>


<style>
	.container {
		display: flex;
		flex-direction: column;
		position: relative;
		height: 100%;
	}

	.study-header {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: left;
	}

	.study-header :global(.heading) {
		margin: 0.0rem;
		padding: 0.0rem;
		line-height: 1;
		/* Keep the title on a single line so it isn't squished down to the width of a
		   narrow (e.g. single-column) study or before passages stream in. The header is
		   a fit-content child, so a long title simply widens the box to fit itself. */
		white-space: nowrap;
	}

	/* The subtitle is now a plain <p> (it used to be a <Heading classes="h4">). The
	   font-size/weight that the h4 size-class provided are restored here so the visual
	   appearance is unchanged. */
	.study-header .subheading {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0.6rem 0.0rem 0.0rem;
		padding: 0.0rem;
		color: var(--gray-400);
		line-height: 1;
		/* See .heading above — keep the subtitle on a single line for the same reason. */
		white-space: nowrap;
	}


	.placeholder-text {
		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	/* Centered in-page loading overlay shown while streamed content resolves. Absolute
	   inside the position:relative .container so it covers the content area and stays
	   centered regardless of the (empty) scroll content behind it. */
	.content-loading {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		pointer-events: none;
	}

	.analyze-content {

		flex-grow: 1;
		overflow-x: auto;
		overflow-y: auto;
		touch-action: pan-x pan-y pinch-zoom;
		/* Lay the scroll content out as a flex column so the copyright notice can act as
		   a sticky footer: the wrapper grows to fill any spare vertical space (pushing the
		   notice to the very bottom of the viewport on short studies) while the notice
		   itself never shrinks and sits below the content on tall studies. */
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		/* Safari scroll-paint hints (Fix B). Momentum scrolling + telling the
		   engine scroll-position will change lets WebKit keep the scrolled content
		   on the compositor and translate it rather than re-running layout/paint
		   each frame — which is what made large studies fall behind repainting
		   newly-revealed text while scrolling. */
		-webkit-overflow-scrolling: touch;
		will-change: scroll-position;
	}


	.analyze-content-wrapper {
		/* Wrapper defines the scrollable area size based on scaled dimensions */
		position: relative;
		/* Grow to fill spare vertical space so the copyright-notice footer is pushed to
		   the very bottom of the viewport when the study is short, but keep its natural
		   (content) height when the study is tall so the footer scrolls below it. */
		flex: 1 0 auto;
	}


	/* Zoom-transformed positioning context. Carries NO padding: its border box,
	   padding box and content box all coincide, so the absolutely-positioned
	   .connections-container (inset: 0) and the html-to-image export clone resolve
	   the overlay SVG to the SAME top-left origin as the visible content. Padding
	   that used to live here moved to .analyze-content-padded below — keeping it here
	   shifted the overlay's coordinate origin away from the clone's border-box origin,
	   which is what made exported anchors/lines drift left/up. width: fit-content lets
	   the box (and thus the overlay) size exactly to the padded content. */
	.analyze-content-inner {
		position: relative;
		transition: transform 0.2s ease-out;
		width: fit-content;
	}

	/* Padded content column. Holds the flex layout + padding that formerly sat on
	   .analyze-content-inner. Because the overlay is a sibling that fills the (now
	   unpadded) inner, this padding offsets the passage content WITHIN the shared
	   overlay coordinate space identically on screen and in the export clone. */
	.analyze-content-padded {
		display: flex;
		flex-direction: column;
		gap: 2.6rem;
		padding: 2.6rem 4.4rem;
		width: fit-content;
	}

	/* Absolutely-positioned wrapper for the connections SVG overlay.
	   Stretches to fill .analyze-content-inner via inset: 0 so the SVG inside
	   gets correct getBoundingClientRect() dimensions for path calculations.
	   Because it is position: absolute it is removed from the flex flow entirely,
	   so it never contributes a gap slot between study-header and passage-wrapper.
	   z-index: 20 keeps connection lines and anchor points visually above active
	   segments/sections/columns (which use z-index: 10). pointer-events: none
	   lets clicks pass through to content underneath. */
	.connections-container {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: visible;
		pointer-events: none;
		z-index: 20;
	}


	/* ============================================================ */
	/* Passage Layout */
	/* ============================================================ */

	.passage-wrapper {
		display: flex;
		gap: 3.9rem;
	}

	.passage {
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}

	.passage-divider {
		width: 0.0rem;
		display: flex;
		flex-direction: column;
		border-right: solid 0.1rem var(--gray-700);
		margin-top: 2.4rem;
		margin-bottom: 4.4rem;
		/* Cross-passage column spacing: mirror of the next passage's first-column
		   per-side offset X. Growing this margin widens the gap on the divider's LEFT
		   (between the previous passage and the divider) by the same amount the column's
		   own margin-left widens the gap on the divider's RIGHT — keeping the divider
		   centered as the cross-passage gap expands. Defaults to 0. */
		margin-left: var(--divider-offset, 0px);
	}


	.passage-divider:last-child {
		display: none;
	}

	/* The passage reference heading aligns with the left edge of the passage's first
	   column. For cross-passage passages whose first column is shifted right by its
	   per-side offset (--reference-offset, mirrored from the column's --column-offset),
	   we add that same offset here so the reference tracks the column 1:1 — both during
	   a live drag and after the offset is persisted. Defaults to 0. */
	:global(h2.reference) {
		font-size: 1.2rem;
		font-weight: 700;
		margin-left: calc(0.2rem + var(--reference-offset, 0px));
		margin-top: 0.0rem;
		margin-bottom: 1.1rem;
	}


	.passage-container {
		display: flex;
		align-items: flex-start;
		gap: 3.9rem;
	}

	.column {
		position: relative;
		display: flex;
		flex-direction: column;
		/* Readable column widthe 260 plus 18 for spacing */
		width: 27.8rem;
		margin-bottom: 4.4rem;
		border-radius: 0.3rem;
		padding: 0.2rem;
	}

	.column.active {
		background-color: var(--gray-lighter);
		outline: 0.1rem solid var(--gray-700);
	}

	/* User horizontal spacing offset: EXTRA px added to the gap on a column's LEFT side
	   beyond the container's default 3.9rem gap. Defaults to 0 (no change). Only applied
	   to non-first columns (the first column in a passage stays fixed). Pushing a column
	   right widens the gap to its left; there is no upper limit on the total gap. */
	.column.not-first-column {
		margin-left: var(--column-offset, 0px);
	}

	/* Cross-passage first column: the first column of a passage OTHER than the first.
	   Its left gap spans the passage divider. The per-side offset X is applied here as
	   margin-left AND mirrored onto the divider's margin-left (see .passage-divider),
	   so both sides of the divider grow equally and the divider stays centered. */
	.column.cross-passage-column {
		margin-left: var(--column-offset, 0px);
	}


	/* While actively dragging a column, suppress transitions and lift it above siblings
	   so it tracks the cursor cleanly. */
	.column.is-repositioning {
		z-index: 15;
	}

	/* ============================================================ */
	/* Column Reposition Handle (left border drag affordance) */
	/* ============================================================ */

	/* A narrow strip overlapping the LEFT border of each non-first column — the same
	   side as the gap it adjusts. Invisible until hovered, at which point it shows a
	   grab cursor and a vertical three-dot indicator so the user knows the column can be
	   dragged horizontally. Anchored near the top of the column (but pushed down below
	   the first section's selection radio — which sits at top: 0, ~2.0rem tall — so the
	   two controls don't overlap on the column's left side) while staying easy to find
	   without scrolling through long columns. */
	.column-reposition-handle {
		position: absolute;
		top: 2.3rem;
		left: -1.2rem;
		width: 1.4rem;
		height: 2.0rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		z-index: 16;
		opacity: 0;
		transition: opacity 80ms ease-in-out;
	}


	.column-reposition-handle:hover,
	.column.is-repositioning .column-reposition-handle {
		opacity: 1;
	}

	/* Layout Controls toggle (View menu): when active, reveal the column reposition
	   handles persistently instead of only on hover. */
	.show-layout-controls .column-reposition-handle {
		opacity: 1;
	}

	.column.is-repositioning .column-reposition-handle {
		cursor: grabbing;
	}

	/* Grab indicator: exactly three dots in a VERTICAL column (the column counterpart
	   to the section handle's horizontal row), centered over the column's left border. */
	.column-reposition-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}

	/* Each dot uses a light fill with a darker 1px border. */
	.column-reposition-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background-color: var(--gray-light);
		border: 0.1rem solid var(--gray-darker);
	}

	/* ============================================================ */
	/* Column Width Resize Handle (right edge drag affordance) */
	/* ============================================================ */

	/* A narrow strip overlapping the RIGHT edge of each column. Invisible until
	   hovered, at which point it shows an ew-resize cursor and a vertical bar so the
	   user knows the column can be dragged to widen/narrow it. Horizontal counterpart
	   to the segment height resize handle. Spans the full column height so it is easy
	   to grab anywhere along the right edge. */
	.column-resize-handle {
		position: absolute;
		top: 2.3rem;
		right: -1.2rem;
		width: 1.4rem;
		height: 2.0rem;

		display: flex;

		align-items: center;
		justify-content: center;
		cursor: ew-resize;
		z-index: 16;
		opacity: 0;
		transition: opacity 80ms ease-in-out;
	}

	.column-resize-handle:hover,
	.column.is-resizing .column-resize-handle {
		opacity: 1;
	}

	/* Layout Controls toggle (View menu): when active, reveal the column resize
	   handles persistently instead of only on hover. */
	.show-layout-controls .column-resize-handle {
		opacity: 1;
	}

	.column.is-resizing .column-resize-handle {
		cursor: ew-resize;
	}

	/* Resize indicator: a slim vertical bar centered over the column's right edge,
	   the visual cue that this edge is draggable. */
	.column-resize-indicator {
		width: 0.5rem;
		height: 2.4rem;
		border-radius: 0.3rem;

		background-color: var(--gray-light);
		border: 0.1rem solid var(--gray-darker);
	}

	/* While actively resizing a column, suppress transitions and lift it above
	   siblings so it tracks the cursor cleanly. */
	.column.is-resizing {
		z-index: 15;
	}



	.wide-layout .column {
		/* Readable column widthe 480 plus 18 for spacing */
		width: 49.8rem; 
	}

	.overview-mode :global(.text) {
		display: none;
	}

	.section {
		position: relative;
		/* CSS Custom Properties for color theming */
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
		--section-color: var(--green-dark);
		transition: box-shadow 50ms ease-in-out;
		/* User reposition offset: extra spacing ADDED above the section beyond its
		   default gap. Defaults to 0 (no change). Applied additively in margin-top
		   below so a section can be pushed down but never tighter than its default. */
		--reposition-offset: 0px;
	}

	/* First section: default gap is 0 (sits at column top). The reposition offset is
	   the distance from the top of the column. */
	.section:first-of-type {
		margin-top: var(--reposition-offset, 0px);
	}

	/* Other sections: default gap is 4.3rem (distance from the previous section). The
	   reposition offset is added on top of that default. */
	.section:not(:first-of-type) {
		margin-top: calc(4.3rem + var(--reposition-offset, 0px));
	}

	/* While actively dragging, suppress the box-shadow transition so the section
	   tracks the cursor without lag. */
	.section.is-repositioning {
		transition: none;
		z-index: 15;
	}

	/* ============================================================ */
	/* Section Reposition Handle (top border drag affordance) */
	/* ============================================================ */

	/* A narrow strip overlapping the top border of each section. Invisible until
	   hovered, at which point it shows a grab cursor and a dotted indicator so the
	   user knows the section can be dragged vertically. */
	.reposition-handle {
		position: absolute;
		top: -1.2rem;
		left: 0;
		right: 0;
		height: 1.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		z-index: 16;
		opacity: 0;
		transition: opacity 80ms ease-in-out;
	}

	.reposition-handle:hover,
	.section.is-repositioning .reposition-handle {
		opacity: 1;
	}

	/* Layout Controls toggle (View menu): when active, reveal the section reposition
	   handles persistently instead of only on hover. */
	.show-layout-controls .reposition-handle {
		opacity: 1;
	}

	.section.is-repositioning .reposition-handle {
		cursor: grabbing;
	}

	/* Grab indicator: exactly three dots in a row, centered horizontally and sitting
	   slightly above the section's top border. */
	.reposition-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}

	/* Each dot uses the section's light color with a darker 1px border. */
	.reposition-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background-color: var(--section-light);
		border: 0.1rem solid var(--section-darker);
	}




	/* Color variant overrides */
	.section.red {
		--section-darker: var(--red-darker);
		--section-dark: var(--red-dark);
		--section-light: var(--red-light);
		--section-lighter: var(--red-lighter);
	}

	.section.orange {
		--section-darker: var(--orange-darker);
		--section-dark: var(--orange-dark);
		--section-light: var(--orange-light);
		--section-lighter: var(--orange-lighter);
	}

	.section.yellow {
		--section-darker: var(--yellow-darker);
		--section-dark: var(--yellow-dark);
		--section-light: var(--yellow-light);
		--section-lighter: var(--yellow-lighter);
	}

	.section.green {
		--section-darker: var(--green-darker);
		--section-dark: var(--green-dark);
		--section-light: var(--green-light);
		--section-lighter: var(--green-lighter);
	}

	.section.aqua {
		--section-darker: var(--aqua-darker);
		--section-dark: var(--aqua-dark);
		--section-light: var(--aqua-light);
		--section-lighter: var(--aqua-lighter);
	}

	.section.blue {
		--section-darker: var(--blue-darker);
		--section-dark: var(--blue-dark);
		--section-light: var(--blue-light);
		--section-lighter: var(--blue-lighter);
	}

	.section.purple {
		--section-darker: var(--purple-darker);
		--section-dark: var(--purple-dark);
		--section-light: var(--purple-light);
		--section-lighter: var(--purple-lighter);
	}

	.section.pink {
		--section-darker: var(--pink-darker);
		--section-dark: var(--pink-dark);
		--section-light: var(--pink-light);
		--section-lighter: var(--pink-lighter);
	}

	.segment {
		position: relative;
		transition: box-shadow 50ms ease-in-out;
	}

	.section:global(.active),
	.segment:global(.active) {
		z-index: 10;
		box-shadow: 0rem 0rem 0.5rem var(--section-dark);
	}

	.heading-one {
		font-size: 1.4rem;
		text-align: center;
		padding: 0.6rem;
		margin: 0.0rem;
		border: 0.1rem solid;
		color: var(--section-lighter);
		background-color: var(--section-darker);
		border-color: var(--section-darker);
	}

	.heading-two {
		position: inherit;
		z-index: inherit;
		font-size: 1.2rem;
		padding: 0.6rem;
		margin: 0.0rem;
		border-bottom: 0.1rem solid;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		background-color: var(--section-lighter);
		color: var(--section-darker);
		border-color: var(--section-dark);
	}

	.heading-three {
		position: inherit;
		z-index: inherit;
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0.0rem;
		padding: 0.6rem 0.6rem 0.0rem;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-color: var(--section-dark);
	}

	.overview-mode :global(.heading-three) {
		padding: 0.9rem;
		border-bottom: 0.1rem solid var(--section-dark);
	}

	/* Border radius for headings in last segment (overview mode) */
	/* Only apply to the truly last heading - check if followed by other headings */
	
	/* Heading One: only if NOT followed by Heading Two or Three */
	.overview-mode :global(.section .segment:last-child:not(.has-note) .heading-one-container:not(:has(~ .heading-two-container)):not(:has(~ .heading-three-container)) .heading-one) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Heading Two: only if NOT followed by Heading Three */
	.overview-mode :global(.section .segment:last-child:not(.has-note) .heading-two-container:not(:has(~ .heading-three-container)) .heading-two) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Heading Three: always gets radius (it's the last possible heading) */
	.overview-mode :global(.section .segment:last-child:not(.has-note) .heading-three) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Also apply when notes are hidden via hide-notes class */
	.overview-mode.hide-notes :global(.section .segment:last-child .heading-one-container:not(:has(~ .heading-two-container)):not(:has(~ .heading-three-container)) .heading-one) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.overview-mode.hide-notes :global(.section .segment:last-child .heading-two-container:not(:has(~ .heading-three-container)) .heading-two) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	.overview-mode.hide-notes :global(.section .segment:last-child .heading-three) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Note in last segment gets bottom radius in overview mode (when notes are visible) */
	.overview-mode :global(.section .segment:last-child.has-note .note) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* Remove top border from no-headings-indicator when it follows a segment with headings or a note */
	/* Prevents double line: heading/note border-bottom + indicator's border-top */
	/* Uses .analyze-content.overview-mode (local scope, 3 classes with hash) for higher specificity than Segment.svelte's general rule */
	.analyze-content.overview-mode :global(.section .segment.has-heading-one + .segment .no-headings-indicator),
	.analyze-content.overview-mode :global(.section .segment.has-heading-two + .segment .no-headings-indicator),
	.analyze-content.overview-mode :global(.section .segment.has-heading-three + .segment .no-headings-indicator),
	.analyze-content.overview-mode :global(.section .segment.has-note + .segment .no-headings-indicator) {
		border-top: none;
	}

	.text {
		position: inherit;
		z-index: inherit;
		font-size: 1.1rem;
		line-height: 1.7;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
		padding: 0.6rem 0.9rem 0.9rem;
		-webkit-user-select: text;
		user-select: text;
		border-right: 0.1rem solid;
		border-left: 0.1rem solid;
		border-bottom: 0.1rem solid;
		border-color: var(--section-dark);
	}

	.segment:first-child .text.no-headings {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	.segment:last-child,
	.segment:last-child .text {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	:global(.chapter-verse) {
		font-weight: bold;
		color: var(--blue-500);
		padding-right: 0.3rem;
	}

	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-verses .text {
		white-space: normal;
	}

	.hide-notes :global(.note),
	.hide-notes :global(.note-input) {
		display: none;
	}

	/* ============================================================ */
	/* Paragraph Break Markers */
	/* ============================================================ */

	:global(.paragraph-break-marker) {
		display: block;
		width: 100%;
		height: 0;
		margin-top: 0.8em;
		-webkit-user-select: none;
		user-select: none;
		pointer-events: none;
	}

	/* The very first paragraph in a segment needs no top spacing */
	:global(.text > .paragraph-break-marker:first-child) {
		margin-top: 0;
	}

	.hide-paragraph-breaks :global(.paragraph-break-marker) {
		display: none;
	}

	/* ============================================================ */
	/* Compare Mode - Hide unselected items */
	/* ============================================================ */
	
	:global(.compare-hidden) {
		display: none !important;
	}

	/* ============================================================ */
	/* Compare Mode - Dynamic positioning classes */
	/* ============================================================ */
	
	/* First visible segment in compare mode */
	:global(.compare-first-segment .text.no-headings) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* Last visible segment in compare mode */
	:global(.compare-last-segment),
	:global(.compare-last-segment .text) {
		border-bottom-right-radius: 0.3rem;
		border-bottom-left-radius: 0.3rem;
	}

	/* First visible section in compare mode - remove top margin */
	:global(.compare-first-section) {
		margin-top: 0 !important;
	}

	/* First segment with Heading One at top in compare mode */
	:global(.compare-first-segment .heading-one) {
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* First segment with Heading Two at top in compare mode */
	/* Only when there's no Heading One above it within the same segment */
	:global(.compare-first-segment:not(.has-heading-one) .heading-two) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* First segment with Heading Three at top in compare mode */
	:global(.compare-first-segment:not(.has-heading-one):not(.has-heading-two).has-heading-three .heading-three) {
		border-top: 0.1rem solid;
		border-color: var(--section-dark);
		border-top-right-radius: 0.3rem;
		border-top-left-radius: 0.3rem;
	}

	/* ============================================================ */
	/* Color-Aware Word Selection Styles */
	/* Uses CSS custom properties from .section for theming */
	/* ============================================================ */

	/* Hover state - color-aware highlight */
	.section :global(.text .selectable-word:hover:not([data-selected])) {
		background-color: var(--section-light);
	}

	/* Selected state - color-aware highlight */
	.section :global(.text .selectable-word[data-selected="true"]) {
		background-color: var(--section-light);
	}

	/* Word selection styles */

	:global(.text .selectable-word) {
		position: relative;
		cursor: pointer;
		padding: 0.2rem 0.1rem;
		border-radius: 0.2rem;
	}

	/* Hover state - subtle highlight (only when not selected) */
	:global(.text .selectable-word:hover:not([data-selected])) {
		background-color: rgba(255, 255, 255, 0.1);
	}

	/* Hover state - show caret above word (only when not selected and not suppressed) */
	:global(.text .selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 0.5;
	}

	/* Safari-specific fix: Force GPU compositing to ensure :hover state updates properly */
	@supports (-webkit-appearance:none) {
		:global(.text .selectable-word::before) {
			transform: translateZ(0);
			-webkit-transform: translateZ(0);
		}
	}

	/* Selected state - persistent highlight */
	:global(.text .selectable-word[data-selected="true"]) {
		background-color: rgba(255, 255, 255, 0.15);
	}

	/* Selected state - persistent caret (before position) */
	:global(.text .selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	/* Selected state - persistent caret (after position) */
	:global(.text .selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='currentColor' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		right: -0.7rem;
		top: -0.9rem;
		width: 1.0rem;
		height: 1.0rem;
		opacity: 1;
	}

	.error-message {
		padding: 1.8rem;
		background-color: var(--red-900);
		border: 1px solid var(--red-700);
		border-radius: 0.4rem;
		margin-bottom: 1.8rem;
	}

	.error-message p {
		font-size: 1.4rem;
		color: var(--red-300);
		margin: 0;
	}

	/* Yellow snap guide line shown during a segment resize when the dragged edge
	   aligns with another segment's top/bottom edge. Fixed to the viewport because
	   its geometry is computed in viewport coordinates by the resize composable. */
	.resize-snap-guide {
		position: fixed;
		height: 0.1rem;
		background-color: var(--yellow);
		pointer-events: none;
		z-index: 200;
	}

	/* Vertical variant of the snap guide, used during a column WIDTH resize when the
	   dragged right edge aligns with another column's left/right edge. Here the height
	   is set inline (spanning the content area) and the width is the 1px line. */
	.resize-snap-guide-vertical {
		width: 0.1rem;
		height: auto;
	}



	/* In-flow sticky footer for the required Scripture attribution. align-self:stretch
	   makes it span the full scroll width (the parent uses align-items:flex-start), and
	   flex-shrink:0 keeps it from being squeezed. The wrapper's flex-grow pushes this to
	   the very bottom of the viewport on short studies; on tall studies it scrolls in
	   below the content. Center-aligned at the bottom of the study. */

	.copyright-notice {
		align-self: stretch;
		flex-shrink: 0;
		text-align: center;
		padding: 1.2rem 4.4rem 1.8rem;
	}

	.copyright-notice p {
		font-size: 1.0rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}


	.copyright-notice a {
		color: var(--gray-500);
		text-decoration: underline;
	}


</style>
