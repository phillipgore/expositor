<script>
	/**
	 * # MenuExport Component ("Output" menu)
	 *
	 * Dropdown menu for producing output from a study: printing the Document view
	 * and exporting the visual Analyze content (everything inside `.analyze-content`)
	 * to a downloadable file.
	 *
	 * ## Items
	 * - Print — hands the current Document view to the browser's native print dialog.
	 *   The Document page already ships a full `@media print` stylesheet + `@page`
	 *   rule (US Letter, 1" margins) that promotes the continuous measure layer and
	 *   strips on-screen chrome, so we only need `window.print()`. Print is shown on
	 *   BOTH views but DISABLED on Analyze (only the Document view has the print
	 *   stylesheet that produces clean, paginated sheets).
	 * - Image (PNG) — high-resolution raster, great for pasting anywhere. Shown on
	 *   both views but DISABLED off Analyze.
	 * - PDF          — single page sized to the study. Shown on both views but
	 *   DISABLED off Analyze.
	 *
	 * (An SVG option was removed: html-to-image's SVG output embeds the page as an
	 * `<foreignObject>`, which renders blank in dedicated vector programs.)

	 *
	 * ## Architecture
	 * The `.analyze-content` DOM lives in the analyze `+page.svelte`, a different
	 * component from the toolbar that hosts this menu. Following the existing
	 * toolbar pattern (e.g. `set-segment-height`, `insert-column`), each PNG/PDF item
	 * dispatches a window `CustomEvent('export-analyze', { detail: { format } })`.
	 * The analyze page owns the element ref and listens for this event to run the
	 * actual capture. Print is simpler — it calls `window.print()` directly.
	 *
	 * ## View awareness
	 * - Print: rendered on both views, but DISABLED unless `view === 'document'`,
	 *   because only the Document view carries the print stylesheet.
	 * - PNG / PDF: these are Analyze-only raster captures (html-to-image → PNG, then a
	 *   single-page jsPDF). The Document view doesn't listen for `export-analyze` and
	 *   its paginated flow isn't a single screenshot, so both are rendered on both
	 *   views but DISABLED unless `view === 'analyze'`. On Document, the true PDF path
	 *   is Print → "Save as PDF".
	 *
	 * ## Toggle behavior
	 * Whatever is visible on screen at export/print time (notes, verses, connections,
	 * headings, focus mode, etc.) is captured; whatever is toggled off is excluded.
	 *
	 * ## Usage
	 * ```svelte
	 * <MenuButton menuId="MenuExport" iconId="export" underLabel="Output" classes="toolbar-dark" />
	 * <MenuExport menuId="MenuExport" view={activeModeButton} />
	 * ```
	 *
	 * ## Props
	 * @property {string} [menuId='MenuExport'] - Unique identifier for the menu
	 * @property {'analyze'|'document'} [view='analyze'] - Active study view; gates which
	 *           items are enabled (Print on Document; PNG/PDF on Analyze)
	 *
	 * @component
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	let { menuId = 'MenuExport', view = 'analyze' } = $props();

	/**
	 * Close this menu if it's currently open. Shared by every menu item so the
	 * popover dismisses before the action runs.
	 */
	function closeMenu() {
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
	}

	/**
	 * Close this menu, then hand the current (Document) view to the browser's native
	 * print dialog. The Document page's `@media print` rules do the rest.
	 */
	function handlePrint() {
		closeMenu();
		window.print();
	}

	/**
	 * Close this menu (if open), then dispatch the export request for the analyze
	 * page to handle.
	 * @param {'png' | 'pdf'} format
	 */
	function handleExport(format) {
		closeMenu();
		window.dispatchEvent(new CustomEvent('export-analyze', { detail: { format } }));
	}
</script>

<Menu {menuId} classes="dark" ariaLabel="Output options">
	<!-- Print: always shown, but only the Document view has the print stylesheet
	     that produces clean paginated sheets, so it's disabled on Analyze. -->
	<IconButton
		iconId="print"
		label="Print"
		classes="menu-light justify-content-left"
		role="menuitem"
		isDisabled={view !== 'document'}
		handleClick={handlePrint}
	/>
	<!-- PNG / PDF: Analyze-only raster captures, so they're DISABLED on Document
	     (whose true PDF path is Print → "Save as PDF"). -->
	<IconButton
		iconId="document-png"
		label="Export as PNG"
		classes="menu-light justify-content-left"
		role="menuitem"
		isDisabled={view !== 'analyze'}
		handleClick={() => handleExport('png')}
	/>
	<IconButton
		iconId="document-pdf"
		label="Export as PDF"
		classes="menu-light justify-content-left"
		role="menuitem"
		isDisabled={view !== 'analyze'}
		handleClick={() => handleExport('pdf')}
	/>
</Menu>
