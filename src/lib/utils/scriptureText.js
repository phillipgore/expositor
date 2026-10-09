/**
 * Pure text-cleaning rules for translation API responses.
 *
 * Kept out of `$lib/server/bibleApi.js` (which imports `$env`) so the rules can be
 * exercised by plain-Node verifiers against real API strings.
 *
 * Every rule here changes which words `wrapWords()` sees, and therefore the
 * position-derived `data-word-id`s. Change them deliberately.
 */

/**
 * Version of the text-processing rules that turn provider text into words (and so word ids).
 *
 * ⚠️ BUMP THIS for any change in this file, `wrapWords` or `normalizeESVFormatting` that can alter
 * which words a verse produces or their order, and keep the previous rules callable (e.g. as a
 * `…V1` function) so existing structure can be re-anchored exactly. Recorded per passage in
 * `passage.textRulesVersion`; see `$lib/server/textProvenance.js`.
 *
 * 1 — 2026-10-09: NET line tags become spaces, acrostic headings dropped; ESV psalm titles start
 *     verse 1, Psalm 119 stanza names dropped. (Earlier rules were never versioned.)
 */
export const TEXT_RULES_VERSION = 1;

/**
 * Block-level tags. The NET marks every poetic line with `<p class="poetry">`, frequently
 * with NO whitespace before it (`wicked!<p class="poetry">Instead`), so these must become a
 * space when stripped or the two lines fuse into one "word".
 */
const BLOCK_TAG = /<\/?(?:p|br|div)\b[^>]*>/gi;

/** Any remaining (inline) tag, e.g. `<b>` around OT quotations. These can sit inside a word. */
const ANY_TAG = /<[^>]+>/g;

/**
 * NET acrostic headings in Psalm 119 / Lamentations, e.g. `<p class="lamhebrew">א (Alef)`.
 * They are editorial labels, not verse text, so they are removed together with their content
 * (up to the next tag). Psalm titles (`psasuper`) are deliberately KEPT: they are verse 1 in
 * the Hebrew numbering, and the ESV path places them in verse 1 too.
 */
const NET_ACROSTIC_HEADING =
	/<p\b[^>]*class="lamhebrew"[^>]*>[^<]*(?:<\/?b>[^<]*)*?(?=<p\b|<\/p>|$)/gi;

/**
 * Convert one NET verse (formatting=para) to plain text.
 * @param {string} html
 * @returns {string}
 */
export function cleanNETVerseText(html) {
	if (!html) return '';
	return html
		.replace(NET_ACROSTIC_HEADING, ' ')
		.replace(BLOCK_TAG, ' ')
		.replace(ANY_TAG, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Class of the <p> that opens a NET verse: null if the verse has no leading tag, '' for a bare <p>.
 * The NET emits `poetry` for every poetic LINE, so it must not be read as a paragraph by itself;
 * otherwise every Psalms verse becomes a new paragraph.
 */
function leadingNETClass(html) {
	const m = /^\s*<p\b([^>]*)>/i.exec(html || '');
	if (!m) return null; // continuation of the previous paragraph
	const cls = /class="([^"]*)"/i.exec(m[1]);
	return cls ? cls[1].trim().toLowerCase() : '';
}

/**
 * Does this NET verse (formatting=para) open a new paragraph?
 *
 * - bodytext / poetrybreak / psasuper / lamhebrew / bare <p>: yes.
 * - poetry: only where poetry begins — verse 1 of a chapter (a new psalm), or the first poetic
 *   verse after prose (Matt 5:3, Luke 1:47). Otherwise it is just the next line.
 * - no leading tag: no.
 *
 * @param {string} html - this verse's text
 * @param {string|null} prevHtml - previous verse in the same response (null for the first)
 * @param {number|string} verseNum
 * @returns {boolean}
 */
export function isNETParagraphStart(html, prevHtml, verseNum) {
	const cls = leadingNETClass(html);
	if (cls === null) return false;
	// Known block classes and bare <p> open a paragraph; unknown future classes do too, which is
	// the previous behaviour for every tag and the safer default.
	if (cls !== 'poetry') return true;
	if (Number(verseNum) === 1 || prevHtml == null) return true;
	return !/<p\b[^>]*class="poetry"/i.test(prevHtml);
}

/** Psalm 119 stanza names as the ESV prints them. */
const ESV_PS119_STANZAS = [
	'Aleph',
	'Beth',
	'Gimel',
	'Daleth',
	'He',
	'Waw',
	'Zayin',
	'Heth',
	'Teth',
	'Yodh',
	'Kaph',
	'Lamedh',
	'Mem',
	'Nun',
	'Samekh',
	'Ayin',
	'Pe',
	'Tsadhe',
	'Qoph',
	'Resh',
	'Shin',
	'Taw'
];

const ESV_STANZA_LINE = new RegExp(
	`(^|\\n[ \\t]*\\n)[ \\t]*(?:${ESV_PS119_STANZAS.join('|')})[ \\t]*\\n[ \\t]*\\n(?=[ \\t]*\\[\\d+\\])`,
	'g'
);

/**
 * A psalm title: a single marker-free line that stands alone (start of text, or after a blank
 * line) immediately before a `[1]` marker. Without this rule the ESV title is either left as
 * loose unwrapped text (passage starts at the psalm) or appended to the PREVIOUS psalm's last
 * verse (passage crosses a psalm boundary), because verse text is taken from `[n]` to `[n+1]`.
 */
const ESV_PSALM_TITLE = /(^|\n[ \t]*\n)[ \t]*([^[\n]*\S)[ \t]*\n[ \t]*\n([ \t]*)\[1\]/g;

/**
 * Re-arrange raw ESV Psalms text so that headings land where we want them BEFORE verse markers
 * are processed:
 *   - Psalm 119 stanza names (Aleph, Beth, …) are removed;
 *   - psalm titles are moved after the `[1]` marker so they become the start of verse 1,
 *     matching the Hebrew numbering and the NET.
 * The blank line before `[1]` is preserved so paragraph detection is unchanged.
 *
 * @param {string} text - raw ESV `/text/` passage
 * @param {string} bookName
 * @returns {string}
 */
export function placeESVPsalmHeadings(text, bookName) {
	if (!text || !/^psalms?$/i.test((bookName || '').trim())) return text;
	return text
		.replace(ESV_STANZA_LINE, '$1')
		.replace(ESV_PSALM_TITLE, (_m, lead, title, indent) => `${lead}\n${indent}[1] ${title} `);
}
