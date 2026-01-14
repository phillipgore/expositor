<script>
	/**
	 * MenuOutline Component
	 * 
	 * Outline menu for adding heading and note elements to segments.
	 * Provides operations for inserting segment headings at different levels and notes.
	 * 
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuOutline" iconId="outline-bulleted" label="Outline" />
	 * <MenuOutline menuId="MenuOutline" />
	 * ```
	 * 
	 * Props:
	 * - menuId (string, default: 'MenuOutline') - Unique identifier for the menu
	 * 
	 * Features:
	 * - Insert heading one
	 * - Insert heading two
	 * - Insert heading three
	 * - Insert note (auto-shows notes if hidden)
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
    import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { toolbarState, setToolbarState } from '$lib/stores/toolbar.js';

	let { menuId = 'MenuOutline' } = $props();

	// Track deletion loading states
	let deletingHeadingOne = $state(false);
	let deletingHeadingTwo = $state(false);
	let deletingHeadingThree = $state(false);
	let deletingNote = $state(false);

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	/**
	 * Handle deletion success/failure events
	 */
	function handleHeadingOneSuccess() {
		deletingHeadingOne = false;
	}

	function handleHeadingOneFailure() {
		deletingHeadingOne = false;
	}

	function handleHeadingTwoSuccess() {
		deletingHeadingTwo = false;
	}

	function handleHeadingTwoFailure() {
		deletingHeadingTwo = false;
	}

	function handleHeadingThreeSuccess() {
		deletingHeadingThree = false;
	}

	function handleHeadingThreeFailure() {
		deletingHeadingThree = false;
	}

	function handleNoteSuccess() {
		deletingNote = false;
	}

	function handleNoteFailure() {
		deletingNote = false;
	}

	/**
	 * Listen for deletion result events
	 */
	$effect(() => {
		window.addEventListener('remove-heading-one-success', handleHeadingOneSuccess);
		window.addEventListener('remove-heading-one-failure', handleHeadingOneFailure);
		window.addEventListener('remove-heading-two-success', handleHeadingTwoSuccess);
		window.addEventListener('remove-heading-two-failure', handleHeadingTwoFailure);
		window.addEventListener('remove-heading-three-success', handleHeadingThreeSuccess);
		window.addEventListener('remove-heading-three-failure', handleHeadingThreeFailure);
		window.addEventListener('remove-note-success', handleNoteSuccess);
		window.addEventListener('remove-note-failure', handleNoteFailure);
		
		return () => {
			window.removeEventListener('remove-heading-one-success', handleHeadingOneSuccess);
			window.removeEventListener('remove-heading-one-failure', handleHeadingOneFailure);
			window.removeEventListener('remove-heading-two-success', handleHeadingTwoSuccess);
			window.removeEventListener('remove-heading-two-failure', handleHeadingTwoFailure);
			window.removeEventListener('remove-heading-three-success', handleHeadingThreeSuccess);
			window.removeEventListener('remove-heading-three-failure', handleHeadingThreeFailure);
			window.removeEventListener('remove-note-success', handleNoteSuccess);
			window.removeEventListener('remove-note-failure', handleNoteFailure);
		};
	});
</script>

<Menu {menuId} ariaLabel="Outline menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one"
		label="Insert Heading One"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading one event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-one-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingOne}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one-remove"
		label="Remove Heading One"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			deletingHeadingOne = true;
			// Trigger remove heading one event via custom event
			window.dispatchEvent(new CustomEvent('remove-heading-one', {
				detail: { segmentId: $toolbarState.activeSegmentId }
			}));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || !$toolbarState.activeSegmentHasHeadingOne || deletingHeadingOne}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two"
		label="Insert Heading Two"
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
		iconId="heading-two-remove"
		label="Remove Heading Two"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			deletingHeadingTwo = true;
			// Trigger remove heading two event via custom event
			window.dispatchEvent(new CustomEvent('remove-heading-two', {
				detail: { segmentId: $toolbarState.activeSegmentId }
			}));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || !$toolbarState.activeSegmentHasHeadingTwo || deletingHeadingTwo}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three"
		label="Insert Heading Three"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Trigger insert heading three event via custom event
			window.dispatchEvent(new CustomEvent('insert-heading-three-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasHeadingThree}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three-remove"
		label="Remove Heading Three"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			deletingHeadingThree = true;
			// Trigger remove heading three event via custom event
			window.dispatchEvent(new CustomEvent('remove-heading-three', {
				detail: { segmentId: $toolbarState.activeSegmentId }
			}));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || !$toolbarState.activeSegmentHasHeadingThree || deletingHeadingThree}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Insert Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// Auto-show notes if they're hidden
			if (!$toolbarState.notesVisible) {
				setToolbarState('notesVisible', true);
			}
			// Trigger insert note event via custom event
			window.dispatchEvent(new CustomEvent('insert-note-from-menu'));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || $toolbarState.activeSegmentHasNote}
	/>
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note-remove"
		label="Remove Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			deletingNote = true;
			// Trigger remove note event via custom event
			window.dispatchEvent(new CustomEvent('remove-note', {
				detail: { segmentId: $toolbarState.activeSegmentId }
			}));
		}}
		isDisabled={!$toolbarState.hasActiveSegment || $toolbarState.hasActiveColumn || $toolbarState.hasActiveSection || !$toolbarState.activeSegmentHasNote || deletingNote}
	/>
</Menu>
