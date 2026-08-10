<script>
	/**
	 * MenuStructure Component
	 * 
	 * Document structure management menu for organizing content.
	 * Structural tiers are ordered largest container first (Column ⊃ Section ⊃
	 * Segment) to match the app's nesting hierarchy and the View menu's ordering.
	 * Each tier pairs a split action with its inverse join action:
	 * - Column  — Split Column / Join Column
	 * - Section — Split Section / Join Section
	 * - Segment — Split Segment / Join Segment
	 * - Text    — Move Text Up / Move Text Down (relocates content between segments)
	 *
	 * (Connect, which creates a connection between two selected structural
	 * elements, now lives in its own MenuConnect alongside quick-note placement.)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="section" underLabel="Structure" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view this menu serves.
	 *   The "Select All" items put the canvas into a selection mode, which only makes
	 *   sense in the interactive Analyze view; on the read-only Document view they are
	 *   DISABLED (not hidden), keeping the menu's shape stable across mode switches.
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState } from '$lib/stores/toolbar.js';
	import { page } from '$app/stores';

	let { menuId = 'MenuStructure', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');

	// ── Why the join/move commands are dead at a part boundary (SERIES_PLAN §11 option 1) ──
	//
	// These five commands were already inert at a part's edges, because the join target lives in
	// the neighbouring part and the `…FirstInPassage` flags stop them. §11 forbids leaving it at
	// that: "do not ship it silently." So the menu explains which edge is blocking and whether
	// phase 2 will fix it, using the reasons the server resolved from the run predicate.
	//
	// The note is rendered as visible text rather than a `title` tooltip on purpose: the buttons
	// use the NATIVE `disabled` attribute, and browsers suppress hover events on disabled
	// controls, so a tooltip there would be a reason nobody could ever read.
	let seriesContext = $derived($page.data?.seriesContext ?? null);

	// IMPORTANT — the store's flags are "first/last in PASSAGE", and a part may hold several
	// passages (the part-per-passage strategy, §5). In a multi-passage part the second passage's
	// first segment is an *internal* seam, not a part boundary, and claiming "not available across
	// parts yet" there would be a plain lie.
	//
	// A part's own leading/trailing edge is the FIRST passage's start and the LAST passage's end.

	// The `…FirstInPassage` / `isWordIn…Segment` flags are per-passage, so on their own they also
	// fire at every internal passage seam in a multi-passage part; `activePassageIndex` (published
	// by the analyze page) is what separates the two. A part is only at its leading edge when the
	// selection is in passage 0, and at its trailing edge when it is in the last passage — for a
	// single-passage part both collapse to the one passage, which is why that case needed no index.
	let passageCount = $derived($page.data?.passages?.length ?? 0);
	let activePassageIndex = $derived($toolbarState.activePassageIndex);

	// Guard on a RESOLVED index: null means the analyze page could not place the selection (no
	// selection, or content still streaming), and a note that guessed in that state could easily
	// blame a part edge at an internal seam. Silence is correct until we actually know.
	let atPartStart = $derived(
		Boolean(seriesContext) && passageCount > 0 && activePassageIndex === 0
	);
	let atPartEnd = $derived(
		Boolean(seriesContext) && passageCount > 0 && activePassageIndex === passageCount - 1
	);


	// Whether a boundary note may be shown at all, per edge. The Document view is read-only, so
	// its items are disabled for a reason that has nothing to do with series.
	let canExplainStart = $derived(atPartStart && !isDocument);
	let canExplainEnd = $derived(atPartEnd && !isDocument);


	// Resolved PER COMMAND, not per edge. A blanket "leading edge" note would appear under Join
	// Segment while a *column* is selected — where the command is disabled because there is no
	// active segment, nothing to do with a part boundary. Each note therefore requires its own
	// command to be the one actually blocked by the edge.
	//
	// The four leading-edge commands pair `canExplainStart` with `boundaryBefore` (the join target
	// sits in the PREVIOUS part); Move Text Down pairs `canExplainEnd` with `boundaryAfter`. Both
	// halves of each pair must agree about which edge is meant — mixing them (say, an end-edge
	// guard with a `boundaryBefore` string) would put the wrong neighbour in the sentence.
	/**
	 * Is a cross-boundary join available for an item that is first in its passage?
	 *
	 * One rule, three callers. True at an INTERNAL passage seam — always joinable, and never a series
	 * matter — or at a part's leading edge whose previous seam is contiguous. False for the first part
	 * of a series (nothing precedes it) and for a permanently ineligible seam.
	 *
	 * `boundaryBefore` is the discriminator already computed for this purpose: null when the preceding
	 * seam is contiguous (nothing to explain), a sentence when it is ineligible.
	 */
	function canJoinAcross(isFirstInPassage) {
		if (!isFirstInPassage || isDocument) return false;
		const atInternalSeam = passageCount > 1 && activePassageIndex !== 0;
		return atInternalSeam || (atPartStart && seriesContext?.boundaryBefore === null);
	}

	let joinColumnCrossesBoundary = $derived(
		$toolbarState.hasActiveColumn && $toolbarState.isActiveColumnFirstInPassage
	);
	let canJoinColumnAcross = $derived(canJoinAcross(joinColumnCrossesBoundary));

	let joinColumnReason = $derived(
		canExplainStart && joinColumnCrossesBoundary && !canJoinColumnAcross
			? seriesContext.boundaryBefore
			: null
	);

	// Join Section and Join Column now cross a boundary too (§8). The availability rule is identical
	// for all three granularities, so it is factored into `canJoinAcross()` rather than repeated —
	// three copies of a rule about a destructive command is three chances to disagree.
	let joinSectionCrossesBoundary = $derived(
		$toolbarState.hasActiveSection &&
			!$toolbarState.hasActiveColumn &&
			$toolbarState.isActiveSectionFirstInPassage
	);
	let canJoinSectionAcross = $derived(canJoinAcross(joinSectionCrossesBoundary));

	let joinSectionReason = $derived(
		canExplainStart && joinSectionCrossesBoundary && !canJoinSectionAcross
			? seriesContext.boundaryBefore
			: null
	);

	// ── All three Joins now work across a boundary (SERIES_PLAN §8, phase 2) ──
	//
	// Two distinct situations produce `isActive…FirstInPassage`, and they now have opposite answers:
	// an INTERNAL passage seam, or a part boundary whose previous part abuts, is joinable — the server
	// resolves the predecessor across the seam (`crossPartJoin.js`); the very first passage of a series
	// is not. `canJoinAcross()` above is the single rule; each granularity supplies its own flag.
	let joinSegmentCrossesBoundary = $derived(
		$toolbarState.hasActiveSegment && $toolbarState.isActiveSegmentFirstInPassage
	);
	let canJoinSegmentAcross = $derived(canJoinAcross(joinSegmentCrossesBoundary));

	// The reason is shown only when the command is genuinely dead: an ineligible seam. Previously it
	// also appeared over a contiguous seam, where it read "not available across parts yet" — now false,
	// and §11 is explicit that a promise of a later fix must not outlive the fix.
	let joinSegmentReason = $derived(
		canExplainStart && joinSegmentCrossesBoundary && !canJoinSegmentAcross
			? seriesContext.boundaryBefore
			: null
	);

	// The move commands are gated on a word selection, and `isCaretAtSegmentStart/End` disables
	// them for an unrelated in-segment reason — excluded so the note only claims the boundary
	// when the boundary is genuinely what is in the way.
	let moveUpReason = $derived(
		canExplainStart &&

			$toolbarState.hasWordSelection &&
			!$toolbarState.hasActiveColumn &&
			!$toolbarState.hasActiveSection &&
			$toolbarState.isWordInFirstSegment
			? seriesContext.boundaryBefore
			: null
	);

	let moveDownReason = $derived(
		canExplainEnd &&

			$toolbarState.hasWordSelection &&
			!$toolbarState.hasActiveColumn &&
			!$toolbarState.hasActiveSection &&
			$toolbarState.isWordInLastSegment
			? seriesContext.boundaryAfter
			: null
	);



	// "Select All" enters a selection mode that only applies to the interactive Analyze
	// canvas, so it's disabled on the Document view (in addition to the usual capability
	// gate). The split/join/move items below are already gated by selection state, which
	// the read-only Document view never produces, so they stay disabled there naturally.
	let selectAllDisabled = $derived(isDocument || !$toolbarState.canUseStructureItems);

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}
</script>


<Menu {menuId} ariaLabel="Document structure menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column"
		label="Select All Columns"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every column across the study (puts the app in column-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-columns'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="sections"
		label="Select All Sections"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every section across the study (puts the app in section-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-sections'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segments"
		label="Select All Segments"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every segment across the study (puts the app in segment-selection mode).
			window.dispatchEvent(new CustomEvent('select-all-segments'));
		}}
		isDisabled={selectAllDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Select All Connections"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Select every currently VISIBLE connection across the study (respects the
			// per-type visibility toggles). ConnectionsOverlay handles the selection.
			window.dispatchEvent(new CustomEvent('select-all-connections'));
		}}
		isDisabled={selectAllDisabled}
	/>


	<DividerHorizontal />


	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-split"
		label="Split Column"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split column event via custom event
			window.dispatchEvent(new CustomEvent('insert-column'));
		}}
		isDisabled={!$toolbarState.canInsertColumn || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-join"
		label="Join Column"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger join column event via custom event
			window.dispatchEvent(new CustomEvent('join-column'));
		}}
		isDisabled={!$toolbarState.hasActiveColumn ||
			($toolbarState.isActiveColumnFirstInPassage && !canJoinColumnAcross)}
		ariaLabel={joinColumnReason ? `Join Column — ${joinColumnReason}` : undefined}
	/>
	{#if joinColumnReason}
		<p class="boundary-reason" role="none">{joinColumnReason}</p>
	{/if}

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-split"

		label="Split Section"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split section event via custom event
			window.dispatchEvent(new CustomEvent('insert-section'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-join"
		label="Join Section"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger join section event via custom event
			window.dispatchEvent(new CustomEvent('join-section'));
		}}
		isDisabled={!$toolbarState.hasActiveSection ||
			$toolbarState.hasActiveColumn ||
			($toolbarState.isActiveSectionFirstInPassage && !canJoinSectionAcross)}
		ariaLabel={joinSectionReason ? `Join Section — ${joinSectionReason}` : undefined}
	/>
	{#if joinSectionReason}
		<p class="boundary-reason" role="none">{joinSectionReason}</p>
	{/if}

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-split"
		label="Split Segment"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger split segment event via custom event
			window.dispatchEvent(new CustomEvent('insert-segment'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-join"
		label="Join Segment"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger join segment event via custom event
			window.dispatchEvent(new CustomEvent('join-segment'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment ||
			($toolbarState.isActiveSegmentFirstInPassage && !canJoinSegmentAcross)}
		ariaLabel={joinSegmentReason ? `Join Segment — ${joinSegmentReason}` : undefined}
	/>
	{#if joinSegmentReason}
		<p class="boundary-reason" role="none">{joinSegmentReason}</p>
	{/if}

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-up"
		label="Move Text Up"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-up'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.isWordInFirstSegment || $toolbarState.isCaretAtSegmentStart}
		ariaLabel={moveUpReason ? `Move Text Up — ${moveUpReason}` : undefined}
	/>
	{#if moveUpReason}
		<p class="boundary-reason" role="none">{moveUpReason}</p>
	{/if}
	<IconButton
		classes="menu-light justify-content-left"
		iconId="arrow-down"
		label="Move Text Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-down'));
		}}
		isDisabled={!$toolbarState.hasWordSelection || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.isWordInLastSegment || $toolbarState.isCaretAtSegmentEnd}
		ariaLabel={moveDownReason ? `Move Text Down — ${moveDownReason}` : undefined}
	/>
	{#if moveDownReason}
		<p class="boundary-reason" role="none">{moveDownReason}</p>
	{/if}
</Menu>

<style>
	/*
	 * The boundary explanation sits under the command it explains, indented to the icon's text
	 * column so it reads as a note about that item rather than a menu entry of its own.
	 *
	 * It carries `role="none"` because a `role="menu"` container may only own menuitems, and a
	 * stray paragraph in that tree confuses menu navigation. That hides it from screen readers,
	 * so the same reason is ALSO folded into the disabled item's `aria-label` — otherwise the
	 * explanation would be sighted-only, which is the same silent failure §11 objects to, just
	 * for a different audience.
	 *
	 * `aria-live` is deliberately absent: the note appears as a consequence of selecting text,
	 * and announcing it on every selection change would talk over the user.
	 */

	.boundary-reason {
		margin: 0;
		padding: 0.2rem 0.9rem 0.4rem 2.55rem;
		max-width: 15rem;
		font-size: 0.75rem;
		line-height: 1.3;
		color: var(--gray-600, #6d6d6d);
		text-wrap: pretty;
	}
</style>

