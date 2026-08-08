# Series — Design Plan

> Formerly "Linked Studies", and formerly `LINKED_STUDIES_PLAN.md`. The old name is recorded
> here for one reason only: commit messages and people's memory still use it, so a search for
> it should land somewhere useful. It is not an alternative name for the feature — see §3.

**Status:** IN PROGRESS — **phase 1 complete**; phase 2 not started. Migration `0046` and the four new `icons.json` entries

have landed in the repo. `0046` is **applied to dev only** — not staging, not production. Verified
on dev: applies in one transaction, is idempotent on re-run, all five FKs carry the intended
`ON DELETE`, and the 8 existing studies are untouched. Do not record a "migrated through" number
for production here; probe it (`DEPLOYMENT.md`, "Checking what production has applied").

**Step 1b (read path) is complete and builds clean.** A series now renders in the Finder at the
top level and inside groups, expands to its parts, survives search, and is reachable by keyboard.
What landed: the `+layout.server.js` query and part-attachment, `expandSeriesAncestors`,
`StudySeries.svelte`, the `StudyGroup`/`StudiesPanel` wiring, `useStudiesFilter`, and
`PATCH /api/series/[id]` (which accepts **only** `isCollapsed`, `name`, and `lastPartId` — membership
and ordering belong to their own endpoints, so a generic patcher cannot leave a gap in `seriesOrder`).

Two invariants were enforced rather than assumed, and both are load-bearing for later phases:
a part appears **exactly once** in the Finder (inside its series, never also as a loose study —
verified against real dev data, 3 parts + 3 standalone = 6 total), and a series row carries
`type: 'series'` through `groupFlattening.js`. The second was a real bug: the flattener's `else`
branch labelled every non-group row a `study`, so arrowing onto a series would have told the toolbar
a study was selected and pointed Delete at a study that does not exist.

**Step 1c (creation) is complete**, and it did write `translation` — trap 16's warning
(`study.translation` is `NOT NULL` with no default, so an INSERT omitting it fails at runtime, not
at build) was heeded rather than rediscovered. What landed: `seriesPlanning.js` (`isSeriesEligible`,
`getPartingStrategy`, `planSeriesParts`), `POST /api/series`, `SplitIntoSeriesModal`, and the New
Study form's create-as-series choice. Both entry points go through the same planner and the same
endpoint, so the preview a user approves is the parting they get.

**Phase 1 is now feature-complete**: creation, the Finder row, prev/next navigation, delete
(series and part), the derived run helper, and the disabled-with-a-reason boundary states. Two
verifier scripts pin the behaviour to this document — `verify-series-runs.mjs` and
`verify-boundary-reasons.mjs` (24 checks) — and both run against real `bible.json` via
`node --import ./scripts/alias-loader.mjs`.

**Next: phase 2**, which is blocked on Q40 (overlapping boundaries) and Q23 (cross-part
connections). Neither is a coding task; both are decisions.

**Last updated:** 2026-08-08

⚠️ **This read "ON HOLD. Not scheduled; no code written" — all three clauses are now false.** Left
visible because the next reader's first question is "has anything shipped?", and a status line that
was wrong once should be seen to have been wrong. Nothing about the **rationale** for parking it
changed; the work resumed by decision, not because the reasoning below expired.


**Why it was parked, and why that reasoning still stands:** the original trigger — that a study
over 500 verses must be broken into several studies — does not hold. No chapter exceeds 500
verses, and long books are already legal
today as multiple passages in one study. Nothing is broken, so this is a
build-it-because-it's-better feature rather than a fix.

**The reframing is settled** (§1, Q1): this is _a series of studies that belong together_, not a
workaround for long ones.

**Before continuing, read §8 — then Q23.** §8 carries the feature's biggest commitment: five
existing structural commands (Join Column, Join Section, Join Segment, Move Text Up, Move Text
Down) must work across a part boundary. That is what makes the connection questions urgent —
`segmentConnection.studyId` becomes actively wrong once a segment can change part.

⚠️ **This read "read §8, then Q23 and Q42 together", and the paragraph below it gated the phase-1
migration on deciding Q42 first. Q42 is answered and `0046` is written, so the gate is discharged.**
The reasoning is preserved in §4 and §13 rather than repeated here, but the conclusion is: `studyId`
stays `.notNull()`, `seriesId` is nullable and additive, and no `CHECK` was added. What survives as
live guidance is the distinction the old note drew — **"settled" is not "migrated."** Phase 1
excludes Split Part, Join Parts and boundary moves (§11), so it cannot produce a connection whose
endpoints sit in different parts; dropping `.notNull()` belongs to the phase that ships those moves,
not to this one. **Q23 is now the open one**, and it carries the whole question, because cross-part
rows arrive from boundary moves rather than from authoring (§4).


> **Note on this revision.** This document previously carried an inline record of its own
> corrections — which sentences had been withdrawn, and when. That has been removed in favour
> of a clean statement of the current design. What survives of it is §12 (**Traps**), which
> records things that are _not true of the code_ rather than things that were once written
> here. Question numbers are unchanged (Q1–Q37 mean what they did); Q1, Q2, Q3, Q5, Q6, Q9, Q24,
> Q33 and former Q38 are resolved and now sit in the decisions log, and former Q39 is merged into
> Q33.
>
> **New questions start at Q40.** Q38 and Q39 are _retired, not free_ — they meant something
> specific (auto-splitting user selections; a display question folded into Q33) and are cited by
> those numbers in the decisions log. Reusing them would make two different questions share a
> number, which is how the stale cross-references in `studyLimits.js` and `COMPLIANCE.md`
> happened. An earlier pass of this revision did exactly that and it is corrected here.

---

## 1. The case for the feature

Three reasons, none of them a limit:

1. **Teaching cadence.** A 16-week Romans series is 16 studies because that is how it is
   taught — one sitting, one chapter. Nothing to do with verse counts.
2. **Analyze ergonomics.** Structure, connections, columns and the layout overlay all scale
   with verse count. A 433-verse study is legal but unpleasant to work in.
3. **Navigability.** 16 sibling studies in the Finder is clutter; one collapsible series with
   prev/next is not.

**Q1 — decided.** Reframed from "a workaround for long studies" to **"a series of studies that
belong together."** Everything below assumes it. Under that framing the verse caps are guardrails
on individual parts, not the reason the feature exists. See §14.

---

## 2. Constraints that bind

**`COMPLIANCE.md` is authoritative for everything in this section.** Only the consequences
for _this feature_ are stated here; the terms, the probe evidence and the reasoning are not
repeated, because two copies of a licence rule drift and the copy in the design document is
the one that gets stale.

| Constraint                                                                                                                                                       | Consequence for a series                                                                                   | Authority                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| ESV cannot serve or display a whole book — **60 of 66 books**. Only the six single-/double-chapter books are exempt (Obadiah, Philemon, 2–3 John, Jude, Haggai). | A series cannot be justified as a route to whole-book ESV study. It is not one, by any arrangement.        | §1 "The core distinction", §1 "The probe evidence" |
| The display cap applies to the **assembled page**, not the request. Several legal queries can compose an illegal page.                                           | **Splitting a book into passages does not make it displayable.** Neither does splitting it into parts.     | §1.6 "The multi-passage display gap"               |
| The cap is **one** limit — `min(500 verses, half the book)` — not two.                                                                                           | Per-part validation must resolve the binding number before reporting, or it warns twice.                   | §1.7 "Whichever is less is one limit"              |
| NET chunks, ESV deliberately does not.                                                                                                                           | A NET part may be any length; an ESV part is capped at one request. Join Parts must branch on translation. | §1.5 "The third axis: retrieval"                   |
| Display is checked per page; distribution is checked per exported artifact.                                                                                      | Per-part at creation; **aggregated across all parts** at export. See §10.                                  | §2 "Where each rule lives in code"                 |

Two things this feature must not assume:

- **NET's 500-verse cap is ours, not the publisher's** (`source: self-imposed`), so user-facing
  copy must not attribute it to Crossway or Biblical Studies Press.
- **`enforcement` is `'warn'` for both translations today.** Anything built here should keep
  working when it flips to `'block'` at release.

---

## 3. Terminology — decided

**Q2 and Q3 are settled** (see §14). This is the vocabulary; use it in code, copy and the rest
of this document.

Existing vocabulary, unchanged: `Study`, `Study Group` (nestable folder), `Passage`, `Column`,
`Section`, `Segment`, `Connection`.

**"Linked Studies" is retired entirely.** It is **not** the feature's name: it labels the
mechanism rather than the thing, and collides conceptually with `Connection`, already our word
for "link between two things."

It survived for a while as this document's filename, on the grounds that `COMPLIANCE.md` and
`src/lib/config/studyLimits.js` cited it by name. That was a bad reason and the file is now
`SERIES_PLAN.md`: a filename contradicting the vocabulary decided in this very section has the
shape §12 keeps recording — a workaround outliving the thing that produced it — and two citations
are cheaper to update than a permanently misleading name is to live with. Both had their
**filename** references updated with the rename, and the episode is recorded as a trap of its own,
since "cite it by name so it cannot go stale" is precisely what did.

✅ **The dangling section reference this paragraph recorded is fixed.** It read: "one of them still
carries a dangling section reference — `studyLimits.js:18-19` reads 'See COMPLIANCE.md §3 and
**§13.2**', and there is no §13.2." Confirmed by listing `COMPLIANCE.md`'s headings (§0, §1, §1.5,
§1.6, §1.7, §2, §3, §4, §5, §6) and now repointed at **§3 "Translation limits"** and **§1.5 "The
third axis: retrieval"** — the latter being where the NET cap's `source: self-imposed` actually
lives, which is what the dead number was reaching for.

The citation now gives **heading text with the number in parentheses**, so the next renumbering
leaves something greppable behind. That is trap 14's remedy applied rather than restated: a bare
number fails silently, a heading does not. And the sharpest part is worth keeping — the dead
reference sat three lines above the comment explaining why references go stale.



| Concept             | Term                    | Why                                                                          |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| The whole sequence  | **Series**              | Matches how teachers speak ("a series on Romans"); no collision              |
| One study within it | **Part**                | Neutral; "Session" presumes teaching, "Chapter" collides with Bible chapters |
| Label shown to user | **"Part 3 of 16"**      | Unambiguous, reads aloud naturally                                           |
| Creating one        | **Split into a series** | Qualified by its object, per the collision rule below                        |
| Adding a part       | **Split Part**          | Qualified by its object                                                      |
| Combining parts     | **Join Parts**          | Qualified by its object; matches the `column-join` precedent                 |

**The Split/Join collision, and the rule that resolves it.** `column-split.svg` /
`column-join.svg` exist and `passageJoin.js` is an existing module, so a bare "Split" or "Join"
at the _study_ level would read ambiguously beside the same verbs at the _column_ level.

_Rule: at the study level the verb is **always qualified by its object** — "Split Part", "Join
Parts", "Split into a series". Never a bare "Split" or "Join" in a study-level label, menu item
or function name._

"Part" rather than "Study" is the qualifier because by the time these commands are reachable the
thing on screen _is_ a part, and §11's phase list already uses those exact strings.

Rejected: accepting the bare verbs and relying on toolbar context (ambiguous in menus, tooltips
and commit messages, where there is no toolbar); and Divide/Merge for studies (a second name for
one concept, so readers must learn which of two verb pairs applies at which level).

⚠️ **The rule fixes the labels; one genuine overlap remains underneath.** Naming resolves the
_ambiguity_ but not the _fact_ that these operations converge. Once Join Column works across a
part boundary (§8), invoking it on the **first** column of part 4 pulls that column's content
into part 3 — a boundary move wearing a join's clothes, and very nearly "Join Parts for one
column's worth of content." Two distinctly-named commands, adjacent in effect. That is not a
naming defect to fix; it is a real conceptual adjacency, recorded so nobody later "simplifies"
one into the other. They differ in what survives: Join Parts removes a part, a boundary move
does not.

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
seriesId:    text('series_id').references(() => studySeries.id, { onDelete: 'cascade' }),
seriesOrder: integer('series_order')   // NULL for standalone studies

// on `segmentConnection` — required in the phase-1 migration, not optional:
seriesId:    text('series_id').references(() => studySeries.id, { onDelete: 'cascade' })
```

⚠️ **`segmentConnection.seriesId` is not the whole fix, and this is the part that will bite.**
Today the column beside it is:

```ts
studyId: text('study_id').notNull().references(() => study.id, { onDelete: 'cascade' }),
// plus: index('segment_connection_study_id_idx').on(table.studyId)
```

`studyId` is **`.notNull()`**, so simply adding `seriesId` alongside leaves every cross-part
connection still obliged to name one owning part — and `countTouchingConnections()` filters on
`studyId`, so the silent under-reporting described in §8 survives the migration untouched. The
new column does nothing on its own.

So a decision is owed here, in the data model, not at implementation time:

- **Make `studyId` nullable**, with `seriesId` carrying ownership for cross-part connections.
  Honest, but every existing reader of `studyId` must handle `null`.
- **Keep `studyId` not-null and redefine it** as "the part that owns the arc" — conventionally the
  part holding the `from` endpoint. Cheaper, no reader changes, but the column's meaning silently
  shifts and any query that assumes "both endpoints are in this study" becomes wrong.
- **Drop the stored owner and derive part membership** from the endpoint, via
  `passageSegment → passageSection → passageColumn → passage → studyId`. Every one of those FKs
  exists and cascades. **Rejected on query cost** — `studyId` exists so "connections in this study"
  is one indexed lookup, and this makes it a four-join walk on a hot path — but recorded rather
  than omitted, because it is the same move this document makes and defends twice elsewhere: trap
  12 ("Runs are derived, not stored — four chances for a stored `runId` to go stale") and the run
  rule below. A stored owner on a connection whose endpoints can change part is that identical
  failure shape, so the two live options are a considered trade against derivation, not an
  exhaustive list.

Either way `segment_connection_study_id_idx` needs a `seriesId` sibling, since the hot query moves
from "connections in this study" to "connections in this series."

`study` has **no** `displayOrder` today — `studyGroup` has one, and so does `passage`, but no
study-level ordering exists — so parts need an explicit `seriesOrder`; there is nothing to lean on.

**Why a table:**

- Series-level title/subtitle/description live somewhere real, rather than being inferred
  from part 1 (which breaks the moment part 1 is deleted or reordered).
- `groupId` belongs to the series, so a series occupies one slot in a group — matching the
  Finder, where a series is one row.
- Mirrors the existing `studyGroup` shape (`isCollapsed`, `displayOrder`, `parentGroupId`),
  so Finder code and collapse state reuse established patterns.
- A single row to hang series-level state on — which the newer work needs: series-level
  compliance reporting (§5) and series-wide export (Q32) both have nowhere else to live.

**Rejected — `study.seriesParentId`:** cheaper migration, but part 1 becomes load-bearing and
every query needs "am I a parent or a child?" branching.

**Rejected — `studyGroup` with `kind: 'series'`:** nesting, collapse and ordering already
work, but groups are arbitrary nestable folders while a series is a flat ordered sequence with
invariants. Overloading one table with two rule sets will leak.

### Ordering

Structural tables order by `startingWordId`, a canonical Bible-order key. Parts could derive
order the same way, from each part's first passage.

**Decided: canonical order _seeds_ `seriesOrder`; the run rule (below) constrains it thereafter.**

⚠️ **The previous recommendation here was wrong and is withdrawn.** It read: "store `seriesOrder`
explicitly but **derive** it from canonical passage order … re-normalising to 1..N after every
mutation." Re-normalising from canonical order after every mutation would **clobber any deliberate
arrangement the user has made** — which is fatal now that reordering is a supported operation.
`seriesOrder` is explicit, seeded canonically at creation, and thereafter user-editable within the
run invariant.

Its stated justification was also wrong: "purely derived breaks for a non-contiguous series (Q7)."
It doesn't — a Prison Epistles series orders perfectly well canonically (Eph < Phil < Col <
Philemon). What actually defeats a purely derived order is **overlapping parts** (Q40), where
canonical order has no answer, and **deliberate non-canonical arrangement**, which is the real
reason. Recorded because the old justification cites a case that works, and someone would
eventually notice and "correct" the conclusion.

### Runs: the unit of reordering

A series decomposes into maximal **runs** of canonically contiguous parts. Romans 1–16 in sixteen
parts is _one_ run; Prison Epistles is _four_ runs of one part each.

**Decided: reordering permutes runs. Parts within a run are rigid, and runs are never
interleaved.**

| Series                      | Runs | Reorderable?                                          |
| --------------------------- | ---- | ----------------------------------------------------- |
| Romans 1–16, sixteen parts  | 1    | **No** — every part is contiguous with its neighbours |
| Prison Epistles, four parts | 4    | Yes — any permutation of the four books               |
| Rom 1–7 + Rom 8, two parts  | 2    | Yes                                                   |

This is the same predicate as §8's adjacency rule, reused: the function that decides whether Join
Column works at a seam also decides whether a drag is legal. One concept, two uses.

Note what the rule implies: **teaching Romans 8 before Romans 1–7 is not a reordering.** It is a
differently-shaped study — Rom 1–7 plus Rom 8, two runs — and the shape expresses the intent. The
rule does not forbid the teaching plan; it forbids pretending one contiguous block is two.

**Runs are derived, never stored.** A part delete creates a run boundary, Split Part creates one,
Join Parts merges two, and a boundary move shifts where one ends — four places that would have to
keep a stored `runId` correct. Instead fold the adjacency predicate over the parts in canonical
order, on demand. One helper, three callers: reorder legality, the part-delete warning, and
boundary-move eligibility.

⚠️ **Q40 now gates reordering too.** For overlapping parts — Rom 1–3 and Rom 3–5 — "are these in
the same run?" has no answer, because overlap is neither contiguity nor a gap. The same undecided
question now blocks two features rather than one.

### Deletion

**Decided: deleting a series deletes everything in it.** Reverses Q6's earlier `set null`
recommendation, which was justified as "leaving parts as standalone studies instead of cascading
away a user's work." Cascade matches the existing `0009_cascade_delete_studies.sql` precedent, and
it **dissolves the cross-part-connection problem for series deletion** — the FK collects those rows
with no special handling. The cost is that one action destroys every part with all its structure,
notes and commentary, so the confirmation must state the part count and that it cannot be undone.

⚠️ **"Outright" was too strong and is narrowed above.** Cascade disposes of connections when a
series or a part is deleted, under either Q42 option, because the six endpoint FKs cascade
independently. It does nothing for the case the problem actually lives in — **boundary moves**,
where nothing is deleted and a connection's endpoints simply end up in two different parts. Do not
read the delete behaviour as retiring Q23 or Q42.

**Decided: a part may be deleted, with a warning, and its verses leave the series.** Not handed to
a neighbour — that would be Join Parts wearing the wrong label. If the part sits inside a run, the
run **splits in two**: delete part 8 of a sixteen-part Romans series and you have parts 1–7 and
parts 9–16, each internally contiguous, with a gap between them.

Three consequences, all arriving later than the gesture, which is why the warning must name them:

1. **That seam is permanently dead.** Parts 7 and 9 are no longer adjacent, so all five structural
   commands are inert there forever — the _never-applicable_ reason string, not the "yet" one
   (§11).
2. **Rigid parts become reorderable.** One run became two, so a user may now put 9–16 first.
   Follows from the run rule, but surprising unless stated.
3. **The series is now non-contiguous** — exactly the Q7 case, allowed with a warning. Not a new
   exception.

> _Deleting Part 8 (Romans 8) removes Romans 8 from the series and splits it into two blocks:
> Parts 1–7 and Parts 9–16. Structural commands will no longer work across that gap._

**Deleting down to one part dissolves the series**, leaving a standalone study. The minimum is 2
(below), so the alternative is blocking the last delete; a one-part series is a study wearing a
costume, so dissolve rather than refuse.

**Q4. `study_series` table, or `study.seriesParentId`?** _Rec: the table — and the newer work
strengthens it. Series-level compliance reporting (§5) and series-wide export (Q32) both need a row
to hang state on, and part 1 being load-bearing is worse now than when this was first written._

**Q5 — answered.** Explicit `seriesOrder`, canonically seeded, user-editable within the run rule.
Not re-derived after mutations.

**Q6 — answered: cascade.** See "Deletion" above.

**Q42. Which `studyId` strategy for `segmentConnection` — nullable, or redefined as the owning
part?** _(Asked in the present tense below because that is how it stood; the answer follows
immediately.)_ The **semantics** had to be settled before the phase-1 migration was written, since
they fix what `seriesId` means. The **nullability change** belongs to the phase that ships cross-part moves:
phase 1 excludes Split Part, Join Parts and boundary moves, so it cannot produce a connection whose
endpoints are in different parts, and therefore cannot produce a wrong `studyId`. See the schema
note above and the header note. ⚠️ This previously read simply "Blocks the phase-1 migration",
which conflated deciding with migrating and would have made every existing reader handle `null` to
guard a state phase 1 cannot reach.

**Q42 — answered (phase 1 shipped): `studyId` stays `.notNull()`; `seriesId` added nullable and
additive; no constraint either way.** Two findings settled it.

_First, cross-part connections cannot be authored._ Connections are drawn over a single study's
canvas: `ConnectionsOverlay.svelte` resolves endpoint geometry from the elements currently mounted
(`:1048` reads `connection.fromType`/`toType` off the live row, `:1153` derives edges from mounted
node positions). Two parts are never on screen together, so there is no gesture that can express a
cross-part link and no geometry to draw it with. Cross-part connection **authoring** is therefore
out of scope indefinitely — not just phase 1 — until some view shows two parts at once.

_Second, and the reason no constraint was added:_ cross-part rows will not arrive by authoring.
They arrive when a **boundary move** slides under a connection the user legitimately drew inside
one part — Part 2's internal link becomes cross-part because the Part 2/3 boundary moved above one
endpoint. The user never linked across parts. So a `CHECK` forbidding the shape would not block an
impossible gesture; it would silently decide the fate of **already-valid user work** at boundary-
move time, and the available outcomes (delete their connection, refuse the move, corrupt the row)
are all worse than leaving room. ⚠️ Note the shape of that near-miss: "cannot be drawn" was one
step from being promoted into "must not exist". That is trap 10 and trap 15 a third time; see
trap 16.

Verified against a scratch clone of the dev schema before landing: migration `0046` applies
cleanly, is idempotent on re-run, and all five FKs carry the intended `ON DELETE`
(`study.series_id`→CASCADE, `segment_connection.series_id`→CASCADE,
`study_series.last_part_id`→SET NULL). Deleting the remembered part leaves the series standing
with `last_part_id` nulled; deleting the series cascades its parts and leaves standalone studies
untouched.


**Q43. Can a part be deleted while `enforcement` is `'block'` and the resulting series is
non-compliant?** A part delete only ever _reduces_ coverage, so it cannot create a display or
distribution breach — it may clear one. Recorded as a non-issue so nobody adds a check that can
never fire. Contrast §10.1, where boundary moves genuinely can breach.

### Invariants

| Invariant                     | Rec                                            | Note                                                                                                                                                                                                                   |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same translation across parts | **Enforce**                                    | Mixed translations would break the export attribution story. `studySeries.translation` is authoritative; `study.translation` on a part must match it, and Q26's ESV/NET branching reads the series column              |
| Same book across parts        | Allow multi-book                               | Otherwise a legitimate "Prison Epistles" series is blocked. Cost recorded in §8: every book change is a dead boundary                                                                                                  |
| Contiguous, non-overlapping   | **Warn, don't block**                          | Overlap is normal when a pericope straddles a chapter. Gaps are legal too — and both make boundaries ineligible (§8), so permissiveness here is not free                                                               |
| Min parts                     | **2** — below that the series dissolves        | A one-part series is a study wearing a costume; see "Deletion"                                                                                                                                                         |
| Max parts                     | **No hard cap.** Soft-warn ~30, confirm at 150 | Matches Q10. The earlier "2..50" was inconsistent with it and with §5, which treats Psalms at one chapter per part — 150 parts — as a legitimate user choice, so a 50 cap would forbid a case the creation flow offers |

**Q7. Must a series be contiguous?** _Rec: no — warn only._
**Q8. Multi-book series allowed?** _Rec: yes._

_Both are also **creation-time** questions, not only invariants on an existing series: "must a
series be contiguous?" and "may I create a series from a non-contiguous study?" are one question
asked at two moments, and answering the second restrictively at the creation dialog would quietly
overturn the permissive answer here. §5 settles it — membership is unrestricted; contiguity
constrains only which parting strategy is offered. The cost of the permissive answer is recorded
in §8's adjacency subsection._

---

## 5. Creation UX

### Decided: creation is always the user's choice

Three rules, and they are decisions rather than recommendations because each one is a thing that
would otherwise erode:

1. **A series is never imposed.** No range length, book size or verse count causes one to be
   created automatically. The app may _offer_; it never decides.
2. **The default is always one study.** In any offer, "One study" is pre-selected — including for
   Psalms. Pre-selecting "series" because a range looks long is the §1/Q1 instinct (length as a
   reason to restructure) creeping back in through the UI.
3. **The user picks the granularity.** How many chapters a part holds is theirs to set, with a
   default of 1 and a live preview. Closes **Q9**.

### Eligibility vs. solicitation — two different thresholds

These were conflated in an earlier pass of this document, and the conflation would have removed
capability rather than noise, so they are now kept apart deliberately:

| Question                                             | Answer                                                   |
| ---------------------------------------------------- | -------------------------------------------------------- |
| **Eligibility** — when is a series _possible_?       | **Any range spanning 2+ chapters.** Never restricted.    |
| **Solicitation** — when does the app _volunteer_ it? | **As shipped: whenever eligible.** Tunable. |


**Eligibility is 2+ chapters and that is not negotiable.** Two sessions on Haggai is a real
teaching plan; three on Habakkuk likewise. There is no principle by which the app knows better
than the user that a short book is not worth parting.

⚠️ **An earlier revision proposed "raise the ≥2-chapter threshold" because a prompt on a
two-chapter selection is noise.** The observation was fair and the remedy was wrong: it would have
made a Haggai or Habakkuk series **impossible**, not merely unprompted. What is too eager is the
_prompt_, not the _capability_. Tune solicitation; leave eligibility alone.

Solicitation is a UX judgement, not a constraint — a prompt that fires when the answer is obvious
teaches users to dismiss prompts unread, which is precisely when it stops working on Psalms. Set
it wherever it reads well and change it freely; nothing depends on the number.

### Contiguity constrains the parting strategy, not eligibility

**Decided: series creation is _not_ restricted to studies made of contiguous text from one book.**
A "Prison Epistles" study (Ephesians, Philippians, Colossians, Philemon as four passages) can
become a series, as can a gapped study like Romans 1–3 plus Romans 8. Restricting membership would
contradict Q7 and Q8, which exist to let exactly these studies be built.

What contiguity actually constrains is **how the parts get divided**, and only for one of the two
strategies:

| Study shape                                          | Strategy offered                  | Why                                                 |
| ---------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| One contiguous range, 2+ chapters (Romans 1–16)      | **Chapters per part** (stepper)   | Chapter arithmetic is well-defined                  |
| Multiple passages (Prison Epistles; Rom 1–3 + Rom 8) | **One part per passage**          | Seams already drawn by the user; nothing to compute |
| Multiple passages, finer parts wanted                | Part-per-passage, then Split Part | Phase 2                                             |

⚠️ **Why the stepper is single-book — a code fact, not an oversight.**
`splitRangeIntoPassages(range, translationId)` destructures a **scalar `book`** and iterates
`for (let ch = fromChapter; ch <= toChapter; ch += 1)`. It cannot express a multi-book or gapped
range. That is the real reason "3 chapters per part" has no meaning across an Ephesians→Philippians
seam — and across a gap it is not merely undefined but unanswerable: on Romans 1–3 + Romans 8 at
one chapter per part, whether part 4 is "Romans 8" or "Romans 4, which is not in this study" has
no correct answer. Do not generalise the scalar `book` in service of the stepper.

**Part-per-passage is the _easier_ case, which is the argument against restricting.** A four-book
Prison Epistles study divides into four parts with no arithmetic, no stepper and no preview
computation — the user has already chosen the seams. Restricting series creation to contiguous
same-book text would forbid the series needing the least machinery while permitting the one
needing the most.

**Decided: part-per-passage is offered, never applied automatically.** Even with the seams drawn
and nothing left to compute, the dialog asks — _"This study has 4 passages. Create a series of 4
parts, one per passage?"_ — because "the app never decides, it offers" is rule 1 above. An
automatic conversion would be a series imposed by the app's reading of the study's shape. **The
absence of arithmetic is not the absence of a decision.**

### Where series get created

1. **New Study flow** — offer _"Create as: **(•) One study** ( ) A series of studies"_ with a
   chapters-per-part stepper. **One study is pre-selected**, per rule 2. ✅ Shipped in
   `StudyForm.svelte` (the choice, stepper, live preview and compliance notices) and the
   `new-study` action (which converts via `POST /api/series` after creating the study, so the
   parts come from the same `planSeriesParts()` the preview showed).

   ⚠️ **One deviation, recorded rather than hidden: the offer is shown whenever the study is
   eligible (2+ chapters), not only "when the range is plausibly multi-session."** Two reasons.
   A "plausibly multi-session" threshold is a second eligibility rule living beside
   `isSeriesEligible()`, and trap 10 is precisely about eligibility rules drifting apart. And it
   would have the app judging which studies are _worth_ splitting — a soft version of the
   deciding rule 1 forbids. The offer is inert until chosen, so showing it costs a user nothing;
   guessing wrong about their intent costs them the capability.

2. **From an existing study — "Split into a series…" in the study menu. Always available for any
   2+ chapter study, whether or not the flow ever offered it.** This is what makes the choice
   genuinely the user's: it never depends on the app having volunteered the question, so tuning
   solicitation can never take the capability away.
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

### The preview is where compliance lives

**Decided: the compliance position is shown at creation time, live, in the preview** — not
deferred to export. By export there are 21 parts with structure and notes in them, and
restructuring is the expensive operation §8 exists to describe; a warning the user can no longer
act on cheaply is not much of a warning. This also follows `COMPLIANCE.md` §1.6's reasoning:
make the position visible and let the study's owner decide.

Three checks, all recomputed as the stepper moves:

1. **Per-part status** — each proposed part's verse count against `min(500, half the book)`,
   resolved to the binding number per `COMPLIANCE.md` §1.7.
2. **A series-level line** — what the parts add up to, stated plainly:

   > _This series covers the complete book of John (879 verses). ESV permits at most 439 on a
   > page; each part is within that, but exporting the series would exceed the quotation limit._

3. **`checkSinglePassageSupport()` per proposed part** — so a stepper setting that makes a part
   unservable is caught while the stepper is still on screen. "16 chapters per part" on Romans is
   the whole book, which returns `'complete-book'` and cannot be served in ESV at all. Same branch
   Q26 handles for Join Parts, reachable from the creation stepper.

   ⚠️ **This example used to continue "…'8 chapters per part' gives two 216-verse parts and is
   fine." It is wrong and is withdrawn.** Rom 1–8 is **225** verses and Rom 9–16 is 208, not 216
   each; and since Romans is 433 verses, half is 216.5, so **no two-way split of Romans has both
   parts under the cap** — one part must always hold ≥217. The corrected reading is the opposite of
   the old one: 8-chapters-per-part on Romans is precisely a setting the preview must flag. See
   §10.1, where the same 216 error is unpicked in full.


**Informational at creation, binding at export.** These are different points on purpose and it is
not an inconsistency: Q32 wants whole-series export to `'block'` even while per-part export stays
`'warn'`. You may build what you like and you are told, up front, what you will not be able to
export.

⚠️ **Recorded consequence: a user may knowingly create an ESV series that will warn — later
block — at export.** That is the correct outcome. Compliance is the study owner's obligation
(`COMPLIANCE.md` §1.6), `enforcement` is `'warn'` everywhere today, and the alternative is
refusing to create the series, which removes exactly the choice this section exists to protect.
Logged so that nobody later "fixes" it by blocking creation.

**Uneven parts.** Fixed chapters-per-part gives wildly uneven verse counts (Psalm 117 has 2
verses; Psalm 119 has 176). Options: (a) fixed chapter count, accept unevenness; (b) balance
by verse count, breaking on chapter boundaries; (c) both. _Rec: (a) by default — chapter
boundaries are meaningful to readers in a way equal verse counts are not — with (b) offered
as "Balance by length" (Q11). Consistent with the rules above: (b) is an option the user may
choose, never a re-balancing the app applies on their behalf._

**Q9 — closed.** The user picks chapters-per-part; the default is 1. See "creation is always the
user's choice" above.

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
**Q18. What does clicking the series row do?** _Rec: chevron expands; the title opens part 1._

⚠️ **This previously read "the title opens the last-viewed part, falling back to part 1, matching
`user.lastStudyView`." That column cannot do it.** `schema.ts:71` is
`lastStudyView: text('last_study_view').default('analyze')`, documented one line above as "the last
study view ('analyze' | 'document')" — a **view mode**, not a study or part identity. Nothing on
`user`, `study` or `studyGroup` persists a last-viewed part. (§7 uses the same column correctly, so
the document read one column two incompatible ways.) **This has a migration consequence:** "open
the last-viewed part" needs a new column — `studySeries.lastPartId` or a per-user equivalent —
which phase 1's migration list does not include. So either add it to phase 1 deliberately, or keep
"opens part 1". _Rec: part 1 for phase 1; revisit given evidence that users want resume-where-I-
left-off._

**Q18 — answered: option B, resume the last-viewed part.** The recommendation above (part 1, defer
the column) is **not** what shipped; the column was added to phase 1 deliberately, which is the
first branch this question offered. `studySeries.lastPartId` is nullable, references `study.id`, and
uses `onDelete: 'set null'` — **not** cascade, because deleting the remembered part must not delete
the series; a null simply falls back to part 1, so the fallback in the original recommendation
remains the behaviour whenever nothing is remembered.

Verified on the scratch clone: deleting the remembered part leaves the series row intact with
`last_part_id` nulled. Note that this is a genuinely new column and not a reuse of
`user.lastStudyView` — the confusion this question exists to record. The chevron still expands and
the title still navigates; only the destination changed.


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

## 8. Boundary moves, Split Part and Join Parts

The hard part: moving text/segments/sections/columns from the start of one part to the end of
the previous, or from the end of one part to the start of the next.

**Decided: five existing commands must work across a part boundary** — **Join Column**, **Join
Section**, **Join Segment**, **Move Text Up** and **Move Text Down**.

That decision does more work than it looks like. These are not new commands whose scope we get
to choose: they ship today, with menu items in `MenuStructure.svelte` and buttons in
`toolbarConfig.js`. A user who has learned them in a single study will reach for them at a part
boundary within minutes. So the question is not _which_ granularities to support — the existing
command set has already answered that, and the answer is all five, in both directions. See Q24,
which previously recommended the opposite.

### What already exists

- `passageReconcile.js` — `analyzeEdit()`, used when a study's passage range changes; works out
  what structure survives.
- `passageJoin.js` — `joinColumn()`, `joinSection()`, `joinSegment()`, plus `analyzeJoin()`,
  which dry-runs a join to drive the Merge/Delete confirm modal.
- `moveSegmentTextUp()` / `moveSegmentTextDown()` in `src/lib/server/db/utils.js`.
- `passageFold.js` — `foldSegmentContent()` and `reanchorConnectionsOnto()`, imported by
  `passageJoin.js`.

  ⚠️ **This used to read "already shared between the reconciliation engine and the explicit Join
  commands." It is not shared — it is duplicated.** `passageFold.js` has exactly one importer
  (`passageJoin.js:44`). `passageReconcile.js` does not import it; it carries its own
  `foldSegmentContent()` at `passageReconcile.js:790`, plus its own `loadTree()` (`:182`) and
  `flattenSegments()` (`:258`), duplicating `passageJoin.js:54` and `:125`. The two engines have
  parallel implementations of at least three functions. This **understated phase 2**: the
  "ordered sequence of passages" helper below has two call graphs to generalise, not one, and
  generalising only `passageJoin`'s copy leaves `analyzeEdit()` on the old passage-scoped path.
  De-duplicating first is either a prerequisite or an explicit non-goal — decide which, but do not
  assume a shared layer that does not exist.
- Structure is keyed by `startingWordId`, which is **globally canonical**
  (book/chapter/verse/word), not per-study. **Moving a boundary therefore requires no
  re-keying:** a segment keyed at `ROM.3.1.1` is valid in whichever part contains Romans 3:1.

⚠️ **Do not over-read that last point.** An earlier draft of this section treated canonical
keying as most of the problem solved. It removes re-keying and nothing else — every function
listed above is scoped to **one passage**, and that is the actual obstacle. See below.

### The five commands are passage-scoped, not study-scoped

The boundary in the code today is the **passage**, not the study and not the part:

| Site                                          | Scoping                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `loadTree(dbx, passageId)`                    | Loads one passage's column/section/segment tree                                  |
| `flattenSegments()` / `flattenSections()`     | Walk that one tree                                                               |
| `loadContext(dbx, userId, type, itemId)`      | Resolves a single `passageId` from the item and stops                            |
| Join guards                                   | Literally `'Cannot join the first segment in a passage'`                         |
| `moveSegmentTextUp/Down(..., passageId, ...)` | Takes a `passageId` outright                                                     |
| `reanchorAndPrune(tx, studyId, passageId)`    | Re-anchors within one passage                                                    |
| Client guards                                 | `isActiveSegmentFirstInPassage`, `isWordInFirstSegment`, `isCaretAtSegmentStart` |

**This limitation is not new and not caused by series.** A study holding Romans 1–8 and Romans
9–16 as two passages cannot Join Segment across that boundary **today**. Cross-part is therefore
a generalisation of a defect that already exists one level down.

_Decided: go straight to cross-part_ rather than fixing cross-passage-within-a-study first as a
stepping stone. Recorded as a known consequence: the present-day multi-passage limitation is then
fixed incidentally, or not at all, depending on how the generalisation is written. Prefer a
scope-resolution helper that is given an ordered sequence of passages — whether those passages
belong to one study or to adjacent parts — so both cases fall out of one implementation.

⚠️ **Move Text Up/Down are rewritten, not extended.** `moveSegmentTextUp` is the cheapest operation
in the codebase: verify ownership, fetch the segment, check the caret is after the segment's start,
rewrite one `startingWordId` (`utils.js:653-694`). ⚠️ `moveSegmentTextDown` is **not** as cheap, and
the earlier wording ("each validates the caret against the segment anchor and rewrites a single
`startingWordId`") flattened the pair wrongly: it calls `loadPassageStructure()`, flattens every
column/section/segment in the passage, sorts by `compareWordIds` and locates the next segment before
writing (`utils.js:697-760`). So one of the two already walks the whole passage tree — and it is the
one whose "next segment" lookup must cross into another part.

Across a part boundary neither is sufficient: the segment changes passage and both passage ranges
shift. `moveSegmentTextUp` therefore grows from a one-column write into a multi-table one, and
`moveSegmentTextDown`'s tree walk must span two passages instead of one. Budget for them
accordingly — the apparent cheapness of the pair is what misleads, and it is only half true even
today.

### Adjacency: which boundaries are eligible

**Decided: cross-part operations require the boundary to be canonically contiguous.** Passages
from different books, or from non-adjacent parts of a book, are never joined. The predicate is
not "is this part _n−1_" but "does part _n−1_ end at the word immediately preceding part _n_'s
first word" — a pure function of `startingWordId` ordering, which the schema already provides
canonically. Overlap is a third case, not covered by either — see Q40.

| Boundary                                       | Cross-part ops             |
| ---------------------------------------------- | -------------------------- |
| Part 3 ends Rom 3:31, part 4 begins Rom 4:1    | ✅ Contiguous              |
| Part 3 ends Rom 3:31, part 4 begins Rom 5:1    | ❌ Gap — chapter 4 omitted |
| Part 3 ends Eph 6:24, part 4 begins Phil 1:1   | ❌ Different books         |
| Part 3 is Rom 1–3, part 4 is Rom 3–5 (overlap) | ❓ Undecided — see Q40     |

**A dead boundary must be disabled with a stated reason,** not silently inert. "Parts 3 and 4
aren't adjacent in Scripture" is a satisfying explanation; a greyed-out button with no tooltip is
how this gets filed as a bug. The existing guards already disable these commands at the first
item of a passage, so the mechanism exists — it needs a reason string attached.

⚠️ **This makes Q7 and Q8 load-bearing.** Both recommend permissiveness — non-contiguous series
allowed with a warning, multi-book series allowed — so that a "Prison Epistles" series is not
blocked. That is still the right call, but it is no longer free: **every gap and every book
change manufactures a boundary where five commands are permanently unavailable.** The
recommendations stand; the cost is now recorded rather than discovered later.

⚠️ **A series may have _no_ eligible boundary anywhere.** The extreme case is not hypothetical:
a Prison Epistles series created part-per-passage (§5) has four parts and **four seams, none of
them canonically contiguous** — Eph→Phil, Phil→Col, Col→Philemon. All five commands are therefore
inert at every boundary in that series, permanently and by design, not pending some later phase.

That is correct behaviour, but it will be reported as broken unless the reason is stated at every
seam. "Ephesians and Philippians aren't adjacent in Scripture" explains it; a uniformly greyed
toolbar does not. Note also that phase 1's "not available across parts yet" copy is the **wrong**
reason string here — "yet" promises a fix that will never come for this series — so the disabled
state needs to distinguish _not-implemented_ from _never-applicable_.

### What a boundary move must do

1. Verify the boundary is eligible (contiguity, per above).
2. Adjust both parts' passage ranges.
3. Move the affected `passage_column` / `passage_section` / `passage_segment` rows.
4. Handle connections that now cross a part boundary — below.
5. Re-fetch or re-slice `passage.cachedText` for both parts.
6. **Re-validate display compliance for both parts** — see §10.1. Easy to omit, and the
   omission is the fifth instance of `COMPLIANCE.md`'s recurring error. See §12, "validated
   against the resulting page."
7. Re-check whether the receiving part still fits one passage
   (`checkSinglePassageSupport`) — see §10.1.
8. **Leave `seriesOrder` alone.** An earlier version of this step said "re-normalise
   `seriesOrder`", which would silently undo a user's deliberate arrangement (§4). A boundary move
   changes where a part _ends_, never where it sits in the sequence. What may change is **run
   membership** — a move cannot create or close a gap, but recomputing runs is cheap and derived,
   so there is nothing to maintain.

### ⚠️ The unsolved problem: cross-part connections

`segmentConnection` has a `studyId` and two endpoints. If those endpoints end up in **different
parts** it is currently unrepresentable — and this will happen constantly, because a connection
drawn across a chapter boundary is exactly what a user later splits.

⚠️ **"References two segments" was too narrow, and the difference enlarges the migration.**
`schema.ts:317-341` carries `fromType` / `toType` (`'segment' | 'section' | 'column'`, independent
of each other — the schema comment says "so cross-type connections are possible") and **six**
nullable endpoint FKs: `fromSegmentId`, `toSegmentId`, `fromSectionId`, `toSectionId`,
`fromColumnId`, `toColumnId`, each `onDelete: 'cascade'`. `countTouchingConnections()` branches on
all three types (`passageJoin.js:213-217`), as does
`reanchorConnectionsOnto(tx, studyId, orphanSegIds, orphanSectionIds, orphanColumnIds, target, connChoice)`
(`passageFold.js:166`). Two consequences for Q42: ownership must be answered for **column- and
section-anchored** connections too, not only segments; and "the part holding the `from` endpoint"
must say **which of three `from*` columns** is consulted. A cross-_column_ connection at a part
boundary is exactly the case §3's "genuine overlap" paragraph anticipates.

This is the biggest design risk in the feature, and the decision that all five structural
commands work across a boundary **escalates it from a design ambition to a hard blocker.**
`studyId` does not merely become insufficient — it becomes **wrong**:

- `countTouchingConnections()` queries `where(eq(segmentConnection.studyId, studyId))`. Move a
  segment into an adjacent part and connections touching it are in a different study, so the
  query **silently returns fewer rows than it should.** No error; `analyzeJoin()` simply reports
  that no connections are affected, and the confirm modal tells the user so.
- `reanchorConnectionsOnto(tx, studyId, …)` is then called with a `studyId` that no longer
  matches its endpoints.
- `analyzeJoin()`'s Merge/Delete decision is derived from that count, so a wrong count produces
  a wrong prompt — the failure surfaces to the user as a confident, incorrect statement rather
  than as a fault.

**Consequence for phasing:** adding `segmentConnection.seriesId` in the phase-1 migration is no
longer speculative. Any phase that ships cross-part moves needs it, and a silent wrong-answer bug
is a bad thing to discover after the migration has shipped.

Four strategies:

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

**Q23. Which strategy, and for which phase?** Note that (a) is now less safe than it looks: with
five commands reaching the boundary, "block" means five commands dead wherever a connection
happens to cross — and connections cluster at chapter boundaries, which is exactly where part
boundaries fall.

**Q24 — closed. Granularity is settled by the existing command set: all five commands, both
directions.** This question previously read "verse, segment, section, column, or all four?" and
recommended section and column first, segment in phase 2, and **skipping raw verse/word moves as
"too fiddly for the value."** That recommendation is withdrawn: Move Text Up/Down _is_ the
raw-word move, and it is a shipped command with a menu item and a toolbar button, not a
nice-to-have we can defer. The error was treating an existing command set as a design space.
Granularity is not ours to choose; scope generalisation and phasing are (see §11).

**Q25. Should boundary moves be undoable?** _Rec: yes — and this may force a general undo
mechanism, worth scoping before committing._ Now firmer than when first written: five commands
reaching across a boundary, three of which fold content destructively, is a lot of surface with
no `⌘Z`.

**Q40. What do the five commands do at an _overlapping_ boundary?** Not answered, and not
guessable. Q7 says overlap is normal — a pericope straddling a chapter boundary means part 3 is
Rom 1–3 and part 4 is Rom 3–5, with Romans 3 in both. "Join backwards across the boundary" then
has no single meaning: the previous item in canonical order may be in either part, and a move
could silently duplicate structure or orphan it. Overlap is neither contiguity nor a gap but a
third case. _Options: treat overlapping boundaries as ineligible (simplest, consistent with the
adjacency rule, but disables the commands in a case Q7 calls normal); resolve against canonical
order and accept that the receiving part is ambiguous; or forbid overlap outright and revisit
Q7. **Needs a decision before phase 2.**_

### Split Part / Join Parts

- **Split Part** — divide at the selected boundary, renumber the rest. Validate each result
  with `checkSinglePassageSupport(range, translationId)`, which reports whether the translation
  can serve that range as one passage and why not (`'exceeds-request'` / `'complete-book'`).
- **Join Parts** — merge with the next or previous part, validating the _combined_ range.

The original spec said a merged part must not exceed 500 verses. That was never the rule, and
is not even per-passage any more:

| Translation | Merged part over 500 verses                                        |
| ----------- | ------------------------------------------------------------------ |
| **NET**     | Fine, unconditionally. One passage, several requests.              |
| **ESV**     | Needs several passages, each ≤500 verses and none a complete book. |

**Q26. What should Join Parts do when the merged range exceeds one passage?** _Rec: ask
`checkSinglePassageSupport` and branch. For NET, merge silently — there is nothing to warn
about. For ESV, say how many passages the merged part will need and let the user confirm,
rather than blocking or silently restructuring._
**Q27. Join Parts with previous, next, or arbitrary?** _Rec: next and previous; not arbitrary._
**Q28. What happens to titles/subtitles/commentary on Join Parts?** _Rec: keep the first part's
title, concatenate commentary under sub-headings, warn before discarding anything._

---

## 9. Icons

⚠️ **`src/lib/data/icons.json` is the source of truth, not `public/*.svg`.** `Icon.svelte`
renders from a registry of **140 entries** (an **array** of `{ _id, viewBox, d }` objects — not a
keyed map; see the note below), each a single `d` path plus a `viewBox`; the **145 files** in
`public/` are **not** what gets rendered and the two sets do not match. An earlier version of this
section listed icons by reading the directory, which is how it came to recommend one that cannot
be rendered. See trap 13 — the mismatch is a **latent** source of silent bugs; the last two shipped
instances are now fixed, so there are none live today.


⚠️ **Counts corrected twice, and the live-bug count is now zero.** This read "136 entries", "142
files" and "**three**" live bugs; then 140/145 and two. Phase 1 registered `books`, `part-split`,
`part-join` and `warning` (fixing `StudyGroup.svelte:94`), and the last two — `split` and `join` at
`src/lib/utils/toolbarConfig.js:402`/`:407` — were fixed by **repointing them at the existing
`segment-split` / `segment-join`**, not by adding entries. So the registry is still 140 entries and
**no referenced-but-unregistered id is live today** (trap 13). Re-count before quoting these
figures; they have moved twice in two passes.


⚠️ **`icons.json` is an array, not an object — checking membership with `in` silently lies.**
While verifying this section I probed the registry with `'warning' in icons`, which tests *array
indices*, so it reported every real id absent and every integer 0–139 present. The reading was
confidently wrong in both directions and would have "confirmed" that `books` still needed
creating. Look up by `_id` (`icons.some(e => e._id === id)`), and treat any icon audit that did
not go through `_id` as unperformed.


**Reusable today** — all verified present in `icons.json`:

| Need               | Icon                             | Note                                          |
| ------------------ | -------------------------------- | --------------------------------------------- |
| Expand/collapse    | `chevron-right` / `chevron-down` | Exactly what `StudyGroup.svelte` uses         |
| Prev/next part     | `caret-left` / `caret-right`     | Q30                                           |
| A single study     | **`book`**                       | Already the Finder's study icon (`StudyItem`) |
| A group            | `folder` / `folders`             | The precedent for `book`/`books` below        |
| Move Text Up/Down  | `arrow-up` / `arrow-down`        | §8's five commands need **no** new icons      |
| Delete series/part | `trashcan`                       | §4                                            |
| Series/part export | `export`                         | Q32                                           |
| Reorder runs       | `draggable`                      | §11 phase 3                                   |
| Compliance warning | `warning`                        | ⚠️ Was "**unregistered**"; registered in phase 1 |


⚠️ **`book-open` does not exist and was the previous recommendation.** This section used to list
it as reusable and then propose it for standalone studies — the section's main visual decision,
resting on an icon absent from the registry. `public/book-open.svg` exists, which is what made it
look available. Two consequences worth keeping:

- **`Icon.svelte` falls back to an empty path, so it would have rendered nothing and thrown
  nothing.** A blank space in the Finder. ⚠️ Earlier wording added "no console error" — wrong:
  `Icon.svelte`'s `getIcon()` does `console.warn(\`Icon not found: ${iconId}\`)` before returning
  `{ viewBox: '0 0 16 16', d: '' }`. So the failure is silent **on screen** but not in the console.
  Still a bug worth avoiding, and the fallback viewBox differs from the 32×32 norm, which would
  also mis-size a real icon; but anyone debugging a blank icon should check the console first.
- **It was churn disguised as reuse.** `StudyItem.svelte` already renders `book` at three call
  sites. "Use `book-open` for a standalone study" meant adding a missing icon _and_ restyling an
  existing element this feature has no reason to touch. **Withdrawn** — a standalone study keeps
  `book`.

**Three new icons, and that is the whole cost.** ⚠️ **All three are now registered** (phase 1),
along with `warning`. The table stays as the design record for what they depict and why the ids
read as they do.


| New id       | Purpose                | Design                                                                                |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| `books`      | A series in the Finder | Two or three stacked/spined books. Mirrors `folder` → `folders` exactly (see below)   |
| `part-split` | Split Part             | Two books separating, gap between them — the **book** metaphor, not the page metaphor |
| `part-join`  | Join Parts             | Two books converging into contact — mirror of the above                               |

**Naming follows the established object-then-verb rule**, which the whole registry obeys:
`column-split`/`column-join`, `section-split`/`section-join`, `segment-split`/`segment-join`. So
the ids are **`part-split` / `part-join`**.

⚠️ **These were previously `study-split` / `study-join`, which contradicts §3.** §3 settled the
commands as **Split Part** and **Join Parts** — "Part" and not "Study" — so the icon ids must say
`part`. §9 predates §3 closing and kept the old noun. Corrected here.

**Why `books` — the real argument.** Not "several, in order" (the old justification, which is just
a description). It is that **`folder` and `folders` already exist as a singular/plural pair
expressing exactly this**, and `folders` is already used for "a group among groups" in
`MenuActions.svelte`. `book` → `books` reuses a convention the registry has already established
rather than inventing one. The Finder then reads: `book` = one study, `books` = a series,
`folder` = a container.

**Why the book metaphor and not a divided page.** The old spec was "a page divided by a vertical
dashed rule … echoes `column-split` at study scale." Two objections:

1. **The format resists it.** Every icon is a _single fill-only `d` path in a 32×32 viewBox_ —
   there are no strokes, so a dashed rule means hand-placing filled rectangles, and at menu size
   they will merge.
2. **It would be the fourth confusable page-geometry icon.** `column-split`, `section-split` and
   `segment-split` are already three variations on "a rectangle divided." A fourth reads as
   another page-level command, which is the opposite of what §3's qualified-verb rule is for.

Since the geometry cannot carry the level distinction, **the metaphor must**: books for
study-level operations, rectangles for page-level ones. This also ties `part-split`/`part-join`
visually to `books`.

**Q29 — answered: `books`, on the `folder`/`folders` precedent.** Not a folder variant; a folder is
an arbitrary container, and §4 rejected modelling a series as one.
**Q30. Carets or arrows?** _Rec: carets — they read as "step through a sequence" where arrows read
as "move a thing", and `arrow-up`/`arrow-down` are already Move Text Up/Down, so reusing them for
navigation would collide with a command._
**Q31 — answered: no `series-part` icon.** Numbering is text ("Part 3 of 16"), and at 150 parts
(Q10) a badge would need three digits inside 32px.

---

## 10. Export & compliance interaction

Two limits touch this feature, at two points: **display**, per part at creation; and
**distribution**, aggregated at export. Neither shapes the data model.

- **Per part, at creation.** Each part is its own page, so `validateStudyDisplayLimits()`
  applies to each independently. A 16-part Romans series has no single page over half of
  Romans, so the per-study check stays silent — correctly, on the reading that a series is not
  a page. **That silence is not evidence of compliance**, and the finer the parting the less it
  means; see Q33 and §12.
- **Whole series, at export.** A whole-book series trips ESV's `allowCompleteBook: false`, and
  a long one trips `distribution.maxVerses`. Both are `'warn'` today.

  ⚠️ **The figure is deliberately not repeated here, and the value in `translations.json` is
  known-wrong.** This bullet used to say "trips `maxVerses: 1000`". 1000 _is_ the current value,
  but `COMPLIANCE.md` §0 and §5 item 3 both record it as pending correction: 1000 is the **print**
  copyright-page permission, while the API terms say **500** for text obtained via the API, which
  is our case. It is unchanged in the data only because `validateExportLimits()` has no caller.
  Restating it here is precisely the drift §2 warns about — the copy in the design document going
  stale — so read it from `COMPLIANCE.md` §5 instead. Knock-on: at 500 the case for Q32's
  `'block'` strengthens, and §5's series-level preview line reports a different threshold.
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

**Q33 — answered: report the aggregate at creation, informationally; bind it at export.**

A series is not a page, so the per-part display check is the right _check_ and the aggregate is
not a display breach. But the aggregate must still be **shown**, and shown early, because of an
asymmetry that is easy to miss:

> A user selects the whole of John (879 verses, ESV) and chooses **21 parts, one chapter each**.
> Every part is a single chapter, so every per-part check passes and **not one warning fires
> anywhere**. The series nonetheless covers the complete book of John, which ESV's display clause
> caps at 439 verses.

**The finer the parting, the more thoroughly per-part validation goes quiet.** So splitting into a
series is the most effective way to make the compliance warnings disappear without changing what
the user ends up looking at across the series. That is `COMPLIANCE.md` §1.6 — several legal
queries assembling an illegal page — one level up, and it is why the aggregate cannot simply be
left to export.

Hence the split resolved in §5: **informational at creation** (live in the preview, where the
stepper can still be changed cheaply) and **binding at export** (Q32, `'block'` for whole-series
export). Not a blocker at creation, because per-part display genuinely is compliant, `enforcement`
is `'warn'` everywhere today, and refusing to create the series would remove the user's choice
that §5 exists to protect.

**Q36. Accept the ESV whole-book cap, or seek a broader Crossway licence?** _Rec: accept it,
surface it honestly, and open a licence conversation before any public launch._

**Q37. Keep the self-imposed NET 500-verse request cap?** _Rec: yes._ A single 2,461-verse
fetch is slow, caches a huge blob, and lands ~55,000 spans in the DOM — squarely where §11.1
lives. Keep the guardrail; just describe it accurately.

### 10.1 Boundary moves and compliance

The five cross-part commands (§8) interact with the licence limits, and the two axes behave
oppositely. Getting this wrong is easy and the failure is silent, so it is spelled out.

**Distribution/export: provably unaffected.** A boundary move is **verse-conservative** — the
series' total verse coverage does not change, verses only relocate between parts. Same books,
same totals, and `validateExportLimits()`'s verse-identity `Set` is indifferent to which part a
verse sits in. **No boundary move can ever change the export position.** Stated positively
because the instinct will be to re-run every check after every mutation; this one genuinely does
not need it.

**Display: not conservative, and must be re-checked.** The receiving part grows, and the display
cap is per page. A worked case:

> A 2-part Romans series split at **Rom 8:25**. Part 1 is Rom 1:1–8:25: **211 verses**, under
> half of Romans (216.5), so it is compliant and silent. Part 2 begins Rom 8:26. A few
> **Move Text Up** gestures, or one **Join Segment**, pull six verses backwards — part 1 reaches
> **217** and now breaches the half-book display limit.

Nothing about the series changed. One ordinary gesture moved a compliant part over the line. So:

⚠️ **The previous worked example was arithmetically wrong and is corrected above.** It read: "Part
1 is Rom 1–8: **216 verses, exactly half of Romans, compliant** (`COMPLIANCE.md` §1.7 lists this
case)." Three faults, worth keeping because each is easy to repeat:

- **Rom 1–8 is 225 verses, not 216.** Verified against `bible.json`: Rom 1–7 = 186, chapter 8 = 39.
- **225 exceeds half of Romans (216.5), so that part was already in breach** before any boundary
  move. The example demonstrated the opposite of what it was chosen to demonstrate.
- **The citation was false.** `COMPLIANCE.md` §1.7's table lists "Romans whole (433) → at most
  **216** — half"; it does not list Rom 1–8 as compliant. 216 is really the verse count Crossway's
  server _returns_ when asked for all of Romans — `canonical: "Romans 1–8:30"`, i.e. Rom 1–7 plus
  30 verses of chapter 8 (§1 probe table). A truncation artifact was mistaken for a range boundary.

⚠️ **And the sharper point the old example obscured: Romans has no compliant two-way split at all.**
433/2 = 216.5, so of any two parts one must hold ≥217 verses. A 2-part Romans series is
**non-compliant on creation**, with no gesture involved — which is §5's preview requirement, not
§10.1's re-validation requirement. Demonstrating "a compliant part tipped over by one gesture"
needs a partial-chapter boundary, as above. Do not reach for chapter-aligned Romans halves again.


- **Re-run `validateStudyDisplayLimits(passages, translationId)` on _both_ parts.** The receiver
  for a new breach; the donor because its existing warning may now **clear**, and a stale warning
  left on screen is its own bug.
- **Which part is the receiver depends on the command.** All three Joins fold _backwards_, so
  they grow part _n−1_. `moveSegmentTextUp` grows the previous item; `moveSegmentTextDown` the
  next. Five commands, both directions — do not assume the receiver is always the earlier part.
- **Resolve `min(500, half the book)` once** and report the binding number, per `COMPLIANCE.md`
  §1.7. This must not become the fifth instance of that error.
- **The receiving part may outgrow one passage.** If its range crosses 500 verses or becomes a
  complete book, `checkSinglePassageSupport` reports it can no longer be served as one passage —
  the same branch Q26 handles for Join Parts, now reachable from a boundary move.
- **`cachedText` is rewritten for both parts**, so this path is another writer to the unbounded
  cache in `COMPLIANCE.md` §5 item 1 (the one genuine licence violation). Whatever bounding
  remedy lands there must cover boundary moves.

**Q41. What should a boundary move do once `enforcement` is `'block'`?** Undecided, and it needs
deciding before release rather than at it. Today everything is `'warn'`, so this is latent. When
it flips, a boundary move becomes **refusable** — and unlike study creation, where the user is
filling in a form and can back out, this is direct manipulation of the page. `COMPLIANCE.md` §1.6
chose warn-over-block partly to avoid "stranding work already done at the worst possible moment";
a boundary move is exactly that case, and a thrown error is not a design. _Rec: treat the block as
a pre-move confirmation that can be declined, never a mid-gesture failure._

---

## 11. Phasing

**Phase 1 — structure and navigation, no boundary editing**

- `study_series` table; `study.seriesId` / `seriesOrder`; `segmentConnection.seriesId` as a
  **nullable, additive** column — but **not** the `studyId` nullability change, which belongs to
  the phase that ships cross-part moves (§4, and the header note). Phase 1 cannot produce a
  cross-part connection, so it cannot produce a wrong `studyId`. ✅ Shipped as `0046`; Q42 settled
  the semantics before it was written, as this line required
- ✅ **Q18 decided, and the column shipped in `0046`:** `studySeries.lastPartId`, nullable,
  `onDelete: 'set null'`. This read "Decide Q18 before writing this migration. If the series title
  is to open the last-viewed part, that needs a column of its own; `user.lastStudyView` cannot
  carry it (§6)" — the decision was made (resume the last-viewed part) and the column written, so
  the gate is discharged. Why it needed a column of its own is still worth knowing:
  `user.lastStudyView` holds a **view mode**, not a part identity (§6)
- Series delete (cascade) and part delete (warn, split the run, dissolve at one part) — §4
- The derived **run** helper: one function, used by reorder legality, the delete warning and
  boundary-move eligibility (§4)
- ✅ Create-as-series in the New Study flow: chapters-per-part stepper with preview for contiguous
  single-book ranges, part-per-passage for multi-passage studies (§5). Both entry points share
  `planSeriesParts()` and `POST /api/series`, so the New Study form and "Split into a series…"
  cannot produce differently-shaped parts from the same input
- Finder series row: chevron, collapse state, expand-on-deep-link
- Header prev/next and "Part N of M" jump dropdown
- ✅ The `books` icon — **as an `icons.json` entry, not a `public/` file** (§9, trap 13). ⚠️ This
  continued "Register `warning` at the same time; §5's preview needs it and **it is missing
  today**" — no longer true. `books`, `part-split`, `part-join` and `warning` are all registered.
  `split` / `join` were **not** this feature's to fix and were fixed anyway, because the remedy was
  two strings: the passage toolbar now points at the existing `segment-split` / `segment-join`
  rather than at ids that never existed (trap 13)


- _Excluded deliberately: Split Part, Join Parts, boundary moves._

⚠️ **"Independently useful" needs qualifying, and Q34 needs re-reading in that light.** The
original claim was that phase 1 stands alone because creating and navigating a series covers the
main workflow. That is still mostly true — but with five existing commands now expected to work
across boundaries (§8), phase 1 as scoped ships a series in which **Join Column, Join Section,
Join Segment, Move Text Up and Move Text Down are all dead at every part boundary.** A user who
splits Romans into 16 parts and then tries to nudge a segment across a chapter line finds five
familiar commands inert.

Two honest options, and the choice belongs with Q34:

1. **Accept it, but disable visibly.** Each command is greyed with a reason so the limitation is
   legible rather than a mystery. Cheapest, and keeps phase 1 small. **Two reason strings are
   needed, not one:** "not available across parts yet" for a contiguous boundary awaiting phase 2,
   and "these parts aren't adjacent in Scripture" for a boundary that will _never_ be eligible
   (§8). A single "yet" message promises a Prison Epistles user a fix that is never coming.
2. **Move the scope generalisation into phase 1.** More work up front; no dead commands at any
   point. Also front-loads the `segmentConnection` question (Q23), which phase 1 must touch
   anyway for the migration.

_Rec: (1), on the grounds that a legible limitation is survivable and phase 1's value is real
without it — but do not ship it silently, and do not describe phase 1 as complete._

✅ **Option (1) is implemented.** `+layout.server.js` resolves `boundaryBefore` / `boundaryAfter`
for the current part via `getBoundaryDisabledReason`, and `MenuStructure` renders the reason under
whichever of the five commands the edge is actually blocking. Three things worth knowing, because
each was a wrong turn first:

- **The reason is visible text, not a `title` tooltip.** These buttons use the native `disabled`
  attribute and browsers suppress hover events on disabled controls, so a tooltip would have been
  a reason nobody could read — silent shipping by another route.
- **The note is `role="none"` and the reason is ALSO in the item's `aria-label`.** A `role="menu"`
  container may only own menuitems, so a bare paragraph had to be removed from the a11y tree —
  which would have left the explanation sighted-only without the label.
- **Multi-passage parts work too, via `activePassageIndex`.** The store's `is…FirstInPassage`
  flags are per-passage, so on their own they also fire at every *internal* passage seam of a
  multi-passage part (§5's part-per-passage strategy) — and claiming "not available across parts
  yet" at an internal seam would be false. The analyze page therefore publishes which passage the
  selection sits in, and a part's true edges are passage `0`'s start and the last passage's end.
  ⚠️ The index is guarded as a *resolved* value: `null` (no selection, or content still streaming)
  suppresses the note rather than guessing, because a guess there blames a part edge at an
  internal seam.


`scripts/verify-boundary-reasons.mjs` (24 checks, real `bible.json`) pins the part that matters:
the contiguous seam says "yet", the different-books seam does not, and one part's two edges can
carry different reasons.


**Phase 2 — restructuring**

- Split Part / Join Parts (+ the `part-split` / `part-join` icons — §9's names, per §3's
  vocabulary)
- **Generalise all five commands from passage scope to sequence scope** — Join Column, Join
  Section, Join Segment, Move Text Up, Move Text Down — gated on the contiguity predicate (§8)
- Boundary-move compliance re-validation for both parts (§10.1)
- Cross-part connections: warn-and-delete
- Adjacent-part prefetch; "balance by length"
- _Blocked on Q40 (overlapping boundaries) and Q23 (connections)._

**Phase 3 — polish**

- Cross-part connections preserved with edge stubs
- Drag standalone studies into a series
- **Reorder runs** (not parts — §4's run rule). Note this is only meaningful for a series with 2+
  runs: a contiguous Romans series has exactly one run and nothing to reorder, so the UI must not
  offer a drag handle that can never do anything
- Export whole series with the series-wide compliance check

**Q34 — answered: yes, and the condition is met.** The recommendation was "yes, but only if the
unavailable commands are visibly disabled with a reason"; both reason strings are now wired
through (see the ✅ note above), so the conditional is discharged rather than outstanding.

⚠️ **This carried a caveat — "the reason appears only on single-passage parts" — and the caveat is
now lifted.** It was real: the store's `is…FirstInPassage` flags cannot on their own tell an
internal passage seam from a part boundary, which left a part-per-passage Prison Epistles series
(the very case §8 says will be reported as broken) silent. The fix did not need phase 2's scope
generalisation, only *passage identity*: the analyze page publishes `activePassageIndex`, and a
part's true edges are passage `0`'s start and the last passage's end. Recorded because the caveat
deferred to phase 2 a fix that turned out to be one derived value away — "phase 2 owns it" is worth
distrusting when the blocker is information the page already has.


**Q35. Scope undo before phase 2?** Boundary moves are destructive and users will expect `⌘Z`.
_Rec: decide before starting phase 2._

### 11.1 Known issue: Safari scroll choppiness at 400+ verses

Reproducible: choppy in Safari, fine in Chrome, at ~400+ verses (Revelation, Romans).
**Every item below is an unmeasured hypothesis.** An earlier confident diagnosis here was
wrong, so measure before changing anything.

1. The `transform: scale()` layer on `.analyze-content-inner` — Safari re-rasterizes large
   scaled layers on scroll. Test at 100% zoom vs 90% to isolate.
2. Absent CSS containment. Try `contain: layout style paint` on `.segment`. (An earlier version
   said "across ~24,000 nodes"; the figure is unanchored and does not match this section's own
   ~400-verse onset — at the ~22 spans per verse implied below, 400 verses is ≈8,800 spans and
   24,000 corresponds to ~1,100 verses. Measure rather than reason from it.)
3. `will-change: scroll-position` — try removing it.

⚠️ **`ConnectionsOverlay.svelte` does not corroborate this, and citing it as precedent is
misleading.** The previous sentence read "`ConnectionsOverlay.svelte` already records Safari
falling behind on repaint, so this is a recurring weakness rather than a new one." The comment it
refers to describes a **self-inflicted, already-fixed** problem: recomputing every segment's
bounding box on every scroll frame was a main-thread stall that "made Safari fall behind repainting
newly-revealed text", and the fix was to stop recomputing on scroll. That is JS work we caused and
removed, not a Safari rasterization weakness — evidence that scroll-frame main-thread work hurts,
and none at all for suspects 1–3. Treating it as "a recurring weakness" licenses skipping
measurement, which is what this section opens by warning against.

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

⚠️ **That last rationale is pinned to a number under active correction.** `COMPLIANCE.md` §5 item 3
records the binding ESV distribution figure as **500**, not 1,000 (see §10). If that correction
lands, the value worth avoiding becomes 500 — uncomfortably close to the 600 notice threshold —
while 1,200 collides with nothing. **Change nothing yet:** the thresholds are defensible on their
own terms and the reasoning reflects `studyLimits.js` as it stands. Recorded so the two do not
drift apart silently.

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
6. **Two premises in this document's history were false and cost real work:** that a study over
   500 verses must be broken into several studies (relitigated three times — no chapter exceeds
   500 verses; §14 now records the reframing that answers it, so a fourth round should start
   there), and that short books return whole because of a _verse_ floor (there is no floor; the
   exception is structural, single- and double-chapter books). A planned bisecting probe for the
   second would have found no boundary and produced a confident wrong number.

   Note the wording: "broken into several studies", not "split". Per §3, a bare "split" at the
   study level is now the **Split Part** command, so the old phrasing would read as a reference
   to a feature rather than to a false premise. Trap 5 above keeps the bare verb correctly — it
   is about splitting into _passages_, a different level.

   Related but distinct: trap 8 below is about **fine** parting silencing validation. This trap is
   about parting being **necessary** in the first place. Both are wrong; they are wrong differently.

7. **A boundary move must be validated against the resulting _page_, not against the content
   moved.** The tempting check is on the move itself — a column, a few verses, trivially under
   any limit — and it is the wrong check every time. The display clause caps what is on a page,
   so what matters is the receiving part's new total. `COMPLIANCE.md` records this same error at
   §0, §1.5, §1.6 and §1.7, each time as measuring at the operation boundary when the rule is
   written about the page; §1.7 calls its instance "the fourth." **This would be the fifth**, and
   it is pre-recorded here because the code does not exist yet — the one chance to head it off
   before it ships. See §10.1 for what to run instead.

8. **Parting a book finely makes per-part compliance validation go quiet while the series still
   covers the whole book.** Every check is per part, so 21 one-chapter parts of John each pass
   and nothing warns — yet the series covers all 879 verses of a book ESV caps at 439 on a page.
   The temptation is to read "no warnings" as "compliant"; what it actually means is that the
   only check being run is the one that cannot see the problem. **A series is where compliance
   warnings go to disappear**, and the finer the parting the quieter it gets. This is
   `COMPLIANCE.md` §1.6 one level up: legal pieces assembling an illegal whole. See Q33 and §5's
   preview requirement.

9. **Five existing commands are scoped to the passage, and that is not obvious from their
   names.** Join Column, Join Section, Join Segment, Move Text Up and Move Text Down all read
   like study-level operations. They are not: each resolves a single `passageId` and walks one
   tree, and the Join guards say `'in a passage'` in their error strings. So they are already
   inert at a multi-passage boundary **today**, with no series involved. Anyone who assumes
   "cross-part is the new case" will miss that the cross-_passage_ case is also unhandled. See
   §8.

10. **A too-eager prompt and a restricted capability are different problems with different
    fixes.** An earlier pass here read "offering a series on a 2-chapter range is noise" and
    proposed raising the eligibility threshold — which would have made a Haggai or Habakkuk
    series impossible rather than merely unprompted. Eligibility (2+ chapters, fixed) and
    solicitation (when the app volunteers the question, tunable) are separate knobs. When a
    prompt feels wrong, check which one you are actually reaching for. See §5.

11. **`seriesOrder` must not be re-derived after a mutation.** Two places in this document once
    said to re-normalise it from canonical order — §4's ordering recommendation and §8's
    boundary-move step 8 — and both would **silently discard a user's deliberate arrangement**.
    Canonical order _seeds_ `seriesOrder` at creation and never touches it again; the run rule
    (§4) is what keeps it legal thereafter. The instinct to "just recompute it" is strong because
    canonical order is available everywhere, which is exactly why this is recorded.

12. **Runs are derived, not stored — and must stay that way.** Part delete, Split Part, Join Parts
    and boundary moves all change run membership, so a stored `runId` would be four separate
    opportunities to go stale. Fold §8's adjacency predicate over the parts in canonical order
    instead. If you find yourself adding a `run` table, re-read this.

13. **An SVG in `public/` is not an available icon, and asking for a missing one fails silently.**
    `Icon.svelte` renders from `src/lib/data/icons.json` (140 entries) and falls back to an empty

    path for missing icons, so a wrong `iconId` yields blank space **on screen** — though it does
    `console.warn('Icon not found: …')`, so the failure is visible in the console. (This trap
    previously said "no console error", which was wrong; see §9.) `public/` holds 145 files and the
    sets do not match: **11 files are unregistered** (including `book-open`, `text-append`,
    `text-prepend`, `segment-title`) and **6 registered ids have no file** — the latter are all
    typos: `minus-circle` vs the file `minu-circle`, and `note-positon`/`note-offset` vs the files
    `note-position`/`note-offest`. §9 recommended `book-open` purely because the file existed.

    ⚠️ **Counts corrected: "136 entries", "142 files", "12 unregistered" and "**three** live ids"
    were all true when written and none are now.** Phase 1 registered `books`, `part-split`,
    `part-join` and `warning`; `warning` is no longer in either list. Re-count before quoting.

    ✅ **The last two live ids are fixed, and the fix was not to add them.** `split` and `join` were
    referenced by the passage toolbar's Split Segment / Join Segment buttons
    (`src/lib/utils/toolbarConfig.js:402`, `:407`) and absent from the registry, so **both buttons
    rendered blank space** — `Icon.svelte`'s empty-`d` fallback, a console warning, no throw. They
    now point at **`segment-split` / `segment-join`**, which already existed and which
    `MenuStructure.svelte:286`/`:298` already used *for the same two commands*. So the menu drew an
    icon and the toolbar drew nothing, from one registry, for one pair of commands.

    ⚠️ **Registering `split` and `join` was the obvious fix and would have been the wrong one.** It
    would have added two bare, unqualified verbs to a registry that is uniformly object-then-verb,
    at the exact level where §3's collision rule applies — beside `column-split` and `section-split`
    in the same toolbar. The missing icon was a symptom; the wrong *name* was the defect. Repointing
    cost two string edits and no new artwork.

    ⚠️ **This trap also cited the wrong path** — `toolbarConfig.js` is in `src/lib/utils/`, not
    `src/lib/config/`, so a grep in the plausible directory finds nothing and the claim looks
    already-fixed. Fitting, in a trap about not trusting a listing: the file reference was itself an
    unverified handle.

    ⚠️ The third live id was `warning` (`StudyGroup.svelte:94`, the deep-nesting indicator),
    registered in phase 1. **No registered-id-with-no-file or referenced-id-with-no-entry bug is
    known live today** — but verify against `icons.json` by `_id` before specifying any icon; do not
    trust a directory listing, and do not trust that an existing call site works.


    ⚠️ **And do not trust an audit that checked membership the wrong way.** `icons.json` is an
    **array** of `{ _id, ... }` objects, so `'warning' in icons` tests array indices and returns
    nonsense — it reported every real id absent and `0`–`139` present. Match on `_id`. See §9.


    ⚠️ **This trap previously said "six ids", adding `menu`, `back` and `forward`. Those three are
    not live and the count is corrected.** All three appear only inside the JSDoc usage-example
    block at the top of `Toolbar.svelte` — lines 30, 39 and 40, every one a ` * ` comment line
    inside `/** … */`. Nothing renders them. They remain worth fixing as **documentation** that
    would mislead anyone copying the examples, but that is a smaller problem than a broken render,
    and inflating the count invites adding three icons for call sites that do not exist. Recorded
    because this trap is about not trusting a listing, and the six-id claim came from grepping
    without checking whether the matches were code.

14. **A document's _filename_ is a cross-reference too, and citing by name does not make a
    reference stable.** Two files cite this document, and both carried a parenthetical noting
    they cited it by **name** rather than by section number precisely because the numbering had
    gone stale once. Then the filename went stale — so the anti-staleness measure went stale in
    the very axis it was chosen to avoid. The lesson is not "cite by number instead"; it is that
    every handle moves eventually, so **the remedy is grep-ability, not a perfect handle**: keep
    the old name in the renamed file so a search for it still lands, and expect to update
    citations rather than hoping to have chosen a name that never needs it. Both citations now
    record what this document was formerly called, for that reason.

15. **Contiguity is a property of the _parting algorithm_, not of series.** "Chapters per part"
    needs contiguous single-book text because `splitRangeIntoPassages()` takes a scalar `book` and
    counts chapters upward. It is tempting to promote that into a rule about which studies may
    become series — and it would forbid the Prison Epistles case, which needs no algorithm at all
    because the user has already drawn the seams. **The second time in this document that a
    mechanical limitation nearly became a capability restriction** (trap 10 was the first). When
    something cannot be divided, ask whether the _strategy_ or the _feature_ is the thing that
    does not apply. See §5.

16. **`drizzle-kit generate` is not safe to run in this repo, and its prompt is not a question you
    can answer.** The `drizzle/meta` snapshots stop at `0009_snapshot.json` while migrations
    `0010`–`0045` were written by hand, so drizzle-kit diffs `schema.ts` against a snapshot ~36
    migrations stale. Running it during phase 1 asked _"Is app_settings table created or renamed
    from another table? ❯ + app_settings / ~ passage_split › app_settings"_ — it had no record of
    `app_settings` (added in `0044`) and offered to interpret it as a **rename of `passage_split`**,
    a table dropped by `0016`. Answering the wrong branch emits `ALTER TABLE … RENAME` against live
    data. It was aborted before writing anything and `0046` was hand-written instead.

    Note the shape: the tool asked a confident question about a state it could not see, and the
    only safe response was to distrust the premise.

    ⚠️ **This was first recorded as repo drift needing repair. It is not — it is a documented
    convention, and `DEPLOYMENT.md:33-40` says so explicitly:** _"Only migrations `0000`–`0009` are
    tracked in `drizzle/meta/_journal.json`. The hand-written migrations … are not journaled, so
    `drizzle-kit migrate` won't run them automatically. Apply new hand-written SQL files with
    psql."_ Confirmed in the data: `drizzle.__drizzle_migrations` in the dev database holds 7 rows,
    the newest dated 2025-10-13, while objects from `0035`, `0040`, `0042`, `0043` and `0044` are
    all present — applied by hand, exactly as documented.

    So **`0046` needs no journal entry, and the journal must not be "repaired."** Rebaselining
    means reconciling 36 hand-written migrations against a snapshot chain that stops at `0009`,
    against a live production database, to gain automation nobody needs at this cadence: all of the
    risk sits on the repair side. The correct operational rule is `psql -f`, staging first
    (`DEPLOYMENT.md:121-129`), and verification on a throwaway clone (`pg_dump --schema-only` into
    a scratch database) before touching anything real.

    Recorded because the missing journal entry *looks* exactly like an oversight, and the obvious
    "fix" is the dangerous act.

    ⚠️ **The `DEPLOYMENT.md:23` discrepancy noted here is now resolved: `0045` was applied and the
    line was stale.** This read "either it is applied and the line is not; worth checking before the
    next deploy." Checked, by read-only probe against production: `information_schema` reports
    `user.email_verified`, so `0045_fix_auth_column_case.sql` has run. In hindsight it could not
    have been otherwise — `auth.ts` wires Better Auth through `drizzleAdapter(db, { schema })` and
    `schema.ts` is snake_case throughout, so an unapplied `0045` would break **every login in
    production**, not go unnoticed in a doc line.

    The line has been replaced with a probe rather than a corrected number. A hand-maintained
    "migrated through `00NN`" watermark has no writer in the workflow, so it decays silently and
    costs someone this same investigation later — the identical failure shape as trap 17's
    authoritative-column-with-no-writer. When a fact about live state is worth recording, prefer
    recording **how to ask** over recording the answer.



17. **The §4 schema sketch is a sketch, and `0046` diverges from it deliberately.**
    §4 shows `title` on `study_series`; the shipped column is **`name`**, matching `studyGroup.name`
    so the Finder's expandable-row code treats both the same way.

    ⚠️ **This trap previously recorded a second divergence — a missing `translation` column — and
    that gap is now closed.** `0046` adds `"translation" text DEFAULT 'esv' NOT NULL`, and the
    reasoning for closing it is worth keeping, because the first argument for adding it was the
    weaker one. "It is free now and a migration later" is a convenience claim. The real argument is
    that **an authoritative column with no writer is worse than no column**: §4's invariants table
    calls this column authoritative for the same-translation rule and for Q26's ESV/NET branching,
    so if nothing wrote it, parts could silently disagree with the value that supposedly governs
    them. That objection dissolves only because **phase 1c writes it at creation** from the source
    study. Enforcement still arrives with Join Parts / Split Part in phase 2.

    The general form, which is the reason this stays in the traps list: adding a dormant column
    "so it is ready" is not obviously safe. A column that is *authoritative but unwritten* is a
    latent inconsistency, and the decision to add it early is only sound when the same phase gives
    it a writer.


---

## 13. Open questions


Highest-stakes first — the first two are hard to reverse once code exists, because both are
migration shape. Q23, Q40, Q41 and Q42 all follow from the five-command decision in §8; none of
them existed in this form before it.

1. **Q23** — cross-part connections: block / delete / preserve. Biggest technical risk. No longer
   "which strategy is nicest": with five commands crossing the boundary, `segmentConnection`'s
   `studyId` becomes actively wrong and `countTouchingConnections()` silently under-reports. It
   decides whether phase 1's migration adds `segmentConnection.seriesId`, and that migration is
   no longer speculative.
2. ⚠️ **Q42 is answered and no longer open** — this read "**Blocks the phase-1 migration**, and
   pairs with Q23 — adding `seriesId` beside a `.notNull()` `studyId` fixes nothing, so these two
   must be decided together." Migration `0046` has shipped: `studyId` stays `.notNull()`, `seriesId`
   is nullable and additive, no `CHECK` (§4). The pairing with Q23 was real, but resolves the other
   way round — cross-part rows arrive from **boundary moves**, so Q23 above now carries it whole.
   Kept in place rather than deleted because "blocks the migration" is what made it #2, and the
   migration shipping is precisely what a future reader needs to see.

3. **Q40** — what the five commands do at an **overlapping** part boundary. Newly opened by the
   adjacency decision (§8). Contiguity and gaps are settled; overlap is a third case with no
   answer, and Q7 says overlap is _normal_. Now blocks **two** features, not one: boundary-move
   eligibility and the run rule that governs reordering (§4).
4. **Q4** — `study_series` table vs. `study.seriesParentId`. ⚠️ Listed here as open, but treated as
   decided everywhere else: §4's heading is "Recommendation: a `study_series` table", both
   alternatives have explicit "**Rejected —**" subsections, and §11 phase 1 commits to the table.
   Either promote it to §14 as decided, or state what evidence would reopen it — leaving it at #4
   overstates what is actually undecided.
5. ⚠️ **Q34 is answered and no longer open** — option (1) shipped: the five commands are visibly
   disabled with **both** reason strings, resolved server-side per edge (§11). This entry also
   recorded a leftover **scoped gap** (the reason showing only on single-passage parts, so a
   part-per-passage series stayed silently inert); that gap is **closed** — `activePassageIndex`
   distinguishes a part edge from an internal passage seam, so multi-passage parts explain
   themselves too. Nothing here is waiting on phase 2.


6. **Q41** — what a boundary move does once `enforcement` flips to `'block'`. Latent today
   (everything is `'warn'`), but the answer must not be "throw mid-gesture."
7. **Q32** — export whole series (Q33 is now answered; the two are paired, so decide Q32 with
   Q33's answer in hand).
8. Q7, Q8, Q10–Q22, Q25–Q28, Q30, Q35–Q37 — inline above. (Q29 and Q31 were previously swept into
   a "Q25–Q31" range here while §9 marks both **answered**; they are now in the closed list below.
   A numeric range is a poor status list — it hid a contradiction between two sections.)

Closed: **Q1** (the reframing), **Q2/Q3** (terminology and the Split/Join collision), **Q5**
(explicit `seriesOrder`, canonically seeded, never re-derived), **Q6** (series delete cascades),
**Q9** (the user picks chapters-per-part, default 1), **Q24** (boundary-move granularity — settled
by the existing command set, not a design choice), **Q29** (`books`, on the `folder`/`folders`
precedent), **Q31** (no `series-part` icon — numbering is text), **Q33** (aggregate reported at
creation, informationally; binding at export), **Q42** (`studyId` stays `.notNull()`; `seriesId`
nullable and additive; no `CHECK` — cross-part rows arrive from boundary moves, not authoring),
**Q18** (the title resumes the last-viewed part via `studySeries.lastPartId`, `set null`, falling
back to part 1), **Q43** (a part delete cannot create a compliance breach — recorded so no check is
written for it). See §14.


---

## 14. Decisions log

Decisions with live consequences. Reasoning included so they are not relitigated.

| Question                                                  | Decision                                                                             | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where limits are enforced                                 | Request at fetch, display at create/edit, distribution at export                     | Three different boundaries; conflating them is the recurring bug in this codebase                                                                                                                                                                                                                                                                                                                                          |
| 500-verse rule as the series trigger                      | **Rejected** as primary driver                                                       | No chapter exceeds 500 verses; multi-passage already absorbs long books                                                                                                                                                                                                                                                                                                                                                    |
| What the feature _is_                                     | **A series of studies that belong together**                                         | Teaching cadence, Analyze ergonomics and Finder navigability justify it; the verse caps are guardrails on parts, not the reason it exists. Not a workaround for length, and not a route to whole-book ESV study (Q1)                                                                                                                                                                                                       |
| Series / Part as the vocabulary                           | **Adopted**                                                                          | "Series" is how teachers speak and does not collide with `Connection`, which already means "link between two things"; "Part" is neutral where "Session" presumes teaching and "Chapter" collides with Bible chapters. Label reads "Part 3 of 16" (Q2)                                                                                                                                                                      |
| Split/Join collision with columns                         | **Qualify the verb by its object at study level**                                    | `column-split.svg` / `column-join.svg` / `passageJoin.js` already own the bare verbs, so study-level commands are "Split Part" / "Join Parts" / "Split into a series" — never a bare Split or Join. Divide/Merge was rejected as a second name for one concept (Q3)                                                                                                                                                        |
| Chunk NET?                                                | **Yes**                                                                              | Its cap is our own guardrail with no server-side control, so chunking routes around nothing. Psalms = 1 passage, 6 requests                                                                                                                                                                                                                                                                                                |
| Chunk ESV?                                                | **No**                                                                               | Crossway polices completeness server-side; sub-whole chunks would each succeed and defeat a deliberate control                                                                                                                                                                                                                                                                                                             |
| Auto-split user selections                                | **Removed**                                                                          | Turning one requested passage into six was surprising; passage shape is a document-structure decision belonging to the user (former Q38)                                                                                                                                                                                                                                                                                   |
| Split rule, where it lives                                | Fetch layer only                                                                     | Chapter-boundary greedy fill, invisible to the user (`splitRangeIntoPassages`)                                                                                                                                                                                                                                                                                                                                             |
| Auto-split in the edit flow                               | **Not applied**                                                                      | Edits diff by passage `id`; split parts have none, so a remove would cascade and destroy structure                                                                                                                                                                                                                                                                                                                         |
| ESV whole-book truncation                                 | **Confirmed** by probe                                                               | HTTP 200, `canonical: "Revelation 1–12:8"`, 202/404 verses, no error field — silent                                                                                                                                                                                                                                                                                                                                        |
| ESV truncation trigger                                    | **Completeness, not size**                                                           | Galatians (149v) halved; Romans 1:18–8:39 (208v) returned whole                                                                                                                                                                                                                                                                                                                                                            |
| Short-book exemption                                      | **Structural, not a verse floor**                                                    | Single- and double-chapter books, six of them. No bisecting probe needed                                                                                                                                                                                                                                                                                                                                                   |
| Truncation detection method                               | Verse-count ratio, not `canonical`                                                   | String comparison gave 4 false positives in 9 probes; verse counting gave 0                                                                                                                                                                                                                                                                                                                                                |
| Detection thresholds                                      | <90% **and** >15 verses short                                                        | ESV legitimately omits late-manuscript verses (Mark 9 = 48/50, John 5 = 46/47)                                                                                                                                                                                                                                                                                                                                             |
| "Chunking = circumvention" argument                       | **Withdrawn**                                                                        | A study can already show a whole book as several passages, so chunking reproduces no extra text with no extra requests. Replaced by "don't defeat a server-side control"                                                                                                                                                                                                                                                   |
| Hard cap on study verse count                             | **Rejected**                                                                         | Choppiness starts ~400 verses, below any round cap — a 500 cap would permit the bad case and block legitimate ones. Advisory only                                                                                                                                                                                                                                                                                          |
| `distribution.maxBookPortion`                             | **`null` for both**                                                                  | Crossway's 50% there measures the ESV's share of the user's document, not of the biblical book                                                                                                                                                                                                                                                                                                                             |
| `display.maxBookPortion`                                  | **`0.5` for ESV**                                                                    | The terms cap display per page in those words, excepting single/double-chapter books                                                                                                                                                                                                                                                                                                                                       |
| Safari choppiness                                         | Out of scope, tracked in §11.1                                                       | A rendering issue; must not shape the data model                                                                                                                                                                                                                                                                                                                                                                           |
| Limit message attribution                                 | `source`-aware                                                                       | `validatePassageLimits` once blamed the provider for our own cap. Any new limit copy must check `source` first                                                                                                                                                                                                                                                                                                             |
| Which commands work across a part boundary                | **Join Column, Join Section, Join Segment, Move Text Up, Move Text Down — all five** | They are shipped commands with menu items and toolbar buttons, so a user reaches for them at a boundary immediately. Granularity was never ours to choose; Q24's recommendation to skip raw word moves was withdrawn because Move Text _is_ that move                                                                                                                                                                      |
| Which boundaries are eligible                             | **Canonically contiguous only**                                                      | Different books, or a gap between parts, are never joined. The predicate is "does part _n−1_ end at the word before part _n_ begins", a pure function of canonical `startingWordId` order — not "is this part _n−1_". Overlap is undecided (Q40)                                                                                                                                                                           |
| Cross-passage vs cross-part first                         | **Straight to cross-part**                                                           | The cheaper stepping stone was cross-passage-within-one-study, which is broken today and needs the same generalisation. Recorded consequence: it is fixed incidentally only if the helper takes an ordered passage sequence rather than a part pair                                                                                                                                                                        |
| Export re-validation on boundary move                     | **Not needed — provably**                                                            | Boundary moves are verse-conservative: coverage is unchanged, verses only relocate between parts, and `validateExportLimits()`'s verse-identity `Set` is indifferent to which part holds a verse                                                                                                                                                                                                                           |
| Display re-validation on boundary move                    | **Required, on both parts**                                                          | The receiver may cross `min(500, half the book)` — e.g. a part at Rom 1:1–8:25 (211 verses) tipped past 216 by a few Move Text Up gestures — and the donor's existing warning may now clear, which a stale on-screen warning would misreport. ⚠️ This cell read "Rom 1–8 sits at exactly 216": wrong, it is **225**, which already exceeds half of Romans (216.5). See §10.1                                                |
| Is a series ever created automatically?                   | **No — always opt-in**                                                               | No range length, book size or verse count triggers one. Length as a reason to restructure is the framing Q1 already rejected; letting it back in through the UI would undo that decision quietly                                                                                                                                                                                                                           |
| Default in the create-as-series offer                     | **Always "One study"**                                                               | Pre-selecting "series" for a long range is the same rejected instinct expressed as a default. Applies even to Psalms                                                                                                                                                                                                                                                                                                       |
| Series eligibility threshold                              | **Any range of 2+ chapters, never restricted**                                       | Two sessions on Haggai and three on Habakkuk are real teaching plans; there is no principle by which the app knows better. "Split into a series…" stays available from the study menu for any eligible study, so the capability never depends on the app having offered it                                                                                                                                                 |
| Solicitation threshold                                    | **Tunable UX judgement, not a constraint**                                           | Distinct from eligibility. A prompt that fires when the answer is obvious teaches users to dismiss prompts unread, which is when it stops working on Psalms. Change it freely; nothing depends on the number                                                                                                                                                                                                               |
| Chapters per part                                         | **User's choice, default 1, live preview**                                           | The preview matters more than the stepper: it is where 150 parts for Psalms becomes visible before committing (Q9)                                                                                                                                                                                                                                                                                                         |
| Where the compliance position is shown                    | **At creation, live in the preview**                                                 | By export there are 21 parts holding structure and notes, and restructuring is §8's expensive operation — a warning that arrives then cannot be acted on cheaply. Per-part status, the series-level aggregate, and `checkSinglePassageSupport()` per proposed part, all recomputed as the stepper moves                                                                                                                    |
| Creation-time vs export-time strength                     | **Informational at creation, binding at export**                                     | Not an inconsistency: per-part display genuinely is compliant, so creation only informs; the aggregate is a distribution question, so whole-series export blocks (Q32/Q33)                                                                                                                                                                                                                                                 |
| May a user create a series that will fail export?         | **Yes, knowingly**                                                                   | Compliance is the study owner's obligation (`COMPLIANCE.md` §1.6) and `enforcement` is `'warn'` throughout. The alternative is refusing creation, which removes the choice §5 exists to protect. Logged so it is not later "fixed" by blocking                                                                                                                                                                             |
| Restrict series creation to contiguous same-book studies? | **No**                                                                               | It would contradict Q7/Q8, which allow non-contiguous and multi-book studies to exist, and would forbid the case needing the _least_ machinery: a Prison Epistles study divides part-per-passage with no arithmetic at all, while the contiguous case needs a stepper, a preview and chapter maths                                                                                                                         |
| What contiguity actually constrains                       | **The parting strategy, not eligibility**                                            | "Chapters per part" requires contiguous single-book text because `splitRangeIntoPassages()` takes a scalar `book`; across a gap the arithmetic is unanswerable, not merely undefined. Multi-passage studies get part-per-passage instead. Do not generalise the scalar `book` in service of the stepper                                                                                                                    |
| Part-per-passage: automatic or offered?                   | **Offered, never automatic**                                                         | Even with seams already drawn and nothing to compute, an automatic conversion would be a series imposed by the app's reading of the study's shape, contradicting "the app never decides, it offers". The absence of arithmetic is not the absence of a decision                                                                                                                                                            |
| What may be reordered                                     | **Runs, not parts**                                                                  | A series decomposes into maximal canonically-contiguous runs; runs permute freely, parts within a run are rigid, runs are never interleaved. Reuses §8's adjacency predicate, so one function governs both boundary-move eligibility and drag legality. Consequence: a contiguous Romans series is one run and cannot be reordered at all — teaching Rom 8 first means shaping the study as Rom 1–7 + Rom 8, two runs (Q5) |
| `seriesOrder` after a mutation                            | **Left alone — canonical order seeds it once**                                       | Re-normalising from canonical order after every mutation, as two earlier passages of this document said to do, would clobber a deliberate arrangement. Explicit, seeded at creation, user-editable within the run rule                                                                                                                                                                                                     |
| Runs: stored or derived?                                  | **Derived, never stored**                                                            | Part delete, Split Part, Join Parts and boundary moves all change run membership — four chances for a stored `runId` to go stale. One helper folding the adjacency predicate over parts in canonical order; three callers                                                                                                                                                                                                  |
| On series delete                                          | **Cascade — everything goes**                                                        | Reverses the earlier `set null` recommendation (Q6). Matches `0009_cascade_delete_studies.sql`, and dissolves the cross-part-connection problem via the FK. Cost: one action destroys every part's structure, notes and commentary, so the confirmation must state the part count and irreversibility                                                                                                                      |
| Deleting a single part                                    | **Allowed, warned; the run splits in two**                                           | The part's verses leave the series entirely — handing them to a neighbour would be Join Parts under the wrong name. Three consequences the warning must name: that seam is permanently dead for all five structural commands, previously-rigid parts become reorderable, and the series is now non-contiguous (Q7). Deleting to one part dissolves the series into a standalone study                                      |
| `segmentConnection.studyId`                               | **Stays `.notNull()`; `seriesId` added nullable (Q42, shipped in `0046`)**            | ⚠️ This read "**Must change; strategy open (Q42)**". Neither branch was taken: cross-part connections cannot be *authored* (two parts are never on screen together), so they arrive only when a **boundary move** slides under a link drawn inside one part. A `CHECK` would therefore not block a bad gesture — it would decide the fate of already-valid user work mid-move. Under-reporting in `countTouchingConnections()` is real but belongs to the phase shipping boundary moves; the index still needs a `seriesId` sibling. See §4 |
| Icon for a standalone study                               | **`book` — unchanged**                                                               | Reverses the earlier recommendation of `book-open`, which is **not in `icons.json`** and would have rendered as blank space via the documented missing-icon fallback. `StudyItem.svelte` already uses `book` at three call sites, so the old advice was churn dressed as reuse (trap 13)                                                                                                                                   |
| Icon for a series                                         | **`books`**                                                                          | Not "several, in order" but the `folder` → `folders` precedent: the registry already expresses this distinction as a singular/plural pair, and `folders` already means "a group among groups" in `MenuActions.svelte`. The Finder then reads `book` = study, `books` = series, `folder` = container (Q29)                                                                                                                  |
| Split/Join Part icon names                                | **`part-split` / `part-join`**                                                       | Was `study-split` / `study-join`, which contradicts §3's decided "Split Part" / "Join Parts". The registry is uniformly object-then-verb (`column-split`, `section-join`, `segment-split`), so the object is `part`                                                                                                                                                                                                        |
| Split/Join Part icon design                               | **The book metaphor, not a divided page**                                            | Icons are a single fill-only `d` path in a 32×32 viewBox, so the old "vertical dashed rule" needs hand-placed rects that merge at menu size. And it would be a fourth variation on "a divided rectangle" beside the three page-level split icons. The geometry cannot carry the level distinction, so the metaphor must                                                                                                    |
| Icon cost of the five commands                            | **Zero**                                                                             | Move Text Up/Down already use `arrow-up`/`arrow-down`, and the three Joins already have icons. §8's commitment adds no icon work — three new entries total for the whole feature (`books`, `part-split`, `part-join`), plus `warning`. ⚠️ This cell ended "plus registering `warning`, **which is already broken**" — all four are now registered (phase 1), so the whole icon cost of this feature is paid. `split` / `join` were not ours either, and are fixed by repointing at the existing `segment-split` / `segment-join` — no new artwork (trap 13)                                                     |

