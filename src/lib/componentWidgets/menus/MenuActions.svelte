<script>
	/**
	 * # MenuActions Component
	 * 
	 * Menu for performing actions on selected items in the Studies Panel.
	 * Provides keyboard-accessible alternatives to drag-and-drop operations.
	 * 
	 * ## Features
	 * - Move to… submenu with hierarchical group list
	 * - Remove from Group option (moves to ungrouped)
	 * - Delete option (with confirmation modal)
	 * - Dark themed menu
	 * - Circular nesting prevention for groups
	 * 
	 * ## Props
	 * @property {string} menuId - Unique identifier for the menu
	 * @property {Array} groups - All available groups for move operations
	 * @property {Function} onMoveToGroup - Callback when moving items to a group
	 * @property {Function} onDelete - Callback when delete is clicked
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuActions 
	 *   menuId="MenuActions" 
	 *   groups={allGroups}
	 *   onMoveToGroup={handleMove}
	 *   onDelete={handleDelete}
	 * />
	 * ```
	 * 
	 * @component
	 */

	import { goto } from '$app/navigation';
	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import MoveToGroupModal from '../modals/MoveToGroupModal.svelte';
	import SplitIntoSeriesModal from '../modals/SplitIntoSeriesModal.svelte';
	import SplitPartModal from '../modals/SplitPartModal.svelte';
	import JoinPartsModal from '../modals/JoinPartsModal.svelte';
	import AddToSeriesModal from '../modals/AddToSeriesModal.svelte';
	import ReorderRunsModal from '../modals/ReorderRunsModal.svelte';
	import { describeRuns } from '$lib/utils/seriesReorder.js';
	import { toolbarState } from '$lib/stores/toolbar.js';
	import { wouldCreateCircularNesting } from '$lib/utils/groupHierarchy.js';
	import { flattenGroupsForMenu } from '$lib/utils/groupFlattening.js';
	import { isSeriesEligible } from '$lib/utils/seriesPlanning.js';
	import { invalidateAll } from '$app/navigation';

	/** @type {{ menuId: string, groups: Array, series: Array, onMoveToGroup: Function, onDelete: Function }} Props */
	let { menuId, groups = [], series = [], onMoveToGroup, onDelete } = $props();

	let showMoveToModal = $state(false);
	let showSplitIntoSeriesModal = $state(false);
	let splitError = $state(null);
	let showSplitPartModal = $state(false);
	let showJoinPartsModal = $state(false);


	// Check if a single group is selected
	let selectedGroup = $derived(
		$toolbarState.selectedItem?.count === 1 && 
		$toolbarState.selectedItem?.items[0]?.type === 'group'
			? $toolbarState.selectedItem.items[0]
			: null
	);

	// Check if anything is selected
	let hasSelection = $derived(
		$toolbarState.selectedItem?.count > 0 || false
	);

	// Check if any selected items are in groups
	let hasGroupedItems = $derived(
		$toolbarState.selectedItem?.items.some(item => {
			if (item.type === 'study') {
				return item.data.groupId !== null;
			}
			if (item.type === 'group') {
				return item.data.parentGroupId !== null;
			}
			return false;
		}) || false
	);

	// ── Split into a series ───────────────────────────────────────────────────────
	//
	// SERIES_PLAN §5: "Always available for any 2+ chapter study, whether or not the flow ever
	// offered it. This is what makes the choice the user's." So eligibility is decided purely by
	// the study's own chapter span — never by how long the range looks, and never withheld
	// because the creation flow did not happen to suggest it.

	/** The single selected study, or null. Splitting is a one-study operation. */
	let selectedStudy = $derived(
		$toolbarState.selectedItem?.count === 1 &&
		$toolbarState.selectedItem?.items[0]?.type === 'study'
			? $toolbarState.selectedItem.items[0]
			: null
	);

	let selectedStudyData = $derived(selectedStudy?.data ?? null);

	/**
	 * A study already in a series cannot be split again — that is "Split Part" (§8), which §11
	 * phases as **phase 2**, not phase 3. Its planning and structure-transfer layers have landed;
	 * the endpoint and UI have not, so this guard still holds for now.
	 */
	let isAlreadyPart = $derived(Boolean(selectedStudyData?.seriesId));

	let canSplitIntoSeries = $derived(
		Boolean(selectedStudyData) &&
		!isAlreadyPart &&
		isSeriesEligible(selectedStudyData?.passages ?? [])
	);

	// §1d asks for the reason to be stated rather than left to a dead control.
	let splitDisabledReason = $derived(
		!selectedStudyData
			? 'Select a single study to split into a series.'
			: isAlreadyPart
				? 'This study is already part of a series.'
				: !isSeriesEligible(selectedStudyData?.passages ?? [])
					? 'A series needs a study spanning at least two chapters.'
					: null
	);

	function handleSplitIntoSeriesClick() {
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		splitError = null;
		showSplitIntoSeriesModal = true;
	}

	/**
	 * Create the series. The endpoint re-plans server-side from the same planner, so the
	 * chapters-per-part setting is all that needs to travel.
	 */
	async function handleCreateSeries(chaptersPerPart, options = {}) {
		splitError = null;
		try {
			const response = await fetch('/api/series', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					studyId: selectedStudyData.id,
					chaptersPerPart,
					// "Balance by length" (§5 option (b)). Forwarded so the server re-plans the shape the
					// user actually approved, not the default one.
					balanceByLength: options.balanceByLength ?? false,
					targetParts: options.targetParts ?? 0
				})
			});

			const result = await response.json();

			if (!response.ok) {
				splitError = result.error ?? 'Could not create the series.';
				return;
			}

			showSplitIntoSeriesModal = false;
			// Refresh the panel so the new parts and their series appear.
			await invalidateAll();
		} catch (error) {
			console.error('Failed to create series:', error);
			splitError = 'Could not create the series.';
		}
	}

	// ── Split Part / Join Parts (§8, phase 2) ─────────────────────────────────────
	//
	// Both act on a PART, which the Finder selects as an ordinary study. `study.seriesId` names its
	// series but carries none of its siblings, so the series row is looked up here — Join Parts
	// needs the neighbours to exist before it can offer a direction at all.

	/** The series containing the selected part, or null when the selection is not a part. */
	let selectedPartSeries = $derived(
		selectedStudyData?.seriesId
			? (series ?? []).find((s) => s.id === selectedStudyData.seriesId) ?? null
			: null
	);

	let isPart = $derived(Boolean(selectedPartSeries));

	/**
	 * Split Part needs a part with something to divide. The authoritative rule is
	 * `getSplitPoints()` on the server, which the modal renders; this is only the enabling test, so
	 * it asks the cheaper question the client can answer — does the part span more than one chapter,
	 * or hold more than one passage?
	 *
	 * Deliberately NOT a second copy of the planner's rule: if the two disagree, the modal opens and
	 * states the reason, which is §11's requirement anyway.
	 */
	let canSplitPart = $derived(
		isPart &&
			(selectedStudyData?.passages ?? []).length > 0 &&
			((selectedStudyData?.passages ?? []).length > 1 ||
				(selectedStudyData.passages[0].toChapter ?? 0) >
					(selectedStudyData.passages[0].fromChapter ?? 0))
	);

	// Join needs a neighbour to join with. A one-part series cannot exist (§4), so any real part has
	// at least one — but the guard is kept because a stale payload should disable the command rather
	// than open a modal with no legal direction.
	let canJoinParts = $derived(isPart && (selectedPartSeries?.parts?.length ?? 0) > 1);

	let splitPartDisabledReason = $derived(
		!isPart
			? 'Select a part of a series to split it.'
			: !canSplitPart
				? 'This part covers a single chapter, so it cannot be divided further.'
				: null
	);

	let joinPartsDisabledReason = $derived(
		!isPart ? 'Select a part of a series to join it with a neighbour.' : null
	);

	function closeMenu() {
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
	}

	function handleSplitPartClick() {
		closeMenu();
		showSplitPartModal = true;
	}

	function handleJoinPartsClick() {
		closeMenu();
		showJoinPartsModal = true;
	}

	/**
	 * After a restructure the Finder is stale in several ways at once — a part added or removed,
	 * ranges changed, possibly the series dissolved — so the whole tree is refetched rather than
	 * patched. `invalidateAll` is what the create-series path already uses for the same reason.
	 */
	async function handleRestructured() {
		showSplitPartModal = false;
		showJoinPartsModal = false;
		showAddToSeriesModal = false;
		await invalidateAll();
	}

	// ── Add a standalone study to a series (Q17, phase 3) ─────────────────────
	//
	// The inverse of "Split into a Series…": that makes a series FROM a study, this puts a study INTO
	// one. Offered for a standalone study only — a study already in a series would have to answer what
	// happens to the series it leaves (§4: down to one part, that series dissolves), which the endpoint
	// refuses rather than performs silently.
	let showAddToSeriesModal = $state(false);

	let canAddToSeries = $derived(
		Boolean(selectedStudyData) && !selectedStudyData.seriesId && (series?.length ?? 0) > 0
	);

	let addToSeriesDisabledReason = $derived(
		!selectedStudyData
			? 'Select a single study to add it to a series.'
			: selectedStudyData.seriesId
				? 'This study is already part of a series.'
				: (series?.length ?? 0) === 0
					? 'There are no series to add it to yet.'
					: null
	);

	function handleAddToSeriesClick() {
		closeMenu();
		showAddToSeriesModal = true;
	}

	// ── Reorder runs (§4, phase 3) ────────────────────────────────────────────
	//
	// §11: "only meaningful for a series with 2+ runs: a contiguous Romans series has exactly one run
	// and nothing to reorder, so the UI must not offer a drag handle that can never do anything." The
	// command is therefore disabled — with a reason — for a single-run series, rather than opening a
	// dialog that would show one immovable row.
	//
	// Runs are computed here from data the Finder already holds, so the menu can answer "is this
	// offerable?" without a round trip. The endpoint recomputes them anyway, so a stale client cannot
	// produce a bad write.
	let showReorderModal = $state(false);

	/**
	 * The series to reorder: the one selected directly, or the one the selected part belongs to.
	 *
	 * Both entry points matter — §6 gives a series its own Finder row (selectable as `type: 'series'`,
	 * which `groupFlattening.js` was fixed to report), and a user who has a part open is just as likely
	 * to reach for the command from there.
	 */
	let selectedSeriesRow = $derived(
		$toolbarState.selectedItem?.count === 1 &&
			$toolbarState.selectedItem?.items[0]?.type === 'series'
			? ((series ?? []).find((s) => s.id === $toolbarState.selectedItem.items[0].data?.id) ?? null)
			: null
	);

	let reorderTargetSeries = $derived(selectedSeriesRow ?? selectedPartSeries ?? null);

	let reorderRuns = $derived(
		reorderTargetSeries?.parts?.length ? describeRuns(reorderTargetSeries.parts) : null
	);

	let canReorderRuns = $derived(Boolean(reorderRuns?.reorderable));

	let reorderDisabledReason = $derived(
		!reorderTargetSeries
			? 'Select a series, or a part of one, to reorder it.'
			: !reorderRuns?.reorderable
				? 'Every part of this series follows the one before it, so there is nothing to reorder.'
				: null
	);

	function handleReorderClick() {
		closeMenu();
		showReorderModal = true;
	}

	// Note: flattenGroupsForMenu is no longer needed here as the modal handles flattening


	/** Navigate to new study page, optionally with groupId */
	const handleNewStudy = (groupId = null) => {
		// Close the menu first
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Then navigate
		if (groupId) {
			goto(`/new-study?groupId=${groupId}`);
		} else {
			goto('/new-study');
		}
	};

	/** Navigate to new group page, optionally with parentGroupId */
	const handleNewGroup = (parentGroupId = null) => {
		// Close the menu first
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Then navigate
		if (parentGroupId) {
			goto(`/new-study-group?parentGroupId=${parentGroupId}`);
		} else {
			goto('/new-study-group');
		}
	};

	/**
	 * Handle move to group click
	 */
	async function handleMoveToGroup(groupId) {
		// Close both menus
		const mainMenu = document.getElementById(menuId);
		if (mainMenu && mainMenu.matches(':popover-open')) {
			mainMenu.hidePopover();
		}
		
		if (onMoveToGroup) {
			await onMoveToGroup(groupId);
		}
	}

	/**
	 * Handle remove from group click
	 */
	async function handleRemoveFromGroup() {
		// Close the menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		if (onMoveToGroup) {
			await onMoveToGroup(null);
		}
	}

	/**
	 * Handle delete click
	 */
	function handleDeleteClick(event) {
		// Close the menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		if (onDelete) {
			// Pass whether this was triggered via keyboard
			// (Enter/Space on focused button) vs mouse click
			const viaKeyboard = event.detail === 0 || event instanceof KeyboardEvent;
			onDelete(viaKeyboard);
		}
	}

	/**
	 * Open move to modal
	 */
	function handleMoveToClick() {
		// Close the Actions menu
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		
		// Open the modal
		showMoveToModal = true;
	}

	/**
	 * Handle modal close
	 */
	function handleModalClose() {
		showMoveToModal = false;
	}

	/**
	 * Handle move from modal
	 */
	async function handleMoveFromModal(targetGroupId) {
		if (onMoveToGroup) {
			await onMoveToGroup(targetGroupId);
		}
		showMoveToModal = false;
	}
</script>

<Menu {menuId} classes="dark">
	<IconButton
		iconId="book"
		label="New Study"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewStudy(null)}
	/>

	<IconButton
		iconId="book-in"
		label="New Study in Selected"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewStudy(selectedGroup.id)}
		isDisabled={!selectedGroup}
	/>

	<DividerHorizontal />

	<IconButton
		iconId="folder"
		label="New Study Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewGroup(null)}
	/>

	<IconButton
		iconId="folders"
		label="New Study Group in Selected"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleNewGroup(selectedGroup.id)}
		isDisabled={!selectedGroup}
	/>
	
	<DividerHorizontal />
	
	<IconButton
		iconId="arrow-right-curve"
		label="Move to…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleMoveToClick}
		isDisabled={!hasSelection}
	/>
	
	<IconButton
		iconId="arrow-left-curve"
		label="Remove from Group"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleRemoveFromGroup}
		isDisabled={!hasGroupedItems}
	/>

	<DividerHorizontal />

	<!-- §3: the verb is always qualified by its object at study level — never a bare "Split",
	     which belongs to columns (column-split.svg). -->
	<IconButton
		iconId="series-split"
		label="Split into a Series…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleSplitIntoSeriesClick}
		isDisabled={!canSplitIntoSeries}
		title={splitDisabledReason}
	/>

	<!-- Split Part / Join Parts act on a part of an existing series (§8). Separate items from
	     "Split into a Series…" because they are different operations on different objects — §3's
	     rule that the verb is always qualified by its object.

	     That rule also chooses the artwork. These two carry `series-part-split` / `series-part-join`
	     — the single-part rectangle — not the books-and-squares `series-split` above, whose object is
	     the whole series. Both items rendered `series-split` until the part artwork landed, which put
	     one glyph on two adjacent items with different objects: the exact confusion §9 draws the two
	     icon families to prevent. -->
	<IconButton
		iconId="series-part-split"
		label="Split Part…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleSplitPartClick}
		isDisabled={!canSplitPart}
		title={splitPartDisabledReason}
	/>

	<IconButton
		iconId="series-part-join"
		label="Join Parts…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleJoinPartsClick}
		isDisabled={!canJoinParts}
		title={joinPartsDisabledReason}
	/>

	<!-- §4: reordering permutes RUNS, not parts. Disabled with a reason for a contiguous series, which
	     has exactly one run and nothing to rearrange (§11). -->
	<IconButton
		iconId="series-reorder"
		label="Reorder Series…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleReorderClick}
		isDisabled={!canReorderRuns}
		title={reorderDisabledReason}
	/>

	<!-- The inverse of "Split into a Series…": that makes a series FROM a study, this puts a study
	     INTO one (Q17). Uses `series-add` — a part rectangle with a plus — not the bare `series`
	     glyph it used to carry. `series` is the NOUN: it marks the series' own Finder row and the
	     series page heading, so a menu item wearing it read as "a series" rather than "add one more
	     to a series". The verb needs the verb artwork (§9). -->
	<IconButton
		iconId="series-add"
		label="Add to Series…"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleAddToSeriesClick}
		isDisabled={!canAddToSeries}
		title={addToSeriesDisabledReason}
	/>

</Menu>


<MoveToGroupModal
	isOpen={showMoveToModal}
	{groups}
	selectedItems={$toolbarState.selectedItem?.items || []}
	onMoveToGroup={handleMoveFromModal}
	onClose={handleModalClose}
/>

<SplitIntoSeriesModal
	isOpen={showSplitIntoSeriesModal}
	study={selectedStudyData}
	error={splitError}
	onCreate={handleCreateSeries}
	onClose={() => (showSplitIntoSeriesModal = false)}
/>

<SplitPartModal
	isOpen={showSplitPartModal}
	part={selectedStudyData}
	seriesId={selectedPartSeries?.id ?? null}
	onDone={handleRestructured}
	onClose={() => (showSplitPartModal = false)}
/>

<JoinPartsModal
	isOpen={showJoinPartsModal}
	part={selectedStudyData}
	seriesId={selectedPartSeries?.id ?? null}
	onDone={handleRestructured}
	onClose={() => (showJoinPartsModal = false)}
/>

<ReorderRunsModal
	isOpen={showReorderModal}
	series={reorderTargetSeries}
	onDone={handleRestructured}
	onClose={() => (showReorderModal = false)}
/>

<AddToSeriesModal
	isOpen={showAddToSeriesModal}
	study={selectedStudyData}
	{series}
	onDone={handleRestructured}
	onClose={() => (showAddToSeriesModal = false)}
/>

