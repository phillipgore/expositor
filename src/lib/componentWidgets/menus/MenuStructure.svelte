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
	 * - Reorder — Move Item Up / Move Item Down (moves the selected item intact into the adjacent
	 *             container; the non-destructive counterpart to Join)
	 * - Text    — Move Text Up / Move Text Down (relocates content between segments)
	 *
	 * The four sections are separated by dividers only, with no MenuSectionLabel captions: every
	 * label already begins with its section's verb (Split…, Join…, Move Item…, Move Text…), so a
	 * caption would just repeat it.
	 *
	 * (Connect, which creates a connection between two selected structural
	 * elements, now lives in its own MenuConnect alongside quick-note placement.)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuStructure" iconId="structure-layout" underLabel="Structure" />
	 * <MenuStructure menuId="MenuStructure" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuStructure') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view this menu serves.
	 *   (The "Select All" items now live in MenuSelection.)
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

	// ── Part boundaries in a series ──
	//
	// At a part's edge the join/move target lives in the neighbouring part. Whether that seam can be
	// crossed is decided by `crossPartCommands.js`; when it can't, the command is simply disabled —
	// the menu shows no explanatory notes (a disabled item is enough).
	let seriesContext = $derived($page.data?.seriesContext ?? null);

	// The `…FirstInPassage` / `isWordIn…Segment` flags are per-passage, so on their own they also
	// fire at every internal passage seam in a multi-passage part; `activePassageIndex` (published
	// by the analyze page) lets the seam predicates tell an internal seam from the part's own edge.
	let passageCount = $derived($page.data?.passages?.length ?? 0);
	let activePassageIndex = $derived($toolbarState.activePassageIndex);

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

	// ── Move Text Up / Down across a boundary (§8, commands 4 and 5) ──
	//
	// ⚠️ Move Down uses the END edge (`boundaryAfter`). The Join Up
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

	// ── Move Selected Up / Down (§8) ──
	//
	// A different command from BOTH neighbours in this menu, and the distinction is worth stating
	// because all three use arrows:
	//
	//   Join Selected  — two items become one; something is destroyed.
	//   Move Text      — words change hands between two segments that both survive.
	//   Move Selected  — the item itself changes container, intact. Nothing is folded or deleted.
	//
	// The rule is one sentence at all three tiers: **be at the edge of your container, and have an
	// adjacent container of the same kind to land in** — a segment moves between sections, a section
	// between columns, a column between parts.
	//
	// ⚠️ These read `canMoveSelectedUp/Down` from the store, NOT `hasJoinPredecessor`/`hasJoinSuccessor`.
	// Those answer a same-tier question ("is there another segment anywhere in this study?"), which is
	// true for all but the first item — so both commands were enabled on essentially every selection,
	// including a segment mid-section with nowhere to go, and only failed after a server round trip.
	// `transferNeighbours.js` answers the container question instead, and supplies the refusal text.
	let moveSelectedGranularity = $derived(joinGranularity);

	let moveSelectedUpDisabled = $derived(
		!moveSelectedGranularity || isDocument || !$toolbarState.canMoveSelectedUp
	);
	let moveSelectedDownDisabled = $derived(
		!moveSelectedGranularity || isDocument || !$toolbarState.canMoveSelectedDown
	);

	// Move Selected states its verdict through the disabled state alone — no explanatory note. The
	// rule ("be at the edge of your container") is short enough to be learned from the greyed item.

	// ── Focus mode guards ──
	//
	// In Focus, a command whose target (the neighbour a join folds into, the container a move lands
	// in, the segment Move Text pushes words into) is HIDDEN would change something the user cannot
	// see, so it is simply disabled. The analyze page resolves these against its visible sets
	// (`focusStructureBlocks`); every flag is false outside Focus.
	let focusBlocks = $derived($toolbarState.focusStructureBlocks);



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
		isDisabled={joinUpDisabled || focusBlocks.joinUp}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="join-down"
		label="Join Selected Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('join-down'));
		}}
		isDisabled={joinDownDisabled || focusBlocks.joinDown}
	/>

	<DividerHorizontal />

	<!--
		Move Selected Up / Down — the NON-destructive pair.

		Where Join Selected folds two items into one, these move the selected item intact into the
		adjacent container: the next column, or the next part when no column is adjacent. Its anchor,
		children, commentary and identity all survive, and the mirror command puts it back.

		The destination is resolved SERVER-side (`itemTransfer.js`), because the rule depends on the
		item's position among its siblings — only the first item of a container may move up, and only
		the last may move down, since order is derived from `startingWordId` and a middle item would
		land out of reading order. The menu therefore enables the command whenever a move is
		conceivable and lets the server refuse with the specific reason.
	-->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="move-up"
		label="Move Item Up"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-selected-up'));
		}}
		isDisabled={moveSelectedUpDisabled || focusBlocks.moveUp}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="move-down"
		label="Move Item Down"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('move-selected-down'));
		}}
		isDisabled={moveSelectedDownDisabled || focusBlocks.moveDown}
	/>

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
			$toolbarState.isCaretAtSegmentStart ||
			focusBlocks.moveTextUp}
	/>
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
			$toolbarState.isCaretAtSegmentEnd ||
			focusBlocks.moveTextDown}
	/>
</Menu>


