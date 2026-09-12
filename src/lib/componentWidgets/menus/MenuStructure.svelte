<script>
	/**
	 * MenuStructure Component
	 * 
	 * Document structure management menu for organizing content.
	 *
	 * - Split   — Split Column / Split Section / Split Segment, ordered largest container first
	 *             (Column ⊃ Section ⊃ Segment) to match the app's nesting hierarchy and the View
	 *             menu's ordering. Splitting needs an explicit tier because a word selection alone
	 *             cannot say which level to divide.
	 * - Join    — Join Selected Up / Join Selected Down. Deliberately NOT one-per-tier: the tier is
	 *             inferred from the current selection (`joinGranularity`), which the user has already
	 *             made, so the choice these expose is the one they could not otherwise make —
	 *             direction. Replaces the former Join Column / Join Section / Join Segment trio,
	 *             which could only ever join backwards.
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
	import {
		canJoinUpAcross as resolveJoinUpAcross,
		canJoinDownAcross as resolveJoinDownAcross,
		canMoveTextUpAcross,
		canMoveTextDownAcross
	} from '$lib/utils/crossPartCommands.js';
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
	 * Everything the seam predicates need, in one object.
	 *
	 * ⚠️ `seriesContext` travels WHOLE rather than as a pre-extracted `boundaryBefore`. The predicates
	 * need `position` / `total` as well, and those are exactly what this menu used to ignore — reading
	 * `boundaryBefore === null` as permission when it also means "there is no previous part at all",
	 * which left Join/Move Up enabled on part 1's first item. See `crossPartCommands.js`.
	 */
	let edgeContext = $derived({
		seriesContext,
		passageCount,
		activePassageIndex,
		isDocument
	});

	// ── One pair of Join commands, not three (Join Up / Join Down) ──
	//
	// There used to be Join Column, Join Section and Join Segment: three buttons, each joining its own
	// tier and each only ever joining BACKWARDS. That is the wrong axis to expose. The user has already
	// said which tier they mean by *what they selected* — selecting a column and then hunting for the
	// button labelled "Column" is asking them to repeat themselves — whereas the thing they could not
	// say at all was the direction.
	//
	// So granularity is inferred from the selection and direction is the choice. Same three server
	// paths underneath; `handleJoin` in the analyze page maps the resolved granularity to its endpoint.
	//
	// Precedence is Column ⊃ Section ⊃ Segment, matching how the tiers nest and how the old buttons'
	// own guards read (Join Section was disabled while a column was active, so a column selection
	// already meant "column" everywhere). `null` means nothing structural is selected.
	let joinGranularity = $derived(
		$toolbarState.hasActiveColumn
			? 'column'
			: $toolbarState.hasActiveSection
				? 'section'
				: $toolbarState.hasActiveSegment
					? 'segment'
					: null
	);

	// ── The primary rule: is there anything to join INTO? ──
	//
	// A join folds two items together, so it is meaningless without a neighbour. `hasJoinPredecessor`
	// / `hasJoinSuccessor` answer exactly that, resolved against the whole study's structure by the
	// analyze page — NOT from the `is…FirstInPassage` flags, which ask the narrower per-passage
	// question and are wrong in both directions once a study holds several passages.
	//
	// Scope is this study (this part). A neighbouring part may still offer a cross-part join beyond
	// that edge, which is what `crossPartCommands.js` / `boundaryAfter` below add back. So: no neighbour
	// the study AND no reachable neighbour across the seam ⇒ the command is genuinely dead.
	let hasPredecessor = $derived($toolbarState.hasJoinPredecessor);
	let hasSuccessor = $derived($toolbarState.hasJoinSuccessor);

	// Whether the resolved tier's selected item sits at the START of its passage, so a Join Up would
	// have to reach across the seam. Reads the flag belonging to the tier actually in play — reading
	// all three at once is what made the old guards disagree with one another.
	let joinUpCrossesBoundary = $derived(
		joinGranularity === 'column'
			? $toolbarState.isActiveColumnFirstInPassage
			: joinGranularity === 'section'
				? $toolbarState.isActiveSectionFirstInPassage
				: joinGranularity === 'segment'
					? $toolbarState.isActiveSegmentFirstInPassage
					: false
	);

	let canJoinUpAcross = $derived(joinUpCrossesBoundary && resolveJoinUpAcross(edgeContext));

	// Join Up needs SOMETHING above it: either a predecessor inside this study, or a reachable one
	// across the leading seam. With neither, there is nothing to fold into and the item is simply the
	// first thing in the study — so the button is disabled rather than offering a no-op.
	let joinUpDisabled = $derived(
		!joinGranularity || isDocument || (!hasPredecessor && !canJoinUpAcross)
	);

	// The reason is shown only when the command is genuinely dead: an ineligible seam. Previously it
	// also appeared over a contiguous seam, where it read "not available across parts yet" — now false,
	// and §11 is explicit that a promise of a later fix must not outlive the fix.
	//
	// `!hasPredecessor` guards it too: with a predecessor inside this study the command works, and a
	// boundary note beside a working button would explain a problem the user does not have.
	let joinUpReason = $derived(
		canExplainStart && !hasPredecessor && joinUpCrossesBoundary && !canJoinUpAcross
			? seriesContext.boundaryBefore
			: null
	);

	// ── Join Down: the END edge, and therefore a DIFFERENT seam ──
	//
	// ⚠️ Join Down must never reuse the Join Up predicate. `canJoinUpAcross()` is start-edge only (it
	// consults `boundaryBefore`), and using it here would enable Join Down whenever the part's *leading*
	// seam happened to be contiguous — a different seam entirely, exactly the trap already documented
	// for Move Text Down below.
	//
	// The mirror of Join Up's rule: a successor inside this study, or a reachable one across the
	// TRAILING seam. `hasSuccessor` is what makes the last item of the study disable properly —
	// before it existed this had to guess from the part index, which left the button enabled on the
	// final item and deferred the "Nothing follows this…" to a server refusal after the click.
	//
	// Only reached when `hasSuccessor` is already false, which — because that flag spans every passage
	// of the study — means the selection really is at the END of this part. So the only question left
	// is whether the NEXT part abuts. (`canJoinDownAcross()` still carries an internal-seam clause for
	// callers that ask the genuinely per-passage question; here it can never fire.)
	//
	// ⚠️ The existence of a next part is now part of the rule. Without it, `boundaryAfter === null` also
	// matched the LAST part of the series — where it means "there is no next part" — leaving this
	// enabled on the final item of the final part with nothing below it to fold in.
	let canJoinDownAcross = $derived(!hasSuccessor && resolveJoinDownAcross(edgeContext));

	let joinDownDisabled = $derived(
		!joinGranularity || isDocument || (!hasSuccessor && !canJoinDownAcross)
	);

	// Explain the trailing edge only when it is the boundary that is actually in the way: the user is
	// at the end of this part, nothing follows inside it, and the seam beyond is ineligible. Without
	// the `!hasSuccessor` term this note would appear while a perfectly good successor sat below.
	let joinDownReason = $derived(
		canExplainEnd && joinGranularity && !hasSuccessor && seriesContext?.boundaryAfter
			? seriesContext.boundaryAfter
			: null
	);

	// ── Move Text Up / Down across a boundary (§8, commands 4 and 5) ──
	//
	// The move commands are gated on a word selection, and `isCaretAtSegmentStart/End` disables them for
	// an unrelated in-segment reason — excluded so a note only claims the boundary when the boundary is
	// genuinely what is in the way.
	//
	// ⚠️ Move Down uses the END edge, so it pairs `atPartEnd` with `boundaryAfter`. The Join Up
	// predicate is start-edge only and must NOT be reused here: doing so would enable Move Down whenever
	// the part's *leading* seam happened to be contiguous, which is a different seam entirely.
	let moveIsWordScoped = $derived(
		$toolbarState.hasWordSelection &&
			!$toolbarState.hasActiveColumn &&
			!$toolbarState.hasActiveSection
	);

	let moveUpCrossesBoundary = $derived(moveIsWordScoped && $toolbarState.isWordInFirstSegment);
	let moveDownCrossesBoundary = $derived(moveIsWordScoped && $toolbarState.isWordInLastSegment);

	// Same seam rule as the Joins, per edge — an internal passage seam is always eligible, and a part
	// edge is eligible only when a neighbouring part EXISTS and its own seam is contiguous.
	let canMoveUpAcross = $derived(moveUpCrossesBoundary && canMoveTextUpAcross(edgeContext));
	let canMoveDownAcross = $derived(moveDownCrossesBoundary && canMoveTextDownAcross(edgeContext));

	let moveUpReason = $derived(
		canExplainStart && moveUpCrossesBoundary && !canMoveUpAcross ? seriesContext.boundaryBefore : null
	);

	let moveDownReason = $derived(
		canExplainEnd && moveDownCrossesBoundary && !canMoveDownAcross ? seriesContext.boundaryAfter : null
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
	<DividerHorizontal />

	<!--
		Join Selected Up / Down replace Join Column, Join Section and Join Segment.

		The tier comes from the selection (see `joinGranularity`), so these two items cover all three
		tiers in both directions — six operations where there were three.

		"Selected" rather than the resolved tier ("Join Section Up") on purpose: the label is then
		STABLE. A label that renamed itself as the selection changed made the menu appear to offer
		different commands depending on what was highlighted, and read as a promise about the tier
		that the disabled state could contradict. "Selected" says the same true thing in every state —
		it acts on whatever you have selected — and the icons carry the direction.

		Join Down is NOT a new kind of write: the server resolves it to the equivalent Join Up on the
		next item (`joinRouting.js`), because a join removes an anchor and the earlier item of the pair
		always survives. That is also why Join Down leaves the selection intact while Join Up clears it.
	-->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="join-up"
		label="Join Selected Up"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('join-up'));
		}}
		isDisabled={joinUpDisabled}
		ariaLabel={joinUpReason ? `Join Selected Up — ${joinUpReason}` : undefined}
	/>
	{#if joinUpReason}
		<p class="boundary-reason" role="none">{joinUpReason}</p>
	{/if}

	<IconButton
		classes="menu-light justify-content-left"
		iconId="join-down"
		label="Join Selected Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('join-down'));
		}}
		isDisabled={joinDownDisabled}
		ariaLabel={joinDownReason ? `Join Selected Down — ${joinDownReason}` : undefined}
	/>
	{#if joinDownReason}
		<p class="boundary-reason" role="none">{joinDownReason}</p>
	{/if}

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-up"
		label="Move Text Up"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-up'));
		}}
		isDisabled={!$toolbarState.hasWordSelection ||
			$toolbarState.hasActiveColumn ||
			$toolbarState.hasActiveSection ||
			($toolbarState.isWordInFirstSegment && !canMoveUpAcross) ||
			$toolbarState.isCaretAtSegmentStart}
		ariaLabel={moveUpReason ? `Move Text Up — ${moveUpReason}` : undefined}
	/>
	{#if moveUpReason}
		<p class="boundary-reason" role="none">{moveUpReason}</p>
	{/if}
	<IconButton
		classes="menu-light justify-content-left"
		iconId="text-down"
		label="Move Text Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-text-down'));
		}}
		isDisabled={!$toolbarState.hasWordSelection ||
			$toolbarState.hasActiveColumn ||
			$toolbarState.hasActiveSection ||
			($toolbarState.isWordInLastSegment && !canMoveDownAcross) ||
			$toolbarState.isCaretAtSegmentEnd}
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

