<script>
	/**
	 * # MenuExport Component
	 *
	 * Dropdown menu for exporting the visual content of the Analyze view
	 * (everything inside `.analyze-content`) to a downloadable file.
	 *
	 * ## Formats
	 * - Image (PNG)  — high-resolution raster, great for pasting anywhere
	 * - PDF          — single page sized to the study, ideal for printing
	 *
	 * (An SVG option was removed: html-to-image's SVG output embeds the page as an
	 * `<foreignObject>`, which renders blank in dedicated vector programs.)

	 *
	 * ## Architecture
	 * The `.analyze-content` DOM lives in the analyze `+page.svelte`, a different
	 * component from the toolbar that hosts this menu. Following the existing
	 * toolbar pattern (e.g. `set-segment-height`, `insert-column`), each item
	 * dispatches a window `CustomEvent('export-analyze', { detail: { format } })`.
	 * The analyze page owns the element ref and listens for this event to run the
	 * actual capture.
	 *
	 * ## Toggle behavior
	 * Whatever is visible on screen at export time (notes, verses, connections,
	 * headings, focus mode, etc.) is captured; whatever is toggled off is excluded.
	 *
	 * ## Usage
	 * ```svelte
	 * <MenuButton menuId="MenuExport" iconId="apeture" underLabel="Export" classes="toolbar-dark" />
	 * <MenuExport menuId="MenuExport" />
	 * ```
	 *
	 * ## Props
	 * @property {string} [menuId='MenuExport'] - Unique identifier for the menu
	 *
	 * @component
	 */

	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';

	let { menuId = 'MenuExport' } = $props();

	/**
	 * Close this menu (if open), then dispatch the export request for the analyze
	 * page to handle.
	 * @param {'png' | 'pdf'} format
	 */

	function handleExport(format) {
		const menu = document.getElementById(menuId);
		if (menu && menu.matches(':popover-open')) {
			menu.hidePopover();
		}
		window.dispatchEvent(new CustomEvent('export-analyze', { detail: { format } }));
	}
</script>

<Menu {menuId} classes="dark" ariaLabel="Export options">
	<IconButton
		iconId="document-png"
		label="Export as PNG"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleExport('png')}
	/>
	<IconButton
		iconId="document-pdf"

		label="Export as PDF"
		classes="menu-light justify-content-left"
		role="menuitem"
		handleClick={() => handleExport('pdf')}
	/>
</Menu>
