<script>
	/**
	 * # MenuExport Component ("Output" menu)
	 *
	 * Dropdown menu for producing output from a study: printing the Document view
	 * and exporting the visual Analyze content (everything inside `.analyze-content`)
	 * to a downloadable file.
	 *
	 * ## Items
	 * - Image (PNG) — high-resolution raster, great for pasting anywhere. Shown on
	 *   both views but DISABLED off Analyze.
	 * - PDF          — single page sized to the study. Shown on both views but
	 *   DISABLED off Analyze.
	 * - Print (below a divider) — enabled on BOTH views, with a different path per
	 *   view:
	 *     - Document: hands the live page to the browser's native print dialog.
	 *       The Document page already ships a full `@media print` stylesheet +
	 *       `@page` rule (US Letter, 1" margins) that promotes the continuous
	 *       measure layer and strips on-screen chrome, so we only need
	 *       `window.print()`.
	 *     - Analyze: there is no print stylesheet for the zoom-transformed
	 *       Analyze DOM, so print reuses the SAME raster capture pipeline as the
	 *       PNG/PDF exports (dispatched as `format: 'print'`). The capture is
	 *       loaded into a hidden iframe scaled to page width and handed to the
	 *       print dialog, flowing across pages as needed.
	 *
	 * (An SVG option was removed: html-to-image's SVG output embeds the page as an
	 * `<foreignObject>`, which renders blank in dedicated vector programs.)

	 *
	 * ## Architecture
	 * The `.analyze-content` DOM lives in the analyze `+page.svelte`, a different
	 * component from the toolbar that hosts this menu. Following the existing
	 * toolbar pattern (e.g. `set-segment-height`, `insert-column`), each PNG/PDF item
	 * (and Print, when on Analyze) dispatches a window
	 * `CustomEvent('export-analyze', { detail: { format } })`. The analyze page owns
	 * the element ref and listens for this event to run the actual capture. Print on
	 * Document is simpler — it calls `window.print()` directly.
	 *
	 * ## View awareness
	 * - Print: enabled on both views. Document prints the live page via
	 *   `window.print()`; Analyze routes through the `export-analyze` event with
	 *   `format: 'print'` so the export utility can capture + print the study.
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
	 *           items are enabled (PNG/PDF on Analyze; Print on both) and selects
	 *           the print path (native print on Document, capture+print on Analyze)
	 *
	 * @component
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';

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
	 * Close this menu, then print the current view.
	 * - Document: hand the live page to the browser's native print dialog — its
	 *   `@media print` rules do the rest.
	 * - Analyze: dispatch `export-analyze` with `format: 'print'` so the analyze
	 *   page runs the shared capture pipeline and prints the resulting image
	 *   (see exportAnalyze.js).
	 */
	function handlePrint() {
		closeMenu();
		if (view === 'analyze') {
			window.dispatchEvent(new CustomEvent('export-analyze', { detail: { format: 'print' } }));
		} else {
			window.print();
		}
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

	<DividerHorizontal />

	<!-- Print: enabled on both views. Document prints the live page (it has the
	     print stylesheet); Analyze prints the shared raster capture via the
	     export pipeline (format: 'print'). -->
	<IconButton
		iconId="print"
		label="Print"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={handlePrint}
	/>
</Menu>
