<script>
	/**
	 * StudiesPanel Component (Refactored)
	 *
	 * Orchestrates the studies panel with delegated responsibilities:
	 * - Data filtering and search (this file)
	 * - Multi-select logic (useMultiSelect composable)
	 * - Drag-and-drop logic (useDragAndDrop composable)
	 * - Group display (StudyGroup component)
	 * - Study display (StudyItem component)
	 */
	import Input from '$lib/componentElements/Input.svelte';
	import Icon from '$lib/componentElements/Icon.svelte';
	import StudyGroup from './studies/StudyGroup.svelte';
	import StudySeries from './studies/StudySeries.svelte';
	import StudyItem from './studies/StudyItem.svelte';
	import { useMultiSelect } from '$lib/composables/useMultiSelect.svelte.js';
	import { useDragAndDrop } from '$lib/composables/useDragAndDrop.svelte.js';
	import { useStudiesFilter } from '$lib/composables/useStudiesFilter.svelte.js';
	import { useKeyboardNavigation } from '$lib/composables/useKeyboardNavigation.svelte.js';
	import { usePanelResize } from '$lib/composables/usePanelResize.svelte.js';
	import { formatPassageReference } from '$lib/utils/passageFormatting.js';
	import { getFlattenedItemsList } from '$lib/utils/groupFlattening.js';
	import {
		toolbarState,
		setActiveSegment,
		setActiveConnection,
		setHeadingOrNoteEditorActive
	} from '$lib/stores/toolbar.js';
	import AddToSeriesModal from './modals/AddToSeriesModal.svelte';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { flip } from 'svelte/animate';

	let {
		isOpen = false,
		studies = [],
		groups = [],
		ungroupedStudies = [],
		ungroupedSeries = [],
		initialWidth = 300
	} = $props();

	// Search state
	let searchQuery = $state('');

	// Initialize composables
	const multiSelect = useMultiSelect();
	const dragDrop = useDragAndDrop(
		() => invalidate('app:studies'),
		// Dropping a standalone study on a series row PROPOSES an add (SERIES_PLAN Q17, phase 3).
		// It opens the same dialog the "Add to Series..." menu item opens, because §4's invariant
		// table only warns for a gap, an overlap or a different book — and a warning nobody reads is
		// a warning that was not given. The dialog dry-runs through the planner that performs the add.
		(study, seriesId) => {
			pendingSeriesDrop = { study, seriesId };
		}
	);

	/**
	 * The drop awaiting confirmation: `{ study, seriesId }`, or null.
	 *
	 * Held here rather than inside the composable so the composable stays about pointer mechanics and
	 * this file owns the dialog, matching how every other Finder modal is driven.
	 */
	let pendingSeriesDrop = $state(null);

	/**
	 * Every series the user has, top-level and filed inside groups.
	 *
	 * The dialog needs the target's name and part count, and a series filed in a group is not in
	 * `ungroupedSeries` — dropping on one and then being told "Selected series" with no part count
	 * would make the preview weaker for the nested case than the loose one, for no reason.
	 */
	let allSeries = $derived.by(() => {
		const collected = [...(ungroupedSeries ?? [])];
		const walk = (groupList) => {
			for (const group of groupList ?? []) {
				if (group.series?.length) collected.push(...group.series);
				walk(group.subgroups);
			}
		};
		walk(groups);
		return collected;
	});

	// Initialize filter composable
	const studiesFilter = useStudiesFilter(
		() => studies,
		() => groups,
		() => ungroupedStudies,
		() => searchQuery,
		() => ungroupedSeries
	);

	// Derived filtered/sorted data
	let sortedStudies = $derived(studiesFilter.getSortedStudies());
	let filteredGroups = $derived(studiesFilter.getFilteredGroups());
	let filteredUngroupedStudies = $derived(studiesFilter.getFilteredUngroupedStudies());
	let sortedGroupsAndStudies = $derived(studiesFilter.getSortedGroupsAndStudies());

	// Initialize keyboard navigation.
	//
	// The collapse callback routes by ROW TYPE: a series is a separate table with its own endpoint
	// (`/api/series/[id]`, not `/api/groups/[id]`), so passing `toggleGroupCollapse` directly would
	// PATCH a group id that does not exist and silently fail to collapse the row.
	const keyboardNav = useKeyboardNavigation(
		() => sortedGroupsAndStudies,
		(id, currentState, type) =>
			type === 'series'
				? toggleSeriesCollapse(id, currentState)
				: toggleGroupCollapse(id, currentState)
	);

	// Initialize panel resize
	const panelResize = usePanelResize(
		initialWidth,
		'studiesPanelWidth',
		'/api/user/preferences',
		() => isOpen,
		null, // Use default API property name
		'left', // Panel is on the left side
		300 // Minimum width: 30.0rem
	);

	let panelWidth = $derived(panelResize.getWidth());
	let isResizing = $derived(panelResize.getIsResizing());

	// Track active study from current route
	let activeStudyId = $derived.by(() => {
		if ($page.url.pathname.startsWith('/study/')) {
			const pathPart = $page.url.pathname.split('/study/')[1];
			// Extract just the ID (remove /edit or other suffixes)
			return pathPart.split('/')[0];
		}
		return null;
	});

	// Track current study view (document vs analyze) so that selecting a new study
	// keeps the user in the same view they're currently in. When inside a study view
	// we read it directly from the route. When NOT inside a study view (e.g. on the
	// glossary, new-study, or dashboard pages), we fall back to the last study view
	// the user was in — tracked in the toolbar store — so navigating back into a study
	// returns them to the same view (Document or Analyze) they last used.
	let currentStudyView = $derived.by(() => {
		if ($page.url.pathname.startsWith('/study/')) {
			const view = $page.url.pathname.split('/study/')[1].split('/')[1];
			if (view === 'document') return 'document';
			if (view === 'analyze') return 'analyze';
		}
		return $toolbarState.lastStudyView;
	});

	/**
	 * Track the active series from the current route.
	 *
	 * Mirrors `activeGroupId`, and the mirroring is the whole rule: a series row is "active" when
	 * its OWN page is open, and at no other time. Reading a part does not light the series, just
	 * as opening a study does not light its group — the active row is the thing on screen, and
	 * the part is already lighting itself. An earlier version OR'd in
	 * `parts.some(p => p.id === activeStudyId)`, which left the series stuck in solid blue while
	 * you read a part and made the container look like the selection.
	 */
	let activeSeriesId = $derived.by(() => {
		if ($page.url.pathname.startsWith('/series/')) {
			const pathPart = $page.url.pathname.split('/series/')[1];
			// Strip /edit and any other suffix, as the group and study equivalents do.
			return pathPart.split('/')[0];
		}
		return null;
	});

	// Track active group from current route or URL parameter
	let activeGroupId = $derived.by(() => {
		// Check if we're on a study-group page
		if ($page.url.pathname.startsWith('/study-group/')) {
			const pathPart = $page.url.pathname.split('/study-group/')[1];
			// Extract just the ID (remove /edit or other suffixes)
			return pathPart.split('/')[0];
		}
		// Check if we're on the new-study page with a groupId parameter
		if ($page.url.pathname === '/new-study') {
			return $page.url.searchParams.get('groupId');
		}
		// Check if we're on the new-study-group page with a parentGroupId parameter
		if ($page.url.pathname === '/new-study-group') {
			return $page.url.searchParams.get('parentGroupId');
		}
		return null;
	});

	/**
	 * Toggle group collapsed state
	 */
	async function toggleGroupCollapse(groupId, currentState) {
		try {
			const response = await fetch(`/api/groups/${groupId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isCollapsed: !currentState })
			});

			if (response.ok) {
				await invalidate('app:studies');
			}
		} catch (error) {
			console.error('Error toggling group:', error);
		}
	}

	/**
	 * Toggle series collapsed state.
	 *
	 * Separate endpoint from groups because a series is a separate table (SERIES_PLAN §4);
	 * the persisted flag is studySeries.isCollapsed, mirroring studyGroup.isCollapsed.
	 */
	async function toggleSeriesCollapse(seriesId, currentState) {
		try {
			const response = await fetch(`/api/series/${seriesId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ isCollapsed: !currentState })
			});

			if (response.ok) {
				await invalidate('app:studies');
			}
		} catch (error) {
			console.error('Error toggling series:', error);
		}
	}

	/**
	 * Handle series header click.
	 *
	 * ⚠️ Deliberately IDENTICAL in shape to `handleGroupHeaderClick`: select the row, then open
	 * the row's own page. A series is selected the way a group is (§4 treats both as expandable
	 * Finder rows), so it must behave the same way.
	 *
	 * This REVERSES Q18's resume-on-click. The old version navigated straight to a PART and never
	 * selected anything, which meant:
	 *   1. `isItemSelected('series', ...)` was never true, so the row's selection styling was dead
	 *      code and the toolbar never saw a series;
	 *   2. the part it navigated to became `activeStudyId`, which the auto-select effect below
	 *      then selected — so clicking a series reliably ended up selecting a PART, and Edit acted
	 *      on that part.
	 *
	 * Resuming is not lost: `/series/[id]` offers it as an explicit "Continue reading" button, so
	 * it is a choice the user makes rather than a side effect of selecting the series.
	 *
	 * The chevron is a separate control and handles expand/collapse on its own.
	 */
	function handleSeriesHeaderClick(event, series) {
		event.preventDefault();

		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;

		clearStudyContentState();

		// Always select the series, modifier or not — the modifiers are the multi-select gestures
		// and belong to `handleItemClick`, exactly as for groups and studies.
		multiSelect.handleItemClick(
			event,
			'series',
			series.id,
			series,
			getFlattenedItemsList(sortedGroupsAndStudies)
		);

		// Only navigate without modifiers, and only when the destination differs from the current
		// route. A redundant same-URL goto() still toggles $navigating, which arms the global
		// loading curtain without producing a load to clear it — see handleStudyClick.
		if (!hasModifier) {
			const dest = `/series/${series.id}`;
			if ($page.url.pathname !== dest) goto(dest);
		}
	}

	/**
	 * Handle group header click
	 */
	function handleGroupHeaderClick(event, group) {
		event.preventDefault();

		// Check for modifier keys
		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;

		clearStudyContentState();

		// Always select the group
		multiSelect.handleItemClick(
			event,
			'group',
			group.id,
			group,
			getFlattenedItemsList(sortedGroupsAndStudies)
		);

		// Only navigate if no modifier keys are pressed, and only when the destination
		// differs from the current route. Re-selecting an already-active group is fully
		// handled by the multi-select re-selection above; a redundant goto() to the
		// current URL needlessly toggles $navigating (which arms the global loading
		// curtain) without producing a real load to clear it.
		if (!hasModifier) {
			const dest = `/study-group/${group.id}`;
			if ($page.url.pathname !== dest) goto(dest);
		}
	}

	/**
	 * Handle study click
	 */
	function handleStudyClick(event, study) {
		event.preventDefault();

		// Check for modifier keys
		const hasModifier = event.shiftKey || event.metaKey || event.ctrlKey;

		// Always select the study
		multiSelect.handleItemClick(
			event,
			'study',
			study.id,
			study,
			getFlattenedItemsList(sortedGroupsAndStudies)
		);

		// Selecting a study deselects any active connection, segment, or note editor inside the study
		clearStudyContentState();

		// Only navigate if no modifier keys are pressed, and only when the destination
		// differs from the current route. Preserve the current view (document vs
		// analyze) when switching studies.
		//
		// The guard matters when re-selecting an ALREADY-ACTIVE study (e.g. it was
		// demoted from "selected" to "active-only" by interacting with study content,
		// then clicked again): the multi-select re-selection above already restores the
		// "selected" state, so navigating to the URL we are already on is pure overhead.
		// Worse, a same-URL goto() still briefly toggles $navigating, which arms the
		// global loading curtain (see +layout.svelte), but produces no real
		// study-switch load to clear it -- leaving the curtain stuck forever.
		if (!hasModifier) {
			const dest = `/study/${study.id}/${currentStudyView}`;
			if ($page.url.pathname !== dest) goto(dest);
		}
	}

	/**
	 * Handle study mousedown for drag
	 */
	function handleStudyMouseDown(event, study) {
		const isStudySelected = multiSelect.isItemSelected('study', study.id);
		const getSelectedStudies = () => multiSelect.getSelectedStudies().map((item) => item.data);

		dragDrop.handleStudyMouseDown(event, study, isStudySelected, getSelectedStudies);
	}

	/**
	 * Handle series mousedown for drag.
	 *
	 * A series is filed into a group the way a study is (§4 gives it its own Finder slot, and
	 * `studySeries.groupId` records where). No selection callback is passed: the composable drags
	 * exactly the grabbed series, because a series move PATCHes a different endpoint from a study
	 * move and a mixed selection cannot be sent to one of them.
	 */
	function handleSeriesMouseDown(event, series) {
		dragDrop.handleSeriesMouseDown(event, series);
	}

	/**
	 * Handle group mousedown for drag
	 */
	function handleGroupMouseDown(event, group) {
		const isGroupSelected = multiSelect.isItemSelected('group', group.id);
		const getSelectedItems = () => multiSelect.selectedItems;

		// Get all groups (flat list) for ancestry checking
		const allGroups = [];
		function collectGroups(groupList) {
			for (const g of groupList) {
				allGroups.push(g);
				if (g.subgroups && g.subgroups.length > 0) {
					collectGroups(g.subgroups);
				}
			}
		}
		collectGroups(groups);

		dragDrop.handleGroupMouseDown(event, group, isGroupSelected, getSelectedItems, allGroups);
	}

	/**
	 * Clear any active study-content state (segment, connection, note editor).
	 * Called whenever the user interacts with the Studies panel so that active
	 * items inside the study are deactivated.
	 */
	function clearStudyContentState() {
		setHeadingOrNoteEditorActive(false, null);
		setActiveSegment(false, null);
		setActiveConnection(false, []);
		// Notify the analyze page to clear its local visual state (activeColumns, activeSections,
		// activeSegments arrays). Those arrays live in +page.svelte and cannot be cleared from here
		// via the store alone; a window event bridges the gap.
		window.dispatchEvent(new CustomEvent('clear-analyze-selections'));
	}

	/**
	 * Handle panel click (for deselection)
	 */
	function handlePanelClick(event) {
		const clickedOnStudy = event.target.closest('.study-item');
		const clickedOnGroupButton = event.target.closest('.group-select-button');
		const clickedOnChevron = event.target.closest('.chevron-button');

		clearStudyContentState();

		if (!clickedOnStudy && !clickedOnGroupButton && !clickedOnChevron) {
			multiSelect.clearSelection();
		}
	}

	/**
	 * Document click handler for deselection
	 */
	$effect(() => {
		function handleDocumentClick(event) {
			if (multiSelect.selectedItems.length === 0) return;

			// Preserve selection on /new-study page with groupId parameter
			if ($page.url.pathname === '/new-study' && $page.url.searchParams.get('groupId')) {
				return;
			}

			// Preserve selection on /new-study-group page with parentGroupId parameter
			if (
				$page.url.pathname === '/new-study-group' &&
				$page.url.searchParams.get('parentGroupId')
			) {
				return;
			}

			// Preserve selection when interacting with Actions menu
			const clickedOnActionsButton = event.target.closest('[popovertarget="MenuActions"]');
			const clickedInActionsMenu = event.target.closest('#MenuActions');
			const clickedInModal = event.target.closest('[role="dialog"]');

			if (clickedOnActionsButton || clickedInActionsMenu || clickedInModal) {
				return;
			}

			const container = document.querySelector('.studies-container');
			if (!container) return;

			const clickedInsideContainer = container.contains(event.target);

			if (!clickedInsideContainer) {
				multiSelect.clearSelection();
			}
		}

		document.addEventListener('click', handleDocumentClick);

		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});

	/**
	 * Document mouseup handler for drag
	 */
	$effect(() => {
		const handleMouseUp = (e) => dragDrop.handleDocumentMouseUp(e, multiSelect.clearSelection);
		// This is set up by dragDrop.handleStudyMouseDown
		return () => {};
	});

	/**
	 * Effect for global resize listeners
	 */
	$effect(() => {
		return panelResize.setupResizeListeners();
	});

	/**
	 * Track the last study ID that was auto-selected, so we only auto-select
	 * on initial navigation to a study — not on every $effect re-run.
	 * This is a plain (non-reactive) variable so reading/writing it inside
	 * the $effect doesn't create reactive dependencies or trigger re-run loops.
	 */
	let previousActiveStudyId = null;

	/**
	 * The same latch for series, and it is NOT symmetry for its own sake.
	 *
	 * ⚠️ Without it, clicking a series' first part left the SERIES selected. `goto()` is async, so
	 * when `handleStudyClick` replaced the selection the effect below re-ran while the URL was
	 * still `/series/{id}` — `activeSeriesId` was therefore still truthy, the series was "not
	 * selected", and the branch selected it again, discarding the part. The navigation then
	 * landed and the study branch normally repaired it, which is why this only showed up
	 * SOMETIMES: on a part that had already been `previousActiveStudyId`, the study branch
	 * skipped its own auto-select and the stale series selection survived on screen.
	 */
	let previousActiveSeriesId = null;

	/**
	 * Auto-select active group or study on page load, or clear selection on dashboard.
	 *
	 * For studies: only auto-selects when navigating to a NEW study (ID changed).
	 * If the user then interacts with content inside the study, handleDocumentClick
	 * clears the selection — and since the study ID hasn't changed, the $effect
	 * re-runs but skips the auto-select, leaving the study in "active only" (gray) state.
	 */
	$effect(() => {
		if (activeSeriesId) {
			// Checked BEFORE the study branch. A series page has no active study, so the order is
			// not strictly load-bearing today — but a series selection must never be replaceable by
			// a part's, and stating the precedence here keeps that true if the routes ever overlap.
			//
			// Gated on the ID having CHANGED, exactly as the study branch is. `!isItemSelected(...)`
			// alone is not the same test: it is also true the instant the user selects something
			// else while still on the series page — which is precisely what clicking a part does,
			// since `goto()` has not resolved yet. Re-running then re-imposed the series selection
			// on top of the part's.
			if (activeSeriesId !== previousActiveSeriesId) {
				previousActiveSeriesId = activeSeriesId;
				const flatList = getFlattenedItemsList(sortedGroupsAndStudies);
				const seriesItem = flatList.find(
					(item) => item.type === 'series' && item.id === activeSeriesId
				);

				if (seriesItem && !multiSelect.isItemSelected('series', activeSeriesId)) {
					multiSelect.selectedItems = [
						{
							type: 'series',
							id: activeSeriesId,
							data: seriesItem.data,
							index: seriesItem.index
						}
					];
					multiSelect.lastSelectedIndex = seriesItem.index;
					multiSelect.updateToolbarSelection();
				}
			}
		} else if (activeGroupId) {
			previousActiveSeriesId = null;
			// Find the group in the flattened list
			const flatList = getFlattenedItemsList(sortedGroupsAndStudies);
			const groupItem = flatList.find((item) => item.type === 'group' && item.id === activeGroupId);

			if (groupItem && !multiSelect.isItemSelected('group', activeGroupId)) {
				// Select the active group
				multiSelect.selectedItems = [
					{
						type: 'group',
						id: activeGroupId,
						data: groupItem.data,
						index: groupItem.index
					}
				];
				multiSelect.lastSelectedIndex = groupItem.index;
				multiSelect.updateToolbarSelection();
			}
		} else if (activeStudyId) {
			// Cleared on the way out so that navigating BACK to the series page selects the series
			// again. Without this the latch would fire exactly once per session.
			previousActiveSeriesId = null;
			// Only auto-select when first arriving at this study (ID changed).
			// If it's the same study and selection was cleared by user interaction,
			// do nothing — let the study remain in "active only" (unselected) state.
			if (activeStudyId !== previousActiveStudyId) {
				previousActiveStudyId = activeStudyId;
				const flatList = getFlattenedItemsList(sortedGroupsAndStudies);
				const studyItem = flatList.find(
					(item) => item.type === 'study' && item.id === activeStudyId
				);

				if (studyItem) {
					// Select the active study
					multiSelect.selectedItems = [
						{
							type: 'study',
							id: activeStudyId,
							data: studyItem.data,
							index: studyItem.index
						}
					];
					multiSelect.lastSelectedIndex = studyItem.index;
					multiSelect.updateToolbarSelection();
				}
			}
		} else {
			// Clear selection when no active item (e.g., on dashboard)
			previousActiveStudyId = null;
			previousActiveSeriesId = null;
			if (multiSelect.selectedItems.length > 0) {
				multiSelect.clearSelection();
			}
		}
	});

	/**
	 * Clear Finder study selection when the user activates a column, section,
	 * connection, segment, or connection quick note inside the study content.
	 * This transitions the study from "selected" (blue) to "active only" (gray)
	 * so the Delete button targets the column/section/connection/heading/note
	 * rather than the study itself.
	 */
	$effect(() => {
		const isConnectionNoteEditing =
			$toolbarState.hasActiveHeadingOrNoteEditor &&
			$toolbarState.activeHeadingOrNoteType === 'connection-note';

		if (
			($toolbarState.hasActiveColumn ||
				$toolbarState.hasActiveSection ||
				$toolbarState.hasActiveSegment ||
				$toolbarState.hasActiveConnection ||
				isConnectionNoteEditing) &&
			multiSelect.selectedItems.length > 0
		) {
			multiSelect.clearSelection();
		}
	});

	/*
	 * ⚠️ NO AUTOFOCUS ON THE SEARCH FIELD. Deliberately removed, and it must not come back.
	 *
	 * This used to be an `$effect` labelled "focus search input when panel opens" that called
	 * `searchInputRef.focus()` behind a 100ms timeout. The label described an intent the code could
	 * not honour: an `$effect` re-runs whenever ANY dependency changes, and it read
	 * `searchInputRef` — a `$bindable` that Svelte reassigns on every re-render of `bind:this`.
	 *
	 * So it fired on every selection change, route change and `invalidate('app:studies')`, not on
	 * the open transition. The 100ms delay turned that into focus THEFT rather than a default: a
	 * click landed in some other field, then the pending timeout pulled the caret into the Finder's
	 * search box. Typing in the Title field on New Study or Edit Series was affected too, since
	 * both open this panel on mount.
	 *
	 * The search field now takes focus only when the user clicks it. Keyboard navigation is
	 * unaffected — `focusItem()` in `useKeyboardNavigation` is a separate mechanism driven by an
	 * actual keypress.
	 */

	/**
	 * Handle keyboard resize
	 */
	function handleResizeKeyDown(event) {
		const step = 10; // pixels to resize per keypress

		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			panelResize.adjustWidth(-step);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			panelResize.adjustWidth(step);
		}
	}
</script>

<!-- Drag ghost -->
{#if dragDrop.isDragging && (dragDrop.draggedStudies.length > 0 || dragDrop.draggedGroups.length > 0 || dragDrop.draggedSeries.length > 0)}
	<div
		class="drag-ghost"
		class:multi={dragDrop.draggedStudies.length + dragDrop.draggedGroups.length > 1}
		style="left: {(dragDrop.currentMouseX + 6) / 10}rem; top: {(dragDrop.currentMouseY + 6) /
			10}rem;"
	>
		{#if dragDrop.draggedStudies.length + dragDrop.draggedGroups.length > 1}
			<div class="drag-count">{dragDrop.draggedStudies.length + dragDrop.draggedGroups.length}</div>
		{/if}
		{#if dragDrop.draggedSeries.length > 0}
			<!-- Dragging a series. Shaped like the group ghost rather than the study one, because a
			     series is being FILED here exactly as a group is, and its count is of parts. The
			     `series` glyph keeps it distinguishable from a folder mid-drag — the same icon the
			     Finder row and the series page use (§9, Q29). Never multi: a series drag carries
			     exactly one series, so no count badge. -->
			<div class="drag-ghost-group">
				<Icon iconId={'series'} classes="folder-icon" />
				<span class="group-name">{dragDrop.draggedSeries[0].name}</span>
				<span class="item-count">{dragDrop.draggedSeries[0].parts?.length || 0}</span>
			</div>
		{:else if dragDrop.draggedGroups.length > 0}
			<!-- Dragging groups -->
			<div class="drag-ghost-group">
				<Icon iconId={'folder'} classes="folder-icon" />
				<span class="group-name">{dragDrop.draggedGroups[0].name}</span>
				<span class="item-count">{dragDrop.draggedGroups[0].studies?.length || 0}</span>
			</div>
		{:else}
			<!-- Dragging studies -->
			<StudyItem study={dragDrop.draggedStudies[0]} ghost={true} {formatPassageReference} />
		{/if}
	</div>
{/if}

<aside
	class="studies-panel"
	class:open={isOpen}
	class:resizing={isResizing}
	style:width="{isOpen ? panelWidth : 0}px"
>
	<div class="panel-content" style:width="{panelWidth}px">
		<div class="panel-header">
			<Input
				id="search-studies"
				name="search"
				type="search"
				placeholder="Search"
				aria-label="Search studies"
				bind:value={searchQuery}
			/>
		</div>

		<div class="panel-scrollable" onclick={handlePanelClick}>
			{#if studies.length === 0 && groups.length === 0}
				<p class="empty-message">No studies yet.<br />Create one to get started.</p>
			{:else if filteredGroups.length === 0 && filteredUngroupedStudies.length === 0 && searchQuery.trim() === ''}
				<!-- Fallback -->
				<ul class="studies-list">
					{#each sortedStudies as study}
						<li>
							<StudyItem
								{study}
								asLink={true}
								href="/study/{study.id}/{currentStudyView}"
								isActive={study.id === activeStudyId}
								{formatPassageReference}
							/>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="studies-container" onkeydown={keyboardNav.handleListKeyDown}>
					{#each sortedGroupsAndStudies as item, index (item.type + '-' + item.data.id)}
						<div role="presentation" animate:flip={{ duration: 300 }}>
							{#if item.type === 'group'}
								<StudyGroup
									group={item.data}
									tabindex={index === 0 ? 0 : -1}
									isSelected={multiSelect.isItemSelected('group', item.data.id)}
									selectionPosition={multiSelect.getSelectionPosition('group', item.data.id)}
									isActive={item.data.id === activeGroupId}
									dropTargetGroupId={dragDrop.dropTargetGroupId}
									onToggleCollapse={toggleGroupCollapse}
									onGroupHeaderClick={handleGroupHeaderClick}
									onGroupMouseDown={handleGroupMouseDown}
									onStudyMouseDown={handleStudyMouseDown}
									onStudyClick={handleStudyClick}
									isStudySelected={(studyId) => multiSelect.isItemSelected('study', studyId)}
									getStudySelectionPosition={(studyId) =>
										multiSelect.getSelectionPosition('study', studyId)}
									isStudyActive={(studyId) => studyId === activeStudyId}
									isStudyBeingDragged={dragDrop.isStudyBeingDragged}
									isDragging={dragDrop.isDragging}
									dropTargetSeriesId={dragDrop.dropTargetSeriesId}
									{formatPassageReference}
									isGroupSelected={(groupId) => multiSelect.isItemSelected('group', groupId)}
									getGroupSelectionPosition={(groupId) =>
										multiSelect.getSelectionPosition('group', groupId)}
									isGroupActive={(groupId) => groupId === activeGroupId}
									isSeriesSelected={(seriesId) => multiSelect.isItemSelected('series', seriesId)}
									getSeriesSelectionPosition={(seriesId) =>
										multiSelect.getSelectionPosition('series', seriesId)}
									isSeriesActive={(seriesId) => seriesId === activeSeriesId}
									onToggleSeriesCollapse={toggleSeriesCollapse}
									onSeriesHeaderClick={handleSeriesHeaderClick}
									onSeriesMouseDown={handleSeriesMouseDown}
									forceExpanded={searchQuery.trim() !== ''}
									onfocus={() => {
										const flatList = getFlattenedItemsList(sortedGroupsAndStudies);
										const itemIndex = flatList.findIndex(
											(i) => i.type === 'group' && i.id === item.data.id
										);
										if (itemIndex !== -1) keyboardNav.updateFocusedIndex(itemIndex);
									}}
								/>
							{:else if item.type === 'series'}
								<StudySeries
									series={item.data}
									tabindex={index === 0 ? 0 : -1}
									isSelected={multiSelect.isItemSelected('series', item.data.id)}
									selectionPosition={multiSelect.getSelectionPosition('series', item.data.id)}
									isActive={item.data.id === activeSeriesId}
									onToggleCollapse={toggleSeriesCollapse}
									onSeriesHeaderClick={handleSeriesHeaderClick}
									onSeriesMouseDown={handleSeriesMouseDown}
									onStudyMouseDown={handleStudyMouseDown}
									onStudyClick={handleStudyClick}
									isStudySelected={(studyId) => multiSelect.isItemSelected('study', studyId)}
									getStudySelectionPosition={(studyId) =>
										multiSelect.getSelectionPosition('study', studyId)}
									isStudyActive={(studyId) => studyId === activeStudyId}
									isStudyBeingDragged={dragDrop.isStudyBeingDragged}
									isDragging={dragDrop.isDragging}
									dropTargetSeriesId={dragDrop.dropTargetSeriesId}
									{formatPassageReference}
									forceExpanded={searchQuery.trim() !== ''}
								/>
							{:else}
								<div class="study-wrapper">
									<StudyItem
										study={item.data}
										tabindex={index === 0 && sortedGroupsAndStudies[0]?.type === 'study' ? 0 : -1}
										isSelected={multiSelect.isItemSelected('study', item.data.id)}
										selectionPosition={multiSelect.getSelectionPosition('study', item.data.id)}
										isActive={item.data.id === activeStudyId}
										beingDragged={dragDrop.isStudyBeingDragged(item.data.id)}
										isDragging={dragDrop.isDragging}
										ungrouped={true}
										{formatPassageReference}
										onMouseDown={handleStudyMouseDown}
										onClick={handleStudyClick}
										onfocus={() => {
											const flatList = getFlattenedItemsList(sortedGroupsAndStudies);
											const itemIndex = flatList.findIndex(
												(i) => i.type === 'study' && i.id === item.data.id
											);
											if (itemIndex !== -1) keyboardNav.updateFocusedIndex(itemIndex);
										}}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
	{#if isOpen}
		<div
			class="resize-handle"
			tabindex="0"
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize studies panel. Use left and right arrow keys to adjust width."
			onmousedown={panelResize.handleResizeStart}
			onkeydown={handleResizeKeyDown}
		></div>
	{/if}
</aside>

<!-- Confirmation for the drag gesture (SERIES_PLAN Q17, phase 3). Mounted only while a drop is
     pending so its `isOpen` effect re-dry-runs for each new drop rather than reusing stale warnings. -->
{#if pendingSeriesDrop}
	<AddToSeriesModal
		isOpen={true}
		study={pendingSeriesDrop.study}
		series={allSeries}
		fixedSeriesId={pendingSeriesDrop.seriesId}
		onDone={async () => {
			pendingSeriesDrop = null;
			// The study left its group and joined a series, so its Finder row moves and the series' part
			// count changes. `invalidateAll` is what the other series commands use for the same reason:
			// the tree is refetched rather than patched.
			await invalidateAll();
		}}
		onClose={() => (pendingSeriesDrop = null)}
	/>
{/if}

<style>
	.studies-panel {
		position: relative;
		min-width: 0;
		height: 100%;
		background-color: var(--gray-lighter);
		border-right: 1px solid var(--gray-700);
		overflow: hidden;
		transition: width 0.3s ease-in-out;
		flex-shrink: 0;
	}

	.studies-panel.resizing {
		transition: none;
	}

	.panel-content {
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	.resize-handle {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		z-index: 10;
		background-color: transparent;
	}

	.resize-handle:focus-visible {
		outline: 0.1rem solid var(--gray-700);
		background-color: var(--gray-light);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1.5rem;
		padding: 1.5rem 1.5rem 0.6rem;
		position: sticky;
		top: 0;
		z-index: 1;
		flex-shrink: 0;
	}

	.panel-header :global(input) {
		border-radius: 2.5vh;
	}

	.panel-scrollable {
		flex: 1;
		overflow-y: auto;
		padding: 0.9rem;
	}

	.empty-message {
		color: var(--gray-400);
		font-size: 1.4rem;
		text-align: center;
		line-height: 1.5;
		padding: 25vh 0;
	}

	.studies-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.studies-container {
		display: flex;
		flex-direction: column;
	}

	/* Drag ghost styles */
	.drag-ghost {
		position: fixed;
		pointer-events: none;
		z-index: 9999;
		width: 28.2rem;
		border-radius: 0.3rem;
	}

	.drag-ghost :global(.study-item) {
		position: relative;
		z-index: 3;
		background-color: var(--gray-lighter);
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
	}

	.drag-ghost.multi::before,
	.drag-ghost.multi::after {
		content: '';
		position: absolute;
		top: 0.5rem;
		right: -0.5rem;
		bottom: -0.5rem;
		left: 0.5rem;
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
		background-color: var(--gray-lighter);
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		z-index: 2;
	}

	.drag-ghost.multi::after {
		top: 1rem;
		right: -1rem;
		bottom: -1rem;
		left: 1rem;
		z-index: 1;
	}

	.drag-ghost.multi .drag-count {
		display: flex;
		align-items: center;
		justify-content: center;
		position: absolute;
		z-index: 4;
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--white);
		background-color: var(--red);
		border-radius: 100vw;
		height: 2.4rem;
		width: 2.4rem;
		top: -0.9rem;
		right: -0.9rem;
	}

	.drag-ghost-group {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.9rem 0.9rem 0.9rem 2.2rem;
		background-color: var(--gray-lighter);
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		border-radius: 0.3rem;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--black);
		position: relative;
		z-index: 3;
	}

	.drag-ghost-group :global(.folder-icon) {
		height: 1.2rem;
		fill: var(--gray-300);
	}

	.drag-ghost-group .group-name {
		flex: 1;
	}

	.drag-ghost-group .item-count {
		font-size: 1.2rem;
		color: var(--gray-400);
	}

	:global(body.dragging) {
		user-select: none;
		cursor: grabbing;
	}
</style>
