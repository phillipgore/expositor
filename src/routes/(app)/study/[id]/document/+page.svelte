<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount, tick } from 'svelte';

	import Spinner from '$lib/componentElements/Spinner.svelte';
	import GlossaryBadge from '$lib/componentElements/GlossaryBadge.svelte';
	import DocumentCommentaryToolbar from '$lib/componentWidgets/DocumentCommentaryToolbar.svelte';
	import DocumentCommentaryEditor from '$lib/componentWidgets/DocumentCommentaryEditor.svelte';

	import { getTranslationMetadata } from '$lib/utils/translationConfig.js';
	import { setStudyContentLoading, studyContentLoading } from '$lib/stores/loading.js';
	import {
		toolbarState,
		setActiveSegment,
		setWordSelection,
		setCanInsertColumn,
		setActiveSection,
		setActiveColumn
	} from '$lib/stores/toolbar.js';



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
	 * Capitalize a connection endpoint type ('segment' | 'section' | 'column') for
	 * display, e.g. 'segment' → 'Segment'. Used to render the connection KIND line
	 * ("Segment → Segment", "Column → Segment", …) so the reader knows what level
	 * of structure is being linked. Falls back to an em dash for missing/unknown
	 * types so the arrow line always reads cleanly.
	 * @param {string|null|undefined} type
	 * @returns {string}
	 */
	function formatConnectionType(type) {
		if (!type) return '—';
		return type.charAt(0).toUpperCase() + type.slice(1);
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
				fromType: conn.fromType ?? null,
				toType: conn.toType ?? null,
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
	function buildDocumentBlocks(passageText, passageData, connectionsByFromId = {}, view = {}) {
		const cols = passageText?.structure?.columns;
		if (!cols?.length || !passageText.text) return null;

		// Document-view visibility flags. Default to visible (true) when unspecified so
		// callers that don't pass `view` get the full document. Hidden content is
		// OMITTED here (not just CSS-hidden) so it never enters pagination — keeping the
		// page-break math honest. `headings` also governs the per-heading commentary
		// (no heading shown → its commentary has nothing to attach to); `commentaries`
		// governs the standalone segment commentary aside; `passageNotes` governs the
		// segment quick note.
		const showHeadings = view.headings !== false;
		const showCommentaries = view.commentaries !== false;
		const showPassageNotes = view.passageNotes !== false;


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
				id: column.id,
				ref: columnRef,
				// First column of the passage already sits at the top of the passage's
				// new page (under the Passage ref), so it must NOT force a further break.
				// Every subsequent column begins on its own fresh page.
				firstInPassage: ci === 0
			});


			// Columns no longer carry their own commentary (it was removed in favor
			// of heading commentary), so no column-level aside is emitted here.
			// Connections are no longer emitted inline either — they are collected
			// into a single "Connections" appendix at the end of the document (see
			// buildFlowItems), so the reading flow isn't interrupted by cross-refs.

			const columnSections = column.sections ?? [];
			for (let secIdx = 0; secIdx < columnSections.length; secIdx++) {
				const section = columnSections[secIdx];

				const sIdx = sectionCursor++;
				const sectionRef = refOf(sectionFirstWord[sIdx], sectionFirstWord[sIdx + 1] ?? null);

				blocks.push({
					type: 'section-start',
					key: `secstart-${section.id}`,
					id: section.id,
					ref: sectionRef,

					// First section of a column sits at the top of that column (under the
					// passage ref for the first column, or at the top of the column's fresh
					// page otherwise), so it gets NO leading horizontal rule. Every
					// subsequent section in the column is separated by a rule.
					firstInColumn: secIdx === 0
				});

				// Sections no longer carry their own commentary (it was removed in
				// favor of heading commentary), so no section-level aside is emitted.
				// Section connections are collected into the end-of-document
				// "Connections" appendix rather than emitted inline here.

				const sectionSegments = section.segments ?? [];
				for (let segIdx = 0; segIdx < sectionSegments.length; segIdx++) {
					const segment = sectionSegments[segIdx];

					const segmentRef = refOf(segment.startingWordId, nextStartById[segment.id]);


					// Each heading carries its OWN commentary (stored per-heading in the
					// passage_heading table and projected onto segment.headings[] by the
					// loader). Pull the commentary out by heading type so the template can
					// render Heading One/Two/Three commentary directly beneath the matching
					// heading. Falls back to null when a heading (or its commentary) is absent.
					const headingsByType = { one: null, two: null, three: null };
					for (const h of segment.headings ?? []) headingsByType[h.headingType] = h;

					// Heading row ids so the document can route per-heading commentary
					// edits to the right passage_heading record (the commentary editor
					// PATCHes /api/passages/headings/:id).
					const headingIdByType = {
						one: headingsByType.one?.id ?? null,
						two: headingsByType.two?.id ?? null,
						three: headingsByType.three?.id ?? null
					};

					blocks.push({
						type: 'segment',
						key: segment.id,
						id: segment.id,
						// First segment of a section sits directly under that section's
						// horizontal rule, so it must NOT add a leading 36px segment gap;
						// every subsequent segment in the section does.
						firstInSection: segIdx === 0,
						// First segment of a COLUMN (first section, first segment) sits at
						// the very top of the column's fresh page — where the left-margin
						// Column/Section selectors are anchored. Its leading heading/text
						// margin would otherwise push the content ~3.6rem below those
						// selectors; this flag lets the template zero that top margin so the
						// content top lines up with the selector pair.
						firstInColumn: secIdx === 0 && segIdx === 0,

						// Headings (and their per-heading commentary) are suppressed entirely
						// when the Document view's Headings toggle is off — nulled here so they
						// never enter pagination. The per-heading commentary additionally
						// depends on the Commentaries toggle.
						headingOne: showHeadings ? segment.headingOne : null,

						headingTwo: showHeadings ? segment.headingTwo : null,
						headingThree: showHeadings ? segment.headingThree : null,
						headingOneCommentary: showHeadings && showCommentaries ? headingsByType.one?.commentary ?? null : null,
						headingTwoCommentary: showHeadings && showCommentaries ? headingsByType.two?.commentary ?? null : null,
						headingThreeCommentary: showHeadings && showCommentaries ? headingsByType.three?.commentary ?? null : null,
						// Heading row ids — the per-heading commentary editor PATCHes
						// /api/passages/headings/:id, so the template needs the id of the
						// passage_heading row backing each heading's commentary.
						headingOneId: headingIdByType.one,
						headingTwoId: headingIdByType.two,
						headingThreeId: headingIdByType.three,
						ref: segmentRef,

						// Quick note (plain text) authored on the segment — carried through so the
						// document can render it directly beneath the segment's text. Suppressed
						// when the Document view's Text Quick Notes toggle is off.
						note: showPassageNotes ? segment.note ?? null : null,
						html: htmlBySegmentId[segment.id] ?? ''
					});

					// Segment commentary is the NARROWEST scope — it comments on this one
					// segment's text — so it TRAILS the segment as a note (unlike the broad
					// column/section commentary, which is anchored ahead of the content it
					// introduces). Same editorial-aside treatment so it's never mistaken for
					// body text or a heading. Suppressed when the Commentaries toggle is off.
					if (showCommentaries && segment.commentary) {

						blocks.push({
							type: 'aside',
							scope: 'segment',
							key: `seg-com-${segment.id}`,
							ref: segmentRef,
							// The segment id backs this commentary's inline editor (PATCHes
							// /api/segments/:id) when the section is made editable.
							subjectId: segment.id,
							html: segment.commentary
						});
					}

					// Connections are no longer emitted inline alongside the segment —
					// they are collected into the end-of-document "Connections" appendix
					// (see buildFlowItems) so the reading flow stays uninterrupted.
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
	 * Collect every connection across the whole study into a single ordered list for
	 * the end-of-document "Connections" appendix. Connections used to render inline
	 * beneath the column/section/segment they point FROM; they're now gathered here
	 * instead so the reading flow stays uninterrupted. Walks the structure in reading
	 * order (passage → column → section → segment) and, at each item, appends the
	 * connections grouped under that item's id (deduped by connection key), so the
	 * appendix lists each connection exactly once in document order.
	 * @param {Array<Object>|undefined} passagesWithText
	 * @param {Object<string, Array<Object>>} connectionsByFromIdMap
	 * @returns {Array<Object>}
	 */
	function collectAllConnections(passagesWithText, connectionsByFromIdMap, view = {}) {
		// Per-type visibility flags (default visible). A connection is included only
		// when the toggle governing its KIND is on, mirroring the Analyze view's
		// connection-type filtering: a connection whose two endpoints are of DIFFERENT
		// kinds is "cross-item"; otherwise it's gated by its shared kind's toggle.
		const showColumn = view.columnConnections !== false;
		const showSection = view.sectionConnections !== false;
		const showSegment = view.segmentConnections !== false;
		const showCross = view.crossItemConnections !== false;
		const isVisible = (conn) => {
			if (conn.fromType !== conn.toType) return showCross;
			if (conn.fromType === 'column') return showColumn;
			if (conn.fromType === 'section') return showSection;
			return showSegment; // segment ↔ segment (or unknown) → segment toggle
		};

		/** @type {Array<Object>} */
		const all = [];
		const seen = new Set();
		const take = (id) => {
			for (const conn of connectionsByFromIdMap[id] ?? []) {
				if (seen.has(conn.key)) continue;
				if (!isVisible(conn)) continue;
				seen.add(conn.key);
				all.push(conn);
			}
		};

		for (const passageText of passagesWithText ?? []) {
			const cols = passageText?.structure?.columns;
			if (!cols?.length) continue;
			for (const column of cols) {
				take(column.id);
				for (const section of column.sections ?? []) {
					take(section.id);
					for (const segment of section.segments ?? []) {
						take(segment.id);
					}
				}
			}
		}
		return all;
	}

	/**
	 * Collect every glossary term id used inline ANYWHERE in the study's commentary
	 * into a single deduped, first-appearance-ordered list for the universal "Tags"
	 * section at the end of the document. Each commentary used to surface its own
	 * trailing tags strip; they're now gathered here instead so the whole study's
	 * vocabulary reads as one consolidated index. Walks the structure in reading
	 * order (passage → column → section → segment), pulling term ids from each
	 * segment's commentary and each heading's commentary, then appends the term ids
	 * from every connection's commentary (in the same order the Connections appendix
	 * lists them). The shared `seen` set keeps each term to its FIRST occurrence.
	 * @param {Array<Object>|undefined} passagesWithText
	 * @param {Array<Object>} allConnections - connections in appendix order
	 * @returns {string[]}
	 */
	function collectAllGlossaryTermIds(passagesWithText, allConnections) {
		/** @type {string[]} */
		const ids = [];
		const seen = new Set();
		const take = (html) => {
			for (const id of extractGlossaryTermIds(html)) {
				if (seen.has(id)) continue;
				seen.add(id);
				ids.push(id);
			}
		};
		for (const passageText of passagesWithText ?? []) {
			const cols = passageText?.structure?.columns;
			if (!cols?.length) continue;
			for (const column of cols) {
				for (const section of column.sections ?? []) {
					for (const segment of section.segments ?? []) {
						take(segment.commentary);
						for (const h of segment.headings ?? []) take(h.commentary);
					}
				}
			}
		}
		for (const conn of allConnections ?? []) take(conn.commentary);
		return ids;
	}

	/**
	 * Flatten the streamed study content into a single ordered list of renderable
	 * "flow items" — the atomic units the paginator packs onto pages. Each item is
	 * `{ id, kind, ... }`; `kind` selects which snippet renders it.
	 * @returns {Array<Object>}
	 */
	function buildFlowItems(passagesWithText, passages, connectionsByFromIdMap, view = {}) {



		/** @type {Array<Object>} */
		const items = [{ id: 'header', kind: 'header' }];

		// Tracks whether we've already emitted a passage. Every passage AFTER the
		// first begins on a fresh page (forceBreak); the first passage shares page 1
		// with the study header so the header never sits alone on a near-empty page.
		let passageCount = 0;

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
				reference: passageText.reference,
				// Every passage after the first begins on a fresh page.
				forceBreak: passageCount > 0
			});
			passageCount++;


			const blocks = buildDocumentBlocks(passageText, passageData, connectionsByFromIdMap, view);
			if (blocks) {

				for (const block of blocks) {
					items.push({ id: `blk-${passageId}-${block.key}`, kind: 'block', block });
				}
			} else {
				items.push({ id: `fb-${passageId}`, kind: 'fallback-text', html: passageText.text });
			}
		}

		// Connections appendix — every connection in the study, collected in reading
		// order and rendered as a titled section at the END of the document (after all
		// passages, before the copyright). Each connection is its own flow item so the
		// paginator can split a long appendix across pages; the title is a separate
		// item that leads them off.
		const allConnections = collectAllConnections(passagesWithText, connectionsByFromIdMap, view);
		if (allConnections.length) {
			items.push({ id: 'connections-appendix-title', kind: 'connections-title' });
			for (const conn of allConnections) {
				// Suppress the connection's quick note when the Document view's Connection
				// Quick Notes toggle is off, and its commentary when the Commentary toggle
				// is off — pass a stripped copy so the card renders the connection without
				// the suppressed pieces. Mirrors how segment/heading commentary respects the
				// same Commentary toggle, so turning Commentary off hides Connection
				// Commentary too.
				let c = conn;
				if (view.connectionNotes === false) c = { ...c, note: null };
				if (view.commentaries === false) c = { ...c, commentary: null };

				items.push({ id: `appendix-conn-${conn.key}`, kind: 'connection', connection: c });
			}
		}


		// Tags section — every glossary term used inline anywhere in the study's
		// commentary, consolidated into a single titled "Tags" section at the END of
		// the document (after Connections, before the copyright). Replaces the
		// per-commentary tags strips that used to trail each commentary block. Only
		// emitted when at least one term is used study-wide.
		const allTermIds = collectAllGlossaryTermIds(passagesWithText, allConnections);
		if (allTermIds.length) {
			items.push({ id: 'tags-appendix', kind: 'tags', termIds: allTermIds });
		}

		items.push({ id: 'copyright', kind: 'copyright' });
		return items;

	}


	// Document-view visibility flags (the document* toolbar fields — INDEPENDENT of
	// the Analyze view's toggles). Threaded into the flow-item builders below so that
	// hidden content is OMITTED FROM PAGINATION (not just visually hidden), keeping the
	// page breaks correct. The inline verse-notation / paragraph-break markers live
	// inside the passage HTML and are hidden via CSS classes on the gutter instead
	// (both the measure layer and the visible pages inherit those classes, so
	// measurement still matches what's rendered).
	let docView = $derived({
		headings: $toolbarState.documentHeadingsVisible,
		commentaries: $toolbarState.documentCommentariesVisible,
		passageNotes: $toolbarState.documentPassageNotesVisible,
		connectionNotes: $toolbarState.documentConnectionNotesVisible,
		columnConnections: $toolbarState.documentColumnConnectionsVisible,
		sectionConnections: $toolbarState.documentSectionConnectionsVisible,
		segmentConnections: $toolbarState.documentSegmentConnectionsVisible,
		crossItemConnections: $toolbarState.documentCrossItemConnectionsVisible
	});

	let flowItems = $derived(
		streamedContent && data.passagesWithText && data.passagesWithText.length > 0
			? buildFlowItems(data.passagesWithText, data.passages, connectionsByFromId, docView)
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

	/* ============================================================
	   ZOOM — apply the toolbar's Zoom selection to the on-screen pages
	   ------------------------------------------------------------
	   The shared toolbar store carries the user's Zoom choice as `zoomLevel`
	   (percentage) + `zoomMode` ('percentage' | 'fit-width' | 'fit-study'),
	   updated by the toolbar's MenuZoom. The Analyze view reads these and applies
	   a CSS `transform: scale(...)`; we mirror that here so the same Zoom control
	   drives the Document view too.

	   Only the VISIBLE pages are scaled. The off-screen measure layer is left at
	   its natural (rem) size so the paginator's height math is unaffected by zoom —
	   the document still splits into the same Letter-sized sheets at every zoom
	   level; the sheets are merely drawn larger/smaller. Print is likewise
	   unaffected (the @media print rules hide .page and promote the measure layer).
	   ============================================================ */

	// The element actually carrying the scale transform (wraps the .page column).
	// Its NATURAL (unscaled) layout size is measured below to size the wrapper and
	// to compute the fit-mode scales.
	let pagesInnerEl = $state(/** @type {HTMLElement | null} */ (null));
	// The scroll surface (gutter). Used to read the available viewport for fit modes.
	let gutterEl = $state(/** @type {HTMLElement | null} */ (null));

	// Dynamically computed scale for the two fit modes (recomputed on resize /
	// content change in the effect below). Ignored while in percentage mode.
	let fitScale = $state(1);

	// Effective scale: the fit scale in a fit mode, else the percentage / 100.
	// Document view reads its OWN zoom pair (documentZoom*) so it stays independent
	// from the Analyze view's zoom.
	let currentScale = $derived.by(() => {
		if ($toolbarState.documentZoomMode === 'fit-width' || $toolbarState.documentZoomMode === 'fit-study') {
			return fitScale;
		}
		return ($toolbarState.documentZoomLevel || 100) / 100;
	});


	// Last-measured NATURAL (un-scaled) size of the pages column. offsetWidth/Height
	// are layout px — unaffected by the scale transform — so a ResizeObserver on the
	// inner reports its true natural size and fires whenever content reflows.
	let lastNaturalWidth = $state(0);
	let lastNaturalHeight = $state(0);

	// Explicit scaled dimensions for the wrapper so the gutter reserves the right
	// amount of (visual) space and the scroll area matches the scaled content. The
	// inner is taken out of flow (position: absolute) and centered, so without this
	// the wrapper would collapse and scrolling/centering would break.
	let wrapperDimensions = $derived.by(() => {
		const w = lastNaturalWidth;
		const h = lastNaturalHeight;
		if (w > 0 && h > 0) {
			return `width: ${w * currentScale}px; height: ${h * currentScale}px;`;
		}
		return '';
	});

	/**
	 * Recompute the fit-mode scale from the available viewport and the pages
	 * column's natural size. fit-width fills the viewport width; fit-study fits the
	 * whole sheet (both dimensions) within the viewport. No-op outside a fit mode.
	 */
	function recomputeFitScale() {
		const mode = $toolbarState.documentZoomMode;
		if (mode !== 'fit-width' && mode !== 'fit-study') return;

		if (!gutterEl || !pagesInnerEl) return;

		// Available viewport = the scroll container (the gutter's parent) minus the
		// gutter's own padding, so the fitted page clears the gray margin all around.
		const scroller = gutterEl.parentElement ?? gutterEl;
		const gStyle = getComputedStyle(gutterEl);
		const padX = parseFloat(gStyle.paddingLeft) + parseFloat(gStyle.paddingRight);
		const padY = parseFloat(gStyle.paddingTop) + parseFloat(gStyle.paddingBottom);
		const availW = scroller.clientWidth - padX;
		const availH = scroller.clientHeight - padY;

		const naturalW = pagesInnerEl.offsetWidth;
		const naturalH = pagesInnerEl.offsetHeight;
		if (naturalW <= 0 || naturalH <= 0 || availW <= 0 || availH <= 0) return;

		if (mode === 'fit-width') {
			fitScale = availW / naturalW;
		} else {
			fitScale = Math.min(availW / naturalW, availH / naturalH);
		}
	}

	// Track the pages column's natural size via a ResizeObserver so the wrapper
	// dimensions and fit scales stay correct as content reflows (stream resolves,
	// study switches, pagination changes the number of pages, etc.).
	$effect(() => {
		if (typeof window === 'undefined' || !pagesInnerEl) return;
		const ro = new ResizeObserver(() => {
			lastNaturalWidth = pagesInnerEl.offsetWidth;
			lastNaturalHeight = pagesInnerEl.offsetHeight;
			recomputeFitScale();
		});
		ro.observe(pagesInnerEl);
		// Seed an initial measurement immediately.
		lastNaturalWidth = pagesInnerEl.offsetWidth;
		lastNaturalHeight = pagesInnerEl.offsetHeight;
		recomputeFitScale();
		return () => ro.disconnect();
	});

	// Recompute the fit scale whenever the zoom mode changes (e.g. the user picks
	// Fit Width / Fit Study) so it snaps to the right size right away.
	$effect(() => {
		$toolbarState.documentZoomMode;
		$toolbarState.documentZoomLevel;
		if (typeof window === 'undefined') return;
		tick().then(() => recomputeFitScale());
	});


	// Keep fit modes responsive to viewport size changes.
	onMount(() => {
		if (typeof window === 'undefined') return;
		let raf = 0;
		const onResize = () => {
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(() => recomputeFitScale());
		};
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', onResize);
		};
	});


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

		// Precompute each flow item's laid-out top/bottom offset (relative to the
		// measure layer's top). Cached in arrays — rather than read inline — so that
		// after peeling orphaned intro items onto a new page (keep-with-next, below)
		// we can recompute that page's starting offset from the first moved item.
		const tops = /** @type {number[]} */ (new Array(nodes.length));
		const bottoms = /** @type {number[]} */ (new Array(nodes.length));
		for (let i = 0; i < nodes.length; i++) {
			const rect = nodes[i].getBoundingClientRect();
			tops[i] = rect.top - containerTop;
			bottoms[i] = rect.bottom - containerTop;
		}

		// KEEP-WITH-NEXT: lightweight "intro" flow items must never be left stranded
		// as the last thing on a page while the content they introduce flows onto the
		// next page (which, since every .page is a full sheet tall, would show as a
		// near-empty page of white space). Flag those kinds: the study header, passage
		// references, the column/section structural dividers (segment dividers live
		// INSIDE a `block` flow item, so divider-typed blocks count too), and the
		// Connections title.
		//
		// The header is included so that when the VERY FIRST content block overflows
		// (the only time the header can be a page's trailing item — nothing but the
		// header + intros precede that block), the whole lead group stays WITH the
		// block instead of the header being orphaned on a near-empty first page. In
		// that case every item on the page is keep-with-next, so the `keep === 0`
		// branch below keeps them together and lets the tall block share their page.
		const isKeepWithNext = (idx) => {
			const item = flowItems[idx];
			if (!item) return false;
			if (
				item.kind === 'header' ||
				item.kind === 'passage-ref' ||
				item.kind === 'connections-title'
			)
				return true;
			if (item.kind === 'block') {
				const t = item.block?.type;
				return t === 'column-start' || t === 'section-start';
			}
			return false;
		};

		// FORCES-BREAK: items that must ALWAYS begin a fresh page (mirroring the
		// print rule `break-before: page`). A passage-ref carries `forceBreak` for
		// every passage after the first; a column-start carries it for every column
		// after the first in its passage. When such an item is reached and the
		// current page already holds content, the page is flushed and the item
		// starts a new one — so passages and columns each open at the top of a sheet.
		const forcesBreak = (idx) => {
			const item = flowItems[idx];
			if (!item) return false;
			if (item.kind === 'passage-ref') return !!item.forceBreak;
			if (item.kind === 'block' && item.block?.type === 'column-start')
				return !item.block.firstInPassage;
			return false;
		};


		/** @type {number[][]} */
		const newPages = [];
		/** @type {number[]} */
		let current = [];
		let pageStartTop = null;

		for (let i = 0; i < nodes.length; i++) {
			const top = tops[i];
			const bottom = bottoms[i];

			if (pageStartTop === null) pageStartTop = top;

			// FORCED PAGE BREAK: a passage (after the first) or a column (after the
			// first in its passage) must open at the top of a fresh page. If the
			// current page already holds content, flush it and start this item on a
			// new page. Take this branch BEFORE the overflow check so the break is
			// honored even when the item would otherwise fit on the current page.
			if (current.length && forcesBreak(i)) {
				newPages.push(current);
				current = [i];
				pageStartTop = top;
				continue;
			}

			if (current.length && bottom - pageStartTop > pageContentHeight) {
				// Item `i` overflows the current page. Before breaking, peel any trailing
				// keep-with-next intro items off the end of the current page so they
				// travel onto the new page WITH the content they introduce.
				let keep = current.length;
				while (keep > 0 && isKeepWithNext(current[keep - 1])) keep--;

				if (keep === 0) {
					// The current page holds ONLY intro items (e.g. a section divider that
					// just opened a fresh page, now followed by an oversized segment block).
					// Breaking here would orphan those intros on an otherwise empty page, so
					// instead keep them and let the tall item share their page — it simply
					// overflows the sheet, as oversized blocks always have.
					current.push(i);
				} else {
					const moved = current.slice(keep);
					current = current.slice(0, keep);
					newPages.push(current);
					current = [...moved, i];
					pageStartTop = moved.length ? tops[moved[0]] : top;
				}
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
		// The verse-notation / paragraph-break toggles hide their inline markers via
		// CSS (not by changing flowItems), but hiding them changes the measured height
		// of the passage text — so re-paginate when either flips, or the page breaks
		// would be computed against stale heights.
		$toolbarState.documentVersesVisible;
		$toolbarState.documentParagraphBreaksVisible;
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


	/* ============================================================
	   IN-PLACE HEADING EDITING — Heading One/Two/Three are editable directly in
	   the document. Clicking a segment "activates" it (mirroring the Analyze view's
	   setActiveSegment flow) so the toolbar's Markup menu lights up its Heading
	   One/Two/Three items; choosing one inserts an empty, focused heading inline.
	   Existing headings are contenteditable and save on blur. All edits persist via
	   the shared POST /api/passages/segments/heading endpoint, then re-load via
	   invalidate('app:studies') so the document re-paginates against the new text.
	   ============================================================ */

	// The segment id whose headings are currently being edited / is active for the
	// Markup menu. A subtle highlight marks it; clicking elsewhere clears it.
	let activeDocSegmentId = $state(/** @type {string | null} */ (null));

	// The column / section id currently selected via the left-margin selector buttons
	// (the rounded-square Column control and the circular Section control). At most one
	// of activeDocSegmentId / activeDocColumnId / activeDocSectionId is set at a time —
	// selecting any structural level clears the others — so the toolbar's Split/Join
	// Column / Section / Segment buttons enable against exactly one active item.
	let activeDocColumnId = $state(/** @type {string | null} */ (null));
	let activeDocSectionId = $state(/** @type {string | null} */ (null));

	/* ============================================================
	   IN-PLACE COMMENTARY EDITING — clicking any commentary section (segment-level
	   commentary, a heading's commentary, or a connection's commentary) "activates"
	   it: the static read-only render is swapped for an inline Tiptap editor, and the
	   universal commentary toolbar at the top of the page (DocumentCommentaryToolbar)
	   drives that editor via the commentaryToolbar bus. At most ONE commentary section
	   is editable at a time — activating another (or clicking away / Escape) saves and
	   tears down the previous one. The active section is identified by a stable key of
	   `subjectType:subjectId` so the same id can't collide across the three subject
	   kinds (segment / heading / connection).
	   ============================================================ */
	let activeCommentaryKey = $state(/** @type {string | null} */ (null));

	/** @param {string} type @param {string} id */
	const commentaryKey = (type, id) => `${type}:${id}`;
	/** @param {string} type @param {string} id */
	const isActiveCommentary = (type, id) => activeCommentaryKey === commentaryKey(type, id);

	/**
	 * Make a commentary section editable. Setting the key deactivates whatever was
	 * previously active (its editor flushes + saves on teardown), so only one editor
	 * is ever mounted. No-op if the section is already active (idempotent click).
	 * @param {string} type @param {string} id
	 */
	function activateCommentary(type, id) {
		if (!id) return;
		activeCommentaryKey = commentaryKey(type, id);
	}

	/** Drop the active commentary section (click-away / Escape), tearing down its editor. */
	function clearActiveCommentary() {
		activeCommentaryKey = null;
	}

	/** Re-load the study after a commentary save so the document re-paginates. */
	function handleCommentarySaved() {
		invalidate('app:studies');
	}



	// Per-(segment, headingType) "newly inserted, awaiting first input" flags. When a
	// heading is inserted from the Markup menu it has no stored text yet, so the
	// template renders an empty editable element for it; this set tells the template
	// which (segmentId|type) pairs to render even though their block.headingX is null.
	let pendingHeadings = $state(/** @type {Set<string>} */ (new Set()));

	const pendingKey = (segmentId, type) => `${segmentId}|${type}`;

	/**
	 * Look up the raw (un-nulled) segment record for a given id across all passages,
	 * so we can read its true heading presence even when a toggle has hidden them in
	 * the rendered blocks. Returns null when not found / not yet streamed.
	 * @param {string} segmentId
	 */
	function findRawSegment(segmentId) {
		for (const passageText of data.passagesWithText ?? []) {
			for (const seg of flattenSegments(passageText)) {
				if (seg.id === segmentId) return /** @type {any} */ (seg);
			}
		}
		return null;
	}

	/**
	 * Determine whether a segment is the FIRST segment in its passage. Mirrors the
	 * Analyze view's `isFirstSegment` computation: the first segment of a passage has
	 * nothing before it to join to, so Join Segment must disable for it. Walks each
	 * passage's flattened (reading-order) segments and compares the leading id.
	 * @param {string} segmentId
	 * @returns {boolean}
	 */
	function isFirstSegmentInPassage(segmentId) {
		for (const passageText of data.passagesWithText ?? []) {
			const segments = flattenSegments(passageText);
			if (!segments.length) continue;
			// Only the passage that CONTAINS this segment is decisive; once found, stop.
			if (segments.some((seg) => seg.id === segmentId)) {
				return segments[0].id === segmentId;
			}
		}
		return false;
	}

	/**
	 * Determine whether a column is the FIRST column in its passage. The first column
	 * has nothing before it to join to, so Join Column must disable for it. Walks each
	 * passage's structure.columns and compares the leading column id.
	 * @param {string} columnId
	 * @returns {boolean}
	 */
	function isFirstColumnInPassage(columnId) {
		for (const passageText of data.passagesWithText ?? []) {
			const cols = passageText?.structure?.columns;
			if (!cols?.length) continue;
			if (cols.some((c) => c.id === columnId)) {
				return cols[0].id === columnId;
			}
		}
		return false;
	}

	/**
	 * Determine whether a section is the FIRST section in its passage (across all of
	 * the passage's columns, in reading order). The first section has nothing before
	 * it to join to, so Join Section must disable for it. Mirrors the Analyze view's
	 * first-section handling.
	 * @param {string} sectionId
	 * @returns {boolean}
	 */
	function isFirstSectionInPassage(sectionId) {
		for (const passageText of data.passagesWithText ?? []) {
			const cols = passageText?.structure?.columns;
			if (!cols?.length) continue;
			const sections = [];
			for (const column of cols) {
				for (const section of column.sections ?? []) sections.push(section);
			}
			if (!sections.length) continue;
			if (sections.some((s) => s.id === sectionId)) {
				return sections[0].id === sectionId;
			}
		}
		return false;
	}

	/**
	 * Select a COLUMN via its left-margin rounded-square selector. Toggles: clicking
	 * the already-selected column clears the selection. Selecting a column clears any
	 * active segment / word / section selection (only one structural level is active
	 * at a time) and pushes the column into the shared toolbar store so the Markup
	 * menu's Split/Join Column buttons enable correctly.
	 * @param {string} columnId
	 */
	function selectColumn(columnId) {
		if (activeDocColumnId === columnId) {
			clearStructuralSelection();
			return;
		}
		// Clear the other structural levels — only one is ever active at a time.
		activeDocSegmentId = null;
		activeDocSectionId = null;
		selectedWord = null;
		suppressHoverCaret = null;
		setActiveSegment(false);
		setActiveSection(false);
		activeDocColumnId = columnId;
		setActiveColumn(true, columnId, isFirstColumnInPassage(columnId), [columnId]);
	}

	/**
	 * Select a SECTION via its left-margin circular selector. Toggles: clicking the
	 * already-selected section clears the selection. Selecting a section clears any
	 * active segment / word / column selection and pushes the section into the shared
	 * toolbar store so the Markup menu's Split/Join Section buttons enable correctly.
	 * @param {string} sectionId
	 */
	function selectSection(sectionId) {
		if (activeDocSectionId === sectionId) {
			clearStructuralSelection();
			return;
		}
		activeDocSegmentId = null;
		activeDocColumnId = null;
		selectedWord = null;
		suppressHoverCaret = null;
		setActiveSegment(false);
		setActiveColumn(false);
		activeDocSectionId = sectionId;
		setActiveSection(true, sectionId, isFirstSectionInPassage(sectionId), [sectionId]);
	}

	/**
	 * Clear any column/section selection made via the left-margin selectors, dropping
	 * the highlight and telling the toolbar nothing structural is active so the
	 * Split/Join Column / Section buttons disable again.
	 */
	function clearStructuralSelection() {
		activeDocColumnId = null;
		activeDocSectionId = null;
		setActiveColumn(false);
		setActiveSection(false);
	}



	/**
	 * Push the active segment's heading/note presence into the shared toolbar store
	 * so the Markup menu enables/disables Heading One/Two/Three correctly. Pending
	 * (just-inserted) headings count as present so the menu can't insert a duplicate.
	 * @param {string | null} segmentId
	 */
	function syncActiveSegment(segmentId) {
		if (!segmentId) {
			setActiveSegment(false);
			return;
		}
		// The Document view never selects a column or section (there's no UI for it),
		// so force those flags off here. Otherwise a stale hasActiveSection /
		// hasActiveColumn carried over from the Analyze view would survive into the
		// Document view and wrongly enable Join Section while only a segment is active.
		setActiveSection(false);
		setActiveColumn(false);
		const seg = findRawSegment(segmentId);
		setActiveSegment(true, segmentId, {
			hasHeadingOne: !!seg?.headingOne || pendingHeadings.has(pendingKey(segmentId, 'one')),
			hasHeadingTwo: !!seg?.headingTwo || pendingHeadings.has(pendingKey(segmentId, 'two')),
			hasHeadingThree: !!seg?.headingThree || pendingHeadings.has(pendingKey(segmentId, 'three')),
			hasNote: !!seg?.note,
			// The first segment of a passage has nothing before it to join to, so Join
			// Segment must disable for it (matches the Analyze view's isFirst handling).
			isFirst: isFirstSegmentInPassage(segmentId)
		});
	}


	/**
	 * Activate a segment (click on its text/headings). Marks it active for the
	 * Markup menu and shows the subtle highlight. Re-clicking the same segment keeps
	 * it active (idempotent).
	 * @param {string} segmentId
	 */
	function activateSegment(segmentId) {
		activeDocSegmentId = segmentId;
		syncActiveSegment(segmentId);
	}

	/**
	 * Clear the active segment (click on empty gutter / Escape). Drops the highlight
	 * and tells the toolbar nothing is active so the Markup items disable again.
	 * Also clears any word-level selection so the two stay in sync.
	 */
	function clearActiveSegment() {
		activeDocSegmentId = null;
		setActiveSegment(false);
		// Keep section/column flags off — the Document view never selects them, so a
		// stale flag must never linger to wrongly enable Join Section / Join Column.
		setActiveSection(false);
		setActiveColumn(false);
		selectedWord = null;
		suppressHoverCaret = null;
	}


	/* ============================================================
	   WORD SELECTION — reuses the Analyze view's data-word-id-based logic.
	   ------------------------------------------------------------
	   The passage HTML rendered here already wraps every word in a
	   `.selectable-word` span (via the shared extractSegmentText helper), so the
	   words just need handlers + state to become interactive. State and handlers
	   mirror the Analyze page exactly: hovering shows a caret, and the click cycle
	   is before → after → deselect (Shift+Click jumps straight to "after").

	   Selecting a word ALSO activates its segment (the passage-text div's onclick
	   calls activateSegment alongside handleWordClick), matching the requirement
	   that selecting a single word makes its segment active.

	   Because each block is rendered TWICE (the off-screen measure layer + the
	   visible pages), the attribute-stamping effect uses querySelectorAll so both
	   copies of the selected word reflect the state; the measure layer is
	   pointer-events:none so only the visible copy ever fires the handlers.
	   ============================================================ */
	let hoveredWord = $state(/** @type {{ passageIndex: number, wordId: string } | null} */ (null));
	let selectedWord = $state(
		/** @type {{ passageIndex: number, wordId: string, position: 'before'|'after' } | null} */ (null)
	);
	let suppressHoverCaret = $state(/** @type {{ passageIndex: number, wordId: string } | null} */ (null));

	/**
	 * Track the hovered word so its caret can render.
	 * @param {MouseEvent} event
	 */
	function handleWordHover(event) {
		const target = /** @type {HTMLElement} */ (event.target);
		if (target?.classList?.contains('selectable-word')) {
			hoveredWord = {
				passageIndex: parseInt(target.dataset.passageIndex || '0'),
				wordId: target.dataset.wordId || ''
			};
		}
	}

	/** Clear hover state (and the post-deselect caret suppression) on mouse-out. */
	function handleWordHoverEnd() {
		hoveredWord = null;
		suppressHoverCaret = null;
	}

	/**
	 * Three-state word selection (click 1 → before, click 2 same word → after,
	 * click 3 same word → deselect; Shift+Click → straight to "after"). Mirrors the
	 * Analyze view's handleWordClick.
	 * @param {MouseEvent} event
	 */
	function handleWordClick(event) {
		const target = /** @type {HTMLElement} */ (event.target);
		if (!target?.classList?.contains('selectable-word')) return;

		const passageIndex = parseInt(target.dataset.passageIndex || '0');
		const wordId = target.dataset.wordId || '';
		const isShiftKey = event.shiftKey;
		const isSameWord = selectedWord?.passageIndex === passageIndex && selectedWord?.wordId === wordId;

		if (isShiftKey) {
			selectedWord = { passageIndex, wordId, position: 'after' };
			suppressHoverCaret = null;
		} else if (isSameWord) {
			if (selectedWord.position === 'before') {
				selectedWord = { passageIndex, wordId, position: 'after' };
				suppressHoverCaret = null;
			} else {
				selectedWord = null;
				suppressHoverCaret = { passageIndex, wordId };
			}
		} else {
			selectedWord = { passageIndex, wordId, position: 'before' };
			suppressHoverCaret = null;
		}
	}

	// Stamp data-selected / data-position / data-suppress-hover-caret onto the
	// matching word span(s) whenever the selection changes. Re-runs after the DOM
	// settles (tick) and also when the rendered content/pagination changes so the
	// attributes survive re-renders. Uses querySelectorAll because the same word
	// exists in both the measure layer and the visible pages.
	$effect(() => {
		if (typeof document === 'undefined') return;
		// Touch deps so the effect re-runs on selection AND content/layout changes.
		selectedWord;
		suppressHoverCaret;
		flowItems;
		pages;

		tick().then(() => {
			document.querySelectorAll('.selectable-word').forEach((word) => {
				word.removeAttribute('data-selected');
				word.removeAttribute('data-position');
				word.removeAttribute('data-suppress-hover-caret');
			});

			if (selectedWord) {
				document
					.querySelectorAll(
						`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
					)
					.forEach((el) => {
						el.setAttribute('data-selected', 'true');
						el.setAttribute('data-position', selectedWord.position);
					});
			}

			if (suppressHoverCaret) {
				document
					.querySelectorAll(
						`.selectable-word[data-passage-index="${suppressHoverCaret.passageIndex}"][data-word-id="${suppressHoverCaret.wordId}"]`
					)
					.forEach((el) => el.setAttribute('data-suppress-hover-caret', 'true'));
			}
		});
	});

	// Mirror the Analyze view's Split/Join button enabling: push the word-selection
	// flags to the shared toolbar store so getPassageToolbarConfig's disabledCheck
	// rules light up the same way on the Document view. hasActiveSegment (driving
	// Join Segment, Split/Join Section, Join Column) is already synced via
	// activateSegment / clearActiveSegment; these two effects add the remaining
	// word-driven flags: hasWordSelection (Split Segment) and canInsertColumn
	// (Split Column).
	$effect(() => {
		setWordSelection(selectedWord !== null);
	});

	// Validate Split Column availability based on word selection — lifted verbatim
	// from the Analyze view. Split Column is enabled only when the selection marks a
	// valid mid-column insertion point (not the first word of a column, not after the
	// last word). Uses the same `.selectable-word` DOM + structure.columns the
	// Document page already renders.
	$effect(() => {
		if (!selectedWord || !data.passagesWithText || data.passagesWithText.length === 0) {
			setCanInsertColumn(false);
			return;
		}

		const passageText = data.passagesWithText[selectedWord.passageIndex];
		if (!passageText || !passageText.structure || !passageText.structure.columns) {
			setCanInsertColumn(false);
			return;
		}

		// Get the insertion word ID based on position
		let insertionWordId = null;
		if (selectedWord.position === 'before') {
			// Before: use current word's ID directly
			insertionWordId = selectedWord.wordId;
		} else {
			// After: need to find next word's ID
			const wordElement = document.querySelector(
				`.selectable-word[data-passage-index="${selectedWord.passageIndex}"][data-word-id="${selectedWord.wordId}"]`
			);

			if (wordElement) {
				// Find next word sibling in the DOM
				let nextElement = /** @type {HTMLElement | null} */ (wordElement.nextElementSibling);
				while (nextElement) {
					if (nextElement.classList.contains('selectable-word')) {
						insertionWordId = nextElement.dataset.wordId;
						break;
					}
					nextElement = /** @type {HTMLElement | null} */ (nextElement.nextElementSibling);
				}

			}
		}

		if (!insertionWordId) {
			// No valid insertion point (e.g., after last word)
			setCanInsertColumn(false);
			return;
		}

		// Check if insertion point is at the beginning of a column
		const columns = passageText.structure.columns;
		for (const column of columns) {
			if (column.startingWordId === insertionWordId) {
				// Cannot insert at column start
				setCanInsertColumn(false);
				return;
			}
		}

		// Valid insertion point
		setCanInsertColumn(true);
	});



	/**
	 * Persist a heading edit for a segment. Empty text removes the heading. Re-loads
	 * the study afterward so the rendered document reflects the new text and the
	 * pagination is recomputed against it.
	 * @param {string} segmentId
	 * @param {'one'|'two'|'three'} headingType
	 * @param {string} text
	 */
	async function saveHeading(segmentId, headingType, text) {
		const headingText = (text ?? '').trim();
		try {
			await fetch('/api/passages/segments/heading', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ segmentId, headingType, headingText })
			});
			// Clear the pending flag now that the row is persisted (or removed).
			pendingHeadings.delete(pendingKey(segmentId, headingType));
			pendingHeadings = new Set(pendingHeadings);
			await invalidate('app:studies');
			// Refresh the toolbar's view of this segment's headings after the reload.
			if (activeDocSegmentId === segmentId) syncActiveSegment(segmentId);
		} catch (error) {
			console.error('Error saving heading:', error);
		}
	}

	/**
	 * Blur handler for an editable heading: read the element's text and persist it.
	 * @param {FocusEvent} event
	 * @param {string} segmentId
	 * @param {'one'|'two'|'three'} headingType
	 */
	function handleHeadingBlur(event, segmentId, headingType) {
		const el = /** @type {HTMLElement} */ (event.currentTarget);
		saveHeading(segmentId, headingType, el.textContent ?? '');
	}

	/**
	 * Keydown handler for an editable heading: Enter commits (blur), Escape cancels
	 * (restore original text, blur without saving).
	 * @param {KeyboardEvent} event
	 * @param {string} original
	 */
	function handleHeadingKeydown(event, original) {
		const el = /** @type {HTMLElement} */ (event.currentTarget);
		if (event.key === 'Enter') {
			event.preventDefault();
			el.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			el.textContent = original ?? '';
			el.blur();
		}
	}




	// Listen for the Markup menu's "insert heading" events. Each inserts an empty,
	// pending heading on the active segment and focuses it for typing. Mirrors the
	// Analyze page's handleInsertHeading*FromMenuEvent handlers, but tailored to the
	// document's inline editing.
	onMount(() => {
		if (typeof window === 'undefined') return;

		const insert = (type) => {
			const segmentId = activeDocSegmentId;
			if (!segmentId) return;
			// Mark this heading pending so the template renders an empty editable for it.
			pendingHeadings.add(pendingKey(segmentId, type));
			pendingHeadings = new Set(pendingHeadings);
			syncActiveSegment(segmentId);
			// Focus the new editable once it renders.
			tick().then(() => {
				// Scope to the VISIBLE pages so we never focus the off-screen,
				// pointer-events:none measure-layer copy of the same heading.
				const el = document.querySelector(
					`.pages-inner [data-doc-heading="${segmentId}|${type}"]`
				);
				if (el instanceof HTMLElement) {
					el.focus();
					// Place caret inside the empty element.
					const range = document.createRange();
					range.selectNodeContents(el);
					range.collapse(false);
					const sel = window.getSelection();
					sel?.removeAllRanges();
					sel?.addRange(range);
				}
			});
		};

		const onOne = () => insert('one');
		const onTwo = () => insert('two');
		const onThree = () => insert('three');

		window.addEventListener('insert-heading-one-from-menu', onOne);
		window.addEventListener('insert-heading-two-from-menu', onTwo);
		window.addEventListener('insert-heading-three-from-menu', onThree);

		return () => {
			window.removeEventListener('insert-heading-one-from-menu', onOne);
			window.removeEventListener('insert-heading-two-from-menu', onTwo);
			window.removeEventListener('insert-heading-three-from-menu', onThree);
		};
	});

	// Click-outside to deselect: a pointerdown anywhere that ISN'T on an editable
	// segment text / heading (and isn't in the toolbar, whose Markup menu acts on the
	// active segment) clears the active segment so its highlight drops and the Markup
	// items disable again. Editable elements are matched via closest() so clicking
	// within a selected segment (or its headings) keeps it active. Capture phase so it
	// runs before the segment/heading click handlers re-activate.
	onMount(() => {
		if (typeof window === 'undefined') return;

		const onDocPointerDown = (event) => {
			const target = /** @type {Element | null} */ (event.target);

			// COMMENTARY: a pointerdown outside the active commentary section AND outside
			// the universal commentary toolbar (and its popovers) deactivates the editor,
			// flushing/saving its edits. Clicks INSIDE the editable section or the toolbar
			// keep it active so the user can type and run toolbar commands.
			if (activeCommentaryKey) {
				if (
					!target?.closest?.(
						'.doc-commentary-editable, .doc-commentary-toolbar, .link-popover, .glossary-picker, [class*="popover"]'
					)
				) {
					clearActiveCommentary();
				}
			}

			// Nothing selected (segment OR structural column/section) → nothing more to clear.
			if (!activeDocSegmentId && !activeDocColumnId && !activeDocSectionId) return;
			if (
				target?.closest?.(
					'.passage-text-editable, .doc-heading-editable, .doc-selector, .toolbar, [class*="toolbar"], [class*="menu"]'
				)
			) {
				return;
			}
			clearActiveSegment();
			clearStructuralSelection();
		};

		// Escape clears the active segment, any word selection, the active commentary
		// editor, AND any structural (column/section) selection, mirroring Analyze.
		const onKeyDown = (event) => {
			if (event.key === 'Escape') {
				hoveredWord = null;
				clearActiveCommentary();
				clearActiveSegment();
				clearStructuralSelection();
			}
		};


		document.addEventListener('pointerdown', onDocPointerDown, true);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onDocPointerDown, true);
			window.removeEventListener('keydown', onKeyDown);
		};
	});


	// On ENTRY, force the section/column selection flags off: the Document view has no
	// section/column selection UI, so a stale hasActiveSection / hasActiveColumn carried
	// over from the Analyze view must not survive to wrongly enable Join Section / Join
	// Column here. (syncActiveSegment / clearActiveSegment also keep these off, but those
	// only run once the user interacts — this clears the carried-over state immediately.)
	//
	// On TEARDOWN, clear the active segment AND the word-selection flags so the Markup /
	// Split-Join buttons don't stay enabled against a segment or selection that's no
	// longer mounted (e.g. switching views). Mirrors the flags the effects above push
	// while the page is live.
	onMount(() => {
		setActiveSection(false);
		setActiveColumn(false);
		return () => {
			setActiveSegment(false);
			setWordSelection(false);
			setCanInsertColumn(false);
			setActiveSection(false);
			setActiveColumn(false);
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

<!-- Reusable commentary renderer: shared by segment-level commentary (the `aside`
     block) and per-heading commentary (Heading One/Two/Three). Renders the
     commentary body via {@html}, surfaces its footnotes as a renumbered ordered
     list, and reflects any inline glossary terms as a read-only tags strip —
     identical treatment everywhere commentary appears. `scope` is appended as a
     modifier class so callers can tune spacing per context. -->
{#snippet commentaryContent(html, scope, interactive = false, subjectType = null, subjectId = null)}
	{#if interactive && subjectId}
		<!-- INTERACTIVE (visible pages only): clicking the section makes it editable;
		     the universal toolbar at the top of the page then drives its inline editor.
		     A light-blue hover border + solid-blue active border match the segment /
		     heading affordances. Only the visible pages pass interactive=true — the
		     off-screen measure layer renders the static branch below so it never mounts
		     a second editor for the same subject. -->
		<div
			class="doc-commentary doc-commentary-{scope} doc-commentary-editable"
			class:active={isActiveCommentary(subjectType, subjectId)}
			role="button"
			tabindex="0"
			onclick={() => activateCommentary(subjectType, subjectId)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					activateCommentary(subjectType, subjectId);
				}
			}}
		>
			<DocumentCommentaryEditor
				{subjectType}
				{subjectId}
				content={html}
				active={isActiveCommentary(subjectType, subjectId)}
				{scope}
				onSaved={handleCommentarySaved}
			/>
		</div>
	{:else}
		{@const rendered = renderCommentaryWithFootnotes(html)}
		<div class="doc-commentary doc-commentary-{scope}">
			<div class="doc-commentary-body">{@html rendered.html}</div>
			{#if rendered.footnotes.length > 0}
				<ol class="doc-footnotes">
					{#each rendered.footnotes as footnote (footnote.number)}
						<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
					{/each}
				</ol>
			{/if}
			<!-- Glossary terms used inline here are no longer reflected per-commentary;
			     they are collected into a single universal "Tags" section at the end of
			     the document (see the tags flow item / tagsContent snippet). -->
		</div>
	{/if}
{/snippet}


<!-- Reusable single-connection card: renders one connection's "Connection:
     fromRef → toRef" label, its quick note, and its commentary (with footnotes).
     Glossary terms used inline are collected into the universal "Tags" section at
     the end of the document. Shared by the end-of-document Connections appendix. -->
{#snippet connectionCard(conn, interactive = false)}
	<div class="doc-connection doc-connection-appendix">

		<p class="doc-ref-line doc-connection-ref">
			<span class="doc-ref-label">Connection:</span>
			<span class="doc-connection-from">{conn.fromRef ?? '—'}</span>
			<span class="doc-connection-arrow"> → </span>
			<span class="doc-connection-to">{conn.toRef ?? '—'}</span>
		</p>
		<!-- Connection KIND — names the structural level of each endpoint
		     (e.g. "Segment → Segment", "Column → Segment") so the reader knows
		     what's being linked, not just which references. Capitalized via the
		     formatConnectionType helper; falls back to an em dash if a type is
		     missing. -->
		{#if conn.fromType || conn.toType}
			<p class="doc-connection-type">
				{formatConnectionType(conn.fromType)}
				<span class="doc-connection-arrow"> → </span>
				{formatConnectionType(conn.toType)}
			</p>
		{/if}

		{#if conn.note}
			<p class="doc-connection-note">{conn.note}</p>
		{/if}
		{#if interactive}
			<!-- Connection commentary is click-to-edit on the visible pages: clicking it
			     mounts the inline editor (PATCHes /api/segments/connections/:id) driven by
			     the universal toolbar. The measure layer passes interactive=false so it
			     renders the static branch below. -->
			<div
				class="doc-connection-commentary-editable doc-commentary-editable"
				class:active={isActiveCommentary('connection', conn.key)}
				role="button"
				tabindex="0"
				onclick={() => activateCommentary('connection', conn.key)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						activateCommentary('connection', conn.key);
					}
				}}
			>
				<DocumentCommentaryEditor
					subjectType="connection"
					subjectId={conn.key}
					content={conn.commentary ?? ''}
					active={isActiveCommentary('connection', conn.key)}
					scope="connection"
					variant="connection"
					placeholder="Add connection commentary"
					onSaved={handleCommentarySaved}
				/>
			</div>
		{:else if conn.commentary}
			<!-- Connection commentary carries footnotes too; surface them the
			     same way as the commentary above. -->
			{@const connRendered = renderCommentaryWithFootnotes(conn.commentary)}
			<div class="doc-connection-commentary">{@html connRendered.html}</div>
			{#if connRendered.footnotes.length > 0}
				<ol class="doc-footnotes doc-footnotes-connection">
					{#each connRendered.footnotes as footnote (footnote.number)}
						<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
					{/each}
				</ol>
			{/if}
		{/if}
	</div>
{/snippet}


<!-- Universal Tags section: a single read-only reflection of EVERY glossary term
     used inline anywhere in the study's commentary, consolidated at the end of the
     document (replaces the per-commentary tags strips). Mirrors the Connections
     appendix: a "Tags" title line followed by the bordered box of GlossaryBadge
     pills. -->
{#snippet tagsContent(termIds)}
	<p class="doc-ref-line doc-passage-ref doc-tags-title">Tags</p>
	<div class="doc-tags">
		<div class="doc-tags-list">
			{#each termIds as termId (termId)}
				<GlossaryBadge {termId} removable={false} />
			{/each}
		</div>
	</div>
{/snippet}


{#snippet blockContent(block, interactive = false)}

	{#if block.type === 'column-start'}


		<!-- Column break: each column (after the first in its passage) begins on a
		     fresh page, and is introduced by a horizontal rule (like sections). The
		     marker carries the page-break class so the print/PDF paginator breaks
		     before it; the first column of a passage is already at the top of the
		     passage's new page, so it doesn't break — but it still gets a rule, with
		     its top margin zeroed (see .doc-column-break.first .doc-column-rule) so
		     the column's content starts flush with the left-margin selectors.

		     The rounded-square SELECTOR button rides in the page's left margin
		     (absolutely positioned), mirroring the Analyze view's ToolbarColumn
		     control so the Markup menu's Split/Join Column buttons can act on this
		     column. Screen-only — it's hidden in print. -->
		<div
			class="doc-column-break"
			class:first={block.firstInPassage}
			class:doc-break-before={!block.firstInPassage}
		>
			<hr class="doc-column-rule" />
			<button
				type="button"
				class="doc-selector doc-selector-column"
				class:active={activeDocColumnId === block.id}
				title="Select Column"
				aria-label="Select Column"
				aria-pressed={activeDocColumnId === block.id}
				onclick={(e) => {
					e.stopPropagation();
					selectColumn(block.id);
				}}
			></button>
		</div>
	{:else if block.type === 'section-start'}
		<!-- Section divider: a plain horizontal rule shown above EVERY section,
		     including the first one in a column (which sits at the top of the
		     column's fresh page). The first-in-column rule drops its top margin
		     (see .doc-section-marker.first .doc-section-rule) so the column's
		     content still starts flush with the left-margin selectors. The circular
		     SELECTOR button rides in the page's left margin (absolutely positioned),
		     mirroring the Analyze view's ToolbarSection control so the Markup menu's
		     Split/Join Section buttons can act on this section. Screen-only — hidden
		     in print. -->
		<div class="doc-section-marker" class:first={block.firstInColumn}>
			<hr class="doc-section-rule" />
			<button
				type="button"
				class="doc-selector doc-selector-section"
				class:first={block.firstInColumn}
				class:active={activeDocSectionId === block.id}
				title="Select Section"
				aria-label="Select Section"
				aria-pressed={activeDocSectionId === block.id}
				onclick={(e) => {
					e.stopPropagation();
					selectSection(block.id);
				}}
			></button>
		</div>
	{:else if block.type === 'aside'}

		<!-- Editorial commentary: segment-level (columns/sections no longer carry
		     their own commentary). Rendered as flowing body text directly beneath
		     the segment text it comments on, NOT as a boxed callout. Footnotes and
		     glossary tags are surfaced by the shared commentaryContent snippet. On the
		     visible pages it is click-to-edit (interactive); the measure layer renders
		     the static read-only branch. -->
		{@render commentaryContent(block.html, block.scope, interactive, 'segment', block.subjectId)}
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
						     same way as the commentary above. Glossary terms used inline are
						     collected into the universal "Tags" section at the document end. -->
						{@const connRendered = renderCommentaryWithFootnotes(conn.commentary)}
						<div class="doc-connection-commentary">{@html connRendered.html}</div>
						{#if connRendered.footnotes.length > 0}
							<ol class="doc-footnotes doc-footnotes-connection">
								{#each connRendered.footnotes as footnote (footnote.number)}
									<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
								{/each}
							</ol>
						{/if}
					{/if}
				</div>
			{/each}
		</div>

	{:else}
		<!-- Segment divider: a fixed 36px vertical space separates each segment from
		     the one before it. Suppressed for the first segment of a section, which
		     sits directly under that section's horizontal rule (no leading gap). -->
		{#if !block.firstInSection}
			<div class="doc-segment-space"></div>
		{/if}

		<!-- Each heading is followed by its OWN commentary (if any), so Heading One
		     commentary sits under Heading One, Heading Two commentary under Heading
		     Two, and Heading Three commentary under Heading Three. The shared
		     commentaryContent snippet renders the body, footnotes, and glossary tags
		     identically to segment/connection commentary.

		     Headings are EDITABLE IN PLACE: each is contenteditable so the author can
		     retype it; a hover affordance (dashed lower border) signals editability,
		     and edits persist on blur. A heading is rendered when it has stored text OR
		     when it's a freshly-inserted "pending" heading (from the Markup menu) for
		     this segment. -->
		{#if block.headingOne || pendingHeadings.has(pendingKey(block.id, 'one'))}
			<h3
				class="doc-heading doc-heading-one doc-heading-editable"
				class:doc-first-in-column={block.firstInColumn}
				data-doc-heading="{block.id}|one"


				contenteditable="true"
				role="textbox"
				tabindex="0"
				spellcheck="false"
				onblur={(e) => handleHeadingBlur(e, block.id, 'one')}


				onkeydown={(e) => handleHeadingKeydown(e, block.headingOne ?? '')}
			>{block.headingOne ?? ''}</h3>

			{#if block.headingOneCommentary}
				{@render commentaryContent(block.headingOneCommentary, 'heading-one', interactive, 'heading', block.headingOneId)}
			{/if}
		{/if}
		{#if block.headingTwo || pendingHeadings.has(pendingKey(block.id, 'two'))}
			<h4
				class="doc-heading doc-heading-two doc-heading-editable"
				class:doc-first-in-column={block.firstInColumn}
				data-doc-heading="{block.id}|two"


				contenteditable="true"
				role="textbox"
				tabindex="0"
				spellcheck="false"
				onblur={(e) => handleHeadingBlur(e, block.id, 'two')}


				onkeydown={(e) => handleHeadingKeydown(e, block.headingTwo ?? '')}
			>{block.headingTwo ?? ''}</h4>

			{#if block.headingTwoCommentary}
				{@render commentaryContent(block.headingTwoCommentary, 'heading-two', interactive, 'heading', block.headingTwoId)}
			{/if}
		{/if}
		{#if block.headingThree || pendingHeadings.has(pendingKey(block.id, 'three'))}
			<h5
				class="doc-heading doc-heading-three doc-heading-editable"
				class:doc-first-in-column={block.firstInColumn}
				data-doc-heading="{block.id}|three"


				contenteditable="true"
				role="textbox"
				tabindex="0"
				spellcheck="false"
				onblur={(e) => handleHeadingBlur(e, block.id, 'three')}


				onkeydown={(e) => handleHeadingKeydown(e, block.headingThree ?? '')}
			>{block.headingThree ?? ''}</h5>

			{#if block.headingThreeCommentary}
				{@render commentaryContent(block.headingThreeCommentary, 'heading-three', interactive, 'heading', block.headingThreeId)}
			{/if}
		{/if}
		<!-- Clicking the segment text activates this segment so the Markup menu can
		     add a heading to it. Clicking a single WORD additionally selects that word
		     (handleWordClick) while still activating the segment, mirroring the Analyze
		     view. onmouseover/onmouseleave drive the per-word hover caret. -->
		<div
			class="passage-text passage-text-editable"
			class:active={activeDocSegmentId === block.id}
			role="presentation"
			onmouseover={handleWordHover}
			onmouseleave={handleWordHoverEnd}
			onfocus={() => {}}
			onclick={(e) => {
				handleWordClick(e);
				activateSegment(block.id);
			}}
		>{@html block.html}</div>


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
{#snippet flowItemContent(item, interactive = false)}
	{#if item.kind === 'header'}
		{@render headerContent()}
	{:else if item.kind === 'passage-ref'}
		<!-- Passage reference — the top of the structural label family. Every
		     structural ref in the document is rendered as "Label: Reference"
		     (Passage / Column / Section / Segment / Connection) so the reading
		     document is navigable by location, matching the mockup. -->
		<p class="doc-ref-line doc-passage-ref" class:doc-break-before={item.forceBreak}>
			<span class="doc-ref-label">Passage:</span> {item.reference}
		</p>
	{:else if item.kind === 'block'}
		{@render blockContent(item.block, interactive)}
	{:else if item.kind === 'fallback-text'}
		<!-- Fallback: a passage with no usable structure renders whole, so text
		     is never lost (legacy/edge studies). -->
		<div class="passage-text">{@html item.html}</div>
	{:else if item.kind === 'error'}
		<div class="error-message">
			<p>Error loading {item.reference}: {item.error}</p>
		</div>
	{:else if item.kind === 'connections-title'}
		<!-- Leads off the end-of-document Connections appendix. Its own flow item so
		     the paginator can break before the appendix if it doesn't fit. -->
		<p class="doc-ref-line doc-passage-ref doc-connections-title">Connections</p>
	{:else if item.kind === 'connection'}
		<!-- One connection card in the appendix, rendered via the shared snippet so
		     it matches the inline treatment connections used to have. -->
		{@render connectionCard(item.connection, interactive)}
	{:else if item.kind === 'tags'}
		<!-- Universal Tags section — every glossary term used study-wide,
		     consolidated at the end of the document (after Connections, before the
		     copyright). Replaces the per-commentary tags strips. -->
		{@render tagsContent(item.termIds)}
	{:else if item.kind === 'copyright'}

		{@render copyrightContent()}
	{/if}
{/snippet}


<!-- The verse-notation / paragraph-break markers are inline in the passage HTML, so
     they're hidden with CSS rather than omitted from the flow items. The classes are
     placed on the gutter (which wraps BOTH the off-screen measure layer and the visible
     pages) so measurement and render stay in lock-step — pagination sees the same
     hidden markers the pages do. -->
<!-- The Document view is a vertical stack: the universal commentary toolbar pinned
     just below the app's main toolbar, then the scrollable page gutter beneath it.
     The toolbar drives whichever commentary section is currently editable (via the
     commentaryToolbar bus) and is disabled when none is. -->
<div class="document-view">
<DocumentCommentaryToolbar />
<div
	class="document-gutter"
	class:hide-verses={!$toolbarState.documentVersesVisible}
	class:hide-paragraph-breaks={!$toolbarState.documentParagraphBreaksVisible}
	bind:this={gutterEl}
>

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

		<!-- ZOOM WRAPPER — the toolbar's Zoom selection scales the visible pages via a
		     CSS transform on .pages-inner. The outer .pages-wrapper is given the scaled
		     width/height (natural size × scale) so the gutter reserves the right amount
		     of space and scrolling/centering stay correct; the inner is taken out of
		     flow and centered within it. The off-screen measure layer above is NOT
		     scaled, so pagination math (and print) is unaffected by zoom. -->
		<div class="pages-wrapper" style={wrapperDimensions}>
			<div
				class="pages-inner"
				bind:this={pagesInnerEl}
				style="transform: translateX(-50%) scale({currentScale}); transform-origin: top center;"
			>

				<!-- VISIBLE PAGES — one .page per packed group of flow items. Until the
				     measure layer has been measured (or during SSR), displayPages is a
				     single page holding everything, so content is never hidden. -->
				{#each displayPages as pageIndices, p (p)}
					<div class="page">
						{#each pageIndices as idx (flowItems[idx].id)}
							<div class="doc-flow-item">
								{@render flowItemContent(flowItems[idx], true)}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>

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


	/* The Document view stacks the universal commentary toolbar above the scrollable
	   page gutter. It fills the content area so the gutter can scroll independently
	   beneath the pinned toolbar. */
	.document-view {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}

	/* The gutter is the gray surface the pages float on (Google Docs style). It
	   fills the scroll container and centers the page column horizontally. */
	.document-gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--page-gap);
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gap) var(--page-gap) 6rem;
		background-color: var(--gray-900);
	}

	/* ============================================
	   EDITABLE COMMENTARY — clicking a commentary section makes it editable; the
	   universal toolbar at the top of the page then drives it. The affordance
	   mirrors the editable segment text / headings: a quiet light-blue border on
	   hover signals "click to edit", and a solid-blue border marks the section while
	   it's active (being edited). A transparent border is reserved at rest so the
	   border can appear without shifting the surrounding layout. Screen-only — these
	   affordances are stripped in print.
	   ============================================ */
	.doc-commentary-editable {
		cursor: pointer;
		border-radius: 0.3rem;
		padding: 0.4rem 0.6rem;
		margin-left: -0.6rem;
		margin-right: -0.6rem;
		border: 0.1rem solid transparent;
		transition: border-color 0.15s ease;
	}

	.doc-commentary-editable:hover {
		border-color: var(--blue-light);
	}

	.doc-commentary-editable.active,
	.doc-commentary-editable.active:hover {
		border-color: var(--blue);
		cursor: text;
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


	/* ============================================
	   ZOOM — scale the visible pages to the toolbar's Zoom selection.
	   --------------------------------------------
	   .pages-wrapper carries the SCALED dimensions (natural size × scale, set
	   inline from JS) so the gutter reserves the right amount of visual space and
	   the scroll area matches the zoomed content. .pages-inner is taken out of flow
	   and pinned to the wrapper's top-center, then scaled there via a CSS transform
	   (transform-origin: top center) so the page column grows/shrinks about its top
	   edge while staying horizontally centered in the gutter. The off-screen
	   measure layer is NOT inside this wrapper, so pagination math is unaffected.
	   ============================================ */
	.pages-wrapper {
		position: relative;
		/* The wrapper's explicit width/height come from the inline style; it must not
		   stretch in the column flex layout, so it sizes to those values exactly. */
		flex: 0 0 auto;
	}

	.pages-inner {
		position: absolute;
		top: 0;
		left: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--page-gap);
		/* The scale + horizontal centering are applied inline (transform), so the
		   inner lays its .page children out at natural size and the transform draws
		   them larger/smaller. The transition animates zoom changes smoothly, matching
		   the Analyze view (which transitions its own scaled .analyze-content-inner).
		   Only the changing scale animates; the constant translateX(-50%) centering
		   rides along unchanged. */
		transition: transform 0.2s ease-out;
	}





	/* Header block — left-aligned: study title, subtitle, and the passage
	   references + translation badge all hug the left margin of the page. The
	   bottom margin reproduces the gap the old `.document-content { margin-top }`
	   wrapper created between the header and the first passage content (the wrapper
	   itself is gone now that content is paginated into flow items). */
	.study-header {
		width: 100%;
		text-align: left;
		margin-bottom: 3.6rem;
	}



	/* Title — 1.6rem bold, near-black (docx sz32, #545352 → --gray-200). */
	.study-title {
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--black);
		line-height: 1.5;
		margin: 0;
	}


	/* Subtitle — 1.4rem bold, a lighter gray than the title (docx sz28, #71706f
	   → --gray-400). */
	.study-subtitle {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--gray-400);
		margin-top: 0.0rem;
		margin-bottom: 0.6rem;
		line-height: 1.5;
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

		font-size: 1.4rem;
		line-height: 1.7;
		color: var(--black);
		white-space: pre-wrap;
		text-align: left;
	}

	/* ============================================
	   EDITABLE SEGMENT TEXT — clicking a segment's text "selects" it so the Markup
	   menu can add a Heading One/Two/Three to it. The affordance mirrors the
	   headings: a quiet hover highlight tells the reader the text is interactive,
	   and a stronger, persistent highlight marks the currently-selected segment.
	   A small negative inset + matching padding lets the highlight breathe slightly
	   around the text without shifting the surrounding layout. Screen-only — the
	   highlights are stripped in print so the exported document stays clean.
	   ============================================ */
	.passage-text-editable {
		cursor: pointer;
		border-radius: 0.3rem;
		padding: 0.2rem 0.4rem;
		margin: 0 -0.4rem;
		/* Transparent border by default so the selected-state blue border can appear
		   without shifting the surrounding layout. */
		border: 0.1rem solid transparent;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	/* Hover hint — a light-blue border signals the segment text is clickable.
	   The block background is intentionally NOT changed on hover (word-level hover
	   draws its own highlight). Hovering the block OR any word inside it triggers
	   this (a normal :hover on the block, since words are children). */
	.passage-text-editable:hover {
		border-color: var(--blue-light);
	}


	/* Selected segment — a solid blue border (with the original transparent
	   background) marks the segment a new heading would attach to. Overrides hover
	   so the selection stays clear even while hovered. */
	.passage-text-editable.active,
	.passage-text-editable.active:hover {
		background-color: transparent;
		border-color: var(--blue);
	}

	/* ============================================
	   WORD SELECTION — mirrors the Analyze view, tuned for the light document page.
	   Each word in the passage HTML is wrapped in a `.selectable-word` span (by the
	   shared extractSegmentText helper). Hovering / selecting a word draws the
	   lightest-blue highlight and a blue caret; the click cycle is before → after →
	   deselect. Selecting a word also activates its segment (the container's onclick
	   calls activateSegment). Screen-only — stripped in print below.
	   ============================================ */
	.passage-text :global(.selectable-word) {
		position: relative;
		cursor: pointer;
		padding: 0.2rem 0.1rem;
		border-radius: 0.2rem;
	}

	/* Hover highlight — lightest blue (only when not already selected). */
	.passage-text :global(.selectable-word:hover:not([data-selected])) {
		background-color: var(--blue-lighter);
	}

	/* Hover caret — a blue caret above the word (not selected, not suppressed). */
	.passage-text
		:global(.selectable-word:hover:not([data-selected]):not([data-suppress-hover-caret])::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059FF' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1rem;
		height: 1rem;
		opacity: 0.5;
	}

	/* Safari-specific fix: force GPU compositing so :hover state updates reliably. */
	@supports (-webkit-appearance: none) {
		.passage-text :global(.selectable-word::before) {
			transform: translateZ(0);
			-webkit-transform: translateZ(0);
		}
	}

	/* Selected highlight — persistent lightest blue. */
	.passage-text :global(.selectable-word[data-selected="true"]) {
		background-color: var(--blue-lighter);
	}

	/* Selected caret (before position) — persistent blue caret. */
	.passage-text :global(.selectable-word[data-selected="true"][data-position="before"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059FF' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		left: -0.7rem;
		top: -0.9rem;
		width: 1rem;
		height: 1rem;
		opacity: 1;
	}

	/* Selected caret (after position) — persistent blue caret on the right. */
	.passage-text :global(.selectable-word[data-selected="true"][data-position="after"]::before) {
		content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath fill='%230059FF' d='M32 9.8q0 .8-.6 1.2l-14 12.5a2 2 0 0 1-1.4.5 2 2 0 0 1-1.4-.5L.6 11Q0 10.5 0 9.8q0-.8.6-1.3A2 2 0 0 1 2 8h28q.8 0 1.4.5t.6 1.3'/%3E%3C/svg%3E");
		position: absolute;
		right: -0.7rem;
		top: -0.9rem;
		width: 1rem;
		height: 1rem;
		opacity: 1;
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
		color: var(--black);
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
	   DOCUMENT-VIEW TOGGLE HIDING — the View menu's "Notations" (verse markers) and
	   "Paragraphs" (translator paragraph breaks) toggles. Both targets are INLINE in
	   the passage HTML (so they can't be omitted from the flow items the way headings
	   /commentary are); instead they're hidden with CSS when the toggle is off. The
	   `hide-*` classes live on the gutter, which wraps BOTH the off-screen measure
	   layer and the visible pages, so hiding a marker shrinks it identically in the
	   measurement and the render — keeping pagination in agreement. Mirrors the
	   Analyze view's `.hide-verses` / `.hide-paragraph-breaks` rules. */
	.hide-verses :global(.chapter-verse) {
		display: none;
	}

	.hide-paragraph-breaks :global(.paragraph-break-marker) {
		display: none;
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
		color: var(--black);
		margin: 3.6rem 0 0.6rem;
	}

	/* First heading of a COLUMN's first segment sits at the very top of the
	   column's fresh page, where the left-margin Column/Section selectors are
	   anchored (against the zero-height column-break / first-section markers at
	   y = 0). Its default 3.6rem top margin would push the heading ~3.6rem below
	   that selector pair, leaving the selectors floating above the text. Zero it so
	   the column's content top lines up flush with the selectors — the fresh page
	   already provides all the separation a leading gap would. */
	.doc-heading.doc-first-in-column {
		margin-top: 0;
	}



	/* Heading One — 1.8rem bold. Flush left as the top of the hierarchy. The
	   -0.4rem left margin folds in the editable affordance's left inset so the
	   hover/focus border breathes 0.4rem to the left while the TEXT still aligns to
	   the page's left edge (matching the segment text below). */
	.doc-heading-one {
		font-size: 1.8rem;
		font-weight: 700;
		line-height: 1.5;
		margin-left: -0.4rem;
	}

	/* Heading Two — 1.6rem bold. Indented one level to sit beneath Heading One
	   (1.6rem indent − 0.4rem editable inset = 1.2rem). */
	.doc-heading-two {
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1.5;
		margin-left: 1.2rem;
	}

	/* Heading Three — 1.4rem bold. Indented a further level beneath Heading Two
	   (3.2rem indent − 0.4rem editable inset = 2.8rem). */
	.doc-heading-three {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.5;
		margin-left: 2.8rem;
	}

	/* ============================================

	   EDITABLE HEADINGS — Heading One/Two/Three are contenteditable in the document.
	   --------------------------------------------
	   The affordance for editability mirrors the editable SEGMENT TEXT: a quiet
	   light-blue border appears on hover to signal "click to type here", and a
	   stronger solid-blue border marks the heading while it's focused (actively
	   being edited) — the heading's equivalent of a "selected" segment. A
	   transparent border is reserved at rest, with a small negative inset + matching
	   padding, so the highlight breathes around the heading on hover/focus without
	   shifting the surrounding layout. The caret + outline are tuned so the
	   contenteditable reads as inline editable text, not a form field. These
	   affordances are screen-only — they're stripped in print so the exported
	   document is clean. */
	.doc-heading-editable {
		cursor: text;
		border-radius: 0.3rem;
		padding: 0.2rem 0.4rem;
		/* Only the RIGHT inset is set here (via the longhand) so this rule — which
		   cascades after the per-level rules — never clobbers each heading's
		   margin-left indent or the .doc-heading margin-top. The matching LEFT inset
		   is folded into each level's own margin-left (see .doc-heading-one/two/three),
		   so the border breathes 0.4rem on each side while the text stays aligned. */
		margin-right: -0.4rem;
		/* Transparent border by default so the focused-state blue border can appear
		   without shifting the surrounding layout. */
		border: 0.1rem solid transparent;
		outline: none;
		transition: border-color 0.15s ease;
	}


	/* Hover hint — a light-blue border signals the heading text is editable,
	   mirroring the segment text's hover affordance. */
	.doc-heading-editable:hover {
		border-color: var(--blue-light);
	}

	/* Focused (actively editing) — a solid blue border marks the heading being

	   edited, mirroring the selected segment. Overrides hover so the focus state
	   stays clear even while hovered. */
	.doc-heading-editable:focus {
		border-color: var(--blue);
	}



	/* Empty heading (just inserted, no text yet) shows a faint placeholder so the
	   caret has something to anchor against and the author knows what they're typing. */
	.doc-heading-editable:empty::before {
		content: 'Heading';
		color: var(--gray-500);
		pointer-events: none;
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

	/* A heading commentary directly followed by its segment's text needs a clear
	   gap so the segment text isn't flush against the commentary/tags box. */
	.doc-commentary + .passage-text {
		margin-top: 1.2rem;
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
		margin: 0.6rem 0 1.2rem;
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
		color: var(--black);
		line-height: 1.5;
	}

	/* The "Label:" prefix — a bold lead-in that names the level. Inherits the
	   line's color (per the mockup the whole label line is one near-black gray). */
	.doc-ref-label {
		font-weight: 700;
		color: var(--black);
	}

	/* Passage reference — bold 1.6rem, opens each passage block (docx sz32). The
	   bottom margin opens a small gap between the passage ref and the first column's
	   horizontal rule that immediately follows it (that rule's top margin is zeroed
	   for the first column, so this provides the separation). */
	.doc-passage-ref {
		font-size: 2.0rem;
		font-weight: 700;
		line-height: 1.5;
		margin-top: 0;
		margin-bottom: 2.4rem;
	}



	/* ============================================
	   STRUCTURAL DIVISIONS — Column / Section / Segment
	   --------------------------------------------
	   The structural levels are now indicated SPATIALLY rather than with labeled
	   rules:
	     • Passage  → begins on a new page (see .doc-break-before, print rules and
	                  the JS paginator's forcesBreak()).
	     • Column   → begins on a new page (zero-height .doc-column-break marker
	                  carries the page break; no visible mark on screen).
	     • Section  → a plain horizontal rule (.doc-section-rule).
	     • Segment  → 36px of vertical space (.doc-segment-space).
	   ============================================ */

	/* Column break marker — carries the page-break class so the print/PDF paginator
	   breaks before a new column, AND introduces the column with a horizontal rule
	   (like sections). On screen the JS paginator handles the page break
	   (forcesBreak); the rule provides the visible division. */
	.doc-column-break {
		margin: 0;
		padding: 0;
	}

	/* Column rule — a plain full-measure horizontal line introducing each column.
	   Shares the exact same styling as the section rule. */
	.doc-column-rule {
		border: none;
		border-top: 0.1rem solid var(--gray-700);
		margin: 2.7rem 0;
	}


	/* First column of a passage: its rule sits at the very top of the passage's
	   page (under the passage ref), where the left-margin Column/Section selectors
	   are anchored. Zero the rule's top margin so the rule — and the content beneath
	   it — starts flush with the selector pair. */
	.doc-column-break.first .doc-column-rule {
		margin-top: 0;
	}

	/* Section rule — a plain full-measure horizontal line separating sections,
	   with generous space above and below so it reads as a clear division. */
	.doc-section-rule {
		border: none;
		border-top: 0.1rem solid var(--gray-700);
		margin: 2.7rem 0;
	}


	/* First section of a column: its rule sits at the very top of the column's
	   fresh page, where the left-margin Column/Section selectors are anchored. The
	   default 2.7rem top margin would push the rule (and the column's content) down
	   below those selectors; zero it so the rule — and the content beneath it —
	   starts flush with the selector pair. The bottom margin is kept so the first
	   segment's heading/text still clears the rule. */
	.doc-section-marker.first .doc-section-rule {
		margin-top: 0;
	}


	/* Segment space — a fixed 36px (3.6rem) vertical gap before each segment
	   (except the first in its section). A plain spacer div rather than a margin so
	   the gap is deterministic and unaffected by margin collapsing in either the
	   measure layer or the visible pages. */
	.doc-segment-space {
		height: 3.6rem;
	}

	/* ============================================
	   STRUCTURAL SELECTORS — left-margin Column / Section selection buttons.
	   --------------------------------------------
	   Mirror the Analyze view's ToolbarColumn (rounded-square "checkbox") and
	   ToolbarSection (circular "radio") controls, but rendered in the Document page's
	   1" left margin. Each is absolutely positioned against its (relatively
	   positioned) marker so it occupies NO layout space — pagination height is
	   unaffected. The Document view is intentionally monochrome, so both selectors
	   use a darker gray (rather than the per-section colors used on Analyze).
	   Screen-only — stripped in print.
	   ============================================ */

	/* The zero-height column-break and the section marker each anchor their selector
	   button: position:relative makes them the button's offset parent without adding
	   any box of their own. */
	.doc-column-break,
	.doc-section-marker {
		position: relative;
	}

	/* Shared selector look — a 2rem control sitting in the left margin, 2.9rem left
	   of the page's content edge (clearing the text by ~0.9rem). The fill is clipped
	   to the content box so the inner padding leaves a gap between the filled center
	   and the outline when active (radio/checkbox style). */
	.doc-selector {
		box-sizing: border-box;
		position: absolute;
		left: -2.9rem;
		width: 2rem;
		height: 2rem;
		padding: 0.3rem;
		border: 0.1rem solid var(--gray-400);
		background-color: transparent;
		background-clip: content-box;
		cursor: pointer;
		outline: 0;
		z-index: 2;
		transition: background-color 80ms ease-in-out;
	}

	.doc-selector:hover {
		background-color: var(--gray-600);
	}

	.doc-selector.active,
	.doc-selector.active:hover {
		background-color: var(--gray-400);
	}

	.doc-selector:focus-visible {
		outline: 0.2rem solid var(--gray-400);
		outline-offset: 0.2rem;
	}

	/* Column selector — rounded square (checkbox style), vertically centered on its
	   column rule, exactly as the circular section selector centers on its section
	   rule, so the button sits right beside the hr it controls. */
	.doc-selector-column {
		border-radius: 0.4rem;
		top: 50%;
		transform: translateY(-50%);
	}


	/* Section selector — a circle (radio style), vertically centered on its section
	   rule. For the first section of a column (no rule) the marker has zero height,
	   so it centers at the column's content top instead. */
	.doc-selector-section {
		border-radius: 50%;
		top: 50%;
		transform: translateY(-50%);
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
	/* Generous separation above the end-of-document appendix headings so the
	   "Connections" and "Tags" sections read as distinct sections rather than
	   butting against the preceding content. 3.6rem keeps in step with the
	   larger spacing already used elsewhere in this document view. */
	.doc-connections-title,
	.doc-tags-title {
		margin-top: 3.6rem;
	}

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

	/* Appendix connection cards each live in their own flow-item wrapper (so the
	   paginator can break between them), which means the `:last-child` rule above
	   sees every card as the only/last child and zeroes its bottom margin — leaving
	   them flush against one another. Give each appendix card a top margin instead
	   so there's clear breathing room between consecutive cards. */
	.doc-connection-appendix {
		margin-top: 1.2rem;
	}


	.doc-connection-ref {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--black);
		margin: 0;
		text-align: center;
	}

	.doc-connection-arrow {
		color: var(--black);
	}

	/* Connection KIND line — names the structural level of each endpoint
	   ("Segment → Segment", "Column → Segment", …). A quiet, centered sub-label
	   directly beneath the reference line; uppercase + letter-spaced so it reads
	   as a category tag rather than body text. */
	.doc-connection-type {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--gray-300);
		margin: 0.2rem 0 0;
		text-align: center;
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

		/* The on-screen zoom wrapper is irrelevant in print (its .page children are
		   hidden above). Neutralize its reserved scaled dimensions and absolute
		   positioning so it never leaves an empty scaled gap on the printed sheet. */
		.pages-wrapper {
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

		/* The editing affordances (segment-text and heading hover/selected
		   highlight + the heading placeholder) are screen-only UI — strip them so
		   the printed / exported document reads as clean prose. */
		.passage-text-editable,
		.passage-text-editable.active,
		.doc-heading-editable,
		.doc-heading-editable:hover,
		.doc-heading-editable:focus {
			background-color: transparent;
			border-color: transparent;
			padding: 0;
			margin: 0;
		}


		/* Word selection is a screen-only authoring affordance — strip the per-word
		   highlight and the hover/selected carets so the printed / exported document
		   reads as clean prose. */
		.passage-text :global(.selectable-word) {
			background-color: transparent;
			padding: 0;
		}

		.passage-text :global(.selectable-word::before) {
			content: none;
		}



		.doc-heading-editable:empty::before {
			content: none;
		}


		/* The left-margin Column / Section selector buttons are screen-only authoring

		   controls — remove them entirely so the printed / exported document is clean. */
		.doc-selector {
			display: none;
		}



		/* FORCED PAGE BREAKS — passages (after the first) and columns (after the
		   first in their passage) each open on a fresh sheet. On screen the JS
		   paginator enforces this (forcesBreak); in print the browser's native
		   paginator does, via break-before: page on the marker carrying this class.
		   The passage-ref flow item and the zero-height .doc-column-break marker both
		   receive .doc-break-before. `break-before` is the modern property; the
		   legacy `page-break-before` alias is kept for broad print-engine support. */
		.doc-break-before {
			-webkit-column-break-before: page;
			break-before: page;
			page-break-before: always;
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
