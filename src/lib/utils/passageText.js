/**
 * passageText — shared passage-text slicing helpers.
 *
 * These functions slice a passage's full HTML (a flat run of `.word[data-word-id]`
 * elements wrapped in `.verse` spans) into per-segment HTML, preserving the
 * chapter-verse notation and the a/b/c… suffixes used when a single verse is
 * subdivided across multiple segments.
 *
 * They are intentionally PURE (HTML string in → HTML string out) and carry no
 * Svelte/page state, so they can be reused by both the Analyze view (interactive,
 * word-selectable) and the Document view (read-only reading layout).
 *
 * NOTE: these are browser-only — they use `document.createElement` to parse the
 * passage HTML. Both call sites render passage content on the client (after the
 * streamed content resolves), so that's fine.
 */

import { isWordInRange, startsMidVerse, endsMidVerse } from './wordIds.js';

/**
 * Clip a passage's whole-verse HTML to its word-level bounds (migration 0048).
 *
 * Text is fetched and cached per whole verse (the cache is keyed by verse range), so a part that
 * begins or ends part-way through a verse receives the whole verse and must drop the words it does
 * not own. Word ids are unchanged by clipping, so selection, segments and connections keep working.
 *
 * The partial verse is marked `data-partial="b"` (it starts mid-verse — the later half) or
 * `data-partial="a"` (it ends mid-verse — the earlier half), which `extractSegmentText` reads to put
 * the suffix on the verse number, matching the reference labels from `formatPassageReference`.
 *
 * ⚠️ Pure string work, no DOM: this runs in the server loader. It relies on the shape `wrapWords()`
 * produces — `<span class="word" data-word-id="…">text</span>` with no nested tags — which is the
 * same contract `getParsedPassage` relies on in the browser. A range with null word bounds is
 * returned untouched, so every existing passage is unaffected.
 *
 * @param {string} html - Whole-verse passage HTML
 * @param {{ fromChapter:number, fromVerse:number, fromWord?:number|null, toChapter:number, toVerse:number, toWord?:number|null }} range
 * @returns {string}
 */
export function clipPassageHtml(html, range) {
	if (!html || !range) return html;
	const clipStart = startsMidVerse(range);
	const clipEnd = endsMidVerse(range);
	if (!clipStart && !clipEnd) return html;

	let out = html.replace(
		/\s*<span class="word" data-word-id="([^"]+)">[^<]*<\/span>/g,
		(match, wordId) => (isWordInRange(wordId, range) ? match : '')
	);

	const pad = (n) => String(n).padStart(3, '0');
	const mark = (chapter, verse, letter) => {
		const re = new RegExp(`<span class="verse" data-verse-id="([^"]+-${pad(chapter)}-${pad(verse)})">`);
		out = out.replace(re, `<span class="verse" data-verse-id="$1" data-partial="${letter}">`);
	};
	// Mark the end first so a single verse clipped at both ends ends up "b" (its later portion is
	// what a reader most needs flagged as not starting at the verse's beginning).
	if (clipEnd) mark(range.toChapter, range.toVerse, 'a');
	if (clipStart) {
		const re = new RegExp(
			`(<span class="verse" data-verse-id="[^"]+-${pad(range.fromChapter)}-${pad(range.fromVerse)}")(?: data-partial="a")?>`
		);
		out = out.replace(re, '$1 data-partial="b">');
	}
	return out;
}

/**
 * Build a verse → segment-count map. Counts how many segments START within each
 * verse, which is how we detect a verse that has been subdivided across multiple
 * segments (count > 1) and therefore needs a/b/c… suffixes on its verse number.
 * @param {Array<{ startingWordId?: string }>} allSegments
 * @returns {Object<string, number>} verseId (BOOK-CHAPTER-VERSE) → count
 */
export function buildVerseSectionMap(allSegments) {
	/** @type {Object<string, number>} */
	const verseSectionMap = {};

	// Scan all segments and count how many segments each verse appears in
	for (const segment of allSegments) {
		const wordId = segment.startingWordId;
		if (!wordId) continue;

		// Extract verse ID from word ID (format: BOOK-CHAPTER-VERSE-WORD)
		const parts = wordId.split('-');
		if (parts.length >= 4) {
			const verseId = parts.slice(0, 3).join('-'); // BOOK-CHAPTER-VERSE

			// Count how many segments start with words from this verse
			verseSectionMap[verseId] = (verseSectionMap[verseId] || 0) + 1;
		}
	}

	return verseSectionMap;
}

/**
 * Generate an alphabetic suffix for the Nth subdivision of a verse: a, b, c, …,
 * z, then aa, bb, cc, … (each letter repeated once more per full cycle).
 * @param {number} index 0-based occurrence index
 * @returns {string}
 */
export function generateVerseSuffix(index) {
	if (index < 26) {
		return String.fromCharCode(97 + index); // a-z
	}
	// After 'z', use 'aa', 'bb', 'cc', etc.
	const letter = String.fromCharCode(97 + (index % 26));
	const repeatCount = Math.floor(index / 26) + 1;
	return letter.repeat(repeatCount);
}

/**
 * Build the chapter-verse notation span, splitting the chapter prefix ("5:") into
 * its own `.cv-chapter` span so the "Chapters" View toggle can hide it with CSS
 * while leaving the verse number visible. The rendered text is unchanged ("5:3a").
 *
 * When `keepChapter` is true (the verse is verse 1 of a chapter, or the first verse
 * of the passage) the span is marked `data-chapter-start` so the chapter prefix
 * stays visible even when chapters are hidden — the reader always knows which
 * chapter they're in.
 *
 * NOTE: the marker is a data attribute (not an extra class) because callers detect
 * the notation with `includes('class="chapter-verse"')`.
 *
 * @param {string} chapterVerseText - e.g. "5:3"
 * @param {string} [suffix] - subdivision suffix, e.g. "a"
 * @param {boolean} [keepChapter] - force the chapter prefix to remain visible
 * @param {boolean} [isContinuation] - this is a later part (b, c, …) of a subdivided
 *   verse; only the FIRST part of a chapter-start verse keeps its chapter
 * @returns {string}
 */
export function buildChapterVerseHtml(
	chapterVerseText,
	suffix = '',
	keepChapter = false,
	isContinuation = false
) {
	const match = /^\s*(\d+):(\d+)\s*$/.exec(chapterVerseText);
	if (!match) {
		return `<span class="chapter-verse">${chapterVerseText}${suffix}</span>`;
	}
	const [, chapter, verse] = match;
	const isChapterStart = !isContinuation && (keepChapter || verse === '1');
	const startAttr = isChapterStart ? ' data-chapter-start=""' : '';
	return `<span class="chapter-verse"${startAttr}><span class="cv-chapter">${chapter}:</span>${verse}${suffix}</span>`;
}

/** @type {Map<string, { words: Element[], indexById: Map<string, number> }>} */
const _parsedPassageCache = new Map();

/**
 * Parse a passage's full HTML once and return its ordered word elements plus an
 * index lookup (wordId → position). Cached by the HTML string so every segment of
 * the passage (and re-renders that don't change the text) reuse the same parse
 * instead of re-parsing — the dominant render cost on large studies, especially in
 * Safari. A small FIFO cap keeps the cache from growing unbounded across study switches.
 * @param {string} fullHtml
 * @returns {{ words: Element[], indexById: Map<string, number> }}
 */
export function getParsedPassage(fullHtml) {
	const cached = _parsedPassageCache.get(fullHtml);
	if (cached) return cached;

	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = fullHtml;
	const words = Array.from(tempDiv.querySelectorAll('.word[data-word-id]'));

	/** @type {Map<string, number>} */
	const indexById = new Map();
	for (let i = 0; i < words.length; i++) {
		const id = /** @type {HTMLElement} */ (words[i]).dataset.wordId;
		if (id !== undefined && !indexById.has(id)) indexById.set(id, i);
	}

	const entry = { words, indexById };
	if (_parsedPassageCache.size > 24) {
		const oldestKey = _parsedPassageCache.keys().next().value;
		if (oldestKey !== undefined) _parsedPassageCache.delete(oldestKey);
	}
	_parsedPassageCache.set(fullHtml, entry);
	return entry;
}

/**
 * Extract a text segment from full passage HTML based on word boundaries.
 * Properly handles nested verse structure with chapter-verse notations and
 * a/b/c… suffixes for subdivided verses.
 *
 * Each captured word is cloned and tagged with `.selectable-word` +
 * `data-passage-index` so the Analyze view can make words interactive. The
 * Document (read-only) view simply ignores those hooks.
 *
 * @param {string} fullHtml - The full passage HTML text
 * @param {string} startWordId - Starting word ID (e.g., 'ac-01-01-001')
 * @param {string|null} endWordId - Ending word ID (null = extract to end)
 * @param {number} passageIndex - Index of the passage
 * @param {Object} verseSectionMap - Map of verseId → occurrence count
 * @param {Object} verseOccurrences - Mutable tracker for current verse occurrences
 * @returns {string} Extracted HTML
 */
export function extractSegmentText(
	fullHtml,
	startWordId,
	endWordId,
	passageIndex,
	verseSectionMap,
	verseOccurrences
) {
	if (!fullHtml) return '';

	// Reuse the per-passage parse (parsed once, cached by HTML string) instead of
	// re-parsing the entire passage for every segment — the dominant render cost on
	// large studies. See getParsedPassage().
	const { words: allWords, indexById } = getParsedPassage(fullHtml);

	// Jump straight to this segment's first word rather than scanning the whole
	// passage from index 0. Capturing only ever begins at startWordId, so skipping
	// the earlier words is behavior-preserving. A missing start (no match) falls
	// back to 0, matching the original "capture nothing" outcome.
	const startIndex = indexById.get(startWordId) ?? 0;

	// The passage's opening verse (see buildChapterVerseHtml's keepChapter).
	const firstVerseSpan = allWords[0]?.closest('.verse') ?? null;

	let capturing = false;
	const capturedHTML = [];
	let currentVerseId = null;
	let verseBuffer = []; // Buffer to collect elements within a verse

	for (let i = startIndex; i < allWords.length; i++) {
		const word = /** @type {HTMLElement} */ (allWords[i]);
		const wordId = word.dataset.wordId;

		// Start capturing when we reach the start word
		if (wordId === startWordId) {
			capturing = true;
		}

		// Stop capturing when we reach the end word (BEFORE capturing it)
		if (endWordId && wordId === endWordId) {
			// Flush any remaining verse buffer
			if (verseBuffer.length > 0) {
				// Check if first element is a chapter-verse span
				const firstElement = verseBuffer[0];
				if (firstElement.includes('class="chapter-verse"')) {
					// First element is chapter-verse, rest are words
					// No space between chapter-verse and first word to avoid leading space when hidden
					const chapterVerse = verseBuffer[0];
					const words = verseBuffer.slice(1);
					capturedHTML.push(chapterVerse + words.join(' '));
				} else {
					// No chapter-verse, just join words with spaces
					capturedHTML.push(verseBuffer.join(' '));
				}
				verseBuffer = [];
			}
			break;
		}

		if (capturing) {
			// Find the parent verse span (if any)
			const verseSpan = word.closest('.verse');
			const verseId = verseSpan?.dataset?.verseId || null;

			// Check if we're starting a new verse
			if (verseId !== currentVerseId) {
				// Flush previous verse buffer
				if (verseBuffer.length > 0) {
					// Check if first element is a chapter-verse span
					const firstElement = verseBuffer[0];
					if (firstElement.includes('class="chapter-verse"')) {
						// First element is chapter-verse, rest are words
						// No space between chapter-verse and first word to avoid leading space when hidden
						const chapterVerse = verseBuffer[0];
						const words = verseBuffer.slice(1);
						capturedHTML.push(chapterVerse + words.join(' '));
					} else {
						// No chapter-verse, just join words with spaces
						capturedHTML.push(verseBuffer.join(' '));
					}
					verseBuffer = [];
				}

				currentVerseId = verseId;

				// If this word is in a verse, capture the chapter-verse notation
				if (verseSpan && verseId) {
					const chapterVerseSpan = verseSpan.querySelector('.chapter-verse');
					if (chapterVerseSpan) {
						// Extract chapter and verse numbers
						const chapterVerseText = chapterVerseSpan.textContent || '';

						// The passage's first verse keeps its chapter visible even when
						// chapters are hidden (a passage may open mid-chapter, e.g. 5:3).
						const isPassageFirstVerse = verseSpan === firstVerseSpan;

						// Capture paragraph-break-marker if this verse starts a new paragraph
						const paragraphMarkerEl = verseSpan.querySelector('.paragraph-break-marker');
						const paragraphMarkerHtml = paragraphMarkerEl ? paragraphMarkerEl.outerHTML : '';

						// Determine if we need a suffix
						const isSection = verseSectionMap && verseSectionMap[verseId] > 1;
						// A verse the part boundary divides (see clipPassageHtml).
						const partial = verseSpan.getAttribute('data-partial') ?? '';

						if (partial && !isSection) {
							verseBuffer.push(
								`${paragraphMarkerHtml}${buildChapterVerseHtml(
									chapterVerseText,
									partial,
									isPassageFirstVerse,
									partial === 'b' && !isPassageFirstVerse
								)}`
							);
						} else if (isSection) {
							// Initialize counter for this verse if we haven't seen it yet
							if (verseOccurrences[verseId] === undefined) {
								verseOccurrences[verseId] = 0;
							}

							// Get current counter value (this is which occurrence we're on)
							const currentIndex = verseOccurrences[verseId];

							// Generate suffix using current index
							const suffix = generateVerseSuffix(currentIndex);

							// Increment counter for next occurrence
							verseOccurrences[verseId] = currentIndex + 1;

							verseBuffer.push(
								`${paragraphMarkerHtml}${buildChapterVerseHtml(
									chapterVerseText,
									suffix,
									isPassageFirstVerse,
									currentIndex > 0
								)}`
							);
						} else {
							// Verse not section - use original without suffix
							// Prepend paragraph marker (empty string if none)
							verseBuffer.push(
								`${paragraphMarkerHtml}${buildChapterVerseHtml(chapterVerseText, '', isPassageFirstVerse)}`
							);
						}
					}
				}
			}

			// Clone the word and add selection attributes
			const wordClone = /** @type {HTMLElement} */ (word.cloneNode(true));
			wordClone.classList.add('selectable-word');
			wordClone.dataset.passageIndex = String(passageIndex);

			verseBuffer.push(wordClone.outerHTML);
		}
	}

	// Flush any remaining verse buffer
	if (verseBuffer.length > 0) {
		// Check if first element is a chapter-verse span
		const firstElement = verseBuffer[0];
		if (firstElement.includes('class="chapter-verse"')) {
			// First element is chapter-verse, rest are words
			// No space between chapter-verse and first word to avoid leading space when hidden
			const chapterVerse = verseBuffer[0];
			const words = verseBuffer.slice(1);
			capturedHTML.push(chapterVerse + words.join(' '));
		} else {
			// No chapter-verse, just join words with spaces
			capturedHTML.push(verseBuffer.join(' '));
		}
	}

	return capturedHTML.join(' ');
}
