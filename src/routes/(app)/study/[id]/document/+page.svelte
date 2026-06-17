<script>
	import { invalidate } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { onMount } from 'svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
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

	$effect(() => {
		// Re-runs whenever a navigation hands us a new streamed promise. Clear the
		// previous study's resolved content immediately and flag the global loader so
		// the single navigation Spinner stays up continuously until the new stream
		// lands (rather than handing off to a separate in-page spinner).
		const promise = rawData.streamed?.content;
		streamedContent = null;
		setStudyContentLoading(true);

		let cancelled = false;
		promise?.then((c) => {
			if (!cancelled) {
				streamedContent = c;
				setStudyContentLoading(false);
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
	 *  - `aside` blocks carry column- or section-level commentary as editorial
	 *    callouts. Columns and sections own NO heading in the document outline
	 *    (segments do — see HeadingEditor's headingConfig), so their commentary is
	 *    headingless text that, if rendered as plain body copy, would land ABOVE the
	 *    first segment heading and appear to belong to that narrow heading — a scope
	 *    inversion (column/section commentary speaks to many segments). Rendering it
	 *    as a visually distinct aside, anchored at the START of the column/section it
	 *    governs, keeps the broad-scope note from being mistaken for body text under
	 *    the segment heading that follows, while preserving the deliberate
	 *    "segments own the heading outline" design and the 6-level heading ceiling.
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

			if (column.commentary) {
				blocks.push({
					type: 'aside',
					scope: 'column',
					key: `col-${column.id}`,
					ref: columnRef,
					html: column.commentary
				});
			}

			// Column connections (those pointing FROM this column) — grouped at the
			// column's start with its reference/commentary.
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

				if (section.commentary) {
					blocks.push({
						type: 'aside',
						scope: 'section',
						key: `sec-${section.id}`,
						ref: sectionRef,
						html: section.commentary
					});
				}

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
</script>

<div class="document-gutter">
	<div class="page">
	<div class="study-header">
		<Heading heading="h1" hasSub={data.study.subtitle? true : false}>{data.study.title}</Heading>
		{#if data.study.subtitle}
            <Heading heading="h3" isMuted>{data.study.subtitle}</Heading>
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
	
	<!-- Document View Content -->
	<!-- While the streamed content resolves, an in-page Spinner covers the wait.
	     This branch is SERVER-RENDERED, so on a fresh load / refresh the spinner is
	     present in the very first paint — before client JS hydrates and before
	     `$navigating`/`studyContentLoading` (which the global NavigationIndicator
	     depends on) exist. That closes the Safari first-load "blank, no spinner"
	     gap. During in-app navigations the global overlay already shows, so we hide
	     this one when `$navigating` is active to avoid two spinners at once. -->
	<div class="document-content">

		{#if streamedContent && data.passagesWithText && data.passagesWithText.length > 0}
			{#each data.passagesWithText as passageText}
				{#if passageText.error}
					<div class="error-message">
						<p>Error loading {passageText.reference}: {passageText.error}</p>
					</div>
				{:else if passageText.text}
					{@const passageData = (data.passages ?? []).find((p) => p.id === passageText.structure?.passageId)}
					{@const blocks = buildDocumentBlocks(passageText, passageData, connectionsByFromId)}
					<div class="passage-section">
						<h2 class="passage-reference">{passageText.reference}</h2>
						{#if blocks}
							<!-- Interleave the author's headings with each segment's sliced text so
							     the reading document reflects the structure built in Analyze. Heading
							     One/Two/Three render as h3/h4/h5 (semantic levels below the passage
							     h2); scripture-refs are intentionally omitted for a clean read.

							     Column/section commentary is interleaved as `aside` blocks anchored at
							     the start of the column/section it governs. Columns and sections own no
							     heading in the outline, so their broad-scope commentary is rendered as a
							     visually distinct editorial callout — NOT as plain body text that would
							     otherwise appear to belong to the narrower segment heading that follows. -->
							{#each blocks as block (block.key)}
								{#if block.type === 'column-start'}
									<!-- Column reference: marks where a new column begins, labeling its
									     verse span so the document is navigable by location. -->
									{#if block.ref}
										<p class="doc-ref doc-column-ref">{block.ref}</p>
									{/if}
								{:else if block.type === 'section-start'}
									<!-- Section reference: marks where a new section begins. -->
									{#if block.ref}
										<p class="doc-ref doc-section-ref">{block.ref}</p>
									{/if}
								{:else if block.type === 'aside'}
									<!-- Editorial aside: column-, section-, or segment-level commentary.
									     Sits outside the heading outline (framed as a note, not a heading or
									     body copy) so its scope is never mistaken for the segment text near
									     it. The reference is appended to the label to scope the note.

									     Footnotes authored in the commentary are surfaced here: the inline
									     superscript markers are renumbered 1, 2, 3… per commentary (matching
									     the editor), and the note text — stored in each marker's
									     data-footnote-content attribute — is rendered as an ordered list
									     directly beneath the commentary body. -->
									{@const asideRendered = renderCommentaryWithFootnotes(block.html)}
									<aside class="doc-aside doc-aside-{block.scope}">
										<p class="doc-aside-label">
											<span class="doc-aside-scope">{block.scope === 'column' ? 'Column Commentary' : block.scope === 'section' ? 'Section Commentary' : 'Segment Commentary'}</span>{#if block.ref}<span class="doc-aside-ref"> · {block.ref}</span>{/if}
										</p>
										<div class="doc-aside-body">{@html asideRendered.html}</div>
										{#if asideRendered.footnotes.length > 0}
											<ol class="doc-footnotes">
												{#each asideRendered.footnotes as footnote (footnote.number)}
													<li class="doc-footnote" value={footnote.number}>{footnote.content}</li>
												{/each}
											</ol>
										{/if}
									</aside>
								{:else if block.type === 'connections'}
									<!-- Connections group: links this item makes to others, shown once
									     at the FROM end. Each entry is "fromRef → toRef" followed by its
									     quick note (plain text) and commentary (rich text). -->
									<div class="doc-connections doc-connections-{block.scope}">
										<p class="doc-connections-label">{block.connections.length === 1 ? 'Connection' : 'Connections'}</p>
										{#each block.connections as conn (conn.key)}
											<div class="doc-connection">
												<p class="doc-connection-ref">
													<span class="doc-connection-from">{conn.fromRef ?? '—'}</span>
													<span class="doc-connection-arrow"> → </span>
													<span class="doc-connection-to">{conn.toRef ?? '—'}</span>
												</p>
												{#if conn.note}
													<p class="doc-connection-note">{conn.note}</p>
												{/if}
												{#if conn.commentary}
													<!-- Connection commentary carries footnotes too; surface them the
													     same way as the editorial asides above. -->
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
									{#if block.headingOne}
										<h3 class="doc-heading doc-heading-one">{block.headingOne}</h3>
									{/if}
									{#if block.headingTwo}
										<h4 class="doc-heading doc-heading-two">{block.headingTwo}</h4>
									{/if}
									{#if block.headingThree}
										<h5 class="doc-heading doc-heading-three">{block.headingThree}</h5>
									{/if}
									<!-- Segment reference: a quiet per-segment location label. -->
									{#if block.ref}
										<p class="doc-ref doc-segment-ref">{block.ref}</p>
									{/if}
									<div class="passage-text">{@html block.html}</div>
									<!-- Quick note: a brief plain-text margin note authored on the segment.
									     Rendered right after the segment's text (and before any segment
									     commentary aside that follows). Plain text — NOT {@html} — to mirror
									     the editor and avoid interpreting note content as markup. -->
									{#if block.note}
										<p class="doc-note">{block.note}</p>
									{/if}
								{/if}
							{/each}
						{:else}
							<!-- Fallback: a passage with no usable structure renders whole, so text
							     is never lost (legacy/edge studies). -->
							<div class="passage-text">{@html passageText.text}</div>
						{/if}
					</div>
				{/if}
			{/each}
			
			<!-- Copyright Notice — required Scripture attribution. Sits at the bottom of the
			     document via margin-top:auto: pinned to the bottom of the viewport for short
			     studies, and flowing below the content for tall ones. -->
			<div class="copyright-notice">
				{#if data.study.translation === 'esv'}
					<p>Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. <a href="https://www.esv.org" target="_blank" rel="noopener noreferrer">www.esv.org</a></p>
				{:else if data.study.translation === 'net'}
					<p>Scripture quoted by permission. Quotations designated (NET) are from the NET Bible® copyright ©1996, 2019 by Biblical Studies Press, L.L.C. All rights reserved. <a href="https://netbible.org" target="_blank" rel="noopener noreferrer">netbible.org</a></p>
				{/if}
			</div>

		{:else if !streamedContent}
			<!-- Still streaming: show an in-page spinner. Server-rendered so it appears
			     in the first paint on a fresh load (covering the pre-hydration gap that
			     the client-only global overlay can't). Suppressed while `$navigating`
			     OR the global content loader is active, so in-app navigations show only
			     the single global overlay rather than two spinners. -->
			{#if !$navigating && !$studyContentLoading}
				<div class="content-loading">
					<Spinner size="lg" label="Loading study…" />
				</div>
			{/if}
		{:else}
			<p class="placeholder-text">No passages available for this study.</p>
		{/if}

	</div>
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
	   future paginator and the @media print rules can reference the same values. */
	:root {
		--page-width: 81.6rem;   /* 8.5in × 9.6rem/in */
		--page-height: 105.6rem; /* 11in  × 9.6rem/in */
		--page-margin: 9.6rem;   /* 1in on all sides  */
		--page-gap: 2.4rem;      /* vertical space between stacked pages */
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

	/* A single physical page: fixed Letter width, at least Letter height (grows for
	   long studies until the paginator splits it), white surface, 1" padding for
	   the margins, and a subtle shadow to lift it off the gutter. */
	.page {
		box-sizing: border-box;
		width: var(--page-width);
		min-height: var(--page-height);
		padding: var(--page-margin);
		background-color: var(--white);
		box-shadow: 0 0.1rem 0.6rem var(--black-alpha);
		/* Flex column so the copyright notice (margin-top:auto) is pushed to the
		   bottom margin of the page on short studies. */
		display: flex;
		flex-direction: column;
	}


	.study-header {
		width: 100%;
		text-align: center;
	}


	.study-subtitle {
		font-size: 1.6rem;
		color: var(--gray-300);
		margin-top: 0.6rem;
		line-height: 1.5;
	}

	.study-references {
		font-size: 1.4rem;
		color: var(--gray-400);
		margin-top: 0.0rem;
		margin-bottom: 2.7rem;
	}

	.translation-badge {
		display: inline-block;
		margin-left: 0.3rem;
		font-size: 1.4rem;
		color: var(--gray-400);
	}

	.document-content {
		width: 100%;
		margin-top: 2.7rem;
		/* Flex column so the copyright notice (margin-top:auto) is pushed to the bottom
		   margin of the page on short studies while still flowing below the content for
		   tall ones. flex-grow fills the remaining page height. */
		display: flex;
		flex-direction: column;
		flex: 1 0 auto;
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

	.passage-reference {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--gray-300);
		margin-bottom: 1.8rem;
		text-align: left;
	}

	.passage-text {
		font-size: 1.6rem;
		line-height: 1.8;
		color: var(--gray-100);
		white-space: pre-wrap;
		text-align: left;
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
		color: var(--gray-100);
		margin: 2.7rem 0 0.9rem;
	}

	.doc-heading:first-child {
		margin-top: 0;
	}

	/* Heading One — the most prominent section heading. */
	.doc-heading-one {
		font-size: 2.0rem;
		font-weight: 700;
		line-height: 1.3;
	}

	/* Heading Two — secondary heading, slightly smaller. */
	.doc-heading-two {
		font-size: 1.7rem;
		font-weight: 700;
		line-height: 1.3;
	}

	/* Heading Three — the finest level: smaller and set apart with weight only. */
	.doc-heading-three {
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--gray-300);
	}

	/* A heading directly followed by its segment text should hug that text. */
	.doc-heading + .passage-text {
		margin-top: 0;
	}

	/* ============================================
	   EDITORIAL ASIDES — column/section commentary
	   --------------------------------------------
	   Columns and sections carry commentary but own NO heading in the document
	   outline (segments do). Rendered as plain body text, that commentary would
	   land above the first segment heading and look like it belongs to that
	   narrow heading — a scope inversion, since column/section commentary speaks
	   to many segments at once.

	   So we frame it as a clearly-delineated editorial callout: an indented block
	   with a left rule and a small uppercase label naming its scope. This sits
	   OUTSIDE the heading hierarchy (it's a note, not a heading and not body copy),
	   so a reader never mistakes the broad-scope commentary for the segment text
	   that follows. The left rule + label do the scoping work that a heading would
	   otherwise do, without overflowing the 6 legal heading levels.
	   ============================================ */
	.doc-aside {
		margin: 2.7rem 0;
		padding: 1.2rem 0 1.2rem 1.8rem;
		border-left: 0.3rem solid var(--gray-600);
		background-color: var(--gray-900);
		border-radius: 0 0.4rem 0.4rem 0;
	}

	/* Section commentary is the narrower scope of the two, so it reads a touch
	   lighter/quieter than column commentary to imply the nesting. */
	.doc-aside-section {
		border-left-color: var(--gray-700);
	}

	/* Segment commentary is the NARROWEST scope — a trailing note on a single
	   segment's text — so it gets the lightest left rule to nest visually beneath
	   the broader column/section asides. */
	.doc-aside-segment {
		border-left-color: var(--gray-800);
	}

	.doc-aside-label {
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.05rem;
		text-transform: uppercase;
		color: var(--gray-400);
		margin: 0 0 0.6rem;
	}

	.doc-aside-body {
		font-size: 1.5rem;
		line-height: 1.7;
		color: var(--gray-200);
		/* No default italic: commentary is rich text where the user can italicize
		   specific runs, so forcing italic on the whole block would both clash with
		   and visually erase those intentional emphases. The left rule + uppercase
		   label already distinguish the aside as editorial. */
	}

	/* Keep rich-text commentary tidy inside the aside: no stray top/bottom margins
	   on the first/last block so the callout padding is the only spacing. */
	.doc-aside-body :global(> :first-child) {
		margin-top: 0;
	}

	.doc-aside-body :global(> :last-child) {
		margin-bottom: 0;
	}

	/* Footnote markers inline in the commentary body — a small superscript number
	   tied to the matching entry in the footnote list below. The marker is a span
	   (.footnote-marker) emitted from the stored commentary HTML; we only need to
	   size/lift its superscript so it reads as a reference, not body text. */
	.doc-aside-body :global(.footnote-marker sup),
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
	   match the numbers the author entered. Quiet, small type set off by a hairline
	   rule so it reads as supporting apparatus, not body copy.
	   ============================================ */
	.doc-footnotes {
		margin: 0.9rem 0 0;
		padding: 0.6rem 0 0 1.8rem;
		border-top: 0.1rem solid var(--gray-700);
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
	   REFERENCE LABELS — column/section/segment verse spans
	   --------------------------------------------
	   Every column, section, and segment carries a scripture reference so the
	   reading document is navigable by passage location. These are quiet, muted
	   labels with a clear size hierarchy (column > section > segment) so they aid
	   navigation without competing with the reading flow.
	   ============================================ */
	.doc-ref {
		text-align: left;
		margin: 0;
	}

	/* Column reference — the most prominent of the three; an underlined band that
	   announces a new column's verse span. */
	.doc-column-ref {
		font-size: 1.3rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05rem;
		color: var(--gray-300);
		margin-top: 2.7rem;
		padding-bottom: 0.3rem;
		border-bottom: 0.1rem solid var(--gray-700);
	}

	.doc-column-ref:first-child {
		margin-top: 0;
	}

	/* Section reference — secondary. */
	.doc-section-ref {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--gray-400);
		margin-top: 1.8rem;
	}

	/* Segment reference — the finest level: a small muted location label that sits
	   directly above its segment's text. */
	.doc-segment-ref {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--gray-500);
		margin-top: 1.2rem;
	}

	.doc-segment-ref + .passage-text {
		margin-top: 0.2rem;
	}

	/* Reference appended to a commentary aside's label. */
	.doc-aside-ref {
		font-weight: 600;
		color: var(--gray-500);
	}

	/* ============================================
	   QUICK NOTE — a brief plain-text note authored on a segment, shown directly
	   beneath that segment's text. Quieter than the commentary asides (it's a short
	   margin note, not full commentary): small, muted, with a subtle left rule and
	   preserved line breaks. Sits before any segment-commentary aside that follows.
	   ============================================ */
	.doc-note {
		font-size: 1.3rem;
		font-style: italic;
		line-height: 1.6;
		color: var(--gray-300);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0.9rem 0 0;
		padding-left: 1.2rem;
		border-left: 0.2rem solid var(--gray-700);
	}

	/* ============================================
	   CONNECTIONS — links an item (column/section/segment) makes to others.
	   --------------------------------------------
	   Shown once at the FROM end, grouped at the end of that item's block. Each
	   entry reads "fromRef → toRef", then its quick note (plain text) and commentary
	   (rich text). Framed as a quiet labeled group, distinct from the body text and
	   the commentary asides, and indented to read as item metadata.
	   ============================================ */
	.doc-connections {
		margin: 1.2rem 0 0;
		padding: 0.9rem 0 0.3rem 1.2rem;
		border-left: 0.2rem dashed var(--gray-700);
	}

	.doc-connections-label {
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.05rem;
		text-transform: uppercase;
		color: var(--gray-400);
		margin: 0 0 0.6rem;
	}

	.doc-connection {
		margin: 0 0 0.9rem;
	}

	.doc-connection:last-child {
		margin-bottom: 0;
	}

	.doc-connection-ref {
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--gray-300);
		margin: 0;
	}

	.doc-connection-arrow {
		color: var(--gray-500);
	}

	/* Connection quick note — brief plain text, mirrors the segment quick note look. */
	.doc-connection-note {
		font-size: 1.2rem;
		font-style: italic;
		line-height: 1.6;
		color: var(--gray-300);
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0.4rem 0 0;
	}

	/* Connection commentary — rich text; no forced italic so authored emphases show. */
	.doc-connection-commentary {
		font-size: 1.4rem;
		line-height: 1.7;
		color: var(--gray-200);
		margin: 0.4rem 0 0;
	}

	.doc-connection-commentary :global(> :first-child) {
		margin-top: 0;
	}

	.doc-connection-commentary :global(> :last-child) {
		margin-bottom: 0;
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

	/* margin-top:auto consumes the .document-content flex column's spare vertical space,
	   pushing this notice to the very bottom of the viewport on short studies. On tall
	   studies there is no spare space, so it simply follows the content (and scrolls).
	   The top padding/border keep a visible separator above the notice in both cases. */
	.copyright-notice {
		margin-top: auto;
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

		.page {
			width: auto;
			min-height: 0;
			padding: 0;        /* margins now come from @page below */
			box-shadow: none;
			background: none;
		}

		/* Keep the aside readable on paper: drop the screen fill, keep the left rule
		   so the editorial scope still reads in print/PDF export. */
		.doc-aside {
			background: none;
		}

		/* Footnotes must survive into the printed/PDF output — keep them visible and
		   their hairline rule intact so the apparatus reads on paper too. */
		.doc-footnotes {
			border-top-color: var(--gray-400);
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
