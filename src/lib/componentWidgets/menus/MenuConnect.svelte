<script>
	/**
	 * MenuConnect Component
	 *
	 * Everything that operates on a connection lives here:
	 * - Connect — create a connection between two selected structural elements
	 *   (moved out of MenuStructure so that menu stays focused on split/join/move).
	 * - Add Quick Note — add a note to the selected connection (auto-reveals
	 *   connection notes if hidden). Text/segment notes live in the Headings menu.
	 * - Shape — Curved / Straight / Cornered (checked = current) for every selected
 *   connection, plus Reset Connection (clears manual bend and placed end points).
	 * - Quick-note placement — once a connection has a quick note, fine-tune where
	 *   that note card sits relative to its anchor dot. These items only apply to a
	 *   single selected connection that actually has a note (see noteSideDisabled).
	 *
	 * The note-placement groups are:
	 * - Side   — Above / Below / Right / Left (which edge of the dot the card hangs off)
	 * - Slide  — how far the dot rides ALONG the connection line (noteAnchorT)
	 * - Position — how far the card slides ALONG its anchored edge (noteOffset)
	 * - Offset — the gap the card floats OFF the line, perpendicular to it (noteLead)
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuConnect" iconId="connect" underLabel="Connect" />
	 * <MenuConnect menuId="MenuConnect" />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuConnect') - Unique identifier for the menu
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import MenuSectionLabel from '$lib/componentElements/MenuSectionLabel.svelte';
	import { toolbarState, showConnectionNotes, showDocumentConnectionNotes } from '$lib/stores/toolbar.js';
	import { showPopover } from '$lib/stores/popover.js';
	import messages from '$lib/data/messages.json';


	// `view` tells this menu which study view it is rendered for ('analyze' |
	// 'document'). Connection Quick Notes are wired for BOTH views but each keeps its
	// OWN visibility flag (connectionNotesVisible vs documentConnectionNotesVisible)
	// and its own "insert" listener, so the auto-reveal + hidden-note detection below
	// must target the active view's flag/helper.
	let { menuId = 'MenuConnect', view = 'analyze' } = $props();

	/** Shape section: one checkable item per line route. */
	const routeOptions = /** @type {const} */ ([
		{ route: 'curved', label: 'Curved' },
		{ route: 'straight', label: 'Straight' },
		{ route: 'cornered', label: 'Cornered' }
	]);

	/**
	 * Quick Note Side section. `side` is the anchor edge sent to setNoteSide; the card
	 * extends AWAY from it, so the label names where the card ends up.
	 */
	const sideOptions = /** @type {const} */ ([
		{ side: 'bottom', label: 'Above' },
		{ side: 'top', label: 'Below' },
		{ side: 'left', label: 'Right' },
		{ side: 'right', label: 'Left' }
	]);

	/** Quick Note Placement section: each opens its numeric modal. */
	const placementOptions = [
		{ event: 'set-connection-note-slide', label: 'Slide Along Line…' },
		{ event: 'set-connection-note-position', label: 'Position Along Edge…' },
		{ event: 'set-connection-note-offset', label: 'Offset from Line…' }
	];

	// The active view's connection-notes visibility flag. Reads the document* copy on
	// the Document view so auto-reveal / hidden-note logic tracks the right toggle.
	let connectionNotesVisibleForView = $derived(
		view === 'document'
			? $toolbarState.documentConnectionNotesVisible
			: $toolbarState.connectionNotesVisible
	);


	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	/**
	 * Re-attach the selected connection's quick note to a chosen side of its
	 * anchor dot. The card always extends AWAY from the chosen edge, so picking
	 * 'top' hangs the card below the dot, 'left' puts it to the right, etc.
	 * ConnectionsOverlay listens for this event (handleSetNoteSide).
	 * @param {'top'|'right'|'bottom'|'left'} side
	 */
	function setNoteSide(side) {
		closeMenu();
		window.dispatchEvent(new CustomEvent('connection-note-set-side', { detail: { side } }));
	}

	/**
	 * Set how the selected connection line(s) are drawn. ConnectionsOverlay
	 * listens for this event (handleSetRoute) and applies it to every selection.
	 * @param {'curved'|'straight'|'cornered'} route
	 */
	function setRoute(route) {
		closeMenu();
		window.dispatchEvent(new CustomEvent('connection-set-route', { detail: { route } }));
	}

	// The note placement items (Side / Slide / Position / Offset) apply to EVERY
	// selected connection that has a note — so they enable whenever one or more of
	// the selected connections carries a note. A single chosen value is applied to
	// all of them (each clamped to its own limits where relevant).
	let noteSideDisabled = $derived(
		!($toolbarState.hasActiveConnection && $toolbarState.activeConnectionNoteCount > 0)
	);

	// "Connection Quick Note" stays SINGLE-selection: a note can only be added to one
	// connection at a time. The base requirement is EXACTLY ONE connection selected
	// (disabled under multi-select or with nothing selected).
	let singleConnectionSelected = $derived(
		$toolbarState.hasActiveConnection && $toolbarState.activeConnectionIds.length === 1
	);

	// The selected connection already has a quick note, but connection quick notes are
	// currently toggled OFF so it isn't shown. In this case we keep the button ENABLED
	// (rather than silently disabling it) so a click can surface an explanatory popover
	// telling the user the note already exists and to toggle connection notes on.
	let noteExistsButHidden = $derived(
		singleConnectionSelected &&
		$toolbarState.activeConnectionHasNote &&
		!connectionNotesVisibleForView
	);


	// Enabled when a single connection is selected AND either it has no note yet (normal
	// add) OR it has a note that is currently hidden by the toggle (click → popover).
	// Hover reasons shown on disabled items (undefined when enabled → no tooltip).
	let connectionReason = $derived(
		$toolbarState.hasActiveConnection ? undefined : 'Select a connection first'
	);
	let noteReason = $derived(
		noteSideDisabled ? 'Select a connection that has a quick note' : undefined
	);

	// Defaults every connection starts with (must match ConnectionsOverlay):
	// unset lineRoute draws curved; unset noteAnchorSide anchors to the dot's TOP
	// edge, so the card hangs BELOW it. (Same-column loops default to the right edge
	// instead, but with nothing selected the general default is what to show.)
	const DEFAULT_ROUTE = 'curved';
	const DEFAULT_NOTE_SIDE = 'top';

	// Checked value: the default while the items are disabled (nothing applicable
	// selected), otherwise what the selection shares — null (no check) when mixed.
	let shownRoute = $derived(
		$toolbarState.hasActiveConnection ? $toolbarState.activeConnectionRoute : DEFAULT_ROUTE
	);
	let shownNoteSide = $derived(
		noteSideDisabled ? DEFAULT_NOTE_SIDE : $toolbarState.activeConnectionNoteSide
	);

	let quickNoteDisabled = $derived(
		!(
			singleConnectionSelected &&
			(!$toolbarState.activeConnectionHasNote || noteExistsButHidden)
		)
	);

</script>


<Menu {menuId} ariaLabel="Connect menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="connect"
		label="Add Connection"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('insert-connection'));
		}}
		isDisabled={!$toolbarState.canInsertConnection}
	/>

	<!-- Connection Quick Note: add a note to the selected connection. Auto-shows
	     connection notes if hidden, so the new note is visible. Text/segment notes
	     are added from the Headings menu "Add Quick Note" item. -->
	<IconButton
		classes="menu-light justify-content-left"
		iconId="note"
		label="Add Quick Note"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			// If the selected connection already HAS a note but connection notes are
			// toggled off, don't add a duplicate — tell the user it exists and that they
			// can toggle Connection Quick Notes on to see it. The transient popover
			// auto-dismisses on its own.
			if (noteExistsButHidden) {
				showPopover(messages.notices.connectionNoteExistsHidden);
				return;
			}
			// Auto-show the active view's connection notes if hidden, so the new note is
			// visible. Recomputes that view's master notes toggle and persists it.
			if (view === 'document') {
				showDocumentConnectionNotes();
			} else {
				showConnectionNotes();
			}
			window.dispatchEvent(new CustomEvent('connection-insert-note'));

		}}
		isDisabled={quickNoteDisabled}
	/>

	<DividerHorizontal />

	<!-- Shape: how the selected line(s) are drawn between their anchors. Applies to
	     every selected connection; the check marks the shape they all share (none
	     when the selection is mixed). -->
	<MenuSectionLabel label="Connection Shape" />
	{#each routeOptions as option (option.route)}
		{@const isCurrent = shownRoute === option.route}
		<IconButton
			classes="menu-light justify-content-left"
			iconId={isCurrent ? 'check' : 'blank'}
			label={option.label}
			role="menuitem"
			isActive={isCurrent}
			handleClick={() => setRoute(option.route)}
			isDisabled={!$toolbarState.hasActiveConnection}
			title={connectionReason}
		/>
	{/each}

	<!-- Reset Connection: undo BOTH a manual bend (the hollow shaping ring) and any
	     user-placed end points, returning the line to fully automatic layout. Enabled
	     when either kind of customisation exists on the selection. -->
	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Connection"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			if ($toolbarState.activeConnectionHasBend) {
				window.dispatchEvent(new CustomEvent('connection-reset-shape'));
			}
			if ($toolbarState.activeConnectionHasPlacedPoints) {
				window.dispatchEvent(new CustomEvent('connection-reset-points'));
			}
		}}
		isDisabled={!(
			$toolbarState.hasActiveConnection &&
			($toolbarState.activeConnectionHasBend || $toolbarState.activeConnectionHasPlacedPoints)
		)}
	/>

	<DividerHorizontal />

	<!-- Quick Note Side: which side of the anchor dot the note card attaches to. The
	     card extends away from the chosen edge, so each label names where the card
	     lands relative to the dot (Above → anchored on the dot's bottom edge, etc.). -->
	<MenuSectionLabel label="Quick Note Side" />
	{#each sideOptions as option (option.side)}
		{@const isCurrent = shownNoteSide === option.side}
		<IconButton
			classes="menu-light justify-content-left"
			iconId={isCurrent ? 'check' : 'blank'}
			label={option.label}
			role="menuitem"
			isActive={isCurrent}
			handleClick={() => setNoteSide(option.side)}
			isDisabled={noteSideDisabled}
			title={noteReason}
		/>
	{/each}

	<DividerHorizontal />

	<!-- Quick Note Placement: fine-tuning values, each opening a numeric modal.
	     - Slide    — how far the dot rides ALONG the connection line (noteAnchorT)
	     - Position — how far the card slides ALONG its anchored edge (noteOffset)
	     - Offset   — the gap the card floats OFF the line (noteLead)
	     One Reset clears all three (the side above is kept). -->
	<MenuSectionLabel label="Quick Note Placement" />
	{#each placementOptions as option (option.event)}
		<IconButton
			classes="menu-light justify-content-left"
			label={option.label}
			role="menuitem"
			handleClick={() => {
				closeMenu();
				window.dispatchEvent(new CustomEvent(option.event));
			}}
			isDisabled={noteSideDisabled}
			title={noteReason}
		/>
	{/each}

	<IconButton
		classes="menu-light justify-content-left"
		label="Reset Placement"
		role="menuitem"
		handleClick={() => {
			closeMenu();
			window.dispatchEvent(new CustomEvent('reset-connection-note-placement'));
		}}
		isDisabled={noteSideDisabled}
		title={noteReason}
	/>
</Menu>
