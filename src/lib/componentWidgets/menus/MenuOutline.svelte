<script>
	/**
	 * MenuOutline Component
	 * 
	 * Outline menu for adding heading and note annotations to the active segment.
	 * Items add a new element to the current selection; removal is handled elsewhere
	 * (the Delete toolbar action while editing a heading or note).
	 * 
	 * Items (the heading "Select All" items live in MenuSelection; any selection made there
	 * can be promoted/demoted here):
	 * - Heading One / Two / Three — add a heading at the given level to the active segment
	 * - Promote Heading / Demote Heading — move every selected heading that can move one level
	 *   toward Heading One / Heading Three. Enabled when at least one selected heading can
	 *   move; headings already at the end of the range or blocked by an existing heading at
	 *   the target level in their segment are left alone (see planHeadingShift).
	 * - Text Quick Note — add a passage (segment) note to the active segment. Auto-reveals
	 *   passage notes if they are currently hidden. (Connection notes are added from the
	 *   Connect menu's "Connection Quick Note" item.)
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuOutline" iconId="outline" underLabel="Markup" />
	 * <MenuOutline menuId="MenuOutline" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuOutline') - Unique identifier for the menu
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
    import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { invalidate } from '$app/navigation';
	import { tick } from 'svelte';
	import { toolbarState, showPassageNotes, showDocumentPassageNotes, showHeadings, setActiveHeadings } from '$lib/stores/toolbar.js';
	import { showPopover, showPopoverError } from '$lib/stores/popover.js';
	import { planHeadingShift, segmentHeadingFlags } from '$lib/utils/studyHeadings.js';



	// `view` tells this menu which study view it is rendered for ('analyze' |
	// 'document'). Text Quick Notes work on BOTH views but each keeps its OWN
	// visibility flag (passageNotesVisible vs documentPassageNotesVisible), so the
	// auto-reveal below must target the active view's helper: showPassageNotes for
	// Analyze, showDocumentPassageNotes for Document.
	let { menuId = 'MenuOutline', view = 'analyze' } = $props();

	// Reveal the active view's passage (text) quick notes so a freshly-inserted note
	// is immediately visible even if that view's notes were toggled off.
	function revealPassageNotesForView() {
		if (view === 'document') {
			showDocumentPassageNotes();
		} else {
			showPassageNotes();
		}
	}


	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	// ── Promote / Demote selected headings ──
	// The active view publishes the study's saved headings (studyHeadings). For the current
	// selection (one or many, any mix of levels) planHeadingShift works out which headings
	// can move one level in each direction; a button is enabled when at least one can.
	let studyHeadings = $derived($toolbarState.studyHeadings ?? []);
	let selectedHeadingIds = $derived(
		$toolbarState.hasActiveHeading ? ($toolbarState.activeHeadingIds ?? []) : []
	);
	let canPromote = $derived(planHeadingShift(studyHeadings, selectedHeadingIds, 'up').movable.length > 0);
	let canDemote = $derived(planHeadingShift(studyHeadings, selectedHeadingIds, 'down').movable.length > 0);

	/** @param {'up'|'down'} direction */
	async function shiftSelectedHeadings(direction) {
		closeMenu();
		const selectedIds = [...selectedHeadingIds];
		const { movable, skipped } = planHeadingShift(studyHeadings, selectedIds, direction);
		if (movable.length === 0) return;

		// Sequential, in plan order, so a heading vacates its level before a sibling in the
		// same segment moves into it.
		let failed = 0;
		for (const { heading, targetType } of movable) {
			try {
				const response = await fetch(`/api/passages/headings/${heading.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ headingType: targetType })
				});
				if (!response.ok) failed++;
			} catch (error) {
				console.error('Convert heading network error:', error);
				failed++;
			}
		}

		await invalidate('app:studies');
		await tick();

		// Keep the same headings selected (ids survive a level change), with refreshed level
		// flags, unless the user has selected something else meanwhile.
		const stillSelected =
			$toolbarState.hasActiveHeading &&
			($toolbarState.activeHeadingIds ?? []).join() === selectedIds.join();
		if (stillSelected) {
			const current = $toolbarState.studyHeadings ?? [];
			const kept = current.filter((h) => selectedIds.includes(h.id));
			const levels = new Set(kept.map((h) => h.type));
			setActiveHeadings(
				kept.map((h) => h.id),
				levels.size === 1 ? kept[0].type : null,
				kept.length === 1 ? segmentHeadingFlags(current, kept[0].segmentId) : {}
			);
		}

		const verb = direction === 'up' ? 'promoted' : 'demoted';
		if (failed > 0) {
			showPopoverError(`${failed} heading${failed === 1 ? '' : 's'} could not be ${verb}.`);
		} else if (skipped.length > 0) {
			showPopover(
				`${skipped.length} heading${skipped.length === 1 ? ' was' : 's were'} skipped because ${skipped.length === 1 ? 'its passage already has' : 'their passages already have'} a heading at that level.`,
				5000
			);
		}
	}
</script>

<Menu {menuId} ariaLabel="Outline menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one"
		label="Heading One"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show headings if hidden, so the new heading is visible.
			showHeadings();
			// Trigger insert heading one event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-one-from-menu'));

		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingOne}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two"
		label="Heading Two"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading two event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-two-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingTwo}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three"
		label="Heading Three"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show headings if hidden, so the new heading is visible.
			showHeadings();
			// Trigger insert heading three event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-three-from-menu'));

		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingThree}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="promote-heading"
		label="Promote Heading"
		role="menuitem"
		handleClick={() => shiftSelectedHeadings('up')}
		isDisabled={!canPromote}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="demote-heading"
		label="Demote Heading"
		role="menuitem"
		handleClick={() => shiftSelectedHeadings('down')}
		isDisabled={!canDemote}
	/>

	<DividerHorizontal />

	<!-- Text Quick Note: adds a passage (segment) note to the active segment.
	     Connection notes live in the Connect menu's "Connection Quick Note" item. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Text Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show the active view's passage notes if hidden, so the new note is
			// visible. Recomputes that view's master notes toggle and persists it.
			revealPassageNotesForView();
			// Trigger insert segment note event via custom event
			window.dispatchEvent(new CustomEvent('insert-note-from-menu'));
		}}

		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasNote}
	/>

</Menu>
