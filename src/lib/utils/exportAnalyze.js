/**
 * Analyze View Export Utility
 *
 * Exports the visual content of the Analyze view (everything inside
 * `.analyze-content-inner`) to a downloadable file — or the printer — in one of
 * three formats:
 *
 *   - 'png'   — high-resolution raster image (2× pixel density). Best for pasting
 *               into docs/slides/messages and other Bible software.
 *   - 'pdf'   — single page sized to the study's natural dimensions. Best for
 *               printing or emailing a clean handout.
 *   - 'print' — the SAME raster capture, handed to the browser's print dialog via
 *               a hidden iframe. The image is scaled to the page width and flows
 *               across as many pages as needed (matching what users get when they
 *               print the exported PDF from a viewer). Because studies rarely
 *               match paper proportions, page breaks can land mid-segment — the
 *               print dialog's scale control is the user's escape hatch.
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
 * ## Why we show a curtain during capture
 * Clearing the zoom transform mutates the LIVE DOM, so for the capture window the
 * on-screen content visibly snaps to its natural 100% size (and the overlay
 * recomputes) and then snaps back when we restore — a jarring flash whenever the
 * study is zoomed to anything other than 100%. To hide it we drop a full-viewport
 * "curtain" overlay (`showExportCurtain`) over the page for the duration of the
 * capture. The curtain is appended to `<body>`, OUTSIDE the captured
 * `.analyze-content-inner`, so it is never part of the exported image — it only
 * masks the live flash. It fades in, shows a spinner, and is removed in a
 * `finally` so it can never get stuck if the export throws.

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
 * ## Why anchors used to drift left/up (and why they no longer do)
 * The connections overlay (`.connections-container`) is `position: absolute;
 * inset: 0` and bakes every anchor/line coordinate from its containing block's
 * top-left. Previously `.analyze-content-inner` carried the layout PADDING
 * (≈26px top/bottom, 44px left/right), so the overlay's SVG origin sat at the
 * inner's PADDING box. On screen that was consistent, but html-to-image clones
 * the SVG into a `<foreignObject>` and resolves its origin at the BORDER box,
 * dropping the padding translation — so the lines/nodes painted shifted
 * up-and-left while the reflowed HTML note cards stayed put.
 *
 * That is now fixed structurally in the markup: `.analyze-content-inner` carries
 * NO padding (so its border box == padding box == the overlay's origin) and the
 * visual spacing lives on an inner `.analyze-content-padded` child. Border box
 * and padding box coincide, so the clone and the live DOM resolve the overlay to
 * the SAME origin and exported anchors stay welded to their elements. This util
 * therefore only needs to neutralize the zoom transform and add a uniform export
 * frame; it no longer has to relocate any padding.
 *
 * @module exportAnalyze
 */




import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';


/** Pixel density for raster (PNG / PDF) capture — 2× keeps text & lines crisp. */
const PIXEL_RATIO = 2;

/**
 * Extra breathing margin (CSS px, at natural scale) added AROUND the study in
 * the export so the content (and its connection arcs, which can bow slightly
 * outside the content box) is never flush against the image edge.
 */
const EXPORT_PADDING = 24;

/**
 * Compute the final padded capture dimensions: the natural content size plus the
 * uniform EXPORT_PADDING frame on every side. Shared by buildOptions and
 * exportPdf so the html-to-image canvas and the jsPDF page can never disagree.
 *
 * The study's own visual spacing already lives INSIDE `width`/`height` (it is the
 * padding on `.analyze-content-padded`, captured as part of the natural content),
 * so this only adds the outer export frame.
 * @param {number} width - natural content width (CSS px)
 * @param {number} height - natural content height (CSS px)
 * @returns {{ width: number, height: number, frame: number }}
 */
function paddedSize(width, height) {
	const frame = EXPORT_PADDING;
	return {
		width: width + frame * 2,
		height: height + frame * 2,
		frame
	};
}



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
 * Show a full-viewport "curtain" over the page to mask the live DOM flash that
 * happens while we strip the zoom transform for capture (the on-screen study
 * momentarily snaps to natural 100% and back).
 *
 * The curtain is appended to `<body>`, OUTSIDE the captured
 * `.analyze-content-inner`, so it is NEVER part of the exported image — it only
 * hides the flash from the user.
 *
 * Returns:
 *  - `ready`: a promise that resolves once the curtain has reached FULL opacity.
 *    Callers MUST await this before mutating the live DOM, otherwise the zoom
 *    snap-flash happens while the curtain is still mid-fade and shows through.
 *  - `hide()`: fades the curtain out and removes it; always call from a `finally`
 *    so it can't get stuck.
 *
 * @returns {{ ready: Promise<void>, hide: () => void }}
 */
function showExportCurtain() {

	const curtain = document.createElement('div');
	curtain.setAttribute('data-export-curtain', '');
	curtain.setAttribute('role', 'progressbar');
	curtain.setAttribute('aria-busy', 'true');
	curtain.setAttribute('aria-label', 'Preparing export…');
	Object.assign(curtain.style, {
		position: 'fixed',
		inset: '0',
		zIndex: '2147483647',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		// FULLY OPAQUE: the whole point is to completely hide the live zoom
		// snap-to-100%-and-back flash behind it. Any translucency lets the jump
		// show through (see bug report), so use a solid surface matching the app.
		background: '#ffffff',
		// Fade in so the curtain itself doesn't flash.
		opacity: '0',
		transition: 'opacity 120ms ease',

		cursor: 'progress',
		// Swallow interaction while exporting.
		pointerEvents: 'auto'
	});

	const spinner = document.createElement('div');
	Object.assign(spinner.style, {
		width: '28px',
		height: '28px',
		border: '3px solid rgba(0, 0, 0, 0.15)',
		borderTopColor: 'rgba(0, 0, 0, 0.55)',
		borderRadius: '50%',
		animation: 'expositor-export-spin 0.7s linear infinite'
	});

	// Keyframes are injected once and shared across exports.
	const KEYFRAME_ID = 'expositor-export-curtain-style';
	if (!document.getElementById(KEYFRAME_ID)) {
		const style = document.createElement('style');
		style.id = KEYFRAME_ID;
		style.textContent =
			'@keyframes expositor-export-spin { to { transform: rotate(360deg); } }';
		document.head.appendChild(style);
	}

	curtain.appendChild(spinner);
	document.body.appendChild(curtain);

	// Force a reflow then fade in (so the opacity transition actually runs).
	void curtain.offsetWidth;
	curtain.style.opacity = '1';

	// Resolve `ready` only once the fade-in has finished and the curtain is fully
	// opaque, so callers never start the DOM-mutating capture while the jump could
	// still be seen through a partially-transparent curtain. A timeout backstops
	// the `transitionend` in case it doesn't fire (e.g. reduced-motion, bg tab).
	const ready = new Promise((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve();
		};
		curtain.addEventListener('transitionend', finish, { once: true });
		setTimeout(finish, 180);
	});

	let removed = false;

	const hide = () => {
		if (removed) return;
		removed = true;
		curtain.style.opacity = '0';
		const cleanup = () => curtain.remove();
		curtain.addEventListener('transitionend', cleanup, { once: true });
		// Safety net in case the transition never fires (e.g. tab backgrounded).
		setTimeout(cleanup, 300);
	};

	return { ready, hide };
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

	// Remove the zoom transform so layout reflects natural dimensions. The inner
	// carries NO padding (the visual spacing lives on its `.analyze-content-padded`
	// child), so border box == padding box == the overlay's coordinate origin and
	// nothing needs to be relocated to keep the export clone aligned.
	innerEl.style.transform = 'none';
	innerEl.style.transformOrigin = 'top left';

	// Natural, unscaled content size (includes the padded child's spacing).
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
 * Common html-to-image options for a full, framed, white-background capture.
 *
 * The export frame is applied as MARGIN (not padding): the connections overlay's
 * SVG origin is welded to the inner's border box, and margin lives OUTSIDE the
 * border box, so the whole subtree (content, HTML note cards AND the SVG) shifts
 * together by the frame and stays perfectly aligned. (The study's own visual
 * spacing is already baked into width/height via `.analyze-content-padded`.)
 * @param {number} width - natural content width (CSS px)
 * @param {number} height - natural content height (CSS px)
 * @param {number} [pixelRatio] - device pixel ratio for raster output
 * @returns {import('html-to-image/lib/types').Options}
 */
function buildOptions(width, height, pixelRatio) {
	const p = paddedSize(width, height);
	return {
		backgroundColor: '#ffffff',
		width: p.width,
		height: p.height,
		pixelRatio: pixelRatio ?? 1,
		// Frame the content with MARGIN (not padding — see docblock) so the
		// overlay SVG's origin stays welded to the border box and nothing shifts.
		style: {
			margin: `${p.frame}px`,
			boxSizing: 'border-box',
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


	const p = paddedSize(width, height);

	const paddedWidth = p.width;
	const paddedHeight = p.height;
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
 * Print the analyze content: run the same raster capture as PNG/PDF, then hand
 * the image to the browser's native print dialog via a hidden same-origin
 * iframe.
 *
 * ## Why an iframe (and not window.print() on the live page)
 * The Analyze page has no `@media print` stylesheet — printing the live DOM
 * would emit the zoom-transformed, scroll-clipped on-screen chrome. Instead we
 * reuse the battle-tested capture pipeline (curtain, zoom neutralization,
 * overlay recompute at scale = 1, restore) and print a minimal document that
 * contains ONLY the captured image.
 *
 * ## Page behavior
 * The image is laid out at 100% of the printable page width and allowed to
 * flow across multiple pages (via the iframe document's simple print CSS).
 * Fit-to-one-page was rejected: long studies would print unreadably small,
 * and users can still scale down in the print dialog if they want fewer pages.
 *
 * ## Cleanup
 * The iframe is removed on `afterprint`, with a generous timeout fallback for
 * browsers/situations where the event never fires (e.g. some Safari versions).
 * We deliberately do NOT remove it immediately after `print()` returns —
 * in some browsers `print()` is non-blocking and tearing the iframe down too
 * early yields a blank printout.
 *
 * @param {HTMLElement} innerEl
 * @param {string} title - study title, used for the print document title
 *        (which most browsers use as the default "Save as PDF" file name).
 * @returns {Promise<void>} resolves once the print dialog has been requested.
 */
async function printAnalyze(innerEl, title) {
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

	const iframe = document.createElement('iframe');
	iframe.setAttribute('data-export-print-frame', '');
	iframe.setAttribute('aria-hidden', 'true');
	// Keep it rendered (display:none frames won't print in some browsers) but
	// visually and interactively out of the way.
	Object.assign(iframe.style, {
		position: 'fixed',
		right: '0',
		bottom: '0',
		width: '0',
		height: '0',
		border: '0',
		visibility: 'hidden'
	});
	document.body.appendChild(iframe);

	let removed = false;
	const removeFrame = () => {
		if (removed) return;
		removed = true;
		iframe.remove();
	};

	try {
		const doc = iframe.contentDocument;
		const win = iframe.contentWindow;
		if (!doc || !win) {
			throw new Error('Print failed: could not create the print frame.');
		}

		doc.open();
		doc.write(
			'<!DOCTYPE html><html><head>' +
				`<title>${(title || 'Study').replace(/</g, '&lt;')}</title>` +
				'<style>' +
				'@page { margin: 0.5in; }' +
				'html, body { margin: 0; padding: 0; }' +
				// Scale the capture to the printable page width; height follows
				// the aspect ratio and flows across pages.
				'img { display: block; width: 100%; height: auto; }' +
				'</style>' +
				'</head><body>' +
				'<img alt="" />' +
				'</body></html>'
		);
		doc.close();

		// Wait for the image to fully decode BEFORE calling print() — otherwise
		// Safari (and occasionally others) prints a blank page.
		const img = /** @type {HTMLImageElement} */ (doc.querySelector('img'));
		await new Promise((resolve, reject) => {
			img.onload = () => resolve(undefined);
			img.onerror = () => reject(new Error('Print failed: could not load the captured image.'));
			img.src = dataUrl;
		});

		// Clean up once printing is done (or canceled). Timeout backstops
		// browsers where afterprint never fires on iframe windows.
		win.addEventListener('afterprint', removeFrame, { once: true });
		setTimeout(removeFrame, 60_000);

		win.focus();
		win.print();
	} catch (error) {
		removeFrame();
		throw error;
	}
}

/**
 * Export the analyze view's visual content in the requested format.
 *
 * @param {Object} params
 * @param {HTMLElement | null | undefined} params.element - the
 *        `.analyze-content-inner` element (contentInnerRef) to capture.
 * @param {string | undefined | null} params.title - study title, used for the
 *        downloaded file name (or the print document title for 'print').
 * @param {'png' | 'pdf' | 'print'} params.format - output format.

 * @returns {Promise<void>}
 * @throws {Error} when the element is missing or the format is unsupported.
 */
export async function exportAnalyzeView({ element, title, format }) {
	if (!element) {
		throw new Error('Export failed: analyze content element is not available.');
	}

	const fileBase = sanitizeFileName(title);

	// Drop the curtain BEFORE any capture work mutates the live DOM, and give it
	// a couple of frames to reach full opacity so the user never sees the zoom
	// snap-to-100% flash underneath it. It is removed in `finally` no matter what.
	const curtain = showExportCurtain();
	try {
		// Wait until the curtain is FULLY opaque before any capture work mutates
		// the live DOM, so the zoom snap-to-100% jump happens entirely hidden.
		await curtain.ready;

		switch (format) {

			case 'png':
				await exportPng(element, fileBase);
				break;
			case 'pdf':
				await exportPdf(element, fileBase);
				break;
			case 'print':
				await printAnalyze(element, fileBase);
				break;
			default:
				throw new Error(`Export failed: unsupported format "${format}".`);
		}
	} finally {
		curtain.hide();
	}
}

