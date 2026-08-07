# Linked Studies — Design Plan

**Status:** ON HOLD. Not scheduled; no code written.
**Last updated:** 2026-08-07

**Why it's parked:** the original trigger — "studies over 500 verses must be split" — does
not hold. No chapter exceeds 500 verses, and long books are already legal today as
multiple passages in one study. Nothing is broken, so this is a build-it-because-it's-better
feature rather than a fix.

**Before resuming, start at Q1.** The reframing is unresolved and the rest of this document
assumes an answer to it.

> **Note on this revision.** This document previously carried an inline record of its own
> corrections — which sentences had been withdrawn, and when. That has been removed in favour
> of a clean statement of the current design. What survives of it is §12 (**Traps**), which
> records things that are _not true of the code_ rather than things that were once written
> here. Question numbers are unchanged (Q1–Q37 mean what they did); former Q38 is resolved
> and now sits in the decisions log, and former Q39 is merged into Q33.

---

## 1. The case for the feature

Three reasons, none of them a limit:

1. **Teaching cadence.** A 16-week Romans series is 16 studies because that is how it is
   taught — one sitting, one chapter. Nothing to do with verse counts.
2. **Analyze ergonomics.** Structure, connections, columns and the layout overlay all scale
   with verse count. A 433-verse study is legal but unpleasant to work in.
3. **Navigability.** 16 sibling studies in the Finder is clutter; one collapsible series with
   prev/next is not.

**Q1. Reframe from "a workaround for long studies" to "a series of studies that belong
together"?** Everything below assumes yes. Under that framing the verse caps are guardrails
on individual parts, not the reason the feature exists.

---

## 2. Constraints that bind

**`COMPLIANCE.md` is authoritative for everything in this section.** Only the consequences
for _this feature_ are stated here; the terms, the probe evidence and the reasoning are not
repeated, because two copies of a licence rule drift and the copy in the design document is
the one that gets stale.

| Constraint                                                                                                                                                       | Consequence for a series                                                                               | Authority                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| ESV cannot serve or display a whole book — **60 of 66 books**. Only the six single-/double-chapter books are exempt (Obadiah, Philemon, 2–3 John, Jude, Haggai). | A series cannot be justified as a route to whole-book ESV study. It is not one, by any arrangement.    | §1 "The core distinction", §1 "The probe evidence" |
| The display cap applies to the **assembled page**, not the request. Several legal queries can compose an illegal page.                                           | **Splitting a book into passages does not make it displayable.** Neither does splitting it into parts. | §1.6 "The multi-passage display gap"               |
| The cap is **one** limit — `min(500 verses, half the book)` — not two.                                                                                           | Per-part validation must resolve the binding number before reporting, or it warns twice.               | §1.7 "Whichever is less is one limit"              |
| NET chunks, ESV deliberately does not.                                                                                                                           | A NET part may be any length; an ESV part is capped at one request. Join must branch on translation.   | §1.5 "The third axis: retrieval"                   |
| Display is checked per page; distribution is checked per exported artifact.                                                                                      | Per-part at creation; **aggregated across all parts** at export. See §10.                              | §2 "Where each rule lives in code"                 |

Two things this feature must not assume:

- **NET's 500-verse cap is ours, not the publisher's** (`source: self-imposed`), so user-facing
  copy must not attribute it to Crossway or Biblical Studies Press.
- **`enforcement` is `'warn'` for both translations today.** Anything built here should keep
  working when it flips to `'block'` at release.

---

## 3. Terminology

Current vocabulary: `Study`, `Study Group` (nestable folder), `Passage`, `Column`, `Section`,
`Segment`, `Connection`.

"Linked Studies" names the mechanism rather than the thing, and collides conceptually with
`Connection`, already our word for "link between two things."

| Concept             | Proposed                | Why                                                                          |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| The whole sequence  | **Series**              | Matches how teachers speak ("a series on Romans"); no collision              |
| One study within it | **Part**                | Neutral; "Session" presumes teaching, "Chapter" collides with Bible chapters |
| Label shown to user | **"Part 3 of 16"**      | Unambiguous, reads aloud naturally                                           |
| Creating one        | **Split into a series** | See the collision note below                                                 |
| Adding a part       | **Split Part**          |                                                                              |
| Combining parts     | **Join Parts**          | Matches the `column-join` precedent                                          |

**Naming collision.** `column-split.svg` / `column-join.svg` exist and `passageJoin.js` is an
existing module, so "Split"/"Join" at the _study_ level reads ambiguously beside the same
words at the _column_ level. Options: (a) accept it, disambiguated by toolbar context;
(b) use Divide/Merge for studies, keep Split/Join for columns; (c) always qualify — "Split
Study" / "Join Studies". _Rec: (c) — cheap and unambiguous._

**Q2. Series/Part, or different words?**
**Q3. Which disambiguation — (a), (b) or (c)?**

---

## 4. Data model

### Recommendation: a `study_series` table + two columns on `study`

```ts
export const studySeries = pgTable('study_series', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),          // "Romans"
  subtitle: text('subtitle'),
  description: text('description'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => studyGroup.id, { onDelete: 'cascade' }),
  translation: text('translation').notNull().default('esv'),
  isCollapsed: boolean('is_collapsed').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull()
});

// on `study`:
seriesId:    text('series_id').references(() => studySeries.id, { onDelete: 'set null' }),
seriesOrder: integer('series_order')   // NULL for standalone studies
```

`study` has **no** `displayOrder` today — only `studyGroup` does — so parts need an explicit
`seriesOrder`; there is no existing ordering to lean on.

**Why a table:**

- Series-level title/subtitle/description live somewhere real, rather than being inferred
  from part 1 (which breaks the moment part 1 is deleted or reordered).
- `groupId` belongs to the series, so a series occupies one slot in a group — matching the
  Finder, where a series is one row.
- Mirrors the existing `studyGroup` shape (`isCollapsed`, `displayOrder`, `parentGroupId`),
  so Finder code and collapse state reuse established patterns.
- Deleting a series can `set null`, leaving parts as standalone studies instead of cascading
  away a user's work.

**Rejected — `study.seriesParentId`:** cheaper migration, but part 1 becomes load-bearing and
every query needs "am I a parent or a child?" branching.

**Rejected — `studyGroup` with `kind: 'series'`:** nesting, collapse and ordering already
work, but groups are arbitrary nestable folders while a series is a flat ordered sequence with
invariants. Overloading one table with two rule sets will leak.

### Ordering

Structural tables order by `startingWordId`, a canonical Bible-order key. Parts could derive
order the same way, from each part's first passage.

_Rec: store `seriesOrder` explicitly but **derive** it on create/split/join/move from
canonical passage order, re-normalising to 1..N after every mutation. Explicit keeps queries
simple and indexable; deriving keeps it honest. Purely derived breaks for a non-contiguous
series (Q7); purely manual invites drift._

**Q4. `study_series` table, or `study.seriesParentId`?**
**Q5. `seriesOrder` explicit-but-derived, or purely derived?**
**Q6. On series delete — orphan parts (`set null`), or cascade?** _Rec: orphan._

### Invariants

| Invariant                     | Rec                   | Note                                                        |
| ----------------------------- | --------------------- | ----------------------------------------------------------- |
| Same translation across parts | **Enforce**           | Mixed translations would break the export attribution story |
| Same book across parts        | Allow multi-book      | Otherwise a legitimate "Prison Epistles" series is blocked  |
| Contiguous, non-overlapping   | **Warn, don't block** | Overlap is normal when a pericope straddles a chapter       |
| Min/max parts                 | 2..50, soft           | Psalms at one chapter per part is 150 parts (Q10)           |

**Q7. Must a series be contiguous?** _Rec: no — warn only._
**Q8. Multi-book series allowed?** _Rec: yes._

---

## 5. Creation UX

### Where series get created

1. **New Study flow** — if the range spans ≥2 chapters, offer _"This spans 16 chapters.
   Create as: ( ) One study ( ) A series of studies"_ with a chapters-per-part stepper.
2. **From an existing study** — "Split into a series…" in the study menu.
3. **Ad hoc** — Split Part / Join Parts within an existing series.

### Chapters per part

A stepper defaulting to **1**, with a live preview:

```
Chapters per part:  [− ] 1 [ +]        16 parts · avg 27 verses each
   Part 1  Romans 1      (32 verses)
   Part 2  Romans 2      (29 verses)
   …
```

The preview matters more than the control — it is how the user notices that Psalms at one
chapter per part means 150 parts _before_ committing.

**Uneven parts.** Fixed chapters-per-part gives wildly uneven verse counts (Psalm 117 has 2
verses; Psalm 119 has 176). Options: (a) fixed chapter count, accept unevenness; (b) balance
by verse count, breaking on chapter boundaries; (c) both. _Rec: (a) by default — chapter
boundaries are meaningful to readers in a way equal verse counts are not — with (b) offered
as "Balance by length"._

**Q9. Default 1 chapter per part?** _Rec: yes._
**Q10. Cap the number of parts?** _Rec: soft-warn above ~30, confirm at 150._
_Note the apparent inconsistency with §11.1, which rejects a hard cap on verse count. These
are different quantities. Verse count is uncapped because the cost is an unmeasured rendering
issue, and capping it would encode a browser quirk in the data model. Part count is a UI
problem we can see directly — 150 Finder rows and a 150-entry dropdown — and 150 parts is
almost certainly a mis-click. Prefer a confirmation step over a refusal._

**Q11. Offer "balance by length"?** _Rec: yes, phase 2._
**Q12. Can a part contain a partial chapter (Rom 1:1–17)?** _Rec: yes — pericopes don't
respect chapter boundaries._

---

## 6. Finder

A series renders as one row with a chevron, like a group:

```
▸ 📖 Romans                          Series · 16 parts

▾ 📖 Romans                          Series · 16 parts
     1  Romans 1
     2  Romans 2
     3  Romans 3    ← current
```

Reuses `studyGroup`'s `isCollapsed` pattern and `expandGroupAncestors()`, which will need a
sibling `expandSeriesAncestors()` (or a generalisation) so deep-linking to part 7 expands both
its series and any enclosing groups.

**Q13. Can a series live inside a group?** _Rec: yes — `studySeries.groupId`._
**Q14. Can a series nest, or contain a group?** _Rec: no. Flat sequence only._
**Q15. Distinct icon, or the group folder icon?** _Rec: distinct — see §9._
**Q16. Show part count / verse total on the row?** _Rec: part count always; verse total on hover._
**Q17. Drag a standalone study into a series?** _Rec: phase 3 — needs invariant checks._
**Q18. What does clicking the series row do?** _Rec: chevron expands; the title opens the
last-viewed part, falling back to part 1, matching `user.lastStudyView`._

---

## 7. Navigation

At the far right of the study header:

```
[ Romans 3 ▾ ]                              ‹  Part 3 of 16  ›
```

- `‹` / `›` disabled at the ends, not hidden — layout stability.
- **"Part 3 of 16"** is a dropdown for direct jumps. Essential at 16 parts; mandatory at 150.
- Keyboard `⌥←` / `⌥→`. Bare arrows belong to text/segment selection.
- Preserve the current view (Analyze/Document) across navigation. `user.lastStudyView` already
  persists this; it must not reset when moving between parts.

**Q19. Wrap around at the ends?** _Rec: no._
**Q20. Prefetch adjacent parts?** _Rec: yes, phase 2 — next part's cached text on idle._
**Q21. Keyboard shortcut?** _Rec: `⌥←`/`⌥→`._
**Q22. Progress indicator?** _Rec: text only, no bar._

---

## 8. Boundary moves, Split and Join

The hard part: moving text/segments/sections/columns from the start of one part to the end of
the previous, or from the end of one part to the start of the next.

### What already exists

- `passageReconcile.js` — `analyzeEdit()`, used when a study's passage range changes; works out
  what structure survives.
- `passageJoin.js` — joining structural units.
- Structure is keyed by `startingWordId`, which is **globally canonical**
  (book/chapter/verse/word), not per-study. This is the most important fact for this feature:
  **moving a boundary requires no re-keying.** A segment keyed at `ROM.3.1.1` is valid in
  whichever part contains Romans 3:1.

### What a boundary move must do

1. Adjust both parts' passage ranges.
2. Move the affected `passage_column` / `passage_section` / `passage_segment` rows.
3. Handle connections that now cross a part boundary — below.
4. Re-fetch or re-slice `passage.cachedText` for both parts.
5. Re-normalise `seriesOrder`.

### ⚠️ The unsolved problem: cross-part connections

`segmentConnection` has a `studyId` and references two segments. If its endpoints end up in
**different parts** it is currently unrepresentable — and this will happen constantly, because
a connection drawn across a chapter boundary is exactly what a user later splits.

This is the biggest design risk in the feature.

- **(a) Block the move** if it would orphan a connection. Safe; the user hits a wall with no
  remedy.
- **(b) Delete the connection**, with warning and undo. Honest, destructive.
- **(c) Keep it, scoped to the series** — add `seriesId` to `segmentConnection`, allow endpoints
  in different parts, render a stub arrow at the edge ("continues in Part 4"). Most powerful,
  most work, and arguably the feature's best justification: cross-chapter connections are
  precisely what a Romans series wants.
- **(d) Convert to a reference** — a note pointing at the other part, not a drawn arc.

_Rec: **(b) for phase 1** with a pre-move warning listing affected connections; **(c) as the
phase-3 goal**. Add `seriesId` to `segmentConnection` in the phase-1 migration so (c) needs no
second migration._

**Q23. Which strategy, and for which phase?**
**Q24. Granularity — verse, segment, section, column, or all four?** _Rec: start with section
and column (clean structural units), add segment in phase 2, skip raw verse/word moves — too
fiddly for the value._
**Q25. Should boundary moves be undoable?** _Rec: yes — and this may force a general undo
mechanism, worth scoping before committing._

### Split Part / Join Parts

- **Split Part** — divide at the selected boundary, renumber the rest. Validate each result
  with `checkSinglePassageSupport(range, translationId)`, which reports whether the translation
  can serve that range as one passage and why not (`'exceeds-request'` / `'complete-book'`).
- **Join Parts** — merge with the next or previous part, validating the _combined_ range.

The original spec said a joined part must not exceed 500 verses. That was never the rule, and
is not even per-passage any more:

| Translation | Merged part over 500 verses                                        |
| ----------- | ------------------------------------------------------------------ |
| **NET**     | Fine, unconditionally. One passage, several requests.              |
| **ESV**     | Needs several passages, each ≤500 verses and none a complete book. |

**Q26. What should a join do when the merged range exceeds one passage?** _Rec: ask
`checkSinglePassageSupport` and branch. For NET, join silently — there is nothing to warn
about. For ESV, say how many passages the merged part will need and let the user confirm,
rather than blocking or silently restructuring._
**Q27. Join with previous, next, or arbitrary?** _Rec: next and previous; not arbitrary._
**Q28. What happens to titles/subtitles/commentary on join?** _Rec: keep the first part's
title, concatenate commentary under sub-headings, warn before discarding anything._

---

## 9. Icons

Reusable today: `chevron-right`/`chevron-down` (expand, matching groups),
`caret-left`/`caret-right` (prev/next), `column-split`, `column-join`, `folder`, `folders`,
`book-open`, `book-plus`, `bookmark`.

| New                            | Purpose                | Design                                                                                                                     |
| ------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `books.svg`                    | A series in the Finder | Two or three stacked/spined books — "several, in order", distinct from `folder` (container) and `book-open` (single study) |
| `study-split.svg`              | Split Part             | A page divided by a vertical dashed rule, outward arrow each side — echoes `column-split` at study scale                   |
| `study-join.svg`               | Join Parts             | Two pages converging with inward arrows — mirror of the above                                                              |
| `series-part.svg` _(optional)_ | Marker on a part row   | A single book with a numeric badge; likely unnecessary if numbering is text                                                |

_Rec: `book-open` for a standalone study, `books` for a series, so the Finder reads "one book
vs. several." Use carets rather than arrows for prev/next — carets read as "step through a
sequence," arrows as "move a thing."_

**Q29. `books`, or a folder variant to echo groups?**
**Q30. Carets or arrows?** _Rec: carets._
**Q31. Do we need `series-part.svg`?** _Rec: no._

---

## 10. Export & compliance interaction

Two limits touch this feature, at two points: **display**, per part at creation; and
**distribution**, aggregated at export. Neither shapes the data model.

- **Per part, at creation.** Each part is its own page, so `validateStudyDisplayLimits()`
  applies to each independently. A 16-part Romans series has no single page over half of
  Romans, so the per-study check stays silent — correctly, on the reading that a series is not
  a page. That reading is an interpretation, not a finding; see Q33.
- **Whole series, at export.** A whole-book series trips ESV's `allowCompleteBook: false`, and
  a long one trips `maxVerses: 1000`. Both are `'warn'` today.
- **Export must aggregate across all parts.** Otherwise a 16-part Romans series exports 16
  individually-compliant files that together reproduce the complete book.
  `validateExportLimits()` already aggregates per book across passages, using a verse-identity
  `Set` so overlapping parts are not double-counted. It needs the series' full passage set,
  not one part's.
- **Each exported part carries attribution independently**, since parts travel separately.
- ⚠️ **`validateExportLimits()` has no caller** — see §12.

**Q32. Offer "Export whole series"?** _Rec: yes, phase 3, and it must run the series-wide
check. This is the most likely way to breach the ESV quotation terms, so it deserves `'block'`
even while per-part export stays `'warn'`._

**Q33. Should the display check aggregate across parts at creation time?** A series is not a
page, so per-study is probably right and the aggregate belongs at export (Q32). _Rec: an
informational note when an ESV series would span a complete book — not a blocker — on the
ground that per-part display is compliant and `enforcement` is `'warn'` everywhere._

**Q36. Accept the ESV whole-book cap, or seek a broader Crossway licence?** _Rec: accept it,
surface it honestly, and open a licence conversation before any public launch._

**Q37. Keep the self-imposed NET 500-verse request cap?** _Rec: yes._ A single 2,461-verse
fetch is slow, caches a huge blob, and lands ~55,000 spans in the DOM — squarely where §11.1
lives. Keep the guardrail; just describe it accurately.

---

## 11. Phasing

**Phase 1 — structure and navigation, no boundary editing**

- `study_series` table; `study.seriesId` / `seriesOrder`; `segmentConnection.seriesId` (unused,
  for later)
- Create-as-series in the New Study flow, chapters-per-part stepper with preview
- Finder series row: chevron, collapse state, expand-on-deep-link
- Header prev/next and "Part N of M" jump dropdown
- `books.svg`
- _Excluded deliberately: split, join, boundary moves. This phase is independently useful._

**Phase 2 — restructuring**

- Split Part / Join Parts (+ `study-split.svg`, `study-join.svg`)
- Boundary moves for sections and columns
- Cross-part connections: warn-and-delete
- Adjacent-part prefetch; "balance by length"

**Phase 3 — polish**

- Cross-part connections preserved with edge stubs
- Segment-level boundary moves
- Drag standalone studies into a series; reorder parts
- Export whole series with the series-wide compliance check

**Q34. Is phase 1 useful without split/join?** _Rec: yes — creating a series up front and
navigating it covers the main workflow._
**Q35. Scope undo before phase 2?** Boundary moves are destructive and users will expect `⌘Z`.
_Rec: decide before starting phase 2._

### 11.1 Known issue: Safari scroll choppiness at 400+ verses

Reproducible: choppy in Safari, fine in Chrome, at ~400+ verses (Revelation, Romans).
**Every item below is an unmeasured hypothesis.** An earlier confident diagnosis here was
wrong, so measure before changing anything.

1. The `transform: scale()` layer on `.analyze-content-inner` — Safari re-rasterizes large
   scaled layers on scroll. Test at 100% zoom vs 90% to isolate.
2. Absent CSS containment across ~24,000 nodes. Try `contain: layout style paint` on `.segment`.
3. `will-change: scroll-position` — try removing it.

`ConnectionsOverlay.svelte` already records Safari falling behind on repaint, so this is a
recurring weakness rather than a new one.

Chunked retrieval concentrated the DOM weight without changing its cause: a 2,461-verse NET
Psalms study used to be six passages and is now one, so ~55,000 spans land inside a single
`passage` element. Total node count is unchanged. That makes suspects 1 and 2 **more** likely
and gives a sharper test: compare one 2,461-verse passage against the same range as six.

**This must not influence the data model.** Splitting studies to dodge a rendering issue would
bake a browser quirk into the schema permanently.

A hard cap was considered and rejected. `src/lib/config/studyLimits.js` is **advisory only** —
`assessStudySize()` returns `'ok' | 'notice' | 'warning'` at 600 / 1,200 verses and nothing is
blocked. Choppiness begins around **400** verses, below any round number one would pick, so a
500-verse cap would permit the bad experience it was meant to prevent while blocking legitimate
studies. The thresholds deliberately avoid 1,000, because Crossway's quotation permission is
also 1,000 and two unrelated limits sharing a value is how the earlier confusion started. These
numbers are ours, which is why they live in `src/lib/config/` and not `translations.json`.

---

## 12. ⚠️ Traps

Things that are **not true of the code**, each of which has already cost time. Kept because
the code states what it does, not why the obvious alternative fails.

1. **`maxBookPortion` exists on two axes and means different things.**
   `display.maxBookPortion` is `0.5`; `distribution.maxBookPortion` is `null` **on purpose**.
   The display clause measures the biblical book; the distribution clause measures the ESV's
   share of the user's document. This has been conflated twice. Do not "fix" the `null`.
2. **`chapterData` is a one-element array wrapping a chapter→verse-count map**, not an array of
   chapters. Read naively it reports every book as having 1 chapter. This broke two separate
   verification harnesses. Index `[0]` first.
3. **Book ids are not the obvious abbreviations.** Philemon is `PN`, Jude is `JD`, 2/3 John are
   `2JN`/`3JN`. Guessed ids fall through the not-found guard and pass silently, because
   `bookTotal <= 0` fails quietly.
4. **`validateExportLimits()` has no caller.** It is written and correct by inspection, but
   `MenuExport` / `exportAnalyze.js` do not invoke it. Wire it up for single studies _before_
   building the series-wide check on top of a function that has never run.
5. **Splitting a book into passages does not make it displayable under ESV.** The display cap
   applies to the assembled page, so legal queries can compose an illegal page. Advice to
   "add it as several smaller passages" is wrong and was shipped once.
6. **Two premises in this document's history were false and cost real work:** that studies over
   500 verses must be split (relitigated three times — no chapter exceeds 500 verses), and that
   short books return whole because of a _verse_ floor (there is no floor; the exception is
   structural, single- and double-chapter books). A planned bisecting probe for the second would
   have found no boundary and produced a confident wrong number.

---

## 13. Open questions

Highest-stakes first — the first four are hard to reverse once code exists.

1. **Q1** — the reframing. Everything depends on it.
2. **Q23** — cross-part connections: block / delete / preserve. Biggest technical risk, and it
   decides whether phase 1's migration adds `segmentConnection.seriesId` speculatively.
3. **Q4** — `study_series` table vs. `study.seriesParentId`.
4. **Q24** — boundary-move granularity. Drives most of phase 2.
5. **Q2/Q3** — terminology, including the Split/Join collision.
6. **Q32/Q33** — export whole series, and whether display aggregates across parts.
7. Q5–Q22, Q25–Q31, Q34–Q37 — inline above.

---

## 14. Decisions log

Decisions with live consequences. Reasoning included so they are not relitigated.

| Question                             | Decision                                                         | Reasoning                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where limits are enforced            | Request at fetch, display at create/edit, distribution at export | Three different boundaries; conflating them is the recurring bug in this codebase                                                                                        |
| 500-verse rule as the series trigger | **Rejected** as primary driver                                   | No chapter exceeds 500 verses; multi-passage already absorbs long books                                                                                                  |
| Chunk NET?                           | **Yes**                                                          | Its cap is our own guardrail with no server-side control, so chunking routes around nothing. Psalms = 1 passage, 6 requests                                              |
| Chunk ESV?                           | **No**                                                           | Crossway polices completeness server-side; sub-whole chunks would each succeed and defeat a deliberate control                                                           |
| Auto-split user selections           | **Removed**                                                      | Turning one requested passage into six was surprising; passage shape is a document-structure decision belonging to the user (former Q38)                                 |
| Split rule, where it lives           | Fetch layer only                                                 | Chapter-boundary greedy fill, invisible to the user (`splitRangeIntoPassages`)                                                                                           |
| Auto-split in the edit flow          | **Not applied**                                                  | Edits diff by passage `id`; split parts have none, so a remove would cascade and destroy structure                                                                       |
| ESV whole-book truncation            | **Confirmed** by probe                                           | HTTP 200, `canonical: "Revelation 1–12:8"`, 202/404 verses, no error field — silent                                                                                      |
| ESV truncation trigger               | **Completeness, not size**                                       | Galatians (149v) halved; Romans 1:18–8:39 (208v) returned whole                                                                                                          |
| Short-book exemption                 | **Structural, not a verse floor**                                | Single- and double-chapter books, six of them. No bisecting probe needed                                                                                                 |
| Truncation detection method          | Verse-count ratio, not `canonical`                               | String comparison gave 4 false positives in 9 probes; verse counting gave 0                                                                                              |
| Detection thresholds                 | <90% **and** >15 verses short                                    | ESV legitimately omits late-manuscript verses (Mark 9 = 48/50, John 5 = 46/47)                                                                                           |
| "Chunking = circumvention" argument  | **Withdrawn**                                                    | A study can already show a whole book as several passages, so chunking reproduces no extra text with no extra requests. Replaced by "don't defeat a server-side control" |
| Hard cap on study verse count        | **Rejected**                                                     | Choppiness starts ~400 verses, below any round cap — a 500 cap would permit the bad case and block legitimate ones. Advisory only                                        |
| `distribution.maxBookPortion`        | **`null` for both**                                              | Crossway's 50% there measures the ESV's share of the user's document, not of the biblical book                                                                           |
| `display.maxBookPortion`             | **`0.5` for ESV**                                                | The terms cap display per page in those words, excepting single/double-chapter books                                                                                     |
| Safari choppiness                    | Out of scope, tracked in §11.1                                   | A rendering issue; must not shape the data model                                                                                                                         |
| Limit message attribution            | `source`-aware                                                   | `validatePassageLimits` once blamed the provider for our own cap. Any new limit copy must check `source` first                                                           |
