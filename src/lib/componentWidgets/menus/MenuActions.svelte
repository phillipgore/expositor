<script>
	/**
	 * # MenuActions Component
	 * 
	 * Menu for performing actions on selected items in the Studies Panel.
	 * Provides keyboard-accessible alternatives to drag-and-drop operations.
	 * 
	 * ## Features
	 * - Move to... submenu with hierarchical group list
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
	async function handleCreateSeries(chaptersPerPart) {
		splitError = null;
		try {
			const response = await fetch('/api/series', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ studyId: selectedStudyData.id, chaptersPerPart })
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
		await invalidateAll();
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
		label="Move to..."
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
		iconId="part-split"
		label="Split into a Series..."
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleSplitIntoSeriesClick}
		isDisabled={!canSplitIntoSeries}
		title={splitDisabledReason}
	/>

	<!-- Split Part / Join Parts act on a part of an existing series (§8). Separate items from
	     "Split into a Series..." because they are different operations on different objects — §3's
	     rule that the verb is always qualified by its object. -->
	<IconButton
		iconId="part-split"
		label="Split Part..."
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleSplitPartClick}
		isDisabled={!canSplitPart}
		title={splitPartDisabledReason}
	/>

	<IconButton
		iconId="part-join"
		label="Join Parts..."
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handleJoinPartsClick}
		isDisabled={!canJoinParts}
		title={joinPartsDisabledReason}
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

