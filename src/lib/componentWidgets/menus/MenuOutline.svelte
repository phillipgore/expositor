<script>
	/**
	 * MenuOutline Component
	 * 
	 * Outline menu for adding heading and note annotations to the active segment.
	 * Items add a new element to the current selection; removal is handled elsewhere
	 * (the Delete toolbar action while editing a heading or note).
	 * 
	 * Items (the heading "Select All" items now live in MenuSelection; a one-level selection
	 * made there can be converted to another level here in one step):
	 * - Heading One / Two / Three — add a heading at the given level to the active segment
	 * - Convert to Heading One / Two / Three — change the level of the heading selected via its
	 *   round select button. Levels the heading's segment already has are disabled.
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
	import { planHeadingConversion } from '$lib/utils/studyHeadings.js';



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

	// ── Convert selected heading ──
	// Enabled only while a heading is selected via its round select button. A segment holds
	// at most one heading per level, so every level the selected heading's segment already
	// has (including the heading's own level) is disabled.
	let canConvertHeading = $derived($toolbarState.hasActiveHeading && !!$toolbarState.activeHeadingId);

	// The active view publishes the study's saved headings (studyHeadings); conversion uses
	// them to skip headings whose segment already has the target level.
	let studyHeadings = $derived($toolbarState.studyHeadings ?? []);

	// ── Convert several selected headings ──
	// Allowed only when they all share one level (mixed levels would collide inside a
	// segment holding several). Headings whose segment already has the target level are
	// skipped and reported.
	let isMultiHeadingSelection = $derived(
		$toolbarState.hasActiveHeading && ($toolbarState.activeHeadingIds?.length ?? 0) > 1
	);

	/** @param {'one'|'two'|'three'} headingType */
	function isConvertDisabled(headingType) {
		if (isMultiHeadingSelection) {
			return !$toolbarState.activeHeadingsType || $toolbarState.activeHeadingsType === headingType;
		}
		const segmentHas = {
			one: $toolbarState.activeHeadingSegmentHasOne,
			two: $toolbarState.activeHeadingSegmentHasTwo,
			three: $toolbarState.activeHeadingSegmentHasThree
		};
		return !canConvertHeading || segmentHas[headingType];
	}

	/** @param {'one'|'two'|'three'} headingType */
	async function convertSelectedHeadings(headingType) {
		const selectedIds = [...($toolbarState.activeHeadingIds ?? [])];
		const { convertible, skipped } = planHeadingConversion(studyHeadings, selectedIds, headingType);

		let failed = 0;
		for (const heading of convertible) {
			try {
				const response = await fetch(`/api/passages/headings/${heading.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ headingType })
				});
				if (!response.ok) failed++;
			} catch (error) {
				console.error('Convert heading network error:', error);
				failed++;
			}
		}

		if (convertible.length > 0) {
			await invalidate('app:studies');
			await tick();
		}

		// Keep the same headings selected (ids survive conversion), unless the user has
		// selected something else meanwhile.
		const stillSelected =
			$toolbarState.hasActiveHeading &&
			($toolbarState.activeHeadingIds ?? []).join() === selectedIds.join();
		if (stillSelected) {
			const current = $toolbarState.studyHeadings ?? [];
			const kept = current.filter((h) => selectedIds.includes(h.id));
			const levels = new Set(kept.map((h) => h.type));
			setActiveHeadings(kept.map((h) => h.id), levels.size === 1 ? kept[0].type : null);
		}

		if (failed > 0) {
			showPopoverError(`${failed} heading${failed === 1 ? '' : 's'} could not be converted.`);
		} else if (skipped.length > 0) {
			showPopover(
				`${skipped.length} heading${skipped.length === 1 ? ' was' : 's were'} skipped because ${skipped.length === 1 ? 'its passage already has' : 'their passages already have'} a heading at that level.`,
				5000
			);
		}
	}

	/** @param {'one'|'two'|'three'} headingType */
	function convertSelectedHeading(headingType) {
		closeMenu();
		if (isMultiHeadingSelection) {
			convertSelectedHeadings(headingType);
			return;
		}
		window.dispatchEvent(
			new CustomEvent('convert-selected-heading', {
				detail: { headingId: $toolbarState.activeHeadingId, headingType }
			})
		);
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
		iconId="heading-one-convert"
		label="Convert to Heading One"
		role="menuitem"
		handleClick={() => convertSelectedHeading('one')}
		isDisabled={isConvertDisabled('one')}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two-convert"
		label="Convert to Heading Two"
		role="menuitem"
		handleClick={() => convertSelectedHeading('two')}
		isDisabled={isConvertDisabled('two')}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three-convert"
		label="Convert to Heading Three"
		role="menuitem"
		handleClick={() => convertSelectedHeading('three')}
		isDisabled={isConvertDisabled('three')}
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
