/**
 * Analyze View Export Utility
 *
 * Exports the visual content of the Analyze view (everything inside
 * `.analyze-content-inner`) to a downloadable file in one of two formats:
 *
 *   - 'png' — high-resolution raster image (2× pixel density). Best for pasting
 *             into docs/slides/messages and other Bible software.
 *   - 'pdf' — single page sized to the study's natural dimensions. Best for
 *             printing or emailing a clean handout.
 *
 * ## Why there is no SVG option
 * We previously offered an SVG export via html-to-image's `toSvg()`. That does NOT
 * produce true vector geometry — it wraps the live HTML/CSS inside an SVG
 * `<foreignObject>`. Browsers can render that, but dedicated vector programs
 * (Illustrator, Inkscape, Affinity, etc.) do not support `<foreignObject>`, so the
 * file opened blank there. Rather than ship a misleading format, we expose only PNG
 * (raster) and PDF.

 *
 * ## Why we temporarily reset the zoom transform
 * The inner content is rendered with a CSS `scale()` transform for on-screen
 * zoom, and it is usually larger than the visible viewport (the user scrolls
 * around it). To capture the FULL study at full resolution regardless of the
 * current zoom level or scroll position, we momentarily clear the transform
 * (and pin the scroll-area wrapper to the natural size) before capturing, then
 * restore everything afterward.
 *
 * ## Toggle behavior
 * Everything that is toggled on/off in the View menu is just a CSS class on the
 * live DOM we capture, so whatever is visible at export time is included and
 * whatever is hidden is excluded — automatically, with no extra work here.
 *
 * ## Connection overlay coordination
 * The ConnectionsOverlay computes every anchor/line/note coordinate by dividing
 * client-rect distances by the current zoom `scale`. Once we strip the zoom
 * transform (above) the DOM is at natural size (effective scale = 1), but the
 * overlay still holds the old on-screen scale — so its cached paths would be
 * divided by the wrong factor and the lines, endpoint nodes and note dots would
 * scatter off their elements in the capture. To fix this we dispatch
 * `analyze-export-prepare` AFTER removing the transform (the overlay then
 * recomputes with scale = 1, matching the untransformed DOM) and
 * `analyze-export-cleanup` after the snapshot (the overlay recomputes for the
 * restored zoom). We wait a couple of animation frames between the prepare event
 * and the capture so Svelte flushes the recomputed `<path>`/`<circle>` geometry
 * into the DOM first.
 *
 * @module exportAnalyze
 */


import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';


/** Pixel density for raster (PNG / PDF) capture — 2× keeps text & lines crisp. */
const PIXEL_RATIO = 2;

/** Padding (CSS px, at natural scale) added around the study in the export. */
const EXPORT_PADDING = 24;

/**
 * Turn a study title into a safe file name (no extension).
 * Falls back to "study" when the title is empty.
 * @param {string | undefined | null} title
 * @returns {string}
 */
function sanitizeFileName(title) {
	const base = (title || 'study')
		.trim()
		.replace(/[\\/:*?"<>|]+/g, '') // strip filesystem-illegal characters
		.replace(/\s+/g, ' ')
		.slice(0, 120);
	return base.length > 0 ? base : 'study';
}

/**
 * Resolve after `count` animation frames have painted. Used to give Svelte time
 * to flush the ConnectionsOverlay's recomputed geometry into the DOM after we
 * dispatch `analyze-export-prepare` (which forces a scale = 1 recompute).
 * @param {number} [count=2]
 * @returns {Promise<void>}
 */
function nextFrames(count = 2) {
	return new Promise((resolve) => {
		let remaining = Math.max(1, count);
		const tick = () => {
			remaining -= 1;
			if (remaining <= 0) resolve();
			else requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

/**
 * Trigger a browser download for a data URL or object URL.
 * @param {string} url - href to download
 * @param {string} filename - download file name (with extension)
 */
function triggerDownload(url, filename) {

	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

/**
 * Temporarily neutralize the zoom transform on the inner element and pin the
 * scroll-area wrapper to the natural (unscaled) size so html-to-image captures
 * the FULL study at 100%. Returns a restore() to undo all changes.
 *
 * @param {HTMLElement} innerEl - the `.analyze-content-inner` element
 * @returns {{ width: number, height: number, restore: () => void }}
 */
function prepareForCapture(innerEl) {
	const wrapperEl = /** @type {HTMLElement | null} */ (innerEl.parentElement);

	// Save the inline styles we are about to change.
	const savedInner = {
		transform: innerEl.style.transform,
		transformOrigin: innerEl.style.transformOrigin
	};
	const savedWrapper = wrapperEl
		? { width: wrapperEl.style.width, height: wrapperEl.style.height }
		: null;

	// Remove the zoom transform so layout reflects natural dimensions.
	innerEl.style.transform = 'none';
	innerEl.style.transformOrigin = 'top left';

	// Natural, unscaled content size.
	const width = innerEl.scrollWidth;
	const height = innerEl.scrollHeight;

	// Pin the wrapper to the natural size so it doesn't clip the capture (its
	// inline width/height were sized to the SCALED dimensions for scrolling).
	if (wrapperEl) {
		wrapperEl.style.width = `${width}px`;
		wrapperEl.style.height = `${height}px`;
	}

	// The DOM is now at natural size (effective scale = 1). Tell the connections
	// overlay to recompute its geometry at scale = 1 so its lines/anchors/notes
	// line up with the untransformed elements (see module docblock).
	window.dispatchEvent(new CustomEvent('analyze-export-prepare'));

	const restore = () => {
		innerEl.style.transform = savedInner.transform;
		innerEl.style.transformOrigin = savedInner.transformOrigin;
		if (wrapperEl && savedWrapper) {
			wrapperEl.style.width = savedWrapper.width;
			wrapperEl.style.height = savedWrapper.height;
		}
		// Overlay returns to the live on-screen zoom.
		window.dispatchEvent(new CustomEvent('analyze-export-cleanup'));
	};

	return { width, height, restore };
}


/**
 * Common html-to-image options for a full, padded, white-background capture.
 * @param {number} width - natural content width (CSS px)
 * @param {number} height - natural content height (CSS px)
 * @param {number} [pixelRatio] - device pixel ratio for raster output
 * @returns {import('html-to-image/lib/types').Options}
 */
function buildOptions(width, height, pixelRatio) {
	const paddedWidth = width + EXPORT_PADDING * 2;
	const paddedHeight = height + EXPORT_PADDING * 2;
	return {
		backgroundColor: '#ffffff',
		width: paddedWidth,
		height: paddedHeight,
		pixelRatio: pixelRatio ?? 1,
		// Offset the content inward so the padding sits evenly around it. The
		// transform is applied to the cloned node by html-to-image.
		style: {
			padding: `${EXPORT_PADDING}px`,
			boxSizing: 'content-box',
			// Neutralize the zoom transform inside the clone as well (belt &
			// suspenders alongside prepareForCapture on the live node).
			transform: 'none'
		}
	};
}

/**
 * Export the analyze content to PNG and download it.
 * @param {HTMLElement} innerEl
 * @param {string} fileBase - file name without extension
 */
async function exportPng(innerEl, fileBase) {
	const { width, height, restore } = prepareForCapture(innerEl);
	try {
		// Let the connections overlay flush its scale = 1 recompute into the DOM
		// before we snapshot, so its lines/anchors/notes are correctly placed.
		await nextFrames(2);
		const dataUrl = await toPng(innerEl, buildOptions(width, height, PIXEL_RATIO));
		triggerDownload(dataUrl, `${fileBase}.png`);
	} finally {
		restore();
	}
}


/**
 * Export the analyze content to a single-page PDF and download it.

 * The page is sized to the study's natural (padded) dimensions so nothing is
 * cropped, and orientation is chosen to match the content's aspect ratio.
 * @param {HTMLElement} innerEl
 * @param {string} fileBase - file name without extension
 */
async function exportPdf(innerEl, fileBase) {
	const { width, height, restore } = prepareForCapture(innerEl);
	let dataUrl;
	try {
		// Let the connections overlay flush its scale = 1 recompute into the DOM
		// before we snapshot, so its lines/anchors/notes are correctly placed.
		await nextFrames(2);
		dataUrl = await toPng(innerEl, buildOptions(width, height, PIXEL_RATIO));
	} finally {
		restore();
	}


	const paddedWidth = width + EXPORT_PADDING * 2;
	const paddedHeight = height + EXPORT_PADDING * 2;
	const orientation = paddedWidth >= paddedHeight ? 'landscape' : 'portrait';

	const pdf = new jsPDF({
		orientation,
		unit: 'px',
		format: [paddedWidth, paddedHeight],
		compress: true
	});
	pdf.addImage(dataUrl, 'PNG', 0, 0, paddedWidth, paddedHeight);
	pdf.save(`${fileBase}.pdf`);
}

/**
 * Export the analyze view's visual content in the requested format.
 *
 * @param {Object} params
 * @param {HTMLElement | null | undefined} params.element - the
 *        `.analyze-content-inner` element (contentInnerRef) to capture.
 * @param {string | undefined | null} params.title - study title, used for the
 *        downloaded file name.
 * @param {'png' | 'pdf'} params.format - output format.

 * @returns {Promise<void>}
 * @throws {Error} when the element is missing or the format is unsupported.
 */
export async function exportAnalyzeView({ element, title, format }) {
	if (!element) {
		throw new Error('Export failed: analyze content element is not available.');
	}

	const fileBase = sanitizeFileName(title);

	switch (format) {
		case 'png':
			await exportPng(element, fileBase);
			break;
		case 'pdf':

			await exportPdf(element, fileBase);
			break;
		default:
			throw new Error(`Export failed: unsupported format "${format}".`);
	}
}
