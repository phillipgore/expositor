# Linked Studies — Design Plan

Living document. Updated as we decide things.

**Status:** ON HOLD — parked 2026-08-03. Not scheduled; no code written.
**Last updated:** 2026-08-07, second pass (reviewed against the **display-limit** finding;
still parked)

> ⚠️ **Second pass, 2026-08-07 — one assumption running through this document was false.**
> It repeatedly asserted that **on-screen display is unrestricted**, and built several
> recommendations on it. The ESV API terms cap display explicitly — "not more than 500
> verses or one-half of any book (whichever is less) on any page" — so every such claim has
> been withdrawn in place. Affected: **§0**, **§8** ("the only place a limit should
> constrain the feature"), **§12.3**, **§12.4**, **Q33** and **Q39**. See `COMPLIANCE.md`
> §1.6–1.7. The feature stays parked and no recommendation reverses, but the _grounds_ for
> several of them changed.

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

### 2026-08-07 review — what changed since parking

Chunked retrieval shipped, and it **strengthens the case for staying parked** rather
than weakening it. Three things in this document were made wrong by it, and are
corrected in place below:

1. **Auto-split no longer exists.** `splitPassagesToFitLimits()` was removed. An
   oversized selection is no longer silently expanded into several stored passages;
   passage shape is a document-structure decision belonging to the user. The
   chapter-boundary split rule survives, but as a **fetch-layer** concern
   (`splitRangeIntoPassages`) that the user never sees.
2. **For NET, the 500-verse cap has no passage-level expression at all.**
   `api.retrieval.chunking` is `true` for NET, so `validatePassageLimits()` returns
   valid unconditionally and one passage is fetched as however many requests it
   takes. Psalms is **one** passage in **six** requests. §0's arithmetic is revised
   accordingly.
3. **The "chunking = circumvention" argument was wrong and has been withdrawn.**
   The conclusion (don't chunk ESV) stands; the reason is different. See §12.3.

The net effect: the feature's justification is now **translation-dependent**, and
neither translation makes it necessary. See §12.4.

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
| Can a >500-verse book be one study today?                    | **Yes.** In NET it is one _passage_; in ESV it is several passages in one study.                       |
| How many books fit in a single passage _by verse count_?     | **NET: 66 of 66** (chunked retrieval). **ESV: 42 of 66** (one passage = one request).                  |
| How many of those the **ESV API will actually serve** whole? | **Far fewer** — see §12.3. ESV silently returns ~50% of _any_ complete book, even 149-verse Galatians. |

The 500-verse cap is a **per-API-request** ceiling. As of 2026-08-07 it is no longer
also a per-_passage_ ceiling for every translation:

- **NET** (`retrieval.chunking: true`) — a passage of any size is fetched as however
  many sequential requests it takes and concatenated. `validatePassageLimits()`
  returns valid unconditionally. Psalms is **one passage in six requests**. The
  500-verse number is now purely a transport parameter with no user-visible effect.
- **ESV** (`retrieval.chunking: false`) — one passage is exactly one request, so the
  request ceiling is also the passage ceiling and an oversized selection is refused
  at validation. See §12.3 for why ESV is deliberately unchunked.

So **the 500-verse limit almost never forces a split**, and for NET it cannot force
one at all. Where a split _is_ needed (ESV), the existing multi-passage mechanism
absorbs it.

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
at least two sub-whole passages.

It does **not**, however, mean a series would be "circumventing" anything by holding a
whole book between its parts — an earlier draft of this document said so, and that
argument has been withdrawn (§12.3). A study can already display a whole book as several
passages, so a series reproduces no more text than multi-passage does today.

⚠️ **Revised 2026-08-07 (second pass).** The sentence above once ended "…than what is
permitted on screen today," and the paragraph concluded "the real boundary is
**distribution**." Both overstated it: **display is capped per page** by the API terms, so
multi-passage does not make a whole book _permitted_ — it only makes it _possible_
(`COMPLIANCE.md` §1.6–1.7). Distribution is no longer the only boundary; display is one
too. The narrow claim survives — a series is no worse than multi-passage — but neither is
licensed for a whole ESV book.

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
⚠️ _Reconcile with the no-hard-cap decision on study size (§13.1). These are different
axes and the inconsistency is only apparent: **verse count** has no hard cap because the
cost is a rendering issue we have not yet measured, and capping it would encode a browser
quirk in the data model. **Part count** is a different quantity — 150 Finder rows and a
150-entry jump dropdown is a UI problem we can see directly, and a series of 150 parts is
almost certainly a mis-click rather than an intent. Still, prefer the softest thing that
works: a confirmation step at 150 rather than a refusal._

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
  renumber the rest. Validate each result with `checkSinglePassageSupport(range,
translationId)`, which reports whether the translation can serve that range as one
  passage and why not (`'exceeds-request'` / `'complete-book'`).
- **Join Parts** — merge with the next (or previous) part, and validate the _combined_
  range the same way.

⚠️ **Correction to the original spec:** _"so long as the new linked study is not longer
than 500 verses"_ — the real rule was never per study. It is now not even per passage for
every translation:

| Translation | Merged part over 500 verses                                        |
| ----------- | ------------------------------------------------------------------ |
| **NET**     | Fine, unconditionally. One passage, fetched as several requests.   |
| **ESV**     | Needs several passages, each ≤500 verses and none a complete book. |

**Q26 (revised). What should a join do when the merged range exceeds what one passage
can hold?** The original recommendation — "auto-split into multiple passages and inform" —
is **withdrawn**: `splitPassagesToFitLimits()` no longer exists, and auto-splitting was
deliberately abandoned because passage shape belongs to the user (see the 2026-08-07
review at the top).
_Rec: ask `checkSinglePassageSupport` and branch. For NET, join silently — there is
nothing to warn about. For ESV, tell the user how many passages the merged part will
need and let them confirm, rather than either blocking or silently restructuring._

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

Now directly relevant, given the limits work.

> ⚠️ **Corrected 2026-08-07 (second pass).** This section opened "**This is the only
> place a limit should constrain the feature**." That is now **false**: reading the ESV
> API terms established that _display_ is capped per page as well, so a limit constrains
> **study creation** too (`COMPLIANCE.md` §1.6–1.7). Export is no longer the only
> boundary. See "Display limits" below, which changes the case for this feature.

Verified against `translations.json` on 2026-08-07:

| Setting                         | ESV      | NET      | Consequence for a series                             |
| ------------------------------- | -------- | -------- | ---------------------------------------------------- |
| `allowCompleteBook`             | `false`  | `true`   | Whole-book series warns on ESV export; NET is clean  |
| `maxVerses` (distribution)      | `1000`   | `null`   | A long ESV series will exceed this                   |
| `maxBookPortion` (distribution) | `null`   | `null`   | The 50%-of-book **distribution** branch never fires  |
| `maxVersesPerPage` (display)    | `500`    | `null`   | **New** — caps what one study may show               |
| `maxBookPortion` (display)      | `0.5`    | `null`   | **New** — half a book per page, short books excepted |
| `enforcement`                   | `'warn'` | `'warn'` | Nothing is blocked today                             |

- A series covering a whole book trips the **complete-book** check for ESV
  (`allowCompleteBook: false`) and a long one also trips `maxVerses: 1000`. Both are
  currently `'warn'`.
- ⚠️ Do **not** expect a "more than 50% of Romans" warning **from the distribution
  check**. `restrictions.distribution.maxBookPortion` is deliberately `null` for both
  translations: Crossway's 50% clause there measures the ESV's share of the **user's own
  document**, not the share of the biblical book. Reading it the other way is the original
  bug in this codebase and it survived one relocation already. See the
  `maxBookPortionNote` in `translations.json`.
- ⚠️ **But a half-of-Romans warning now exists on a different axis.**
  `restrictions.display.maxBookPortion` **is** `0.5`, because the API terms cap display
  per page in those words. Two rules that read almost identically measure different
  things; keep them apart when reasoning about a series.

- **Exporting a whole series** must aggregate passages across _all parts_ — otherwise
  a 16-part Romans series exports 16 individually-compliant files that together reproduce
  the complete book. `validateExportLimits()` already aggregates per book across passages
  (using a verse-identity `Set`, so overlapping parts are not double-counted), so it needs
  the series' full passage set passed in, not one part's.
- Each exported part must carry attribution independently (fixed in `exportAnalyze.js`),
  since parts travel separately.
- ⚠️ **`validateExportLimits()` still has no caller.** It is written and correct by
  inspection, but `MenuExport` / `exportAnalyze.js` do not invoke it (`COMPLIANCE.md` §5
  item 3). Any series-wide check is therefore built on a function that has never run in
  anger. Wire it up for single studies **first**, so the series case is an extension of
  something proven rather than its first exercise.

**Q32. Offer "Export whole series" at all?** _Rec: yes, but phase 3, and it must run the
series-wide check. This is the single most likely way to breach the ESV quotation terms,
so it deserves the `'block'` posture even while per-part export stays `'warn'`._
**Q33 (revised 2026-08-07). Should a whole-book series warn at creation time, not just
export?** _Rec: **yes, and it now does** for a single study._ The original recommendation —
"a quiet informational note, not a blocker" — rested on "on-screen study is unrestricted,"
which is **false**: the API terms cap display per page. `validateStudyDisplayLimits()` warns
at study create/edit (`COMPLIANCE.md` §1.6). The remaining series-specific question is
narrower: **should the check aggregate across parts at creation time?** A 16-part Romans
series has no single page over half of Romans, so the per-study check stays silent. Whether
that is correct depends on whether a series is "a page" — it isn't, so per-study is probably
right, and the aggregate belongs at export (Q32).

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

| Date                        | Question                              | Decision                                               | Reasoning                                                                                                                                                                          |
| --------------------------- | ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03                  | Limits: where enforced                | Request limits at fetch; distribution limits at export | See `COMPLIANCE.md`                                                                                                                                                                |
| 2026-08-03                  | 500-verse rule as the series trigger  | **Rejected** as primary driver                         | Measured: no chapter exceeds 500 verses; multi-passage already absorbs long books                                                                                                  |
| 2026-08-03                  | Psalms "500-verse API limit"          | **Was our own bug**                                    | Message blamed the provider for a self-imposed cap; message fixed, and the cap no longer binds NET                                                                                 |
| 2026-08-03                  | Split rule                            | Chapter-boundary greedy fill                           | Chapters are meaningful to readers; equal verse counts are not. _Now a fetch-layer rule only_                                                                                      |
| 2026-08-03                  | Auto-split in the edit flow           | **Not applied**                                        | Edits diff by passage `id`; split parts have none, so a remove would cascade and destroy structure                                                                                 |
| 2026-08-03                  | ESV ~50%-of-book truncation           | **CONFIRMED real** by direct probe                     | HTTP 200, `canonical: "Revelation 1–12:8"`, 202/404 verses, no error field — silent                                                                                                |
| 2026-08-03                  | ESV truncation trigger                | **Completeness, not size**                             | Galatians (149v) halved; Romans 1:18–8:39 (208v) returned whole                                                                                                                    |
| 2026-08-03                  | Truncation detection method           | Verse-count ratio, not `canonical` string              | String comparison gave 4 false positives in 9 probes; verse counting gave 0                                                                                                        |
| 2026-08-03                  | Detection thresholds                  | <90% **and** >15 verses short                          | ESV legitimately omits late-manuscript verses (Mark 9 = 48/50, John 5 = 46/47)                                                                                                     |
| 2026-08-03                  | Chunking ESV to assemble a whole book | **Rejected**                                           | _Reasoning superseded 2026-08-07 — see below_                                                                                                                                      |
| 2026-08-03                  | Safari scroll choppiness              | Out of scope, tracked in §13                           | A rendering issue; must not shape the data model                                                                                                                                   |
| **2026-08-07**              | "Chunking = circumvention" argument   | **Withdrawn**                                          | Doesn't hold: a study can already show a whole book as several passages, so chunking reproduces no extra text with no extra requests                                               |
| **2026-08-07**              | Chunk ESV?                            | **Still no — better reason**                           | Crossway polices completeness server-side; sub-whole chunks would all succeed and defeat a control they deliberately applied                                                       |
| **2026-08-07**              | Chunk NET?                            | **Yes**                                                | Its cap is our own guardrail and there is no server-side control, so chunking routes around nothing. Psalms = 1 passage, 6 requests                                                |
| **2026-08-07**              | Auto-split user selections            | **Removed**                                            | Turning one requested passage into six was surprising; passage shape is a document-structure decision belonging to the user                                                        |
| **2026-08-07**              | Hard cap on study verse count         | **Rejected**                                           | Choppiness starts ~400 verses, below any round cap — a 500 cap would permit the bad case and block legitimate ones. Advisory only, `studyLimits.js`                                |
| **2026-08-07**              | `maxBookPortion`                      | **`null` for both**                                    | Crossway's 50% measures the ESV's share of the user's document, not of the biblical book. The misreading survived one relocation already                                           |
| **2026-08-07** _(2nd pass)_ | "On-screen display is unrestricted"   | **WITHDRAWN — was false throughout**                   | The ESV API terms cap display per page: "not more than 500 verses or one-half of any book (whichever is less) on any page." Ran through §0, §8, §12.3, §12.4, Q33, Q39             |
| **2026-08-07** _(2nd pass)_ | The ESV short-book "floor"            | **No floor exists — probe cancelled**                  | The exception is **structural** (single/double-chapter books), not a verse threshold. A planned bisecting probe would have found no boundary and produced a confident wrong number |
| **2026-08-07** _(2nd pass)_ | `restrictions.display.maxBookPortion` | **`0.5` for ESV, `null` for NET**                      | Distinct from the distribution 50%, which stays `null`. Two near-identical clauses measuring different things — keep them apart                                                    |

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
| NET 500 verses / request         | **Us** (`source: self-imposed`) | **No**                       | Kept, but per _request_ only — chunked    |
| Whole-book Psalms rejected       | **Us**, pre-fetch validation    | **No**                       | **Fixed** — 1 passage, 6 requests         |

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
the New Study flow simply refused to create them.

**The fix landed in two stages, and the second replaced the first.** Stage one added
`splitPassagesToFitLimits()`, which divided oversized selections into several stored
passages on chapter boundaries. That was **withdrawn on 2026-08-07**: silently turning
one requested passage into six was surprising, and passage shape determines structure
trees, dividers and how a study reads — a decision belonging to the user, not to a
validator. Stage two moved the division **into the fetch layer**
(`splitRangeIntoPassages`), where it is invisible: Psalms is **one passage** fetched as
**six sequential requests** and concatenated.

Concatenation is exact rather than approximately right, because `wrapWords()` derives
every `data-word-id` from absolute book/chapter/verse. A word's identity does not depend
on which chunk delivered it, so six stitched responses are byte-identical to one
hypothetical whole response.

Verified against the live NET API on 2026-08-07: Genesis 1,533 verses in 4 requests,
Psalms 2,461 in 6, Philemon 25 in 1 (previously capped at 12 by the misfiled copyright
rule). Local arithmetic and API-returned counts both matched each book's total exactly —
no gaps, no overlaps, endpoints preserved.

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
book" clause reading differently for very short books, or a minimum-verse allowance.

> ⚠️ **RESOLVED 2026-08-07 (second pass) — there is no "floor," and no probe is needed.**
> Both the earlier note ("not worth pinning down") and its revision ("worth a bisecting
> probe over books between 25 and 149 verses") were **answered in the published API terms
> the whole time**:
>
> > "You may request up to 500 verses per query, or half a book, whichever is less
> > **(excepting single-chapter and double-chapter books)**."
>
> The exception is **structural, not size-based.** Philemon and Jude return whole because
> they are **single-chapter books**, not because 25 verses is under some threshold.
>
> Enumerated from `bible.json` — exactly **six** books qualify, and note the ids, which are
> not the obvious abbreviations:
>
> | Book     | id    | Chapters | Verses |
> | -------- | ----- | -------- | ------ |
> | Obadiah  | `OB`  | 1        | 21     |
> | Philemon | `PN`  | 1        | 25     |
> | 2 John   | `2JN` | 1        | 13     |
> | 3 John   | `3JN` | 1        | 14     |
> | Jude     | `JD`  | 1        | 25     |
> | Haggai   | `HG`  | 2        | 38     |
>
> `chapterCount` was cross-checked against `Object.keys(chapterData[0])` for all 66 books —
> zero mismatches — so the count is not resting on one field being right.
>
> ⚠️ **Getting this list took three wrong attempts, all the same mistake.** `chapterData` is
> a **one-element array wrapping a chapter→verse-count map**, not an array of chapters. Read
> naively it reports **every** book as having 1 chapter, which my first pass duly printed as
> "66 of 66 books have ≤2 chapters" — a result absurd enough to catch, but only because
> Genesis was in the list. A subtler query would have passed. The same shape misread
> the verification harness for §1.6 (`COMPLIANCE.md` §1.7) and produced "John has 51 verses."
> **Anything reading `chapterData` must index `[0]` first**; assume a future reader will
> forget this, because three readers already did.
>
> A verse-count bisection would have found **no** boundary and produced a confidently wrong
> number, because it was searching the wrong axis. Recording this because the plan for it
> was specific, actionable, and would have wasted a run confirming a false model —
> **reading the terms cost less than the probe.** `COMPLIANCE.md` §0 is the same lesson.

⚠️ **Implication for §0, revised.** Under ESV, "one study = one whole book" is impossible
for **60 of 66 books** — not "at least 42," and the six exceptions are known exactly rather
than guessed. §0 says 42 books fit in a single passage; that is true of the _verse count_
and false of the _ESV API_. Any whole-book ESV study outside those six needs at least two
passages each less than the whole — and per §1.7 of `COMPLIANCE.md`, **splitting does not
make it displayable either**, since the display cap applies to the assembled page. The
honest statement is: whole-book ESV study is unavailable for 60 of 66 books by any route.

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

#### ⚠️ The principle, corrected 2026-08-07

An earlier version of this section argued: _"If 22 chapters of Revelation arrive as 22
linked parts, the complete book has been reproduced and the requests merely
distributed."_ **That argument does not hold, and has been withdrawn.**

It fails because a study can **already** display a complete book as several passages —
reproducing exactly the same text, via exactly the same number of requests, today,
without any new feature. So chunking (or a series) reproduces nothing extra. The
argument proves too much: taken seriously it would forbid multi-passage studies, which
are the existing and intended mechanism.

**The correct principle is narrower and factual: do not route around a control a
provider deliberately applied.** Crossway enforces completeness **server-side**. A
whole-book request returns ~50%; sub-whole chunks would each succeed, and stitching them
would produce text their server declined to serve in one piece. The objection is not
"too much text was reproduced" but "a deliberate server-side control was defeated."

⚠️ **This paragraph previously read "(on-screen display is unrestricted — `COMPLIANCE.md`
§1)." That parenthesis is now false** and has been struck: the API terms cap display per
page. The surrounding argument survives intact, because it never depended on display being
unrestricted — only on the distinction between _reproducing text_ and _defeating a control_.

Consequences of the corrected reading:

- **ESV stays unchunked** — same conclusion, sound reason. Crossway's server arbitrates,
  so we never interpret the licence ourselves.
- **NET chunks freely** — no server-side control exists to defeat, and its 500-verse cap
  is our own guardrail.
- **A series is not itself a circumvention.** It reproduces no more than multi-passage
  already does. The boundaries that matter are **display** (per part, at creation) and
  **distribution** (aggregated, at export) — not retrieval. ⚠️ This bullet previously said
  "the boundary that matters is **distribution**," singular; the display finding added the
  second one.

**Q36 — Accept the ESV cap, or seek a broader Crossway licence?**
_Rec: accept it now, surface it honestly, and open a licence conversation before any
public launch._

**Q37 — Keep the self-imposed NET 500/request cap?**
_Rec: yes._ A single 2,461-verse fetch is slow, caches a huge blob, and lands ~55,000
spans in the DOM — squarely where the Safari issue in §13 lives. Keep the guardrail;
just describe it accurately.

**Q38 — Auto-split large selections?** **No — reversed 2026-08-07.** It was briefly done
for New Study and has been removed. The division now happens invisibly in the fetch layer
for chunkable translations, and where a range genuinely cannot be one passage (ESV) the UI
says so at selection time via `checkSinglePassageSupport()` and lets the user decide.

### 12.4 What this leaves as the justification

None of the four limits _require_ Linked Studies. The case rests entirely on the three
workflow reasons in §0 — **teaching cadence, Analyze ergonomics, Finder navigability**.

**As of 2026-08-07 the situation is translation-dependent, and neither case forces the
feature:**

| Translation | Whole book as one passage?  | What a series would add                                |
| ----------- | --------------------------- | ------------------------------------------------------ |
| **NET**     | **Yes** — chunked retrieval | Nothing technical. Purely the three workflow reasons.  |
| **ESV**     | **No** — never, at any size | Nothing either: multi-passage already covers it today. |

The NET column is the interesting one, and it is _newly_ true. Before chunking, a
2,461-verse Psalms study needed six passages, so "a series would be tidier" had some
technical force. Now it is one passage, and the argument is purely about workflow — which
is the honest version of the case anyway.

That is a feature built because it is better, not because something is broken.

**Two limits touch the design, at two points.** ⚠️ _This sentence read "One limit still
touches the design, but at one point only" until the display finding; see the closing note
below._ The confirmed ESV complete-book refusal (§12.3) means:

1. **A whole-book ESV series is a _display_ and distribution question.** If a user builds a
   22-part Revelation series in ESV, each part fetches fine and the complete book is
   displayed across the series.
   ⚠️ **Revised 2026-08-07 (second pass).** This item previously said "On screen that is
   **fine** — display is unrestricted (`COMPLIANCE.md` §1)." **Withdrawn**: display is
   capped per page. What remains true is narrower — each _part_ is its own page, and a
   22-part series has no single page over half of Revelation, so the per-study check
   (§1.6–1.7) passes on every part. Whether a series is "a page" for licence purposes is
   genuinely unresolved; the text reads as per-page, and a series is not a page.
   _(Note: an earlier draft called this "the circumvention risk." That framing was wrong —
   see the corrected principle in §12.3.)_

2. Therefore the **series-wide export check (Q32) is the one place this genuinely bites.**
   It is the only place that can see aggregate reproduction across parts, and it should
   `block` for ESV. ⚠️ But `validateExportLimits()` has no caller yet (§8) — wire it up for
   single studies first.
3. **Q39 (revised 2026-08-07, second pass) — should we also note it at series _creation_
   time** when an ESV series would span a complete book? The original reasoning — "Creation
   is not distribution, and a scary message at creation for something permitted on screen
   would be the same category error this document keeps correcting" — **had the category
   error backwards.** Whole-book display is _not_ permitted, so a creation-time note is not
   a false alarm. _Rec: still an informational note rather than a blocker, but on the honest
   ground that per-part display is compliant and `enforcement` is `'warn'` everywhere —
   **not** on the false ground that display is unrestricted._

So: build it because it is better. ⚠️ **But not "exactly one limit at exactly one point"** —
that framing (previously the closing line here) died with the display finding. Two limits
touch it: **display**, per part at creation, and **distribution**, aggregated at export.
Neither shapes the data model, which was the point worth keeping.

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

#### 2026-08-07: DOM weight is now concentrated, not spread

Chunked retrieval changed the shape of this problem without changing its cause. A
2,461-verse NET Psalms study used to be six passages; it is now **one**. The ~55,000 word
spans that were previously distributed across six `passage` elements now land inside a
single one. Total node count is unchanged, but it is concentrated — which matters if the
cause turns out to be per-element (a large scaled layer, or containment boundaries) rather
than per-document. This makes suspects 1 and 2 above **more** likely, not less, and gives
a sharper test: compare one 2,461-verse passage against the same range as six passages.

#### A hard cap was considered and rejected

`src/lib/config/studyLimits.js` now exists and is **advisory only** — `assessStudySize()`
returns `'ok' | 'notice' | 'warning'` at 600 / 1,200 verses and nothing is ever blocked.
The reasoning, recorded so it is not relitigated:

- Choppiness begins around **400** verses, which is _below_ any round number one would
  pick as a cap. A 500-verse cap would therefore permit the bad experience it was meant
  to prevent while blocking legitimate multi-passage studies — the worst of both.
- The thresholds deliberately avoid 1,000, because Crossway's quotation permission is
  also 1,000 verses and two unrelated limits sharing a value is exactly how the earlier
  confusion in this codebase started.
- These numbers are **ours**, which is why they live in `src/lib/config/` rather than in
  `translations.json`. Filing them next to publisher limits would repeat the misfiling
  mistake described in §12.2 and §13.2.

⚠️ **Still unmeasured.** Every suspect above remains a hypothesis. Measure before changing
anything, and before revisiting the cap question at all.

### 13.2 Limit messages (fixed 2026-08-03)

`validatePassageLimits` attributed a self-imposed cap to the provider, sending a
developer through API docs for a limit that came from our own config. Messages are now
`source`-aware. **Any new limit copy must check `source` first.**
