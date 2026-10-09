/**
 * Verify translation text cleaning (src/lib/utils/scriptureText.js).
 *
 * Fixtures are verbatim API responses (NET labs.bible.org formatting=para; ESV /text/), captured
 * 2026-10-09. They pin three bugs: NET poetry lines fusing into one word ("wicked!Instead"),
 * ESV psalm titles attaching to the previous psalm's last verse, and acrostic stanza names
 * becoming verse words.
 *
 * Run: node --import ./scripts/alias-loader.mjs scripts/verify-scripture-text.mjs
 */

import {
	cleanNETVerseText,
	isNETParagraphStart,
	placeESVPsalmHeadings
} from '../src/lib/utils/scriptureText.js';

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
	if (actual === expected) pass += 1;
	else {
		fail += 1;
		console.log(
			`✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
		);
	}
}

// ── NET ────────────────────────────────────────────────────────────────────
check(
	'NET Ps 1:4 poetry lines do not fuse',
	cleanNETVerseText(
		'<p class="poetry">Not so with the wicked!<p class="poetry">Instead they are like wind-driven chaff. </p>'
	),
	'Not so with the wicked! Instead they are like wind-driven chaff.'
);
check(
	'NET Ps 2:11',
	cleanNETVerseText(
		'<p class="poetry">Serve the Lord in fear.<p class="poetry">Repent in terror. </p>'
	),
	'Serve the Lord in fear. Repent in terror.'
);
check(
	'NET Ps 2:8 (comma, lowercase)',
	cleanNETVerseText(
		'<p class="poetry">Ask me,<p class="poetry">and I will give you the nations as your inheritance, <p class="poetry">the ends of the earth as your personal property. </p>'
	),
	'Ask me, and I will give you the nations as your inheritance, the ends of the earth as your personal property.'
);
check(
	'NET inline <b> removed without splitting',
	cleanNETVerseText(
		'<p class="bodytext">“It was said, ‘<b>Whoever divorces his wife must give her a legal document</b>.’ '
	),
	'“It was said, ‘Whoever divorces his wife must give her a legal document.’'
);
check(
	'NET psalm title kept as start of verse 1',
	cleanNETVerseText(
		'<p class="psasuper">A psalm of David, written when he fled from his son Absalom. <p class="poetry">Lord, how numerous are my enemies!<p class="poetry">Many attack me.</p>'
	),
	'A psalm of David, written when he fled from his son Absalom. Lord, how numerous are my enemies! Many attack me.'
);
check(
	'NET Ps 119:1 acrostic heading removed',
	cleanNETVerseText(
		'<p class="lamhebrew">א (Alef)<p class="poetry">How blessed are those whose actions are blameless, <p class="poetry">who obey the law of the Lord.</p>'
	),
	'How blessed are those whose actions are blameless, who obey the law of the Lord.'
);
check(
	'NET Ps 119:113 acrostic heading with <b> removed',
	cleanNETVerseText(
		'<p class="lamhebrew"><b>ס (</b>Samek<b>)</b><p class="poetry">I hate people with divided loyalties, <p class="poetry">but I love your law. </p>'
	),
	'I hate people with divided loyalties, but I love your law.'
);

// ── NET paragraphs ─────────────────────────────────────────────────────────
const poem = '<p class="poetry">Serve the Lord in fear.<p class="poetry">Repent in terror. </p>';
const prosePara = '<p class="bodytext">Now when Jesus saw the crowds, he went up the mountain.';
const proseCont = 'He began to teach them by saying:';
check('NET poetry line mid-psalm is not a paragraph', isNETParagraphStart(poem, poem, 11), false);
check('NET verse 1 of a psalm is a paragraph', isNETParagraphStart(poem, poem, 1), true);
check('NET first verse of response is a paragraph', isNETParagraphStart(poem, null, 4), true);
check(
	'NET poetry after prose is a paragraph (Matt 5:3)',
	isNETParagraphStart(poem, proseCont, 3),
	true
);
check('NET bodytext is a paragraph', isNETParagraphStart(prosePara, poem, 13), true);
check('NET untagged verse is not a paragraph', isNETParagraphStart(proseCont, prosePara, 2), false);
check(
	'NET poetrybreak (stanza) is a paragraph',
	isNETParagraphStart('<p class="poetrybreak">“So now, children, listen to me;', poem, 32),
	true
);

// ── ESV ────────────────────────────────────────────────────────────────────
const esvPs3 =
	'A Psalm of David, when he fled from Absalom his son.\n\n    [1] O LORD, how many are my foes!\n        Many are rising against me;\n    [2] many are saying of my soul,\n        “There is no salvation for him in God.” Selah\n    \n\n';
check(
	'ESV Ps 3 title moved into verse 1',
	placeESVPsalmHeadings(esvPs3, 'Psalms').replace(/\s+/g, ' ').trim(),
	'[1] A Psalm of David, when he fled from Absalom his son. O LORD, how many are my foes! Many are rising against me; [2] many are saying of my soul, “There is no salvation for him in God.” Selah'
);
const esvPs41_42 =
	'    [13] Blessed be the LORD, the God of Israel,\n        from everlasting to everlasting!\n                                  Amen and Amen.\n    \n    \n    To the choirmaster. A Maskil of the Sons of Korah.\n\n    [1] As a deer pants for flowing streams,\n        so pants my soul for you, O God.\n    \n\n';
const ps42 = placeESVPsalmHeadings(esvPs41_42, 'Psalms');
check(
	'ESV Ps 41:13 no longer carries Ps 42 title',
	ps42.replace(/\s+/g, ' ').trim(),
	'[13] Blessed be the LORD, the God of Israel, from everlasting to everlasting! Amen and Amen. [1] To the choirmaster. A Maskil of the Sons of Korah. As a deer pants for flowing streams, so pants my soul for you, O God.'
);
check('ESV Ps 42:1 still a paragraph start', /\n\s*\n\s*\[1\]/.test(ps42), true);
const esvPs119 =
	'    [7] I will praise you with an upright heart,\n        when I learn your righteous rules.\n    [8] I will keep your statutes;\n        do not utterly forsake me!\n    \n    \n    Beth\n\n    [9] How can a young man keep his way pure?\n';
check(
	'ESV Ps 119 stanza name removed',
	placeESVPsalmHeadings(esvPs119, 'Psalms').replace(/\s+/g, ' ').trim(),
	'[7] I will praise you with an upright heart, when I learn your righteous rules. [8] I will keep your statutes; do not utterly forsake me! [9] How can a young man keep his way pure?'
);
check(
	'ESV Ps 119:1 leading stanza name removed',
	placeESVPsalmHeadings('Aleph\n\n    [1] Blessed are those whose way is blameless,\n', 'Psalms')
		.replace(/\s+/g, ' ')
		.trim(),
	'[1] Blessed are those whose way is blameless,'
);
const prose =
	'  [1] Seeing the crowds, he went up on the mountain.\n\n  [2] And he opened his mouth\n';
check('ESV non-Psalms untouched', placeESVPsalmHeadings(prose, 'Matthew'), prose);

console.log(`\nscripture-text: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
