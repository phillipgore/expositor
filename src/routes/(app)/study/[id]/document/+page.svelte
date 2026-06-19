<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount, tick } from 'svelte';

	import Spinner from '$lib/componentElements/Spinner.svelte';
	import GlossaryBadge from '$lib/componentElements/GlossaryBadge.svelte';

	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { setStudyContentLoading, studyContentLoading } from '$lib/stores/loading.js';
	import { buildVerseSectionMap, extractSegmentText } from '$lib/utils/passageText.js';
	import { formatScriptureReference } from '$lib/utils/bibleData.js';


	let { data: rawData } = $props();

	// The heavy passage text/structure is streamed from the server (see
	// +layout.server.js). Resolve it into local state and expose a derived `data`
	// that merges it back in, so all existing `data.passagesWithText` references
	// keep working unchanged — they simply read `undefined` until the stream lands.
	let streamedContent = $state(/** @type {{ passagesWithText: any[], connections: any[] } | null} */ (null));

	// Non-reactive guard tracking which study's content is currently mounted, so we can
	// tell a REAL study switch from a same-study re-invalidation (mirrors the analyze page).
	let loadedStudyId = null;

	$effect(() => {
		// Re-runs whenever a navigation hands us a new streamed promise.
		const promise = rawData.streamed?.content;
		const studyId = rawData.study?.id;
		const isStudySwitch = studyId !== loadedStudyId;

		if (isStudySwitch) {
			// Real study switch: clear the previous study's resolved content immediately
			// and flag the global loader so the single navigation Spinner stays up
			// continuously until the new stream lands.
			streamedContent = null;
			setStudyContentLoading(true);
			loadedStudyId = studyId;
		} else {
			// Same-study (re)invalidation: content is already loaded, so make sure the
			// global loading curtain is DOWN. This self-heals the case where a redundant
			// same-URL navigation (e.g. re-selecting the already-active study in the
			// Studies panel) armed the curtain via +layout.svelte but produced no study
			// switch to clear it — without this the spinner would hang forever.
			setStudyContentLoading(false);
		}

		let cancelled = false;
		promise?.then((c) => {
			if (!cancelled) {
				streamedContent = c;
				if (isStudySwitch) setStudyContentLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	});

	// Clear the global loading flag if this page is torn down mid-stream (e.g. the
	// user navigates away before the content resolves), so the overlay never sticks.
	onMount(() => () => setStudyContentLoading(false));

	let data = $derived({
		...rawData,
		passagesWithText: streamedContent?.passagesWithText,
		connections: streamedContent?.connections
	});

	// Study-wide map of every column/section/segment id → its scripture reference.
	// Connections are study-wide and may link items across passages, so resolving a
	// connection's endpoints to references needs a map spanning ALL passages (built
	// here once), not the per-passage refs computed inside buildDocumentBlocks.
	let itemRefMap = $derived(buildItemRefMap(data.passagesWithText, data.passages));

	// Connections grouped by their FROM endpoint's item id. Each connection appears
	// exactly once — under the item it points FROM — so its note/commentary aren't
	// duplicated at both ends.
	let connectionsByFromId = $derived(buildConnectionsByFromId(data.connections, itemRefMap));


	// Invalidate studies list when study is accessed
	onMount(() => {
		if (data.invalidateStudies) {
			invalidate('app:studies');
		}
	});

	// Get translation abbreviation
	let translationAbbr = $derived.by(() => {
		const metadata = getTranslationMetadata(data.study.translation || 'esv');
		return metadata?.abbreviation || data.study.translation?.toUpperCase() || 'ESV';
	});

	/**
	 * Flatten a passage's structure (columns → sections → segments) into a single
	 * ordered list of segments. The loader already returns segments in
	 * startingWordId order, so a straight depth-first walk yields reading order.
	 * @param {Object} passageText - A passagesWithText entry
	 * @returns {Array<{ id: string, startingWordId: string, headingOne: string|null, headingTwo: string|null, headingThree: string|null }>}
	 */
	function flattenSegments(passageText) {
		const cols = passageText?.structure?.columns;
		if (!cols?.length) return [];
		const out = [];
		for (const column of cols) {
			for (const section of column.sections ?? []) {
				for (const segment of section.segments ?? []) {
					out.push(segment);
				}
			}
		}
		return out;
	}

	/**
	 * Construct the EXCLUSIVE end word ID for a passage — the synthetic word ID one
	 * past the passage's last verse. Used as the end boundary of the LAST block's
	 * reference at each level (column/section/segment), where there's no next sibling
	 * to borrow a start word from. `formatScriptureReference` subtracts 1 from this
	 * exclusive boundary to recover the true last verse. Mirrors the Analyze view's
	 * helper of the same name. Returns null if the boundary can't be derived.
	 * @param {Array<{ startingWordId?: string }>} segments - Flat, ordered segments
	 * @param {{ toChapter?: number, toVerse?: number }} [passageData] - Passage DB record
	 * @returns {string|null}
	 */
	function getPassageEndWordId(segments, passageData) {
		if (!segments.length || !passageData) return null;
		const firstWordId = segments[0].startingWordId;
		if (!firstWordId) return null;
		const parts = firstWordId.split('-');
		if (parts.length < 4) return null;
		const bookAbbr = parts[0];
		const chapterPadLen = parts[1].length;
		const versePadLen = parts[2].length;
		const chapStr = String(passageData.toChapter).padStart(chapterPadLen, '0');
		// toVerse + 1 is the exclusive boundary; formatScriptureReference subtracts 1.
		const verseStr = String((passageData.toVerse ?? 0) + 1).padStart(versePadLen, '0');
		return `${bookAbbr}-${chapStr}-${verseStr}-001`;
	}

	/**
	 * Resolve the item id at one end of a connection. Each end is independently typed
	 * ('segment' | 'section' | 'column'), with the id stored in the matching column.
	 * @param {Object} conn - segment_connection row
	 * @param {'from'|'to'} end
	 * @returns {string|null}
	 */
	function connEndpointId(conn, end) {
		const type = end === 'from' ? conn.fromType : conn.toType;
		if (type === 'segment') return end === 'from' ? conn.fromSegmentId : conn.toSegmentId;
		if (type === 'section') return end === 'from' ? conn.fromSectionId : conn.toSectionId;
		if (type === 'column') return end === 'from' ? conn.fromColumnId : conn.toColumnId;
		return null;
	}

	/**
	 * Build a study-wide map of column/section/segment id → reference string, spanning
	 * every passage. Reuses the same first-word→next-sibling-first-word (exclusive)
	 * boundary logic as buildDocumentBlocks, so a connection endpoint resolves to the
	 * same reference shown on that item elsewhere in the document.
	 * @param {Array<Object>|undefined} passagesWithText
	 * @param {Array<Object>|undefined} passages
	 * @returns {Object<string, string|null>}
	 */
	function buildItemRefMap(passagesWithText, passages) {
		/** @type {Object<string, string|null>} */
		const map = {};
		for (const passageText of passagesWithText ?? []) {
			const cols = passageText?.structure?.columns;
			if (!cols?.length) continue;
			const passageData = (passages ?? []).find((p) => p.id === passageText.structure?.passageId);
			const segments = flattenSegments(passageText);
			if (!segments.length) continue;

			const passageEndWordId = getPassageEndWordId(segments, passageData);
			const refOf = (startWordId, endWordId) =>
				startWordId
					? formatScriptureReference(startWordId, endWordId ?? passageEndWordId, '', '') || null
					: null;

			// Segments
			segments.forEach((seg, i) => {
				map[seg.id] = refOf(seg.startingWordId, segments[i + 1]?.startingWordId ?? passageEndWordId);
			});

			// Columns
			const columnFirstWord = cols.map(
				(c) => (c.sections ?? []).flatMap((sec) => sec.segments ?? [])[0]?.startingWordId ?? null
			);
			cols.forEach((col, ci) => {
				map[col.id] = refOf(columnFirstWord[ci], columnFirstWord[ci + 1] ?? null);
			});

			// Sections (ordered across the passage)
			const orderedSections = [];
			for (const column of cols) {
				for (const section of column.sections ?? []) orderedSections.push(section);
			}
			const sectionFirstWord = orderedSections.map(
				(sec) => (sec.segments ?? [])[0]?.startingWordId ?? null
			);
			orderedSections.forEach((sec, si) => {
				map[sec.id] = refOf(sectionFirstWord[si], sectionFirstWord[si + 1] ?? null);
			});
		}
		return map;
	}

	/**
	 * Group connections by their FROM endpoint's item id, resolving each end to a
	 * reference and carrying the connection's quick note + commentary. A connection is
	 * listed once (under its FROM item) so its content isn't duplicated at both ends.
	 * @param {Array<Object>|undefined} connections
	 * @param {Object<string, string|null>} refMap
	 * @returns {Object<string, Array<{ key: string, fromRef: string|null, toRef: string|null, note: string|null, commentary: string|null }>>}
	 */
	function buildConnectionsByFromId(connections, refMap) {
		/** @type {Object<string, Array<Object>>} */
		const byId = {};
		for (const conn of connections ?? []) {
			const fromId = connEndpointId(conn, 'from');
			const toId = connEndpointId(conn, 'to');
			if (!fromId) continue;
			const entry = {
				key: conn.id,
				fromRef: refMap[fromId] ?? null,
				toRef: toId ? refMap[toId] ?? null : null,
				note: conn.note ?? null,
				commentary: conn.commentary ?? null
			};
			(byId[fromId] ||= []).push(entry);
		}
		return byId;
	}

	/**
	 * Build the read-only document rendering for one passage: an ordered list of
	 * blocks. Two kinds are emitted, interleaved in reading order:
	 *
	 *  - `segment` blocks carry any authored headings (h3/h4/h5 for Heading
	 *    One/Two/Three) plus that segment's sliced HTML text, mirroring the Analyze
	 *    view but without the column/section grid, color bands, scripture-refs, or
	 *    editing affordances.
	 *  - `aside` blocks carry SEGMENT-level commentary as editorial callouts,
	 *    trailing the segment text they comment on. (Columns and sections no longer
	 *    carry their own commentary — it was removed in favor of heading commentary
	 *    — so asides are now only ever emitted at segment scope.)
	 *
	 * Returns null when the passage has no usable structure, signalling the template to
	 * fall back to rendering the whole passage HTML so text is never lost.
	 * @param {Object} passageText
	 * @returns {Array<Object> | null}
	 */
	function buildDocumentBlocks(passageText, passageData, connectionsByFromId = {}) {
		const cols = passageText?.structure?.columns;
		if (!cols?.length || !passageText.text) return null;

		// Flatten segments first (reading order) so each segment's text slice can be
		// computed against the NEXT segment's first word across the whole passage,
		// independent of where the column/section asides are injected below.
		const segments = flattenSegments(passageText);
		if (segments.length === 0) return null;

		// Verse-suffix bookkeeping must span the whole passage so a verse split across
		// multiple segments numbers consistently (16a, 16b, …) — same as Analyze.
		const verseSectionMap = buildVerseSectionMap(segments);
		/** @type {Object<string, number>} */
		const verseOccurrences = {};

		// Precompute each segment's sliced HTML, keyed by id. A segment's text runs up
		// to the NEXT segment's first word (exclusive), or to the end of the passage
		// for the final segment.
		/** @type {Object<string, string>} */
		const htmlBySegmentId = {};
		segments.forEach((segment, i) => {
			const endWordId = segments[i + 1]?.startingWordId ?? null;
			htmlBySegmentId[segment.id] = extractSegmentText(
				passageText.text,
				segment.startingWordId,
				endWordId,
				0,
				verseSectionMap,
				verseOccurrences
			);
		});

		// Passage-end boundary: the exclusive word ID one past the passage's last
		// verse. Used as the end of the LAST block's reference at each level, where
		// there's no next sibling to borrow a start word from.
		const passageEndWordId = getPassageEndWordId(segments, passageData);

		// Map each segment id → the next segment's start word in overall reading
		// order (exclusive end boundary for that segment's reference), or the passage
		// end for the final segment. Mirrors the htmlBySegmentId slicing boundaries.
		/** @type {Object<string, string|null>} */
		const nextStartById = {};
		segments.forEach((seg, i) => {
			nextStartById[seg.id] = segments[i + 1]?.startingWordId ?? passageEndWordId;
		});

		// Per-column and per-section start words (reading order) so each block's
		// reference can run from its first word to the NEXT sibling's first word
		// (exclusive), or the passage end for the last one.
		const columnFirstWord = cols.map(
			(c) => (c.sections ?? []).flatMap((sec) => sec.segments ?? [])[0]?.startingWordId ?? null
		);
		const orderedSections = [];
		for (const column of cols) {
			for (const section of column.sections ?? []) orderedSections.push(section);
		}
		const sectionFirstWord = orderedSections.map(
			(sec) => (sec.segments ?? [])[0]?.startingWordId ?? null
		);

		// Verse-granularity reference (no a/b/c subdivision suffixes) — enough to
		// navigate the document by passage location.
		const refOf = (startWordId, endWordId) =>
			startWordId
				? formatScriptureReference(startWordId, endWordId ?? passageEndWordId, '', '') || null
				: null;

		// Walk the structure. Emit a reference marker where a new column or section
		// begins, the level's commentary as an editorial aside (if any), and each
		// segment's text with its own reference. Every column, section, and segment
		// carries a reference so the whole document is navigable by location.
		const blocks = [];
		let sectionCursor = 0;
		for (let ci = 0; ci < cols.length; ci++) {
			const column = cols[ci];
			const columnRef = refOf(columnFirstWord[ci], columnFirstWord[ci + 1] ?? null);

			blocks.push({
				type: 'column-start',
				key: `colstart-${column.id}`,
				ref: columnRef
			});

			// Columns no longer carry their own commentary (it was removed in favor
			// of heading commentary), so no column-level aside is emitted here.

			// Column connections (those pointing FROM this column) — grouped at the
			// column's start with its reference.
			const columnConns = connectionsByFromId[column.id] ?? [];
			if (columnConns.length) {
				blocks.push({
					type: 'connections',
					scope: 'column',
					key: `col-conn-${column.id}`,
					connections: columnConns
				});
			}

			for (const section of column.sections ?? []) {
				const sIdx = sectionCursor++;
				const sectionRef = refOf(sectionFirstWord[sIdx], sectionFirstWord[sIdx + 1] ?? null);

				blocks.push({
					type: 'section-start',
					key: `secstart-${section.id}`,
					ref: sectionRef
				});

				// Sections no longer carry their own commentary (it was removed in
				// favor of heading commentary), so no section-level aside is emitted.

				// Section connections (those pointing FROM this section).
				const sectionConns = connectionsByFromId[section.id] ?? [];
				if (sectionConns.length) {
					blocks.push({
						type: 'connections',
						scope: 'section',
						key: `sec-conn-${section.id}`,
						connections: sectionConns
					});
				}

				for (const segment of section.segments ?? []) {
					const segmentRef = refOf(segment.startingWordId, nextStartById[segment.id]);

					blocks.push({
						type: 'segment',
						key: segment.id,
						id: segment.id,
						headingOne: segment.headingOne,
						headingTwo: segment.headingTwo,
						headingThree: segment.headingThree,
						ref: segmentRef,
						// Quick note (plain text) authored on the segment — carried through so the
						// document can render it directly beneath the segment's text.
						note: segment.note ?? null,
						html: htmlBySegmentId[segment.id] ?? ''
					});

					// Segment commentary is the NARROWEST scope — it comments on this one
					// segment's text — so it TRAILS the segment as a note (unlike the broad
					// column/section commentary, which is anchored ahead of the content it
					// introduces). Same editorial-aside treatment so it's never mistaken for
					// body text or a heading.
					if (segment.commentary) {
						blocks.push({
							type: 'aside',
							scope: 'segment',
							key: `seg-com-${segment.id}`,
							ref: segmentRef,
							html: segment.commentary
						});
					}

					// Segment connections (those pointing FROM this segment) — last in the
					// segment block, after its text, quick note, and commentary.
					const segmentConns = connectionsByFromId[segment.id] ?? [];
					if (segmentConns.length) {
						blocks.push({
							type: 'connections',
							scope: 'segment',
							key: `seg-conn-${segment.id}`,
							connections: segmentConns
						});
					}
				}
			}
		}
		return blocks;
	}

	/**
	 * Decode the handful of HTML entities that ProseMirror's attribute
	 * serialization produces when a footnote's plain-text content is stored in
	 * the `data-footnote-content` attribute. Runs on both the server (no DOM) and
	 * the client, so it can't lean on `DOMParser`/`textContent`. `&amp;` is decoded
	 * LAST so an already-escaped sequence like `&amp;lt;` round-trips correctly.
	 * @param {string} str
	 * @returns {string}
	 */
	function decodeHtmlEntities(str) {
		if (!str) return '';
		return str
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&#x27;/g, "'")
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&');
	}

	/**
	 * Prepare a commentary HTML string for read-only display by surfacing its
	 * footnotes. Commentary authored in the CommentaryEditor stores each footnote
	 * inline as a `<span class="footnote-marker" data-footnote-id data-footnote-content>`
	 * whose visible content is just a superscript number — the actual note text lives
	 * in the `data-footnote-content` attribute and is rendered as a separate list at
	 * the bottom of the editor. The document page previously emitted only the
	 * superscript marker (via {@html}), so the number appeared with no matching note.
	 *
	 * This walks the markers IN DOCUMENT ORDER and, PER COMMENTARY BLOCK:
	 *  - renumbers each marker's superscript sequentially (1, 2, 3…), matching how the
	 *    editor numbers footnotes within a single commentary so the reader sees the
	 *    same numbers the author entered, and
	 *  - collects each footnote's decoded text so the template can render a footnote
	 *    list directly beneath that commentary.
	 *
	 * Regex-based (not DOM-based) so it works during server-side rendering too.
	 * @param {string|null|undefined} html
	 * @returns {{ html: string, footnotes: Array<{ number: number, content: string }> }}
	 */
	function renderCommentaryWithFootnotes(html) {
		if (!html || typeof html !== 'string') return { html: html ?? '', footnotes: [] };

		/** @type {Array<{ number: number, content: string }>} */
		const footnotes = [];
		let counter = 0;

		// Match a footnote marker span. Markers always carry `data-footnote-id`
		// (parseHTML also accepts a bare `span[data-footnote-id]`), so that — rather
		// than the class — is the reliable signal. Attribute values are HTML-escaped,
		// so `[^>]*` for the opening tag never swallows a real `>`.
		const markerRe = /<span\b([^>]*\bdata-footnote-id=[^>]*)>[\s\S]*?<\/span>/gi;

		const newHtml = html.replace(markerRe, (match, attrs) => {
			counter += 1;
			const number = counter;
			// Pull the note text out of the data-footnote-content attribute.
			const contentMatch = attrs.match(/data-footnote-content=("|')([\s\S]*?)\1/i);
			const rawContent = contentMatch ? contentMatch[2] : '';
			footnotes.push({ number, content: decodeHtmlEntities(rawContent) });
			// Rebuild the marker, replacing whatever superscript it had with the
			// sequential number so the in-text marker matches the list below.
			return `<span${attrs}><sup>${number}</sup></span>`;
		});

		return { html: newHtml, footnotes };
	}

	/**
	 * Extract the unique glossary term ids referenced inline in a commentary HTML
	 * string, in first-appearance order. Mirrors the Analyze view's CommentaryEditor,
	 * whose bottom "tags" strip is a read-only reflection of the glossary terms used
	 * inline in the prose. Each inline term is stored as a
	 * `<span class="glossary-term" data-term-id="…">` (see tiptapGlossaryTerm.js), so
	 * we pull the `data-term-id` values out of the stored HTML. Regex-based (not DOM-
	 * based) so it works during server-side rendering too.
	 * @param {string|null|undefined} html
	 * @returns {string[]}
	 */
	function extractGlossaryTermIds(html) {
		if (!html || typeof html !== 'string') return [];
		const ids = [];
		const seen = new Set();
		const re = /data-term-id=("|')([\s\S]*?)\1/gi;
		let match;
		while ((match = re.exec(html)) !== null) {
			const id = decodeHtmlEntities(match[2]);
			if (id && !seen.has(id)) {
				seen.add(id);
				ids.push(id);
			}
		}
		return ids;
	}

	/**
	 * Format a passage reference for display
	 * @param {Object} passage
	 * @returns {string}
	 */
	function formatPassageReference(passage) {
		const sameChapter = passage.fromChapter === passage.toChapter;
		const singleVerse = passage.fromVerse === passage.toVerse;
		
		if (sameChapter && singleVerse) {
			// Single verse: "John 3:16"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}`;
		} else if (sameChapter) {
			// Multiple verses same chapter: "John 3:16-17"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toVerse}`;
		} else {
			// Multiple chapters: "Genesis 1:1-2:3"
			return `${passage.bookName} ${passage.fromChapter}:${passage.fromVerse}-${passage.toChapter}:${passage.toVerse}`;
		}
	}

	/* ============================================================
	   SCREEN PAGINATION — distribute content across 8.5"×11" sheets
	   ------------------------------------------------------------
	   The document is conceptually a flat, ordered stream of "flow items" (the
	   study header, each passage's reference + structural blocks, and the
	   copyright notice). On screen we want these laid out on a series of discrete
	   Letter-sized pages (Google Docs style), not one tall sheet.

	   CSS alone can't fragment content into on-screen pages — only the print
	   paginator does that. So we render every flow item once into an off-screen
	   "measure layer" that is exactly as wide as a page's content area (page width
	   − 2× margin), read each item's laid-out top/bottom, then pack whole items
	   into pages: an item starts a new page when adding it would overflow the
	   available content height (page height − 2× margin). Items are never split
	   mid-block (v1) — a block taller than a full page simply occupies its own
	   page. The same off-screen measure layer doubles as the PRINT source: in
	   print we reveal it as one continuous flow and let the browser's native
	   paginator produce the real sheets (see the @media print rules).
	   ============================================================ */

	/**
	 * Flatten the streamed study content into a single ordered list of renderable
	 * "flow items" — the atomic units the paginator packs onto pages. Each item is
	 * `{ id, kind, ... }`; `kind` selects which snippet renders it.
	 * @returns {Array<Object>}
	 */
	function buildFlowItems(passagesWithText, passages, connectionsByFromIdMap) {
		/** @type {Array<Object>} */
		const items = [{ id: 'header', kind: 'header' }];

		for (const passageText of passagesWithText ?? []) {
			if (passageText.error) {
				items.push({
					id: `err-${passageText.reference}`,
					kind: 'error',
					reference: passageText.reference,
					error: passageText.error
				});
				continue;
			}
			if (!passageText.text) continue;

			const passageId = passageText.structure?.passageId ?? passageText.reference;
			const passageData = (passages ?? []).find((p) => p.id === passageText.structure?.passageId);

			items.push({
				id: `pref-${passageId}`,
				kind: 'passage-ref',
				reference: passageText.reference
			});

			const blocks = buildDocumentBlocks(passageText, passageData, connectionsByFromIdMap);
			if (blocks) {
				for (const block of blocks) {
					items.push({ id: `blk-${passageId}-${block.key}`, kind: 'block', block });
				}
			} else {
				items.push({ id: `fb-${passageId}`, kind: 'fallback-text', html: passageText.text });
			}
		}

		items.push({ id: 'copyright', kind: 'copyright' });
		return items;
	}

	let flowItems = $derived(
		streamedContent && data.passagesWithText && data.passagesWithText.length > 0
			? buildFlowItems(data.passagesWithText, data.passages, connectionsByFromId)
			: []
	);

	// Pages are arrays of flow-item indices. Computed by measuring the off-screen
	// layer; until that runs (or on the server) we fall back to a single page
	// containing every item, so content is never hidden waiting on measurement.
	let pages = $state(/** @type {number[][]} */ ([]));
	let measureEl = $state(/** @type {HTMLElement | null} */ (null));

	let displayPages = $derived(
		pages.length
			? pages
			: flowItems.length
				? [flowItems.map((_, i) => i)]
				: []
	);

	/**
	 * Measure the off-screen layer and pack whole flow items into pages. Walks the
	 * items in order, accumulating into the current page until the next item's
	 * bottom would exceed the page's content height, then starts a new page. Uses
	 * laid-out geometry (getBoundingClientRect) so it reflects real wrapping and
	 * collapsed margins. The first item of every page has its leading margin zeroed
	 * by CSS, matching the measure layer where the very first top margin collapses
	 * away — keeping the estimate and the rendered pages in agreement.
	 */
	function paginate() {
		if (!measureEl || !flowItems.length) {
			pages = [];
			return;
		}

		const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
		// Page content height = page height (105.6rem) − top+bottom margins (2 × 9.6rem).
		const pageContentHeight = 86.4 * rootFont;

		const nodes = /** @type {HTMLElement[]} */ (
			Array.from(measureEl.querySelectorAll('[data-flow-index]'))
		);
		if (!nodes.length) {
			pages = [];
			return;
		}

		const containerTop = measureEl.getBoundingClientRect().top;
		/** @type {number[][]} */
		const newPages = [];
		/** @type {number[]} */
		let current = [];
		let pageStartTop = null;

		for (let i = 0; i < nodes.length; i++) {
			const rect = nodes[i].getBoundingClientRect();
			const top = rect.top - containerTop;
			const bottom = rect.bottom - containerTop;

			if (pageStartTop === null) pageStartTop = top;

			if (current.length && bottom - pageStartTop > pageContentHeight) {
				newPages.push(current);
				current = [i];
				pageStartTop = top;
			} else {
				current.push(i);
			}
		}
		if (current.length) newPages.push(current);

		// Only assign if the layout actually changed, to avoid effect feedback loops.
		const changed =
			newPages.length !== pages.length ||
			newPages.some((p, i) => p.length !== pages[i]?.length || p.some((v, j) => v !== pages[i][j]));
		if (changed) pages = newPages;
	}

	// Re-paginate whenever the flow items change (content resolves / study switch)
	// or the window resizes. Runs after the measure layer has rendered (tick), and
	// only in the browser.
	$effect(() => {
		// Touch dependencies so the effect re-runs when content changes.
		flowItems;
		measureEl;
		if (typeof window === 'undefined') return;

		let cancelled = false;
		tick().then(() => {
			if (!cancelled) paginate();
		});
		return () => {
			cancelled = true;
		};
	});

	onMount(() => {
		if (typeof window === 'undefined') return;
		let raf = 0;
		const onResize = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => paginate());
		};
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', onResize);
		};
	});
</script>


<!-- ============================================================
     SNIPPETS — one per renderable flow-item kind. Each is rendered both into
     the off-screen measure layer (for pagination) and into the visible pages,
     so the two stay byte-for-byte identical and measurement matches layout.
     ============================================================ -->

{#snippet headerContent()}
	<div class="study-header">
		<h1 class="study-title">{data.study.title}</h1>
		{#if data.study.subtitle}
			<p class="study-subtitle">{data.study.subtitle}</p>
		{/if}
		{#if data.passages && data.passages.length > 0}
			<p class="study-references">
				{#each data.passages as passage, i}
					{formatPassageReference(passage)}{#if i < data.passages.length - 1},&nbsp;{/if}
				{/each}
				<span class="translation-badge" aria-label="Translation: {translationAbbr}">[{translationAbbr}]</span>
			</p>
		{/if}
	</div>
{/snippet}

{#snippet copyrightContent()}
	<!-- Copyright Notice — required Scripture attribution. Flows after the last
	     content block (on the final page). -->
	<div class="copyright-notice">
		{#if data.study.translation === 'esv'}
			<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. <a href="https://www.esv.org" target="_blank" rel="noopener noreferrer">www.esv.org</a></p>
		{:else if data.study.translation === 'net'}
			<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved. <a href="https://netbible.org" target="_blank" rel="noopener noreferrer">netbible.org</a></p>
		{/if}
	</div>
{/snippet}

{#snippet blockContent(block)}
	{#if block.type === 'column-start'}
		<!-- Column divider: a centered "Column: <ref>" label sitting on a SOLID
		     rule that runs to both margins, marking where a new column begins. -->
		{#if block.ref}
			<p class="doc-divider doc-divider-column">
				<span class="doc-divider-text">Column: {block.ref}</span>
			</p>
		{/if}
	{:else if block.type === 'section-start'}
		<!-- Section divider: centered "Section: <ref>" on a DASHED rule. -->
		{#if block.ref}
			<p class="doc-divider doc-divider-section">
				<span class="doc-divider-text">Section: {block.ref}</span>
			</p>
		{/if}
	{:else if block.type === 'aside'}
		<!-- Editorial commentary: segment-level (columns/sections no longer carry
		     their own commentary). Rendered as flowing body text directly beneath
		     the segment text it comments on, NOT as a boxed callout. Footnotes authored in the
		     commentary are surfaced beneath: the inline superscript markers are
		     renumbered 1, 2, 3… per commentary (matching the editor), and each
		     note's text — stored in its marker's data-footnote-content attribute —
		     is rendered as an ordered list directly below the commentary body. -->
		{@const asideRendered = renderCommentaryWithFootnotes(block.html)}
		{@const asideTermIds = extractGlossaryTermIds(block.html)}
		<div class="doc-commentary doc-commentary-{block.scope}">
			<div class="doc-commentary-body">{@html asideRendered.html}</div>
			{#if asideRendered.footnotes.length > 0}
				<ol class="doc-footnotes">
					{#each asideRendered.footnotes as footnote (footnote.number)}
						<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
					{/each}
				</ol>
			{/if}
			<!-- Glossary tags strip: a read-only reflection of the glossary terms
			     used inline in this commentary, mirroring the Analyze view's
			     CommentaryEditor bottom strip. -->
			{#if asideTermIds.length > 0}
				<div class="doc-tags">
					<div class="doc-tags-list">
						{#each asideTermIds as termId (termId)}
							<GlossaryBadge {termId} removable={false} />
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else if block.type === 'connections'}
		<!-- Connections group: links this item makes to others, shown once at the
		     FROM end. Each entry is wrapped in a subtle rounded-rectangle card with
		     a "Connection: <fromRef> → <toRef>" label, followed by its quick note
		     (plain text) and commentary (rich text). -->
		<div class="doc-connections doc-connections-{block.scope}">
			{#each block.connections as conn (conn.key)}
				<div class="doc-connection">
					<p class="doc-ref-line doc-connection-ref">
						<span class="doc-ref-label">Connection:</span>
						<span class="doc-connection-from">{conn.fromRef ?? '—'}</span>
						<span class="doc-connection-arrow"> → </span>
						<span class="doc-connection-to">{conn.toRef ?? '—'}</span>
					</p>
					{#if conn.note}
						<p class="doc-connection-note">{conn.note}</p>
					{/if}
					{#if conn.commentary}
						<!-- Connection commentary carries footnotes too; surface them the
						     same way as the commentary above. -->
						{@const connRendered = renderCommentaryWithFootnotes(conn.commentary)}
						{@const connTermIds = extractGlossaryTermIds(conn.commentary)}
						<div class="doc-connection-commentary">{@html connRendered.html}</div>
						{#if connRendered.footnotes.length > 0}
							<ol class="doc-footnotes doc-footnotes-connection">
								{#each connRendered.footnotes as footnote (footnote.number)}
									<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
								{/each}
							</ol>
						{/if}
						<!-- Glossary tags strip for the connection commentary. -->
						{#if connTermIds.length > 0}
							<div class="doc-tags">
								<div class="doc-tags-list">
									{#each connTermIds as termId (termId)}
										<GlossaryBadge {termId} removable={false} />
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<!-- Segment divider: centered "Segment: <ref>" on a DOTTED rule. -->
		{#if block.ref}
			<p class="doc-divider doc-divider-segment">
				<span class="doc-divider-text">Segment: {block.ref}</span>
			</p>
		{/if}

		{#if block.headingOne}
			<h3 class="doc-heading doc-heading-one">{block.headingOne}</h3>
		{/if}
		{#if block.headingTwo}
			<h4 class="doc-heading doc-heading-two">{block.headingTwo}</h4>
		{/if}
		{#if block.headingThree}
			<h5 class="doc-heading doc-heading-three">{block.headingThree}</h5>
		{/if}
		<div class="passage-text">{@html block.html}</div>
		<!-- Quick note: a brief plain-text margin note authored on the segment.
		     Rendered right after the segment's text (and before any segment
		     commentary that follows). Plain text — NOT {@html} — to mirror
		     the editor and avoid interpreting note content as markup. -->
		{#if block.note}
			<p class="doc-note">{block.note}</p>
		{/if}
	{/if}
{/snippet}

<!-- Render a single flow item by kind. Used by both the measure layer and the
     visible pages so they render identically. -->
{#snippet flowItemContent(item)}
	{#if item.kind === 'header'}
		{@render headerContent()}
	{:else if item.kind === 'passage-ref'}
		<!-- Passage reference — the top of the structural label family. Every
		     structural ref in the document is rendered as "Label: Reference"
		     (Passage / Column / Section / Segment / Connection) so the reading
		     document is navigable by location, matching the mockup. -->
		<p class="doc-ref-line doc-passage-ref">
			<span class="doc-ref-label">Passage:</span> {item.reference}
		</p>
	{:else if item.kind === 'block'}
		{@render blockContent(item.block)}
	{:else if item.kind === 'fallback-text'}
		<!-- Fallback: a passage with no usable structure renders whole, so text
		     is never lost (legacy/edge studies). -->
		<div class="passage-text">{@html item.html}</div>
	{:else if item.kind === 'error'}
		<div class="error-message">
			<p>Error loading {item.reference}: {item.error}</p>
		</div>
	{:else if item.kind === 'copyright'}
		{@render copyrightContent()}
	{/if}
{/snippet}

<div class="document-gutter">
	{#if streamedContent && data.passagesWithText && data.passagesWithText.length > 0}
		<!-- Off-screen MEASURE LAYER — renders every flow item once at the page's
		     content width so the paginator can read each item's laid-out height. It
		     is visually hidden on screen, but in PRINT it becomes the single
		     continuous flow the browser's native paginator splits into sheets. -->
		<div class="measure-layer" bind:this={measureEl} aria-hidden="true">
			{#each flowItems as item, i (item.id)}
				<div class="doc-flow-item" data-flow-index={i}>
					{@render flowItemContent(item)}
				</div>
			{/each}
		</div>

		<!-- VISIBLE PAGES — one .page per packed group of flow items. Until the
		     measure layer has been measured (or during SSR), displayPages is a
		     single page holding everything, so content is never hidden. -->
		{#each displayPages as pageIndices, p (p)}
			<div class="page">
				{#each pageIndices as idx (flowItems[idx].id)}
					<div class="doc-flow-item">
						{@render flowItemContent(flowItems[idx])}
					</div>
				{/each}
			</div>
		{/each}

	{:else if !streamedContent}
		<!-- Still streaming: show an in-page spinner on an empty page. Server-rendered
		     so it appears in the first paint on a fresh load (covering the pre-hydration
		     gap that the client-only global overlay can't). Suppressed while `$navigating`
		     OR the global content loader is active, so in-app navigations show only the
		     single global overlay rather than two spinners. -->
		<div class="page">
			{@render headerContent()}
			{#if !$navigating && !$studyContentLoading}
				<div class="content-loading">
					<Spinner size="lg" label="Loading study…" />
				</div>
			{/if}
		</div>
	{:else}
		<div class="page">
			{@render headerContent()}
			<p class="placeholder-text">No passages available for this study.</p>
		</div>
	{/if}
</div>


<style>
	/* ============================================
	   PAGE LAYOUT — 8.5" × 11" "Google Docs" pages
	   --------------------------------------------
	   The base stylesheet sets font-size: 62.5%, so 1rem = 10px. At the standard
	   print/screen resolution of 96 DPI, 1 inch = 96px = 9.6rem. US Letter is
	   therefore 81.6rem × 105.6rem, and a 1" margin is 9.6rem.

	   Phase 1 (this commit) establishes the visual page shell: a gray "gutter"
	   behind one white Letter-sized page with 1" padding (the margins). True
	   multi-page flow (splitting content across successive .page elements) is a
	   follow-up — for now all content lives in a single page that simply grows
	   taller than 11" when the study is long.
	   ============================================ */

	/* Page geometry — single source of truth for the dimensions/margins so the
	   paginator and the @media print rules can reference the same values. */
	:root {
		--page-width: 81.6rem;   /* 8.5in × 9.6rem/in */
		--page-height: 105.6rem; /* 11in  × 9.6rem/in */
		--page-margin: 9.6rem;   /* 1in on all sides  */
		--page-gap: 2.4rem;      /* vertical space between stacked pages */
		/* Content area = page minus the left+right (and top+bottom) margins. The
		   off-screen measure layer is set to this width so item heights it reports
		   match how they'll lay out inside a real page's content box. */
		--page-content-width: 62.4rem;  /* 81.6 − 2 × 9.6 */
	}


	/* The gutter is the gray surface the pages float on (Google Docs style). It
	   fills the scroll container and centers the page column horizontally. */
	.document-gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--page-gap);
		flex: 1 0 auto;
		padding: var(--page-gap) var(--page-gap) 6rem;
		background-color: var(--gray-900);
	}

	/* A single physical page: fixed Letter width and height (the paginator packs a
	   bounded set of flow items onto each), white surface, 1" padding for the
	   margins, and a subtle shadow to lift it off the gutter. Overflow is hidden so
	   a slight measurement overshoot can never bleed past the sheet edge. */
	.page {
		box-sizing: border-box;
		width: var(--page-width);
		min-height: var(--page-height);
		padding: var(--page-margin);
		background-color: var(--white);
		box-shadow: 0 0.1rem 0.6rem var(--black-alpha);
		overflow: hidden;
	}

	/* ============================================
	   PAGINATION — measure layer + flow-item wrappers
	   --------------------------------------------
	   Each renderable unit (header, passage reference, structural block, copyright)
	   is wrapped in a .doc-flow-item. The two contexts treat that wrapper
	   differently, by design (see the rules below): the measure layer makes each
	   wrapper a flow-root so heights are self-contained and easy to pack; the
	   visible pages make the wrapper `display: contents` so the blocks lay out as
	   direct children of the page and keep their original margin-collapsing rhythm.
	   ============================================ */
	/* In the MEASURE layer each item is its own flow-root so its measured height

	   includes (uncollapsed) margins — a safe over-measure that only ever under-fills
	   a page. On the VISIBLE pages the wrapper uses `display: contents`, so it
	   contributes NO box of its own: the blocks lay out as direct children of the
	   page exactly as they did before pagination existed, restoring the original
	   margin-collapsing and vertical rhythm between blocks. */
	.measure-layer .doc-flow-item {
		display: flow-root;
	}

	.page .doc-flow-item {
		display: contents;
	}

	/* The first block on each page discards its leading top margin so the top of
	   every page's content sits flush against the page's top margin rather than
	   being pushed down by a block's own margin. With `display: contents` wrappers
	   the block is the page's effective first child, so this targets it directly. */
	.page > .doc-flow-item:first-child > :global(:first-child) {
		margin-top: 0;
	}



	/* Off-screen layer that renders every flow item once at the page's CONTENT
	   width (page width − 2× margin), so the paginator can read each item's real
	   laid-out height. Positioned out of flow and hidden from view; in print it is
	   promoted to the visible, continuous flow the browser paginates (see @media
	   print), while the on-screen .page elements are hidden. */
	.measure-layer {
		position: absolute;
		top: 0;
		left: -200vw;
		width: var(--page-content-width);
		box-sizing: border-box;
		visibility: hidden;
		pointer-events: none;
	}



	/* Header block — left-aligned: study title, subtitle, and the passage
	   references + translation badge all hug the left margin of the page. The
	   bottom margin reproduces the gap the old `.document-content { margin-top }`
	   wrapper created between the header and the first passage content (the wrapper
	   itself is gone now that content is paginated into flow items). */
	.study-header {
		width: 100%;
		text-align: left;
		margin-bottom: 2.7rem;
	}



	/* Title — 1.6rem bold, near-black (docx sz32, #545352 → --gray-200). */
	.study-title {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--gray-200);
		line-height: 1.2;
		margin: 0;
	}


	/* Subtitle — 1.4rem bold, a lighter gray than the title (docx sz28, #71706f
	   → --gray-400). */
	.study-subtitle {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--gray-400);
		margin-top: 0.6rem;
		margin-bottom: 0.6rem;
		line-height: 1.2;
	}



	/* Passage listing — the references + translation badge. The lightest of the
	   header text (1.1rem, docx sz22, #555453 → --gray-300), not bold. */
	.study-references {
		font-size: 1.1rem;
		color: var(--gray-300);
		margin-top: 0;
		margin-bottom: 0;
		line-height: 1.5;
	}



	.translation-badge {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 1.1rem;
		color: var(--gray-300);
	}


	.placeholder-text {

		font-size: 1.4rem;
		color: var(--gray-400);
		text-align: center;
		padding: 3.6rem 0;
	}

	/* Centered in-page loading state shown while streamed content resolves. */
	.content-loading {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 7.2rem 0;
	}

	.passage-section {

		margin-bottom: 3.6rem;
	}

	.passage-text {

		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
	}

	/* ============================================
	   VERSE NOTATION — the inline chapter:verse markers (e.g. "5:3") that the
	   passage HTML carries as <span class="chapter-verse">. The Analyze view styles
	   these via a `:global(.chapter-verse)` rule, but that styling is scoped to that
	   page — it never reaches the Document page on a fresh load/refresh, so the
	   markers rendered here (verbatim via {@html}) would otherwise appear as
	   unstyled inline numbers. Mirror Analyze's treatment (bold, blue, slight right
	   gap) scoped to the passage text so the notation reads the same in both views.
	   The paragraph-break-marker rule reproduces the same vertical paragraph spacing
	   the passage HTML expects. ============================================ */
	.passage-text :global(.chapter-verse) {
		font-weight: bold;
		color: var(--blue-500);
		padding-right: 0.3rem;
	}

	.passage-text :global(.paragraph-break-marker) {
		display: block;
		width: 100%;
		height: 0;
		margin-top: 0.8em;
		-webkit-user-select: none;
		user-select: none;
		pointer-events: none;
	}

	.passage-text :global(.paragraph-break-marker:first-child) {
		margin-top: 0;
	}



	/* ============================================
	   DOCUMENT HEADINGS — the author's Heading One/Two/Three (rendered h3/h4/h5)
	   interleaved with the passage text. This is a clean reading layout, so the
	   headings are simple left-aligned type with a clear size/weight hierarchy —
	   NOT the Analyze "banner" look (centered color bands tied to the column grid).
	   The top margin opens space above each heading to separate it from the
	   preceding text; the first heading in a passage loses that gap so it sits
	   directly under the passage reference.
	   ============================================ */
	.doc-heading {
		text-align: left;
		color: var(--gray-200);
		margin: 2.7rem 0 0.9rem;
	}


	/* Heading One — 1.6rem bold (docx sz32). */
	.doc-heading-one {
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1.5;
	}

	/* Heading Two — 1.4rem bold (docx sz28). */
	.doc-heading-two {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.5;
	}

	/* Heading Three — 1.2rem bold (docx sz24). */
	.doc-heading-three {
		font-size: 1.2rem;
		font-weight: 700;
		line-height: 1.5;
	}


	/* Stacked headings hug each other: a Heading Two directly under a Heading One,
	   and a Heading Three directly under a Heading One or Two, drop their top margin
	   so a heading group reads as one unit rather than separated lines. */
	.doc-heading-one + .doc-heading-two,
	.doc-heading-one + .doc-heading-three,
	.doc-heading-two + .doc-heading-three {
		margin-top: 0;
	}

	/* A heading directly followed by its segment text should hug that text. */
	.doc-heading + .passage-text {
		margin-top: 0;
	}


	/* ============================================
	   COMMENTARY — column/section/segment commentary as flowing body text.
	   --------------------------------------------
	   In the mockup, commentary reads as ordinary prose directly beneath the
	   structural label it follows (Column/Section/Segment), NOT as a boxed callout.
	   So this is simply body copy: same measure and color as the passage text, set
	   apart only by spacing. Footnotes authored in the commentary surface as a
	   numbered list directly below (see .doc-footnotes).
	   ============================================ */
	.doc-commentary {
		margin: 0.6rem 0 0;
	}

	.doc-commentary-body {
		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-100);


		/* No default italic: commentary is rich text where the user can italicize
		   specific runs, so forcing italic on the whole block would both clash with
		   and visually erase those intentional emphases. */
	}

	/* Keep rich-text commentary tidy: no stray top/bottom margins on the first/last
	   block so the surrounding spacing is controlled here. */
	.doc-commentary-body :global(> :first-child) {
		margin-top: 0;
	}

	.doc-commentary-body :global(> :last-child) {
		margin-bottom: 0;
	}

	/* Lists in commentary — mirror the CommentaryEditor (Analyze view) so ordered
	   and unordered lists read with the same indentation and inter-item spacing the
	   author saw while writing. The editor sets ul/ol padding-left: 2.4rem, li
	   margin: 0.6rem 0, and zeroes the margin on paragraphs nested in list items. */
	.doc-commentary-body :global(ul),
	.doc-commentary-body :global(ol),
	.doc-connection-commentary :global(ul),
	.doc-connection-commentary :global(ol) {
		padding-left: 2.4rem;
	}

	.doc-commentary-body :global(li),
	.doc-connection-commentary :global(li) {
		margin: 0.6rem 0;
	}

	.doc-commentary-body :global(li p),
	.doc-connection-commentary :global(li p) {
		margin: 0;
	}

	/* Footnote markers inline in the commentary body — a small superscript number
	   tied to the matching entry in the footnote list below. The marker is a span
	   (.footnote-marker) emitted from the stored commentary HTML; we only need to
	   size/lift its superscript so it reads as a reference, not body text. */
	.doc-commentary-body :global(.footnote-marker sup),
	.doc-connection-commentary :global(.footnote-marker sup) {
		font-size: 0.7em;
		line-height: 0;
		vertical-align: super;
		color: var(--gray-300);
		font-weight: 600;
	}


	/* ============================================
	   FOOTNOTES — the note text behind each commentary's superscript markers.
	   --------------------------------------------
	   Authored in the CommentaryEditor and stored inline on each marker's
	   data-footnote-content attribute. Surfaced here as an ordered list directly
	   beneath the commentary it belongs to, numbered PER COMMENTARY (1, 2, 3…) to
	   match the numbers the author entered. Quiet, small type so it reads as
	   supporting apparatus, not body copy.
	   ============================================ */
	.doc-footnotes {
		margin: 0.9rem 0 0;
		padding: 0.6rem 0 0 1.8rem;
		list-style: decimal;
		list-style-position: outside;
	}

	/* Connection footnotes are nested metadata, so they read a touch smaller. */
	.doc-footnotes-connection {
		padding-left: 1.6rem;
	}

	.doc-footnote {
		font-size: 1.2rem;
		line-height: 1.6;
		color: var(--gray-300);
		margin: 0.2rem 0 0;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.doc-footnote::marker {
		color: var(--gray-400);
		font-weight: 600;
	}

	/* ============================================
	   REFERENCE LABELS — "Label: Reference" lines
	   --------------------------------------------
	   Per the mockup, every structural reference is rendered as a labeled line:
	   "Passage: …", "Column: …", "Section: …", "Segment: …", "Connection: …".
	   They share a common left-aligned label family (the colored "Label:" prefix),
	   with a size hierarchy (passage > column > section > segment) so they aid
	   navigation without competing with the reading flow.
	   ============================================ */
	.doc-ref-line {
		text-align: left;
		margin: 1.5rem 0 0.3rem;
		color: var(--gray-300);
		line-height: 1.5;
	}

	/* The "Label:" prefix — a bold lead-in that names the level. Inherits the
	   line's color (per the mockup the whole label line is one near-black gray). */
	.doc-ref-label {
		font-weight: 700;
	}

	/* Passage reference — bold 1.6rem, opens each passage block (docx sz32). */
	.doc-passage-ref {
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1.5;
		margin-top: 0;
		margin-bottom: 1.2rem;
	}

	/* ============================================
	   STRUCTURAL DIVIDERS — Column / Section / Segment
	   --------------------------------------------
	   Per the mockup, each structural reference is a CENTERED label sitting on a
	   horizontal rule that runs to both margins. The rule's line-style encodes the
	   level: Column = solid, Section = dashed, Segment = dotted. Built as a flex
	   row whose ::before/::after pseudo-rules fill the space on either side of the
	   centered text. Text: bold 1.2rem, near-black (docx sz24, #545352 →
	   --gray-300); rule: 0.1rem --gray-700 (docx #b5b4b3).
	   ============================================ */
	.doc-divider {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin: 2.7rem 0 1.2rem;
		line-height: 1;
	}

	/* The rule on either side of the centered label. */

	.doc-divider::before,
	.doc-divider::after {
		content: '';
		flex: 1 1 auto;
		border-top-width: 0.1rem;
		border-top-color: var(--gray-700);
	}

	.doc-divider-text {
		flex: 0 0 auto;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--gray-300);
		text-align: center;
	}

	/* Column → solid rule. */
	.doc-divider-column::before,
	.doc-divider-column::after {
		border-top-style: solid;
	}

	/* Section → dashed rule. */
	.doc-divider-section::before,
	.doc-divider-section::after {
		border-top-style: dashed;
	}

	/* Segment → dotted rule. */
	.doc-divider-segment::before,
	.doc-divider-segment::after {
		border-top-style: dotted;
	}



	/* ============================================
	   QUICK NOTE — a brief plain-text note authored on a segment, shown directly
	   beneath that segment's text. Quieter than the commentary asides (it's a short
	   margin note, not full commentary): small, muted, with a subtle left rule and
	   preserved line breaks. Sits before any segment-commentary aside that follows.
	   ============================================ */
	.doc-note {
		font-size: 1.2rem;
		font-style: italic;
		/* Medium-bold so the quick note reads as an emphasized authoring mark. */
		font-weight: 500;
		line-height: 1.6;

		color: var(--gray-300);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0.9rem 0 0;
		/* Highlighter look: the note sits on a light --gray-800 band. display:inline so

		   the highlight hugs the text (like a marker stroke) rather than filling the line. */
		display: inline-block;
		background-color: var(--gray-800);
		padding: 0.1rem 0.4rem;
		border-radius: 0.3rem;
	}



	/* ============================================
	   CONNECTIONS — links an item (column/section/segment) makes to others.
	   --------------------------------------------
	   Shown once at the FROM end, grouped at the end of that item's block. Per the
	   mockup each connection sits inside its own SUBTLE ROUNDED RECTANGLE — a quiet
	   bordered card that visually fences the cross-reference off from the body copy.
	   Inside: a "Connection: fromRef → toRef" label line, then the quick note (plain
	   text) and commentary (rich text).
	   ============================================ */
	.doc-connections {
		margin: 1.5rem 0 0;
	}

	/* The subtle rounded rectangle around each connection. */
	.doc-connection {
		margin: 0 0 0.9rem;
		padding: 0.9rem 1.2rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.6rem;
	}

	.doc-connection:last-child {
		margin-bottom: 0;
	}

	.doc-connection-ref {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--gray-200);
		margin: 0;
		text-align: center;
	}

	.doc-connection-arrow {
		color: var(--gray-500);
	}

	/* Connection quick note — brief plain text, mirrors the segment quick note look:
	   medium-bold on a light --gray-800 highlight band. */
	.doc-connection-note {
		font-size: 1.2rem;
		font-style: italic;
		font-weight: 500;
		line-height: 1.6;

		color: var(--gray-300);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0.4rem 0 0;
		display: inline-block;
		background-color: var(--gray-800);
		padding: 0.1rem 0.4rem;
		border-radius: 0.3rem;
	}



	/* Connection commentary — rich text; no forced italic so authored emphases show. */
	.doc-connection-commentary {
		font-size: 1.2rem;
		line-height: 1.7;
		color: var(--gray-100);
		margin: 0.4rem 0 0;
	}




	.doc-connection-commentary :global(> :first-child) {
		margin-top: 0;
	}

	.doc-connection-commentary :global(> :last-child) {
		margin-bottom: 0;
	}

	/* ============================================
	   GLOSSARY TAGS STRIP — read-only reflection of the glossary terms used inline
	   in a commentary, mirroring the Analyze view's CommentaryEditor bottom strip.
	   A bordered box holds the wrapped row of GlossaryBadge pills.
	   ============================================ */
	.doc-tags {
		margin: 0.9rem 0 0;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.3rem;
		padding: 1.2rem;
	}

	.doc-tags-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.error-message {
		padding: 1.8rem;
		background-color: var(--red-900);
		border: 1px solid var(--red-700);
		border-radius: 0.4rem;
		margin-bottom: 1.8rem;
	}

	.error-message p {
		font-size: 1.4rem;
		color: var(--red-300);
		margin: 0;
	}

	/* The copyright notice flows at the end of the last page's content. The top
	   padding/border keep a visible separator above it. (It no longer pins to the
	   page bottom: with content paginated into discrete pages there is no single
	   flex column to absorb spare space, and a real page simply ends with this
	   notice after the final block.) */
	.copyright-notice {
		padding-top: 2.7rem;
		border-top: 1px solid var(--gray-700);
	}



	.copyright-notice p {
		font-size: 1.2rem;
		color: var(--gray-500);
		line-height: 1.6;
		text-align: center;
		margin: 0;
	}


	.copyright-notice a {
		color: var(--gray-500);
		text-decoration: underline;
	}

	/* ============================================
	   PRINT — let the browser's paginator produce the real output.
	   --------------------------------------------
	   On paper there is no gutter or drop shadow: the page IS the sheet. We declare
	   the physical Letter sheet with 1" margins via @page, then strip the on-screen
	   page chrome so content flows directly onto the printed sheets. The browser
	   handles page breaks natively, which is the source of truth for PDF export.
	   ============================================ */
	@media print {
		.document-gutter {
			display: block;
			padding: 0;
			gap: 0;
			background: none;
		}

		/* In print the screen pagination is irrelevant — the browser's native
		   paginator fragments content into real sheets. So hide the on-screen .page
		   elements (which would otherwise print as fixed-height boxes with awkward
		   internal breaks and trailing whitespace) and instead promote the
		   measure-layer to the visible, continuous flow the browser paginates. */
		.page {
			display: none;
		}

		.measure-layer {
			position: static;
			left: auto;
			width: auto;
			visibility: visible;
			pointer-events: auto;
		}


		/* Connection cards keep their border in print so the cross-reference still
		   reads as a fenced-off block on paper / in the PDF export. */
		.doc-connection {
			border-color: var(--gray-400);
		}

	}
</style>

<svelte:head>
	<!-- Physical sheet definition for printing/PDF export: US Letter with 1"
	     margins, matching the on-screen 81.6rem × 105.6rem / 9.6rem geometry. -->
	<style>
		@page {
			size: 8.5in 11in;
			margin: 1in;
		}
	</style>
</svelte:head>
