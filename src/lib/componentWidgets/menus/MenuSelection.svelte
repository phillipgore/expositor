<script>
	/**
	 * MenuSelection Component
	 *
	 * Gathers every "Select All" command in one menu. Selecting comes before acting, so this
	 * menu sits first in the toolbar's editing cluster, just before Structure. The commands
	 * that act on these selections live elsewhere (Structure, Headings, Delete, ...).
	 *
	 * Items:
	 * - Select All Columns / Sections / Segments / Connections — put the Analyze canvas into
	 *   the matching selection mode (connections: every currently VISIBLE line). These only
	 *   make sense on the interactive Analyze view, so on the read-only Document view they are
	 *   DISABLED (not hidden), keeping the menu's shape stable across mode switches.
	 * - Select All Headings / Heading One / Two / Three — select every saved heading in the
	 *   study (or every heading of one level), lighting each heading's round select button.
	 *   The toolbar's Delete then removes them all (after confirmation), and a one-level
	 *   selection can be converted to another level from the Headings menu.
	 *
	 * Usage:
	 * ```
	 * <MenuButton menuId="MenuSelection" iconId="select" underLabel="Selection" />
	 * <MenuSelection menuId="MenuSelection" />
	 * ```
	 *
	 * Props:
	 * - menuId (string, default: 'MenuSelection') - Unique identifier for the menu
	 * - view ('analyze'|'document', default: 'analyze') - Which view this menu serves.
	 */

	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Menu from '$lib/componentElements/Menu.svelte';
	import { toolbarState, setActiveHeadings } from '$lib/stores/toolbar.js';
	import { segmentHeadingFlags } from '$lib/utils/studyHeadings.js';

	let { menuId = 'MenuSelection', view = 'analyze' } = $props();

	let isDocument = $derived(view === 'document');

	function closeMenu() {
		const menuElement = document.getElementById(menuId);
		if (menuElement) {
			menuElement.hidePopover();
		}
	}

	// ── Structure selection ──
	// Selection mode only applies to the interactive Analyze canvas, so these are disabled on
	// the Document view (in addition to the usual capability gate).
	let structureSelectDisabled = $derived(isDocument || !$toolbarState.canUseStructureItems);

	/** @param {string} eventName */
	function selectAllStructure(eventName) {
		closeMenu();
		window.dispatchEvent(new CustomEvent(eventName));
	}

	// ── Heading selection ──
	// The active view publishes the study's saved headings (studyHeadings). The items are
	// disabled while that view's headings are hidden, since the selection wouldn't be visible.
	let headingsShown = $derived(
		view === 'document' ? $toolbarState.documentHeadingsVisible : $toolbarState.headingsVisible
	);
	let studyHeadings = $derived($toolbarState.studyHeadings ?? []);
	let headingSelectDisabled = $derived(!headingsShown || $toolbarState.overviewMode);

	/** @param {'one'|'two'|'three'|null} headingType - null selects every level */
	function countHeadings(headingType) {
		return headingType ? studyHeadings.filter((h) => h.type === headingType).length : studyHeadings.length;
	}

	/** @param {'one'|'two'|'three'|null} headingType - null selects every level */
	function selectAllHeadings(headingType) {
		closeMenu();
		const matches = headingType ? studyHeadings.filter((h) => h.type === headingType) : studyHeadings;
		if (matches.length === 0) return;
		const levels = new Set(matches.map((h) => h.type));
		const sharedType = levels.size === 1 ? matches[0].type : null;
		setActiveHeadings(
			matches.map((h) => h.id),
			sharedType,
			matches.length === 1 ? segmentHeadingFlags(studyHeadings, matches[0].segmentId) : {}
		);
	}
</script>

<Menu {menuId} ariaLabel="Selection menu">
	<IconButton
		classes="menu-light justify-content-left"
		iconId="column-select-all"
		label="Select All Columns"
		role="menuitem"
		handleClick={() => selectAllStructure('select-all-columns')}
		isDisabled={structureSelectDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="section-select-all"
		label="Select All Sections"
		role="menuitem"
		handleClick={() => selectAllStructure('select-all-sections')}
		isDisabled={structureSelectDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="segment-select-all"
		label="Select All Segments"
		role="menuitem"
		handleClick={() => selectAllStructure('select-all-segments')}
		isDisabled={structureSelectDisabled}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="connection-select-all"
		label="Select All Connections"
		role="menuitem"
		handleClick={() => selectAllStructure('select-all-connections')}
		isDisabled={structureSelectDisabled}
	/>

	<DividerHorizontal />

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-select-all"
		label="Select All Headings"
		role="menuitem"
		handleClick={() => selectAllHeadings(null)}
		isDisabled={headingSelectDisabled || countHeadings(null) === 0}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-one-select-all"
		label="Select All Heading Ones"
		role="menuitem"
		handleClick={() => selectAllHeadings('one')}
		isDisabled={headingSelectDisabled || countHeadings('one') === 0}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-two-select-all"
		label="Select All Heading Twos"
		role="menuitem"
		handleClick={() => selectAllHeadings('two')}
		isDisabled={headingSelectDisabled || countHeadings('two') === 0}
	/>

	<IconButton
		classes="menu-light justify-content-left"
		iconId="heading-three-select-all"
		label="Select All Heading Threes"
		role="menuitem"
		handleClick={() => selectAllHeadings('three')}
		isDisabled={headingSelectDisabled || countHeadings('three') === 0}
	/>
</Menu>
