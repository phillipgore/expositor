# Linked Studies — Design Plan

Living document. Updated as we decide things.

**Status:** ON HOLD — parked 2026-08-03. Not scheduled; no code written.
**Last updated:** 2026-08-03 (revised after the limits/compliance fix, then parked)

> **Why it's parked:** the limits investigation removed the urgency. The original
> trigger — "studies over 500 verses must be split" — turned out not to hold (no
> chapter exceeds 500 verses, and long books are already legal today as multiple
> passages in one study). Nothing is broken, so this became a
> build-it-because-it's-better feature rather than a fix, and it can wait.
>
> The document is kept because the measurements and the confirmed ESV
> complete-book behaviour in §12 are worth not rediscovering. **Before resuming,
> start at Q1 (§0) — the reframing is unresolved and everything below assumes an
> answer to it.**

---

## 0. TL;DR — what changed, and why it matters

The original framing was:

> For Studies that are too long (more than 500 verses) there will be linked studies.

After fixing the limits bug (see `COMPLIANCE.md`), **that premise no longer holds.** The
numbers, measured from `bible.json`:

| Question                                                     | Answer                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Is any single chapter over 500 verses?                       | **No.** Longest is Psalm 119 at 176.                                                                   |
| How many books exceed 500 verses in total?                   | **24 of 66.**                                                                                          |
| Can a >500-verse book be one study today?                    | **Yes** — as multiple passages. Genesis = 4 passages, one study.                                       |
| How many books fit in a single passage _by verse count_?     | **42 of 66** (Romans, Galatians, Philemon, all of them).                                               |
| How many of those the **ESV API will actually serve** whole? | **Far fewer** — see §12.3. ESV silently returns ~50% of _any_ complete book, even 149-verse Galatians. |

The 500-verse cap is a **per-API-request** ceiling, and `passage` is already the unit
that maps to one request. A study holds many passages. So **the 500-verse limit almost
never forces a split** — the existing multi-passage mechanism absorbs it.

**This is good news, but it means the feature needs a new justification.** If we keep
"over 500 verses" as the trigger, Linked Studies fires for 24 books, is redundant with
multi-passage for all of them, and never fires for the case you actually described
(one chapter per study — which is mostly _short_ books).

### The real reasons to build it

1. **Teaching cadence.** A 16-week Romans series is 16 studies because that's how it's
   taught — one sitting, one chapter. Nothing to do with verse counts.
2. **Analyze ergonomics.** Structure, connections, columns and the layout overlay all
   scale with verse count. A 433-verse single study is legal but unpleasant to work in.
3. **Navigability.** 16 sibling studies in the Finder is clutter; one collapsible series
   with prev/next is not.

**Recommendation: reframe from "a workaround for long studies" to "a series of studies
that belong together."** The verse cap becomes a guardrail on individual parts (already
enforced), not the reason the feature exists.

⚠️ **One genuine external constraint did survive investigation.** The ESV API refuses to
return a _complete book_ in one request — confirmed by probe, silently, at ~50%, and for
short books as well as long ones (§12.3). This does **not** resurrect the 500-verse
premise (it isn't a verse limit; Romans 1:18–8:39 returns all 208 verses while whole
Romans returns 216 of 433). But it does mean a whole-book ESV study must always comprise
at least two sub-whole passages, and that **we must not design Linked Studies as a way to
reassemble a complete book from parts** — that would be circumventing a licence control
rather than working within it.

⚠️ **This reframing is the biggest open question in the document. Everything below
assumes it. See Q1.**

---

## 1. Terminology

Current vocabulary: `Study`, `Study Group` (nestable folder), `Passage`, `Column`,
`Section`, `Segment`, `Connection`.

"Linked Studies" describes the mechanism (they're linked) rather than the thing
(a sequence with an order). It also collides conceptually with `Connection`, which is
already our word for "link between two things."

| Concept             | Proposed                | Alternatives                          | Why                                                                                            |
| ------------------- | ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The whole sequence  | **Series**              | Linked Studies, Sequence, Course, Arc | Short, matches how teachers speak ("a series on Romans"), no collision                         |
| One study within it | **Part**                | Installment, Session, Volume, Entry   | Neutral about content; "Session 3" presumes teaching, "Chapter 3" collides with Bible chapters |
| Label shown to user | **"Part 3 of 16"**      | "3/16", "Session 3"                   | Unambiguous, reads aloud naturally                                                             |
| Creating one        | **Split into a series** | Divide, Chunk, Break up               | "Split" already means something for columns/sections — see risk below                          |
| Adding a part       | **Split Part**          | Divide Part, New Part                 | Matches your original wording                                                                  |
| Combining parts     | **Join Parts**          | Merge Parts, Combine                  | Matches `column-join` precedent                                                                |

⚠️ **Naming collision:** `column-split.svg` / `column-join.svg` already exist, and
`passageJoin.js` is an existing module. "Split"/"Join" at the _study_ level will read
ambiguously next to "Split"/"Join" at the _column_ level. Options: (a) accept it,
disambiguated by toolbar context; (b) use **Divide/Merge** for studies and keep
Split/Join for columns; (c) always qualify — "Split Study" / "Join Studies".
_Rec: (c) — always qualified in labels and tooltips, cheap and unambiguous._

**Q2. Series/Part, or different words?**
**Q3. Which split/join disambiguation — (a), (b) or (c)?**

---

## 2. Data model

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

Note `study` currently has **no** `displayOrder` — only `studyGroup` does. So parts need
an explicit `seriesOrder`; we can't lean on existing ordering.

**Why a table rather than self-referencing `study.seriesParentId`:**

- Series-level title/subtitle/description live somewhere real, instead of being inferred
  from part 1 (which breaks the moment part 1 is deleted or reordered).
- `groupId` moves to the series, so a series occupies one slot in a group — matching the
  Finder model, where a series is one row.
- Mirrors the existing `studyGroup` shape (`isCollapsed`, `displayOrder`, `parentGroupId`),
  so Finder code and collapse state reuse established patterns.
- Deleting a series can `set null` and leave orphaned parts as standalone studies, rather
  than cascading away a user's work.

**Rejected — `study.seriesParentId`:** cheaper migration, but part 1 becomes load-bearing
and every query needs "am I a parent or a child?" branching.

**Rejected — reusing `studyGroup` with `kind: 'series'`:** tempting (nesting, collapse
and ordering already work), but groups are arbitrary nestable folders while a series is a
flat ordered sequence with invariants (contiguous, same book, same translation). Overloading
one table with two sets of rules will leak.

### Ordering: explicit `seriesOrder` vs derived from content

Structural tables order by `startingWordId` (`asc(passageColumn.startingWordId)` etc.) —
a canonical Bible-order key, no manual bookkeeping. We could do the same for parts and
derive order from each part's first passage.

_Rec: **store `seriesOrder` explicitly, but derive it** on create/split/join/move from
canonical passage order, and re-normalise to 1..N after every mutation. Explicit keeps
queries simple and cheap to index; deriving keeps it honest. A pure-derived approach
would break for a non-contiguous series (Q7), and pure-manual invites drift._

**Q4. `study_series` table, or `study.seriesParentId`?**
**Q5. `seriesOrder` explicit-but-derived, or purely derived?**
**Q6. On series delete — orphan parts as standalone (`set null`), or cascade?** _Rec: orphan._

### Invariants — how strict?

| Invariant                     | Rec                   | Note                                                              |
| ----------------------------- | --------------------- | ----------------------------------------------------------------- |
| Same translation across parts | **Enforce**           | Mixed-translation series would break the export attribution story |
| Same book across parts        | Allow multi-book      | Blocks a legitimate "Prison Epistles" series otherwise            |
| Contiguous, non-overlapping   | **Warn, don't block** | Overlap is normal when a pericope straddles a chapter             |
| Min/max parts                 | 2..50, soft           | Psalms at one-chapter-per-part = 150 parts (see Q10)              |

**Q7. Must a series be contiguous?** _Rec: no — warn only._
**Q8. Multi-book series allowed?** _Rec: yes._

---

## 3. Creation UX

### Where series get created

1. **New Study flow** — after passages are chosen, if the range spans ≥2 chapters, offer:
   _"This spans 16 chapters. Create as: ( ) One study ( ) A series of studies"_ with a
   chapters-per-part stepper.
2. **From an existing study** — "Split into a series…" in the study menu.
3. **Ad hoc** — Split Part / Join Parts inside an existing series.

### Chapters per part

Your spec: _"Users will need some way to indicate if they want to start with 1 chapter per
linked study or more than one and if so how many."_

_Rec: a stepper defaulting to **1**, with a live preview:_

```
Chapters per part:  [− ] 1 [ +]        16 parts · avg 27 verses each
   Part 1  Romans 1      (32 verses)
   Part 2  Romans 2      (29 verses)
   …
```

The preview matters more than the control — it's how the user notices that Psalms at 1
chapter/part means 150 parts _before_ committing.

⚠️ **Uneven parts.** Fixed chapters-per-part gives wildly uneven verse counts (Psalm 117
has 2 verses; Psalm 119 has 176). Options: (a) fixed chapter count, accept unevenness;
(b) balance by verse count, breaking on chapter boundaries; (c) offer both.
_Rec: (a) as the default — chapter boundaries are meaningful to readers in a way that
equal verse counts are not — with (b) available as "Balance by length"._

**Q9. Default 1 chapter per part?** _Rec: yes._
**Q10. Cap the number of parts?** _Rec: soft-warn above ~30, hard-block above 150._
**Q11. Offer "balance by length"?** _Rec: yes, but phase 2._
**Q12. Can a part contain a partial chapter (Rom 1:1–17)?** _Rec: yes — the split UI
should allow moving the boundary mid-chapter, since pericopes don't respect chapters._

---

## 4. Finder

A series renders as **one row with a chevron**, like a group:

```
▸ 📖 Romans                          Series · 16 parts
```

expanded:

```
▾ 📖 Romans                          Series · 16 parts
     1  Romans 1
     2  Romans 2
     3  Romans 3    ← current
```

Reuses `studyGroup`'s `isCollapsed` pattern and `expandGroupAncestors()` (which will need
a sibling `expandSeriesAncestors()`, or a generalisation, so deep-linking to part 7
expands both its series and any enclosing groups).

**Q13. Can a series live inside a group?** _Rec: yes — `studySeries.groupId`._
**Q14. Can a series contain a group, or nest?** _Rec: no. Flat sequence only._
**Q15. Distinct icon, or the group folder icon?** _Rec: distinct — see §7._
**Q16. Show part count / verse total on the row?** _Rec: part count always; verse total on hover._
**Q17. Drag a standalone study into a series?** _Rec: phase 3 — needs invariant checks._
**Q18. What does the series row do when clicked — expand, or open part 1?** _Rec: chevron
expands; clicking the title opens the last-viewed part (falling back to part 1), matching
`user.lastStudyView`._

---

## 5. Navigation

Prev/next at the far right of the study header, per your spec.

```
[ Romans 3 ▾ ]                              ‹  Part 3 of 16  ›
```

- `‹` / `›` disabled at the ends (not hidden — layout stability).
- **"Part 3 of 16"** is a dropdown listing all parts for direct jumps. Essential at 16
  parts; mandatory at 150.
- Keyboard: `⌥←` / `⌥→`. Avoid bare arrows (they belong to text/segment selection).
- Preserve the current view (Analyze/Document) across navigation — `user.lastStudyView`
  already persists this; it should not reset when moving between parts.

**Q19. Prev/next wrap around at the ends?** _Rec: no._
**Q20. Prefetch adjacent parts?** _Rec: yes, phase 2 — prefetch next part's cached text on idle._
**Q21. Keyboard shortcut choice?** _Rec: `⌥←`/`⌥→`._
**Q22. Show a series progress indicator (e.g. "3/16" bar)?** _Rec: text only, no bar._

---

## 6. Boundary moves, Split and Join

The hard part. Your spec: _move text/segments/sections/columns from the start of one part
to the end of the previous, or from the end of one part to the start of the next._

### What already exists

- `passageReconcile.js` — `analyzeEdit()`, used when a study's passage range changes;
  works out what structure survives.
- `passageJoin.js` — joining structural units.
- Structure is keyed by `startingWordId`, which is **globally canonical** (book/chapter/verse/word),
  not per-study. This is the single most important fact for this feature: **moving a
  boundary does not require re-keying any structure.** A segment keyed at `ROM.3.1.1`
  is valid in whichever part contains Romans 3:1.

### What a boundary move must do

1. Adjust the donor part's passage range and the receiving part's range.
2. Move the affected `passage_column` / `passage_section` / `passage_segment` rows.
3. **Handle connections that now cross a part boundary** — see below.
4. Re-fetch or re-slice cached text for both parts (`passage.cachedText`).
5. Re-normalise `seriesOrder`.

### ⚠️ The unsolved problem: cross-part connections

`segmentConnection` has a `studyId` and references two segments. If a connection's two
endpoints end up in **different parts**, it is currently unrepresentable — and this will
happen constantly, because connections are exactly what a user draws across a chapter
boundary they later split.

This is the biggest design risk in the feature. Options:

- **(a) Block the move** if it would orphan a connection. Safe, but the user hits a wall
  with no clear remedy.
- **(b) Delete the connection**, with a warning and undo. Honest, destructive.
- **(c) Keep it, scoped to the series** — add `seriesId` to `segmentConnection`, allow
  endpoints in different parts, render it as a stub arrow at the edge ("continues in Part 4").
  Most powerful, most work, and arguably the feature's best justification: cross-chapter
  connections are precisely what a Romans series wants.
- **(d) Convert to a "reference"** — a note pointing at the other part, not a drawn arc.

_Rec: **(b) for phase 1** (with a clear pre-move warning listing affected connections),
**(c) as the phase-3 goal.** Ship the simple thing, but add `seriesId` to
`segmentConnection` in the phase-1 migration so (c) doesn't need a second migration._

**Q23. Which cross-part connection strategy, and for which phase?**
**Q24. What granularity for boundary moves — verse, segment, section, column, or all four?**
_Rec: start with **section and column** (clean structural units), add segment in phase 2,
skip raw verse/word moves entirely — too fiddly for the value._
**Q25. Should boundary moves be undoable?** _Rec: yes, and this may force a general
undo mechanism — worth scoping before committing._

### Split Part / Join Parts

- **Split Part** — divide the current part at the selected boundary into two parts;
  renumber the rest. Must validate each result against `validatePassageLimits`.
- **Join Parts** — merge with the next (or previous) part. Must validate the _combined_
  range against the per-request limit; if the merged part would exceed 500 verses it needs
  multiple passages, which is fine — but the UI should say so.

⚠️ **Correction to the original spec:** _"so long as the new linked study is not longer
than 500 verses"_ — the real rule is **≤500 verses per passage**, not per study. A merged
part over 500 verses is legal; it just needs to be split into multiple passages internally.
Recommend the guard be "the merged part will contain N passages — continue?" rather than
a hard block. See Q26.

**Q26. Hard-block a join over 500 verses, or auto-split into multiple passages and inform?**
_Rec: auto-split and inform._
**Q27. Join with previous, next, or arbitrary selection?** _Rec: next, plus previous; not arbitrary._
**Q28. What happens to the two parts' titles/subtitles/commentary on join?** _Rec: keep the
first part's title, concatenate commentary under sub-headings, warn before discarding anything._

---

## 7. Icons

Existing and reusable: `chevron-right`/`chevron-down` (series expand, matching groups),
`caret-left`/`caret-right` or `arrow-left`/`arrow-right` (prev/next), `column-split`,
`column-join`, `folder`, `folders`, `book-open`, `book-plus`, `bookmark`.

New:

| Name                           | Purpose                | Suggested design                                                                                                                        |
| ------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `books.svg`                    | A series in the Finder | Two or three stacked/spined books — reads as "several, in order", and distinct from `folder` (container) and `book-open` (single study) |
| `study-split.svg`              | Split Part             | A page/study divided by a vertical dashed rule with an outward arrow each side — visually echoing `column-split` but at study scale     |
| `study-join.svg`               | Join Parts             | Two pages converging with inward arrows — mirror of `study-split`                                                                       |
| `series-part.svg` _(optional)_ | Marker on a part row   | A single book with a small numeric badge; may be unnecessary if numbering is text                                                       |

_Rec: keep `book-open` for a standalone study and use `books` for a series, so the Finder
reads "one book vs. several." Prev/next should use `caret-left`/`caret-right` rather than
the `arrow-` icons — carets read as "step through a sequence," arrows as "move a thing."_

**Q29. `books` for the series icon, or a folder variant to echo groups?**
**Q30. Carets or arrows for prev/next?** _Rec: carets._
**Q31. Do we need `series-part.svg`?** _Rec: no — numbering as text is enough._

---

## 8. Export & compliance interaction

Now directly relevant, given the limits work:

- A series covering a whole book will trip the **complete-book** check in
  `validateExportLimits()` for ESV. Currently `enforcement: 'warn'`.
- **Exporting a whole series** must aggregate passages across _all parts_ — otherwise
  a 16-part Romans series exports 16 individually-compliant files that together reproduce
  the complete book. `validateExportLimits()` already aggregates per book across passages,
  so it needs the series' full passage set passed in, not one part's.
- Each exported part must carry attribution independently (fixed in `exportAnalyze.js`),
  since parts travel separately.

**Q32. Offer "Export whole series" at all?** _Rec: yes, but phase 3, and it must run the
series-wide check. This is the single most likely way to breach the ESV quotation terms,
so it deserves the `'block'` posture even while per-part export stays `'warn'`._
**Q33. Should a whole-book series warn at creation time, not just export?** _Rec: a quiet
informational note, not a blocker — on-screen study is unrestricted (see `COMPLIANCE.md` §1)._

---

## 9. Phasing

**Phase 1 — structure and navigation (no boundary editing)**

- `study_series` table; `study.seriesId` / `seriesOrder`; `segmentConnection.seriesId` (unused, for later)
- Create-as-series in the New Study flow, chapters-per-part stepper with preview
- Finder series row with chevron, collapse state, expand-on-deep-link
- Header prev/next + "Part N of M" jump dropdown
- `books.svg`
- _Deliberately excluded: split, join, boundary moves. This phase is independently useful._

**Phase 2 — restructuring**

- Split Part / Join Parts (+ `study-split.svg`, `study-join.svg`)
- Boundary moves for sections and columns
- Cross-part connections: warn-and-delete
- Adjacent-part prefetch; "balance by length"

**Phase 3 — polish**

- Cross-part connections preserved with edge stubs
- Segment-level boundary moves
- Drag standalone studies into a series; reorder parts
- Export whole series with series-wide compliance check

**Q34. Is phase 1 genuinely useful without split/join?** _Rec: yes — creating a series
up front and navigating it covers the main workflow. Restructuring is a refinement._
**Q35. Should undo be scoped in before phase 2?** Boundary moves are destructive and
users will expect `⌘Z`. _Rec: decide before starting phase 2._

---

## 10. Open questions summary

Highest-stakes first:

1. **Q1 — Reframe from "long studies" to "studies that belong together"?** Everything depends on this.
2. **Q23 — Cross-part connections:** block / delete / preserve. Biggest technical risk.
3. **Q4 — `study_series` table vs. `study.seriesParentId`.** Hard to change later.
4. **Q24 — Boundary-move granularity.** Drives most of the phase-2 work.
5. **Q2/Q3 — Terminology,** including the Split/Join collision with columns.
6. **Q32 — Export whole series,** and whether it blocks rather than warns.
7. Q5–Q22, Q25–Q31, Q33–Q35 — see inline.

---

## 11. Decisions log

_(Nothing agreed yet — this section records decisions as we make them, with reasoning,
so we don't relitigate.)_

| Date       | Question                              | Decision                                               | Reasoning                                                                                          |
| ---------- | ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 2026-08-03 | Limits: where enforced                | Request limits at fetch; distribution limits at export | See `COMPLIANCE.md`                                                                                |
| 2026-08-03 | 500-verse rule as the series trigger  | **Rejected** as primary driver                         | Measured: no chapter exceeds 500 verses; multi-passage already absorbs long books                  |
| 2026-08-03 | Psalms "500-verse API limit"          | **Was our own bug**                                    | Message blamed the provider for a self-imposed cap; fixed + auto-split added                       |
| 2026-08-03 | Auto-split rule                       | Chapter-boundary greedy fill                           | Chapters are meaningful to readers; equal verse counts are not                                     |
| 2026-08-03 | Auto-split in the edit flow           | **Not applied**                                        | Edits diff by passage `id`; split parts have none, so a remove would cascade and destroy structure |
| 2026-08-03 | ESV ~50%-of-book truncation           | **CONFIRMED real** by direct probe                     | HTTP 200, `canonical: "Revelation 1–12:8"`, 202/404 verses, no error field — silent                |
| 2026-08-03 | ESV truncation trigger                | **Completeness, not size**                             | Galatians (149v) halved; Romans 1:18–8:39 (208v) returned whole                                    |
| 2026-08-03 | Truncation detection method           | Verse-count ratio, not `canonical` string              | String comparison gave 4 false positives in 9 probes; verse counting gave 0                        |
| 2026-08-03 | Detection thresholds                  | <90% **and** >15 verses short                          | ESV legitimately omits late-manuscript verses (Mark 9 = 48/50, John 5 = 46/47)                     |
| 2026-08-03 | Chunking ESV to assemble a whole book | **Rejected**                                           | Would circumvent a licence control; the permission is about text reproduced, not HTTP calls        |
| 2026-08-03 | Safari scroll choppiness              | Out of scope, tracked in §13                           | A rendering issue; must not shape the data model                                                   |

---

## 12. Translation constraints — what is real and what is ours

Four separate things were suspected of forcing Linked Studies. **All four were
investigated on 2026-08-03. Two were our own code, one is a real limit already absorbed
by multi-passage, and one is a real, confirmed, external constraint** — though not the one
we expected, and not a verse limit. None of them make Linked Studies _necessary_; one of
them does constrain how it must be designed.

### 12.1 The four limits, by origin

| Limit                            | Origin                          | Real constraint?             | Status                                    |
| -------------------------------- | ------------------------------- | ---------------------------- | ----------------------------------------- |
| ESV 500 verses / request         | Crossway, published             | **Yes**                      | Absorbed by multi-passage                 |
| ESV complete-book refusal (~50%) | Crossway, server-side           | **YES — confirmed by probe** | Silent truncation; now detected. See 12.3 |
| NET 500 verses / request         | **Us** (`source: self-imposed`) | **No**                       | Kept as a guardrail; now auto-splits      |
| Whole-book Psalms rejected       | **Us**, pre-fetch validation    | **No**                       | **Fixed** — auto-splits into 6 passages   |

`api.requestLimits.source` in `translations.json` now records `provider` or
`self-imposed` for every cap, and `getRequestLimits()` surfaces it. User-facing copy
must not attribute a self-imposed number to a publisher.

### 12.2 Why Psalms failed, and what changed

Selecting all 2,461 verses of Psalms produced:

> "This passage spans 2461 verses, which exceeds the 500-verse-per-request limit for
> NET. Please choose a smaller range."

That string was **ours**, emitted identically for ESV and NET — which is what gave it
away, since NET publishes no per-request verse ceiling at all. `validatePassagesLimits`
runs _before_ any fetch, so neither API was ever contacted.

The deeper error was treating a per-_passage_ cap as a per-_study_ cap. Validation was
already per-passage, so a 2,461-verse study had always been legal **as six passages** —
the New Study flow simply refused to create them. Now `splitPassagesToFitLimits()`
divides oversized selections on chapter boundaries instead of rejecting them.

Verified against `bible.json`: Psalms → 6 passages, Genesis → 4, Isaiah 40–66 → 2,
Revelation and Romans → 1 each (both already fit). No gaps, no overlaps, endpoints
preserved.

**This is the second instance of the same mistake in two days** — a limit applied at the
wrong boundary, producing a symptom that looked external and invited a workaround. It is
the exact error the original 500-verse premise was built on. Worth re-reading §0 with
that in mind.

### 12.3 The ESV half-book cap — CONFIRMED, and worse than assumed

**Probed directly on 2026-08-03. No longer an inference.**

Requesting `Revelation 1:1-22:21`:

```
HTTP 200
canonical: "Revelation 1–12:8"      ← the only signal, and it is not an error
verses:    202 of 404               ← exactly 50.0%
tail:      "…no longer any place for them in heaven. (ESV)"   ← ends mid-narrative
```

**It is silent truncation — the worst of the three possibilities.** HTTP 200, no `detail`,
no `errors`, no `warnings`, no metadata flag. The text simply stops at half the book and
the response looks entirely healthy. `canonical` is the only tell, and nothing in our code
was reading it.

#### The finding that changes the picture

The cap is **not** about request size, and **not** specific to long books. Measured:

| Requested                  | Verses  | Returned | %         | canonical           |
| -------------------------- | ------- | -------- | --------- | ------------------- |
| Revelation (whole)         | 404     | 202      | 50.0%     | `Revelation 1–12:8` |
| Romans (whole)             | 433     | 216      | 49.9%     | `Romans 1–8:30`     |
| **Galatians (whole)**      | **149** | **74**   | **49.7%** | `Galatians 1–3`     |
| **Ephesians (whole)**      | **155** | **77**   | **49.7%** | `Ephesians 1–4:11`  |
| Romans 1:18–8:39 (partial) | 208     | 208      | 100%      | `Romans 1:18–8:39`  |
| Philemon (whole, 25v)      | 25      | 25       | 100%      | `Philemon`          |
| Jude (whole, 25v)          | 25      | 25       | 100%      | `Jude`              |

**Galatians is only 149 verses and still gets halved.** So the rule is not a verse
ceiling at all — ESV refuses to serve **a complete book**, whatever its length, and caps
the response at ~50%. Note Romans 1:18–8:39 returns _all 208 verses_ while Romans 1:1–16:27
returns only 216 of 433: the same API, similar sizes, different outcomes. The trigger is
**completeness, not size.**

Philemon and Jude come back whole, so there is a floor — probably the "less than 50% of a
book" clause reading differently for very short books, or a minimum-verse allowance. Not
worth pinning down precisely; the practical rule is clear.

⚠️ **Implication for §0.** Under ESV, "one study = one whole book" is **impossible for at
least 42 of 66 books** — including short ones we assumed were safe. §0 says 42 books fit
in a single passage; that is true of the _verse count_ and false of the _ESV API_. Any
whole-book ESV study needs at least two passages that are each less than the whole. This
is a genuine constraint on the Linked Studies design, and the **first** one we've found
that is real, external, and confirmed.

#### Detection now implemented

`fetchESVPassage()` compares verses received against `countVersesInRange()` and returns a
real error instead of half a book. Two conditions must both hold — a proportional gap
(<90%) **and** an absolute one (>15 verses) — because the ESV legitimately omits verses
attested only in later manuscripts. Probed against that: Mark 9 returns 48/50 and John 5
returns 46/47, both correct and both correctly _not_ flagged.

A first attempt compared `canonical` as a string and produced **four false positives out
of nine** (the API echoes `"Philemon"` for a whole short book, and `"John 3:16–17"` with an
en-dash). Counting verses is immune to all of that spelling variation. Worth remembering:
the naive check looked obviously right and was wrong on 44% of cases.

**Principle: never chunk requests to circumvent a licence control.** If 22 chapters of
Revelation arrive as 22 linked parts, the complete book has been reproduced and the
requests merely distributed. Building that into the schema is worse than an ad-hoc
workaround, because it looks legitimate. Splitting for _engineering_ reasons (request
size, DOM weight) is fine; splitting to extract text a publisher declined to serve is
not.

**Q36 — Accept the ESV cap, or seek a broader Crossway licence?**
_Rec: accept it now, surface it honestly, and open a licence conversation before any
public launch._

**Q37 — Keep the self-imposed NET 500/request cap?**
_Rec: yes._ A single 2,461-verse fetch is slow, caches a huge blob, and lands ~55,000
spans in the DOM — squarely where the Safari issue in §13 lives. Keep the guardrail;
just describe it accurately.

**Q38 — Auto-split large selections?** **Done** for New Study. Deliberately _not_ done
for edit (see the decisions log).

### 12.4 What this leaves as the justification

None of the four limits _require_ Linked Studies. The case rests on the three workflow
reasons in §0 — **teaching cadence, Analyze ergonomics, Finder navigability** — plus one
addition: for translations that permit whole books (NET), a 2,461-verse study in six
passages is _legal but unwieldy_, and a series is genuinely nicer to work in.

That is a feature built because it is better, not because something is broken.

**But one limit must now shape the design, in a specific and narrow way.** The confirmed
ESV complete-book refusal (§12.3) means:

1. **A series must never be presented as a way to obtain a whole book in ESV.** If a user
   builds a 22-part Revelation series in ESV, each part fetches fine on its own and the
   complete book ends up reproduced across the series. That is the circumvention risk, and
   it arrives _by accident_ rather than by intent — which makes it more likely, not less.
2. Therefore the **series-wide export check (Q32) is no longer a nice-to-have.** It is the
   only place that can catch aggregate reproduction, and it should `block` for ESV.
3. **Q39 (new) — should we also warn at series _creation_ time** when an ESV series would
   span a complete book? _Rec: yes, informational at creation, blocking at export. On-screen
   study is unrestricted (`COMPLIANCE.md` §1); distribution is the boundary that matters._

So: build it because it is better, and let exactly one limit constrain one part of it —
the export path — rather than the data model.

---

## 13. Known issues — tracked, out of scope

### 13.1 Safari scroll choppiness at 400+ verses

Reproducible: choppy in Safari, fine in Chrome, at ~400+ verses (Revelation, Romans).

Leading suspects, in order:

1. The `transform: scale()` layer on `.analyze-content-inner` — Safari re-rasterizes
   large scaled layers on scroll. Test at 100% zoom vs 90% to isolate.
2. Absent CSS containment across ~24,000 nodes. Try `contain: layout style paint` on
   `.segment`.
3. `will-change: scroll-position` — try removing it.

Note `ConnectionsOverlay.svelte` already records Safari falling behind on repaint in an
earlier revision, so this is a recurring weakness rather than a new one.

**Measure before changing anything.** An earlier confident diagnosis here was wrong.

**This must not influence the Linked Studies data model.** Splitting studies to dodge a
rendering issue would bake a browser quirk into the schema permanently, and Safari will
improve.

### 13.2 Limit messages (fixed 2026-08-03)

`validatePassageLimits` attributed a self-imposed cap to the provider, sending a
developer through API docs for a limit that came from our own config. Messages are now
`source`-aware. **Any new limit copy must check `source` first.**
