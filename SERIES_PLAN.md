# Series — Design Plan

> Formerly "Linked Studies", and formerly `LINKED_STUDIES_PLAN.md`. The old name is recorded
> here for one reason only: commit messages and people's memory still use it, so a search for
> it should land somewhere useful. It is not an alternative name for the feature — see §3.

**Status:** IN PROGRESS — **phases 1 and 2 are complete and reachable from the UI; phase 3's four items
are all implemented and verified, three of them still awaiting a UI affordance** (see the phase-3 list
in §11 for exactly which). Phase 2's cross-part connection limitation is now **removed** — connections
survive a boundary move as edge stubs rather than being deleted. Migration `0046` and the four new
`icons.json` entries

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

**Phase 1 is now feature-complete**: creation, the Finder row (which is also the navigation — the
in-part prev/next control was built and then removed, §7), delete
(series and part), the derived run helper, and the disabled-with-a-reason boundary states. Two
verifier scripts pin the behaviour to this document — `verify-series-runs.mjs` and
`verify-boundary-reasons.mjs` (24 checks) — and both run against real `bible.json` via
`node --import ./scripts/alias-loader.mjs`.

**Phase 2 is COMPLETE.** Split Part / Join Parts, all five cross-boundary commands, §10.1
re-validation, cross-part connections (warn-then-delete), "balance by length" (Q11), and adjacent-part
prefetch. What exists:

- **The planning layer** (`seriesRestructure.js`, 48 assertions) — pure range arithmetic for Split
  Part / Join Parts, shared by the confirm dialog and the endpoint so the preview cannot diverge
  from the outcome, exactly as §5's creation flow does with `planSeriesParts()`.
- **The structure-transfer layer** (`seriesStructurePlan.js` + `server/db/seriesStructure.js`, 54
  assertions) — which column/section/segment rows change parent, and what happens to the
  connections anchored to them.
- **The endpoints and UI** — `POST /api/series/[id]/split` and `…/join`, `SplitPartModal`,
  `JoinPartsModal`, and the two menu items in `MenuActions`. Both endpoints accept `dryRun`, which
  runs the _same code path_ as the commit rather than describing it, so the dialog's stated counts
  are facts about the operation.

**✅ Five write probes now exercise the real database**, which had been the largest outstanding risk:
everything before them was verified only by pure-layer tests and by reasoning, and a pure test can
assert "the planner never asks for a delete that relies on the cascade" but not "the cascade did not
fire".

- `npm run probe:join-parts` (44 assertions) — Join Parts, the highest-risk operation, since the
  absorbed part's `passage` row is deleted. All content survives; **`assertPassageEmpty()` genuinely
  fires** when asked to delete a passage that still owns columns, and the transaction rolls back.
- `npm run probe:xpj` (65 assertions) — the cross-part join at **all three granularities**: content
  folded, ranges moved, `cachedText` invalidated on both sides, connections not orphaned, nothing lost
  to cascade. The section case confirms the multi-segment boundary rule below; the column case confirms
  that sections are re-parented before their container is deleted.
- `npm run probe:split-part` (50 assertions) — Split Part, including the **straddling column**: the
  clone preserves `width` / `leftOffset` / `colour` / `topOffset`, the original column and section keep
  their ids so the near side keeps its identity, and `seriesOrder` is shifted rather than re-derived.
- `npm run probe:move-text` (39 assertions) — Move Text Up **and** Down: the boundary lands where the
  arithmetic says in both directions, coverage is conserved, the correct anchor moves in each, no
  segment is left anchored outside its passage range, §10.1 display re-validation rides along with the
  correct part as receiver per direction, and a mid-verse caret is refused by the analyzer _and_ the
  executor with nothing written.

- `npm run probe:balance` (14 assertions) — creating a **balanced** series end to end: the rows written
  are the parts the same planner previewed, with a counter-check that the default shape would have been
  six parts rather than three. ⚠️ Its last five assertions read the _source_ of the modal → menu →
  endpoint hand-offs, because the probe reproduces the endpoint's logic rather than invoking it; that
  gap was found by mutation and is labelled rather than hidden.
- `npm run probe:prefetch` (17 assertions) — cache-warming: a cold part is filled, a warm one is skipped
  with **no further provider call** (asserted on a call counter, not just on end state), the current
  part is untouched, and a simulated outage neither throws nor half-writes a row.

⚠️ **Phase 2's standing limitations** — one resolved in phase 3, two still standing, all deliberate
and all surfaced to the user rather than hidden:

1. **A cross-part Move Text requires the caret at the start of a verse** — segment anchors are
   word-granular, passage ranges are verse-granular, and the mismatch cannot be represented across a
   part boundary. Refused with a reason; fixing it properly means word-granular ranges, a schema change
   outside §8's scope.
2. ~~**Cross-part connections are deleted, not preserved**~~ — **resolved in phase 3.** Strategy (b)
   has been replaced by (c): the connection survives, stamped with `seriesId`, and each part draws a
   labelled edge stub. Left visible rather than deleted because a reader who remembers the old
   behaviour should be able to see that it changed, and when.
3. **No undo.** Split Part and Join Parts are irreversible: a user who confirms and regrets it has no
   recourse, since the app has no undo stack anywhere to hook into (Q35, now settled). Mitigated
   rather than solved — every destructive command dry-runs through the function that commits,
   connection loss is counted and acknowledged before it happens, and `assertPassageEmpty()` rolls
   back rather than cascading away a part's notes. Listed here because "we chose not to build undo"
   is a limitation of the feature, not an absence of one.

These are all **WRITE probes** and deliberately stay out of `npm run verify`: they mutate the database, so
they must be run knowingly. Each builds its own prefixed fixture and removes it in a `finally`,
including after a failed assertion. Both were mutation-checked — deleting the guard, or skipping the
range move, makes them fail.

**Every structural operation in phase 2 is exercised against a real database, with no path left to the
pure layer alone** — Split Part, Join Parts, the cross-part join at all three granularities, Move Text
in both directions, balanced creation, and prefetch cache-warming. **217 probe assertions across six
probes**, alongside 388 verifier assertions across nine scripts.

The most valuable single result: mutating the column join to delete its container _before_ re-parenting
the sections destroys two segments, both their notes and a heading, and fails 10 assertions. The
ordering comment had been asserting that risk since `169e773`; it is now demonstrated rather than
argued.

**Current totals, measured rather than remembered: 541 verifier assertions across 13 scripts, and 235
probe assertions across 7 write probes.** Every number in this document has drifted at least once as
scripts were added, so recompute with `npm run verify` before quoting it — a stale count invites more
trust than no count.

⚠️ **A verifier outside `npm run verify` is not a verifier.** `verify-series-planning.mjs` — the
oldest script here — was absent from the chain and had been failing for some time, in a way neither
a red chain nor a stale expectation would explain: it demanded a **series-scope warning** for John
at one chapter per part, while `verify-per-passage-parting.mjs` asserts "creation is silent about
the series" for the *identical fixture*. Two scripts requiring opposite behaviour of one function
means one is guaranteed red no matter what the code does.

Trap 8's concern was never dropped — it moved to `checkSeriesExport()`, which blocks at the export
boundary rather than mentioning at creation — so the stale script was the one asserting the
superseded design. Two compounding defects kept it quiet:

1. **Not in the chain**, so nothing ran it.
2. **It exited 0 on failure.** It printed `1 CHECK(S) FAILED` and returned success, so adding it to
   the `&&` chain would have been decorative — the chain reads exit codes, not stdout.

Both fixed: the assertion now matches the shipped design and cross-references the script that
proves the export check still catches this series; `process.exitCode = 1` is set when any check
fails, including the post-summary fixture-sanity guard; and the script is first in `npm run verify`.
Confirmed by mutation — a wrong expected title makes the script exit 1. Every other `verify-*.mjs`
was then checked for the same silent-exit shape: all of them already set an exit code, so this was
the sole offender, and `npm run verify` now runs all 28.

⚠️ Running a probe needs two loader shims that did not exist before (`scripts/alias-hooks.mjs`):
`schema.js` is really `schema.ts`, and `$env/static/private` is generated by Vite. The `$env` shim
reads `.env` **itself** rather than trusting the calling script, because module resolution runs before
the script's own `dotenv.config()` — that ordering trap cost a failed run and is commented in place.

⚠️ **The blocker phase 2's own \"what a boundary move must do\" step 4 warned about is now real and
handled, and the shape of the fix is worth knowing before writing the endpoints.** Joining two
parts coalesces two ranges into one, so the absorbed `passage` row disappears — and
`passage_column.passage_id` is `ON DELETE CASCADE`. The obvious implementation order (write the
merged range, delete the absorbed row) destroys every column, section, segment, heading, note,
commentary and connection in the absorbed part, **and reports success.** Structure is therefore
re-parented before anything is deleted, and the delete sits behind a guard that refuses a passage
row still owning columns. Anyone extending this must preserve that order.

Likewise the `studyId` wrong-answer bug §8 predicted is reachable as soon as structure moves:
`countTouchingConnections()` filters on `segmentConnection.studyId`, so it silently under-counts
and the confirm modal then states that no connections are affected. Connections are now loaded by
their six **endpoint** columns instead, never by `studyId`.

⚠️ **A part divides two ways, and they are different operations on the rows.** `getSplitPoints()`
returns `'chapter'` (inside one passage) or `'passage'` (a seam between passages). Only the chapter
split moves structure; a seam split re-parents whole `passage` rows, and each row owns its own
columns, so nothing changes parent and **no connection can break**. Writing these as one path
produced three separate defects — duplicated verses in the new part, a structure move applied to a
passage that does not move, and a confirmation demanded for connections that would never be touched.
`verify-series-structure.mjs` now pins the distinction.

**The five commands: decision layers built, not yet wired.** Two more pure modules have landed, and
they are the substance of the generalisation §8 asks for — but **no command consults them yet, so no
user-visible behaviour has changed**:

- `sequenceScope.js` (56 assertions) — the scope resolution §8 specifies, taking an **ordered
  sequence of passages** rather than a part pair. `resolveScope()` replaces "am I the first item in
  my passage?" with "what precedes this item in the sequence, and may we reach it?", returning
  `crossesBoundary` and a refusal reason instead of throwing. Because it takes a sequence, it also
  fixes the single-study multi-passage case §8 notes is broken _today_.
- `boundaryMove.js` (41 assertions) — §8 step 2, "adjust both parts' passage ranges". Both ranges
  derive from **one** boundary word id, so a gap or overlap between them is unrepresentable. Verse
  conservation is enforced rather than assumed, because §10.1's licence to skip the export re-check
  depends on it.
- `crossPartCommands.js` (42 assertions) — which of the five commands may reach across each edge.
  Exists because `boundaryBefore === null` is ambiguous between "contiguous seam" and "no neighbouring
  part", and reading it as the former enabled four commands at the series' outer edges. See the ⚠️
  below.

**✅ All three Joins work across a boundary** — Join Segment, Join Section and Join Column, **3 of the
5 commands** — end to end: server (`passageSequence.js` + `crossPartJoin.js`), shared endpoint routing
(`joinRouting.js`), and the menu guards. Selecting part 2's first item and joining folds it into part
1's last, moving the verses with it, with §10.1 display re-validation on both studies. The same change
fixes the single-study multi-passage seam §8 notes is broken _today_, because the resolver takes a
sequence.

⚠️ **The boundary is the first segment that STAYS — not the segment after the active one.** For Join
Segment the two coincide, because one segment moves. A section or column moves several at once, so the
segment after the _first_ of them is still moving, and using it leaves the boundary **inside the moved
block**: the earlier part claims verses whose structure also moved, and the later part renders text it
no longer owns. The naive boundary produces a perfectly valid range, so nothing catches it — the
verifier now asserts that the two rules give different answers.

⚠️ **The within-passage `joinSegment()` was deliberately NOT rewritten.** The endpoint routes on a
server-computed fact: same passage → the original code, untouched; across a boundary →
`crossPartJoin.js`. The shared fold helpers are reused so content semantics cannot drift. This keeps
the risky new path out of the working old one on a command that destroys content, and it is why
§8's "two call graphs" warning has not yet had to be resolved.

**✅ All five commands are generalised (5 of 5).** Move Text Up/Down landed last, and unlike the Joins
they were **rewritten rather than routed** — §8 already said so, and the reason is that a cross-part
join is a _different_ operation while a cross-part text move is the _same_ operation over a wider
scope, so routing would have duplicated `moveSegmentTextDown`'s tree walk rather than widening it.

⚠️ **A cross-part Move Text requires the caret at the start of a verse.** Segment anchors are
word-granular; passage ranges are verse-granular. Inside one passage that mismatch is harmless — both
segments render from the same text. Across a part boundary it is not: a caret at `RO-003-001-005`
yields a boundary of exactly 3:1, dropping the word offset, so one part would claim words 1–4 of a
verse the other owns entirely. Refused with a reason directing the user to move to a verse boundary
within the part first. Making passage ranges word-granular would fix it and is a schema change well
outside §8's scope.

⚠️ **No structure changes parent during a Move Text, and that is a conclusion, not an omission.**
Because the boundary is derived from the caret, the moved verses always land inside the range of the
part whose segment already covers them, by implicit extent. Traced against real `planBoundaryShift`
output — an earlier draft of the code comment claimed re-parenting was required, and it was wrong.

⚠️ **The "yet" copy outlived the fix, and that alone disabled all five commands.**
`getBoundaryDisabledReason()` returned `'Not available across parts yet.'` for a **contiguous** seam —
correct in phase 1, when the cross-part commands did not exist. Every caller treats a non-null reason
as "this boundary is ineligible", so once the commands shipped that one string went on greying them
out at precisely the seams they had just learned to cross, *and* printed the now-false promise
underneath. The server was complete and correct the whole time; the feature was unreachable from the
menu. A contiguous seam now returns `null`. §11 already said a promise of a later fix must not outlive
the fix — this is that rule applied to its own copy, and it is recorded because a stale *string* is far
easier to miss in review than stale logic.

⚠️ **`boundaryBefore === null` meant two different things, and the menu believed only one of them.**
The study layout emits `boundaryBefore: index > 0 ? getBoundaryDisabledReason(…) : null`, so `null`
says both "this seam is contiguous" and "there is no previous part". `MenuStructure` read it purely as
permission, which left **Join Up and Move Text Up enabled on part 1's first item** — and, mirrored
through `boundaryAfter`, both Down commands enabled on the **last part's final item**. Clicking bought
a server round trip and an `alert()`. This is the same defect `setJoinNeighbours` was written to remove
one level down, reappearing at the series' outer edges, so the rule now lives in
`crossPartCommands.js` with `verify-cross-part-commands.mjs` pinning all four directions: an edge is
reachable only when a neighbour **exists** (`position`/`total`, already loaded and previously unread)
**and** that edge's own seam is contiguous.

⚠️ **Move Text now re-validates display on both parts (§10.1), which it did not when it landed.** The
three Joins have carried `displayWarnings()` since they shipped; the two moves did not, and that was a
gap rather than a decision — §10.1 and the §13 table both require re-validation on **any** boundary
move, and the table's worked example ("tipped past 216 by a few Move Text Up gestures") is a Move Text.
A join relocates one item once; a move is repeatable a verse at a time, which makes it the *likelier*
way to drift over the cap. The receiver is the part that **grew**, so it follows `direction`: Up ⇒ the
earlier part, Down ⇒ the later one. Q41's pre-write refusal came with it, as a 409.

⚠️ **A cross-part Join Down is NOT the equivalent Join Up, and treating it as one moved verses the
wrong way.** `joinRouting.js` rewrote every Join Down into "the Join Up a user could perform by
selecting the next item". Within one passage that identity is exact — a join removes one anchor, the
earlier item of the pair survives, and direction only names which pair is meant. **At a part boundary
it is false**, because which part the result lives in is the entire point of the gesture. So a Join
Down on part A's last segment became a Join Up on part B's first: part A *grew*, pulling part B's
content backwards, which is the opposite of what the user asked for — a data-correctness defect on an
undo-less command.

The rule the app now implements, stated once and symmetric: **the selected item is what moves.** Join
Selected Up takes the selection from part B into part A; Join Selected Down takes it from part A into
part B. In both the selected item keeps its row and the *neighbour* is consumed, which also happens to
be what the anchor rule predicts — the selected item's anchor is the earlier of the pair in a Join
Down, so it is the one left standing — and what Join Down already did within a passage (STR-014). Three
independent rules agree, which is why this shape rather than the mirror-image alternative.

`crossPartJoin.js` therefore carries a second path — `analyzeCrossPartJoinDown` /
`joinDownAcrossBoundary` — where the boundary lands on the **first moving** segment rather than the
first that stays, and the cascade-ordering trap applies to the *target's* children instead of the
selection's. The within-passage rewrite is untouched: it is correct there and audited.

⚠️ **The probe asserted the bug.** `probe-join-direction.mjs` claimed to cover "a Join Down that
crosses a part boundary", but its only cross-part assertion was that verses move "in the same direction
as the equivalent Join Up" — the rewrite's own premise restated, so it could only ever pass. It also
never built a two-part fixture. The equivalence claim is now explicitly **scoped to within-passage**,
and a real series fixture asserts the placement outcome: after a cross-part Join Down the selection
lives in part B, part A shrank, part B grew.

⚠️ **A boundary move must re-anchor CONTAINERS, on both sides — and not doing so broke Insert.**
Segments are handled explicitly by each command; the column and section holding them were not. After a
cross-part Move Text or Join, a container could be left anchored at a word that was no longer its first
segment's. Nothing rendered wrongly — extent is implicit, so a container is defined by what it holds —
which is exactly why it went unnoticed. The damage landed one command later, in `insertSegment()`:
`section.startingWordId === insertionWordId` matched a word that was the section's anchor but *not* its
first segment's, so **"Cannot insert segment at the beginning of a section" was raised on the very text
the user had just moved or joined**, with no way to proceed.

The two commands failed for opposite reasons, which is why a single half-fix did not cover it.
`crossPartJoin.js` had a private `reanchorFirstOf()` — but it ran on the **donor only**, and only
corrected an anchor that *preceded* the passage. `crossPartMove.js` had nothing at all, and a Move Text
Down leaves the receiver's container anchored *after* its first segment, the direction the original
helper ignored. Now `reanchor.js` owns one rule, called on both passages by both commands, rewriting in
either direction. ⚠️ **Segments are never re-anchored** — a segment anchor is the user's content
decision, a container anchor is bookkeeping derived from it.

⚠️ **The probes were green throughout, and that is the lesson.** They asserted structure — no orphans,
no segment outside its passage range — and every one of those held. The invariant that broke (a leading
container sits on its first segment) was never stated, and the symptom only appears when a *different*
command reads the anchors. Both probes now assert the invariant **and** drive a real
`insertSegment()` against the moved/joined text; disabling the fix makes them fail with the user's exact
message.

added by analogy with the cross-part Join, which does confirm. The analogy is false: a Join **deletes**
an item and nothing restores it, whereas a move only relocates a boundary — the user reverses it by
selecting the split they actually wanted and moving the text again. Not a traditional undo, but a
complete one: no content is destroyed and no state is unreachable. So the dialog interrupted a
reversible, repeatable, exploratory gesture in order to assert "this cannot be undone", which was
simply untrue. Removed. The **dry run stays**, doing the job it is actually good for: surfacing a
refusal — an ineligible seam, or the mid-verse caret rule — *before* the gesture rather than as an
`alert()` after it. Q35's no-undo reasoning still governs Split Part, Join Parts and the Joins, where
something really is destroyed.

**✅ "Balance by length" is done (Q11).** Offered in the Split-into-Series preview beside the
chapters-per-part stepper, off by default, taking a part **count** (a number whose consequence the
preview can show) rather than a target length. It never splits a chapter, and the modal says so — a
range containing one very long chapter still yields one long part, which is an inherent limit of
respecting chapter boundaries rather than a defect.

**✅ Adjacent-part prefetch is done**, and it is the only decision in the feature that deliberately
does **not** consult the adjacency predicate: prefetch is about what the user will _open_, which is
`seriesOrder` (the Finder's part order, §7), so a Prison Epistles series prefetches its next part
exactly like a Romans one. It
warms at most **one** part, skips any part that is even partially cached, is never awaited, and re-reads
the cache before spending a provider request.

**Nothing remains in phase 2.** De-duplicating `passageJoin`/`passageReconcile` remains an explicit
**non-goal**, not an assumed prerequisite — the three Joins were generalised by _routing around_ those
functions, not through them, so the question is still open rather than answered. **Phase 3 is next**,
and its first item (cross-part connections preserved as edge stubs) would replace the warn-then-delete
behaviour Q23 currently phases as (b).

⚠️ **Move Text Up/Down will not follow the same shape as Join Segment.** §8 already warns that they
are "rewritten, not extended", and `moveSegmentTextDown` locates its next segment by walking one
passage's tree — that walk is what must span two passages. Join Segment could route because a
cross-part join is a _different operation_; a cross-part text move is the _same_ operation over a
wider scope, so routing would duplicate the walk rather than widen it.

⚠️ **`direction` means where the CONTENT moved, never where the boundary moved.** They are exact
opposites, and §10.1 reads it to decide which part is the "receiver" whose display limit must be
re-checked — so getting it backwards grows the wrong part. A boundary moving _later_ means the
earlier part received, i.e. content moved `'backward'` (the three Joins and Move Text Up); a boundary
moving _earlier_ means content moved `'forward'` (Move Text Down). This was wrong in the first draft
of `boundaryMove.js` and is recorded because the naming reads plausibly either way.

**Blocking questions, resolved rather than guessed.** Q40 and Q23 were ratified from what is
already live and phased: `classifyBoundary()` already returns `'overlap'` as its own excluded
state, and a join declines it because merging overlapping ranges would duplicate verses; §11
already phases connections as warn-then-stubs, so the transfer layer _reports_ straddling
connections and never destroys them itself. **Q35 (undo) is deliberately left open** — the app has
no undo anywhere, so making series the first feature to demand app-wide `⌘Z` inverts the cost.
Split/Join ship with confirm-before-destroy, the mitigation part delete already uses.

**Last updated:** 2026-09-12

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
3. **Navigability.** 16 sibling studies in the Finder is clutter; one collapsible series that
   expands into them is not.

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

⚠️ **Q40 gates reordering too, and is settled.** For overlapping parts — Rom 1–3 and Rom 3–5 — "are
these in the same run?" has no answer from adjacency alone, because overlap is neither contiguity nor a
gap. Q40 resolves it the same way for both features: an overlapping seam is **ineligible**, so it ends
a run rather than continuing one. This note used to end "the same undecided question now blocks two
features rather than one" — it blocks neither; `classifyBoundary()` returns `'overlap'` as its own
excluded state and both callers read it.

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

| Question                                             | Answer                                                |
| ---------------------------------------------------- | ----------------------------------------------------- |
| **Eligibility** — when is a series _possible_?       | **Any range spanning 2+ chapters.** Never restricted. |
| **Solicitation** — when does the app _volunteer_ it? | **As shipped: whenever eligible.** Tunable.           |

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
| Multiple passages (Prison Epistles; Rom 1–3 + Rom 8) | **One part per passage** (default)| Seams already drawn by the user; nothing to compute |
| Multiple passages, finer parts wanted                | **Chapters per part, per passage** | One stepper per passage at creation; Split Part after |

**Update — per-passage division landed.** The third row previously read "part-per-passage, then Split
Part (phase 2)", and that route was real but unusable at the scale it was needed: a Revelation +
Matthew study is two parts of 404 and 1071 verses, and reaching one chapter per part meant invoking
Split Part 48 times, none of it visible before committing. Rule 3 asks for the preview to carry the
decision, so the New Study form now shows **one stepper per passage** that spans 2+ chapters, each
defaulting to "whole" — the old shape — so nothing is imposed and the default is unchanged.

⚠️ **This did NOT generalise the scalar `book`**, and the distinction is the whole of trap 15.
`planByChapters()` is called once per passage with a single contiguous single-book range, which is
the input it already accepted; parts are then renumbered across the series. No division spans two
passages, so the unanswerable cross-gap question ("is part 4 Romans 8, or Romans 4 which is not in
this study?") never arises. The algorithm was invoked N times, not widened once. Pinned by
`scripts/verify-per-passage-parting.mjs` (33 assertions), which also fails if the renumbering is
removed — two parts numbered 1 is the failure mode, and `seriesOrder` is what the Finder orders by.

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
▸ ⦙⦙ Romans

▾ ⦙⦙ Romans
    ⦙ Romans 1:1-32  [ESV]
    ⦙ Romans 2:1-29  [ESV]
    ⦙ Romans 3:1-31  [ESV]   ← current
```

⚠️ **This sketch previously read `Series · 16 parts` with a numbered gutter (`1  Romans 1`). Both
are gone**, and the sketch above is what ships. Three corrections, each with its own reason:

1. **No "Series · N parts" suffix.** A group row shows no count, and the two must present
   identically — see Q16.
2. **No number gutter.** It sat *outside* the selectable row, so a part's text and its selection
   highlight both landed right of a grouped study's: two rows of the same kind that did not line
   up. Parts now render at `depth + 1` through the same markup `StudyGroup` uses, so alignment is
   shared by construction. Order is conveyed by the list being ordered.
3. **A part's row shows its REFERENCE, not its title** (`referenceAsTitle` in `StudyItem.svelte`).
   A part's title is derived from its range at creation, so the default two-line row printed
   "Romans 1" above "Romans 1:1-32" — the same fact twice, at double the row height, times 16 or
   150 parts. The reference is the more precise of the two, so it is the one that stays. A
   standalone study keeps both lines: its title is authored, not derived.

⚠️ **And the derivation itself was then corrected: a generated part title IS the full reference.**
The three changes above each fixed one surface that displayed `partTitle()`'s output. That function
is the single source of every part name in the app — the two creation previews, `JoinPartsModal`
and `SplitPartModal`'s "Merge **X**" copy, the review page's deleted-part and discarded-title
lists, and `describePartDeletion`'s consequence sentences all render it — so patching any one
surface puts it in disagreement with the other six. `partTitle()` now emits `Romans 1:1-32` rather
than `Romans 1`, and the seven surfaces correct themselves at once.

Three things this settled, none of them cosmetic:

1. **The dropped verses were load-bearing at a range's own edges.** A study of Rom 1:18–8:39
   produced a part titled "Romans 1" that does not begin where Romans 1 begins. Q12 allows partial
   chapters; the name was the one place that fact was discarded. Pinned by
   `verify-series-planning.mjs` — the part is now `Romans 1:18-4:25`.
2. **The STUDY title was leaking into what is now a citation.** `planByChapters`/`planByBalance`
   were passed `baseTitle`, so a study called "The Road to Righteousness" yielded
   `The Road to Righteousness 1:1-8:39` — a reference to a book that does not exist. Survivable
   while the format was `${baseTitle} ${chapters}`; not survivable now. Both strategies take
   `bookLabelOf(passages[0])`, which is what `planByPassage` already did for the adjacent reason.
   Also pinned.
3. **Hyphen, not en dash — everywhere.** `partTitle()` calls `formatPassageReference()` rather than
   formatting a third way. That is the formatter behind the Finder rows and the series page's
   Continue button, where a part's name is read most often. `seriesExtent.js`'s
   `formatExtentReference` used an **en dash**, so the review page showed `Matthew 5:21–48` a line
   away from part titles reading `Matthew 5:1-20` — two spellings of one thing on one screen, and
   precisely the disagreement that function's own doc comment was written to prevent ("a second
   formatter would be free to disagree with this one about where the dash goes"). It now uses a
   hyphen too. The two functions remain separate because they take different inputs — one a loose
   range with `bookId`/`book`, the other a passage row with a resolved `bookName` — but the dash is
   no longer the obstacle if they are ever merged.

This **converges with Split Part**, which has always named the part it creates by full reference
(`titleForSecondPart`, with its own reasoning recorded there: a name derived from content is stable
under reordering and a number is not). Parts made by splitting and parts made by parting now follow
one rule.

**Existing series are NOT migrated.** `study.title` is user-editable and a rename is
indistinguishable from a generated title at the row level, so rewriting them would silently destroy
deliberate renames — the class of irreversible loss §4 and the review page exist to prevent. Old
parts keep their old names; new ones get references.

**The `Part N` ordinal stays in both preview lists.** §6 removed the Finder's number gutter for an
*alignment* reason — it sat outside the selectable row, so parts and grouped studies did not line
up — which does not transfer to a modal with no selection and no sibling row type. And the ordinal
is load-bearing there in a way it is not in the Finder: `seriesOrder` is the column Split/Join
identify neighbours by, and the preview is where a user checks that Colossians starts at part 7.

**The icons are the only differentiator** between a series row and a group row (§9).

Reuses `studyGroup`'s `isCollapsed` pattern and `expandGroupAncestors()`, which will need a
sibling `expandSeriesAncestors()` (or a generalisation) so deep-linking to part 7 expands both
its series and any enclosing groups.

**Q13. Can a series live inside a group?** _Rec: yes — `studySeries.groupId`._
**Q14. Can a series nest, or contain a group?** _Rec: no. Flat sequence only._
**Q15. Distinct icon, or the group folder icon?** _Rec: distinct — see §9._
**Q16 — answered: neither. No count on the row.** ⚠️ This read "_part count always; verse total on
hover_", and the count shipped as a "Series · 16 parts" suffix before being removed.

The recommendation treated the count as free information. It is not: a group row shows no count,
and a series row carrying one is a visible assertion that a series is a *different kind of thing*
in the Finder — which is exactly the claim §6 spends its effort denying. The count is also
redundant the moment it matters: expand the row and the parts are right there, countable and
individually useful, which "16 parts" is not. Collapsed, it answers a question nobody asks of a
folder.

The verse total on hover went for a plainer reason: a tooltip nothing else in the Finder has, on a
number no decision depends on. Where a verse total *does* drive a decision — the export compliance
check (§10) — it is computed at that point and stated there, with the consequence attached.

**The series landing page followed.** `/series/[id]` had repeated the suffix as a `Series · N parts`
line under the heading, on the reasoning that the page should name the thing the way the row that
led there does. That reasoning still holds — which is why the line went too: the row no longer says
it. The page's own emptiness case (`This series has no parts left`) already covers the one count
that changes what the user can do.

Its "Continue" button changed with it: it now reads `Continue: Ephesians 1:1-23 [ESV]` rather than
`Continue: Ephesians 1`. Same argument as the part rows above — the title is derived from the range,
so naming the part by its title is a lossier way of saying what the reference says exactly, and it
is the reference the user just read in the sidebar. The reference is assembled in the page loader
(`resumePartReference`) so the passages already fetched for the parts list are reused; the
translation badge is appended in the component, where every other abbreviation lookup happens.
**Q17. Drag a standalone study into a series?** _Rec: phase 3 — needs invariant checks._

**Q17 — extended: which Finder rows can be dragged at all?** The question above asked only about
dragging a study INTO a series. Two neighbouring cases were never asked and had both defaulted to
the wrong answer.

**A SERIES can be dragged into a group — now it can.** §4 gives a series its own Finder slot and
`studySeries.groupId` records which group holds it, and the "Move to…" menu command has filed a
series that way since the endpoint's `groupId` branch was added. The *gesture* could not: both
`StudySeries` call sites passed `onSeriesMouseDown={null}`. So the app held two views about whether
a series was a movable thing depending on which affordance the user reached for — and drag is the
one people try first on a row that looks exactly like the group row beside it.

This is **placement, not membership**: nothing about which studies are parts, or their order,
changes. It PATCHes `/api/series/[id]`, which already validates that the destination group belongs
to the user. ⚠️ It must not reuse the study path — a series id sent to `/api/studies/[id]` matches
no row and reports success, which is a move that silently does nothing. That is precisely the
failure the `groupId` branch was written to fix, and it would have been reintroduced by sharing the
`draggedStudies` array instead of giving series their own.

**A PART cannot be dragged anywhere — now it cannot.** It could: a part is rendered by `StudyItem`
with the same `onStudyMouseDown` wire every study gets, so it could be dropped into a group, which
sets `study.groupId` on a row whose place is `study.seriesOrder`. A part's place IS its series
(§4, "a flat ordered sequence"), so that drop is a **membership change wearing a placement
gesture** — and it performed one silently, while every legitimate route out of a series states its
consequences first: Delete Part through `describePartDeletion` (including §4's dissolve-at-one-part
rule), Join Parts, and re-editing the study's extent through the review page.

⚠️ **Refused in the composable, not by withholding the wire in `StudySeries`.** A part reaches the
drag two ways: grabbed directly, and carried along inside a MULTI-SELECTION grabbed by a standalone
study elsewhere in the Finder. A guard in `StudySeries` cannot see the second — parts are filtered
out of the selection instead, so the rest of a mixed selection still moves and only the parts stay
put. Both routes are pinned and mutation-tested in `verify-series-drag.mjs`; neutering either one
turns the scan red.

Two smaller consequences, both recorded because they are easy to reintroduce: a dragged series must
not light up other series rows as drop targets (§4/Q14 — a series never nests in a series), and a
multi-selection emptied entirely by the part filter must not register listeners or draw a ghost from
`draggedStudies[0]`, which would be `undefined`.

⚠️ **The refusal must come AFTER `event.preventDefault()`, and that ordering is load-bearing.** The
first version returned before it, and parts alone grew a blue outline when clicked — a difference no
other Finder row has. `preventDefault()` on mousedown suppresses the browser's native drag *and, as
a side effect, the focus the pointer would give the button*; that side effect is the only reason a
clicked study does not draw `.study-item:focus`. Skipping the call skipped the suppression.

This coupling is invisible from either end: the CSS rule looks like ordinary keyboard-focus styling,
and the `preventDefault()` looks like it is only about dragging. `StudySeries` had already hit it
once and documents it on its own row — the same trap, found twice. Keyboard focus is unaffected,
because `preventDefault()` suppresses only the pointer's focus, so Tab still outlines the row where
it is the sole indication of position. Pinned by an ORDER assertion in `verify-series-drag.mjs`,
mutation-tested by swapping the two statements: both orderings refuse the drag equally well, so
nothing else would have caught it.

**Q18. What does clicking the series row do?** _Rec: chevron expands; the title opens part 1._

⚠️ **This previously read "the title opens the last-viewed part, falling back to part 1, matching
`user.lastStudyView`." That column cannot do it.** `schema.ts:71` is
`lastStudyView: text('last_study_view').default('analyze')`, documented one line above as "the last
study view ('analyze' | 'document')" — a **view mode**, not a study or part identity. Nothing on
`user`, `study` or `studyGroup` persists a last-viewed part. (§7 used the same column correctly, so
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

⚠️ **Q18 — REVISED (2026-08-29): the title opens the SERIES, not a part.** Navigating straight to a
part made the series row unable to be selected on its own, and that had consequences well beyond
navigation:

- `handleSeriesHeaderClick` navigated without ever calling `multiSelect.handleItemClick`, so
  `isItemSelected('series', …)` was never true. The row's selection styling was dead code and the
  toolbar never saw a series at all.
- The part it opened became `activeStudyId`, which the Finder's auto-select effect then selected. So
  clicking a series reliably ended up selecting a **part**.
- Edit therefore acted on that part, opening one part's passage list as though it were the study.
  A 28-part Matthew series offered "Matthew 3" for editing rather than the Matthew 1–28 the user
  typed — §5's whole premise is that a series **is** a study the user divided.

A series is selected the way a group is (§4 treats both as expandable Finder rows), and a group
click opens `/study-group/[id]` — its own page, never one of its studies. A series now has the
same: `/series/[id]`, with the parts listed and the recomposed passage list behind Edit.

**`lastPartId` is not obsolete.** It still records where the user was, and the series page offers it
as an explicit "Continue: «reference»" button. What changed is that resuming is a choice the user
makes rather than a side effect of selecting the series — which is precisely what let the selection
leak into a part. Q18's answer (resume the last-viewed part) survives; its *trigger* moved.

Pinned by `scripts/verify-series-selection.mjs`, which asserts the click selects the series, that it
does not navigate to a part, and that Edit is disabled while a part is selected — the last of these
mutation-tested, including the trap that disabling Edit must **not** disable part deletion (§4's
`describePartDeletion` flow depends on it).

---

## 7. Navigation

**Removed. The Finder is the navigation.** An in-part `‹ Part 3 of 16 ›` control was built and
then taken out: the Finder already lists every part of an expanded series, in order, one click
away, and it stays open while the study is read. A second, view-local navigator duplicated that
with a worse affordance — a bare arrow pair with no titles visible — while adding a `<nav>` to the
Analyze titling row and a chrome bar above the Document gutter that both had to be kept out of the
paginator's measurements and out of print.

What this removes: `SeriesPartNav.svelte`, the `study-header-row` wrapper and `series-nav-bar` bar
in the two views, and `seriesContext.previousPart` / `nextPart` from the study layout load.

What survives:

- `seriesContext` itself — the Structure menu's boundary reasoning (§8, §11) and the whole-series
  export check (§10) read it, and both need `parts` with their ranges.
- `lastPartId` and the series page's "Continue: «reference»" button (§6, Q18).
- Adjacent-part prefetch (Q20): readers still move through a series in order, they just do it from
  the Finder, so the next part is still the predictable next open.

### The part's header titles the SERIES

Removing the nav removed the only place a part's page named the series it belonged to. That was a
real loss, and the fix is not to put the control back: **a part's study header shows the series
name and the series subtitle** (`studySeries.name` / `studySeries.subtitle`, carried on
`seriesContext`), in both Analyze and Document.

A part's own title is *derived from its range at creation*, so heading the page with it restated
the passage reference heading two lines below — while the one piece of context a part cannot
supply about itself, its series, appeared nowhere. The part still identifies itself, by that
reference heading.

This is **display only**. `study.title` and `study.subtitle` are untouched in the database and
remain what the Finder, export, and every other surface read; nothing here writes. Standalone
studies are unaffected — `seriesContext` is null and both lines come from the study, as before.

It matters most in the Document view, which prints: a handout headed "Ephesians 1" does not say
which series it came from, and "Ephesians/Colossians" does.

**Q19. Wrap around at the ends?** _Moot — no arrows._
**Q20. Prefetch adjacent parts?** _Rec: yes, phase 2 — next part's cached text on idle._
**Q21. Keyboard shortcut?** _Moot — `⌥←`/`⌥→` went with the control. Bare arrows belong to
text/segment selection, so any future shortcut still may not use them._
**Q22. Progress indicator?** _Moot — the Finder's part list is the indicator._

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

| Site                                          | Scoping                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `loadTree(dbx, passageId)`                    | Loads one passage's column/section/segment tree                                                                                                                                                                                                                                      |
| `flattenSegments()` / `flattenSections()`     | Walk that one tree                                                                                                                                                                                                                                                                   |
| `loadContext(dbx, userId, type, itemId)`      | Resolves a single `passageId` from the item and stops                                                                                                                                                                                                                                |
| Join guards                                   | Literally `'Cannot join the first segment in a passage'` — ⚠️ **no longer true of any of the three**; all three Joins route to `crossPartJoin.js` at a boundary. The strings remain in `passageJoin.js`, which is now only reached for a within-passage join, where they are correct |
| `moveSegmentTextUp/Down(..., passageId, ...)` | Takes a `passageId` outright — ⚠️ **still true of these two functions, but the endpoint now routes past them**: a cross-part move goes to `crossPartMove.js`, which resolves scope over the whole sequence                                                                           |
| `reanchorAndPrune(tx, studyId, passageId)`    | Re-anchors within one passage                                                                                                                                                                                                                                                        |
| Client guards                                 | `isActiveSegmentFirstInPassage`, `isWordInFirstSegment`, `isCaretAtSegmentStart`                                                                                                                                                                                                     |

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
canonically. Overlap is a third case, covered by neither, and is **also ineligible** — see Q40, which
is settled.

| Boundary                                       | Cross-part ops             |
| ---------------------------------------------- | -------------------------- |
| Part 3 ends Rom 3:31, part 4 begins Rom 4:1    | ✅ Contiguous              |
| Part 3 ends Rom 3:31, part 4 begins Rom 5:1    | ❌ Gap — chapter 4 omitted |
| Part 3 ends Eph 6:24, part 4 begins Phil 1:1   | ❌ Different books         |
| Part 3 is Rom 1–3, part 4 is Rom 3–5 (overlap) | ❌ Overlap — see Q40       |

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

**Q40. What do the five commands do at an _overlapping_ boundary?** ✅ **SETTLED: overlapping
boundaries are ineligible** — the first of the three options below. Q7 says overlap is normal — a
pericope straddling a chapter boundary means part 3 is Rom 1–3 and part 4 is Rom 3–5, with Romans 3
in both. "Join backwards across the boundary" then has no single meaning: the previous item in
canonical order may be in either part, and a move could silently duplicate structure or orphan it.
Overlap is neither contiguity nor a gap but a third case.

**Why ineligible, and why that is not merely the easy answer.** The commands all rest on one
question — "what is the last item before this boundary?" — and at an overlap that question has two
defensible answers. The alternative was to resolve against canonical order and accept an ambiguous
receiving part, but the ambiguity does not stay in the plumbing: it decides which part a user's note
ends up in, and the user cannot see the rule that chose. A command that silently picks one of two
readings of the text is worse than a command that declines and says why. Overlap remains a
legitimate way to _divide_ a series — nothing here restricts Q7 — it simply does not support
structural editing across the overlapping seam.

**What ships.** `classifyBoundary()` returns `'overlap'` as its own excluded state, distinct from
`'gap'`, so the disabled command can name the actual reason rather than claiming the parts are not
adjacent. Verified in `verify-series-restructure.mjs` and `verify-sequence-scope.mjs`. The old text
of this entry read "not answered, and not guessable" long after the behaviour was live and
consistent — a document disagreeing with its own implementation, which is worse than an open
question honestly marked.

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

⚠️ **Counts corrected three times, and the live-bug count is now zero.** This read "136 entries",
"142 files" and "**three**" live bugs; then 140/145 and two. Phase 1 registered `books`,
`part-split`, `part-join` and `warning` (fixing `StudyGroup.svelte:94`), and the last two — `split`
and `join` at `src/lib/utils/toolbarConfig.js:402`/`:407` — were fixed by **repointing them at the
existing `segment-split` / `segment-join`**, not by adding entries. A later pass then **replaced**
`books` / `part-split` / `part-join` with purpose-drawn `series`, `series-part`, `series-split` and
`series-join`, deleting the three superseded entries rather than leaving duplicate artwork behind
(trap 13). The registry is **142 entries** and **no referenced-but-unregistered id is live today**.
Re-count before quoting these figures; they have moved three times.

⚠️ **`icons.json` is an array, not an object — checking membership with `in` silently lies.**
While verifying this section I probed the registry with `'warning' in icons`, which tests _array
indices_, so it reported every real id absent and every integer 0–139 present. The reading was
confidently wrong in both directions and would have "confirmed" that `books` still needed
creating. Look up by `_id` (`icons.some(e => e._id === id)`), and treat any icon audit that did
not go through `_id` as unperformed.

**Reusable today** — all verified present in `icons.json`:

| Need               | Icon                             | Note                                             |
| ------------------ | -------------------------------- | ------------------------------------------------ |
| Expand/collapse    | `chevron-right` / `chevron-down` | Exactly what `StudyGroup.svelte` uses            |
| ~~Prev/next part~~ | ~~`caret-left` / `caret-right`~~ | No longer needed — in-part nav removed (§7, Q30) |
| A single study     | **`book`**                       | Already the Finder's study icon (`StudyItem`)    |
| A group            | `folder` / `folders`             | The precedent for `book`/`books` below           |
| Move Text Up/Down  | `arrow-up` / `arrow-down`        | §8's five commands need **no** new icons         |
| Delete series/part | `trashcan`                       | §4                                               |
| Series/part export | `export`                         | Q32                                              |
| Reorder runs       | `draggable`                      | §11 phase 3                                      |
| Compliance warning | `warning`                        | ⚠️ Was "**unregistered**"; registered in phase 1 |

⚠️ **`book-open` does not exist and was the previous recommendation.** This section used to list
it as reusable and then propose it for standalone studies — the section's main visual decision,
resting on an icon absent from the registry. `public/book-open.svg` exists, which is what made it
look available. Two consequences worth keeping:

- **`Icon.svelte` falls back to an empty path, so it would have rendered nothing and thrown
  nothing.** A blank space in the Finder. ⚠️ Earlier wording added "no console error" — wrong:
  `Icon.svelte`'s `getIcon()` does `console.warn(\`Icon not found: ${iconId}\`)`before returning`{ viewBox: '0 0 16 16', d: '' }`. So the failure is silent **on screen** but not in the console.
  Still a bug worth avoiding, and the fallback viewBox differs from the 32×32 norm, which would
  also mis-size a real icon; but anyone debugging a blank icon should check the console first.
- **It was churn disguised as reuse.** `StudyItem.svelte` already renders `book` at three call
  sites. "Use `book-open` for a standalone study" meant adding a missing icon _and_ restyling an
  existing element this feature has no reason to touch. **Withdrawn** — a standalone study keeps
  `book`.

**Four icons, and that is the whole cost.** ⚠️ **All four are now registered**, along with
`warning`, and the three earlier stand-ins (`books`, `part-split`, `part-join`) have been
**deleted** — purpose-drawn artwork replaced them, and keeping both would leave two glyphs meaning
"series" in a 142-entry registry (trap 13).

| Id             | Purpose                     | Design                                                                       |
| -------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `series`       | A series in the Finder      | An open pair of books over three squares — the ordered sequence made explicit |
| `series-part`  | One part, inside a series   | The same books over a **single** square: one member of that sequence          |
| `series-split` | Split into a Series / Split Part | The squares with one divided — a sequence gaining a seam                 |
| `series-join`  | Join Parts                  | The squares with a converging mark — mirror of the above                      |

**Naming follows the established object-then-verb rule**, which the whole registry obeys:
`column-split`/`column-join`, `section-split`/`section-join`, `segment-split`/`segment-join`. So
the verbs are **`series-split` / `series-join`**.

⚠️ **These were `study-split` / `study-join`, then `part-split` / `part-join`, now
`series-split` / `series-join`.** The first contradicted §3 ("Part", not "Study"). The second was
correct for its artwork — two *books* separating — but the drawn icons make the **series** the
object, and the id follows the drawing. Both old entries are gone from `icons.json`.

**Why a dedicated `series` glyph and not `books`.** The old argument was the `folder` → `folders`
precedent: a singular/plural pair already in the registry, so `book` → `books` reuses a convention
rather than inventing one. That reasoning was sound for a placeholder but the glyph was wrong —
`books` reads as "several studies", which is a *group*, and §4 spent its length rejecting exactly
that model. A series is a flat **ordered** sequence, and the drawn icon says so with numbered
squares that `books` had no way to express. The Finder now reads: `book` = one study,
`series-part` = a part of a series, `series` = the series itself, `folder` = a container.

**Why the book metaphor and not a divided page.** The old spec was "a page divided by a vertical
dashed rule … echoes `column-split` at study scale." Two objections:

1. **The format resists it.** Every icon is a _single fill-only `d` path in a 32×32 viewBox_ —
   there are no strokes, so a dashed rule means hand-placing filled rectangles, and at menu size
   they will merge.
2. **It would be the fourth confusable page-geometry icon.** `column-split`, `section-split` and
   `segment-split` are already three variations on "a rectangle divided." A fourth reads as
   another page-level command, which is the opposite of what §3's qualified-verb rule is for.

Since the geometry cannot carry the level distinction, **the metaphor must**: books for
study-level operations, bare rectangles for page-level ones. The shipped artwork keeps that rule
and sharpens it — every series icon carries the books **plus** a row of squares, so the family is
recognisable as one set and cannot be mistaken for `column-split` and friends.

**Q29 — answered: a dedicated `series` glyph.** ⚠️ **This previously read "`books`, on the
`folder`/`folders` precedent" — superseded.** Still not a folder variant (a folder is an arbitrary
container, and §4 rejected modelling a series as one), but no longer a plural-of-`book` either:
plurality says "several", and the thing that matters is **order**.
**Q30. Carets or arrows?** _Moot — the control they belonged to was removed (§7). The reasoning is
worth keeping for any future stepper: carets read as "step through a sequence" where arrows read as
"move a thing", and `arrow-up`/`arrow-down` are already Move Text Up/Down._
**Q31 — answered, then reversed: there IS a `series-part` icon.** ⚠️ This read "**no**
`series-part` icon". The reasoning was about **numbering** — a badge showing "3" would need three
digits inside 32px at 150 parts (Q10) — and that part still holds: **"Part 3 of 16" remains text**,
rendered beside the row, never drawn into a glyph. What the answer missed is that row **identity**
is a different question from numbering. A part rendered with plain `book` is indistinguishable from
a standalone study, which is precisely the distinction the Finder exists to show. `series-part`
carries no number; it marks the row as *a member of a sequence*, and the position stays text.

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

**Q41. What should a boundary move do once `enforcement` is `'block'`?** ✅ **SETTLED as the
recommendation below: a declinable pre-move confirmation, never a mid-gesture failure.** Implemented
in `crossPartJoin.js` (a `blocked` fact on the analysis, computed before any write) and
`joinRouting.js` (a 409 with the reason attached, refused before the join runs), and pinned by
`verify-enforcement-block.mjs`. Today everything is `'warn'`, so this is latent — which is exactly
why it is verified: latent code that no probe reaches is the code most likely to be wrong when
someone flips the flag. The verifier also asserts a compliant move under `'block'` still proceeds,
since blocking on `enforcement` alone would turn a licence ceiling into a ban on the feature. When
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
- ~~Header prev/next and "Part N of M" jump dropdown~~ — **built, then removed.** The Finder's
  expanded part list is the navigation; see §7
- ✅ The series icon — **as an `icons.json` entry, not a `public/` file** (§9, trap 13). Now
  `series`, not `books`; see §9. ⚠️ This continued "Register `warning` at the same time; §5's
  preview needs it and **it is missing today**" — no longer true. `series`, `series-part`,
  `series-split`, `series-join` and `warning` are all registered.
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

   ⚠️ **Superseded in part: the "yet" string is gone.** Phase 2 shipped the five commands, so a
   contiguous boundary is no longer disabled and `getBoundaryDisabledReason()` returns `null` for it
   — only the never-eligible strings remain. Leaving the "yet" copy in place after the fix landed is
   what kept all five commands greyed out at working seams; see §8's log. The reasoning above is
   preserved because the _two-kinds_ distinction it introduced is what made the never-eligible
   message correct, and that half still stands.


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
  flags are per-passage, so on their own they also fire at every _internal_ passage seam of a
  multi-passage part (§5's part-per-passage strategy) — and claiming "not available across parts
  yet" at an internal seam would be false. The analyze page therefore publishes which passage the
  selection sits in, and a part's true edges are passage `0`'s start and the last passage's end.
  ⚠️ The index is guarded as a _resolved_ value: `null` (no selection, or content still streaming)
  suppresses the note rather than guessing, because a guess there blames a part edge at an
  internal seam.

`scripts/verify-boundary-reasons.mjs` (24 checks, real `bible.json`) pins the part that matters:
the contiguous seam says "yet", the different-books seam does not, and one part's two edges can
carry different reasons.

**Phase 2 — restructuring**

- ✅ **Split Part / Join Parts — done** (+ the `series-split` / `series-join` icons — §9's names;
  these shipped as `part-split` / `part-join` and were renamed with the drawn artwork). Planning
  layer, structure transfer, both endpoints with a shared `dryRun` path, and both confirm modals.
  **Both exercised against a real database** (`probe:split-part`, `probe:join-parts`).
- **Generalise all five commands from passage scope to sequence scope** — Join Column, Join
  Section, Join Segment, Move Text Up, Move Text Down — gated on the contiguity predicate (§8).
  ✅ **DONE — all five, both directions.** `sequenceScope.js` + `boundaryMove.js` decide scope and
  ranges; the three Joins run through `crossPartJoin.js` + `joinRouting.js`; Move Text Up/Down through
  `crossPartMove.js`. Move Text additionally requires a verse-start caret (see the ⚠️ above)
- ✅ Boundary-move compliance re-validation for both parts (§10.1) — **done for Split/Join and for the
  five commands**; the cross-part join reports both studies' display warnings, and export limits are
  deliberately not re-run because §10.1 proves a boundary move is verse-conservative
- ✅ Cross-part connections: warn-and-delete — **done** (Q23 strategy (b): the count is in the preview,
  the delete needs an explicit acknowledgement). Superseded in phase 3 by edge stubs
- ✅ **"Balance by length" — done** (Q11)
- ✅ **Adjacent-part prefetch — done**, completing phase 2
- _Q40 and Q23 are **closed**, not merely unblocked — both were ratified from what was already live
  and phased; see the phase-2 note at the top of this document. Q23's last loose end,
  `countTouchingConnections()` under-reporting cross-part links, was fixed on 2026-08-10. **Q35 (undo)
  is the only question left open, and it is settled as a deliberate no** — see §11's answer and the
  standing-limitations block._

**Phase 3 — polish**

- ✅ **Cross-part connections preserved with edge stubs — done.** Q23 strategy (c) replaces (b):
  the connection is stamped with `seriesId`, the layout query widens to the series, and each part
  draws an inert labelled stub. The 409 "this will break N connections" gates are gone from both
  endpoints, because nothing is destroyed any more
- ✅ **Add a standalone study to a series — done** (Q17). §4's invariant table is honoured exactly,
  including its unevenness: a translation mismatch refuses; a gap, an overlap or a different book
  only warn. ✅ **The drag GESTURE is now wired**: dropping a standalone study on a series row opens
  the same confirmation the menu item opens, with the dropped series preselected. The drop proposes,
  it does not commit — a gap or a different book only warns, and a warning that is applied without
  being read is not a warning. The drop target is withheld for a multi-selection, a group drag or a
  study already in a series, since all three would refuse on release
- ✅ **File a SERIES into a group by dragging it — done** (Q17, extended). The series row is now a
  drag SOURCE as well as a drop target, matching the "Move to…" command that could already do it and
  the group row it is drawn to resemble. Placement only: `studySeries.groupId` moves, membership and
  `seriesOrder` do not. ⚠️ Its own `draggedSeries` array and its own endpoint — a series id PATCHed
  to `/api/studies/[id]` matches no row and reports success
- ✅ **A series PART is not draggable — done** (Q17, extended). It was, through the ordinary
  `StudyItem` wire, and a drop into a group set `groupId` on a row whose place is `seriesOrder` —
  a membership change performed silently. Refused in the composable so the multi-selection route is
  closed too, not just the direct grab
- ✅ **Reorder runs — done** (not parts — §4's run rule). `describeRuns()` reports `reorderable:
false` for a contiguous series, so the UI has what it needs to withhold a handle that could never
  do anything. ✅ **The drag HANDLE is now wired**, in `ReorderRunsModal` — where a row IS a run, so
  no available gesture can claim Romans 8 sits between chapters 3 and 4. It **adds to** the up/down
  buttons rather than replacing them (WCAG 2.1.1 stays satisfied by the buttons), and it reuses the
  same `move()` step-recorder, so a drag and a pair of button presses replay identically against the
  endpoint. The Finder's part rows still have no handle, for the reason above
- ✅ **Whole-series export compliance check — done AND wired** (Q32). Aggregates the series' full
  passage set through `validateExportLimits()` and **blocks**, where per-part export only warns.
  ⚠️ This line read "The export ROUTE is not wired — this is the check such a route must run", and
  that was **false when written**: `MenuExport.svelte` derives `seriesExportCheck` and `guardExport()`
  gives it precedence over the per-part result, honouring `blocked`. The layout supplies
  `seriesContext.parts` as `partsWithPassages` precisely so the aggregate can see every range. The
  stale claim survived because nobody re-read the component — the same drift this document exists to
  catch, recorded rather than quietly deleted

⚠️ **What "done" means here, precisely:** every phase-3 decision layer and endpoint is implemented,
verified and mutation-tested, **and all four now have a UI affordance**. The drag gesture and the
drag handle were wired last; `scripts/verify-series-drag.mjs` (20 checks) asserts the wires
themselves, because the previous state of this list is exactly what no other gate could detect: an
endpoint that is verified, mutation-tested and unreachable.

⚠️ **This paragraph twice claimed "the export menu item is still not wired", and it was wrong both
times.** The second time it was rewritten by someone who had just fixed two other wires and copied
the third claim forward without opening `MenuExport.svelte` — where the check had been wired all
along. Two lessons, and the second is the useful one: a status list is evidence about the document,
not about the code; and **the moment to distrust an inherited claim is when you are editing the line
next to it.** A `grep` for `checkSeriesExport` would have taken seconds.

⚠️ **What the drag verifier does and does not prove.** It is a static scan of the component sources,
not a rendered-DOM test: it proves the callback is called, the drop target is matched by the
attribute the row really renders, `dragover` calls `preventDefault` (without which `ondrop` never
fires, silently), and the keyboard buttons were not removed. It does **not** prove the gesture feels
right, that the ghost tracks the cursor, or that Safari agrees — those still need a human with a
mouse. It was mutation-tested: deleting the callback call and the `ondragover` binding turns three
checks red.

**Q34 — answered: yes, and the condition is met.** The recommendation was "yes, but only if the
unavailable commands are visibly disabled with a reason"; both reason strings are now wired
through (see the ✅ note above), so the conditional is discharged rather than outstanding.

⚠️ **This carried a caveat — "the reason appears only on single-passage parts" — and the caveat is
now lifted.** It was real: the store's `is…FirstInPassage` flags cannot on their own tell an
internal passage seam from a part boundary, which left a part-per-passage Prison Epistles series
(the very case §8 says will be reported as broken) silent. The fix did not need phase 2's scope
generalisation, only _passage identity_: the analyze page publishes `activePassageIndex`, and a
part's true edges are passage `0`'s start and the last passage's end. Recorded because the caveat
deferred to phase 2 a fix that turned out to be one derived value away — "phase 2 owns it" is worth
distrusting when the blocker is information the page already has.

**Q35. Scope undo before phase 2?** ✅ **SETTLED: no undo. Prevention instead of reversal —
recorded as an accepted limitation, not a solved problem.** Boundary moves are destructive and
users will expect `⌘Z`.

**The decision, and the honest reason.** The app has no undo anywhere — not for deleting a study,
not for clearing a note, not for any structural edit. Making series the first feature to demand
app-wide `⌘Z` would mean building an undo stack for every structural command in the codebase, which
is a larger project than series itself and would have blocked all of phase 2. That is the cost
inversion this question was deferred on four separate occasions to avoid stating plainly, so it is
stated here.

**What ships instead**, and it is genuinely more than nothing:

- **Every destructive command dry-runs first**, through the same function that commits. Six
  endpoints take `dryRun`, so the counts in a confirm dialog are facts about the operation, not a
  separate estimate that can disagree with it.
- **Destruction is named before it happens.** Split/Join require explicit acknowledgement when
  connections would be broken, with the count shown — `needsConnectionConfirmation`.
- **The most destructive case was removed rather than confirmed.** Phase 3's edge stubs mean
  cross-part connections are now _preserved_, so the commonest irreversible loss no longer occurs.
- **Content-bearing structure is guarded, not trusted.** `assertPassageEmpty()` rolls the
  transaction back rather than letting a cascade delete a part's notes and commentary, verified
  against a real database in `probe:join-parts`.

**What this does not do.** A user who confirms a Join Parts and then regrets it has no recourse; the
verses are re-fetchable but the structural arrangement is gone. That is a real limitation of the
feature and it is listed as item 3 in the standing-limitations block near the top of this document,
where the other limitations are, rather than only buried in this answer. If undo is
ever built app-wide, these commands are the ones to cover first — they destroy the most per
keystroke.

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

   ⚠️ **The obvious fix over-corrects, and did.** `assessPlan()` answered this by running the page
   validator across the source passages and emitting every result as an "Across the whole series:"
   notice. Under `passage-per-part` that duplicated the per-part checks outright — part _N_'s
   passages **are** source passage _N_, so the identical string was emitted twice, once prefixed
   per part and once prefixed per series. A Revelation + Matthew study produced **six** alerts of
   which three were verbatim repeats and a fourth restated the third: a wall of yellow that gets
   skimmed and dismissed, so the position the user is legally responsible for lands _less_ often
   than if fewer had been shown. Compliance noise is not free; it is paid for in attention.

   ⚠️ **RESOLVED 2026-08-28 — and the resolution is that the aggregate does not belong at
   creation at all.** Two corrections were needed, in sequence, and the first was insufficient:

   1. The notice reported a **display** violation ("the complete book of Matthew … on one
      page"). A series is many pages — separate studies at separate URLs, each its own request.
      Crossway scopes the clause "on any page", so the per-part checks already enforce it.
   2. Re-scoping it to **export** made it true but still useless: it fired on every whole-book
      ESV series, at every stepper setting, and could not be cleared by any control on the form.

   It now emits **nothing**. `MenuExport.guardExport()` runs `checkSeriesExport()` at export and
   **blocks** (Q32) — stronger than a notice, better informed (real loaded ranges), and already
   worded to tell the user to export parts separately. The trap's concern is answered at the
   boundary where the clause it protects actually applies.

   What survives at creation is the per-part check, which catches the opposite failure: **too
   few parts**. Galatians at 5 chapters per part puts 131 of 149 verses in part 1 — fetchable,
   so Save is enabled, yet over the half-book display cap. That is fixable by the stepper next
   to the message, which is the test for whether a creation-time warning earns its place.

   `verify-per-passage-parting.mjs` and `verify-chapter-verse-bounds.mjs` assert both halves:
   creation is silent for a whole-book series, **and** `checkSeriesExport()` still refuses it.
   Asserting only the first would pass equally well if the aggregate had been deleted outright.

   ⚠️ **The same defect recurred a third time, 2026-08-28, in the alert that replaced it.** The
   fix above corrected the **count** the alert was gated on and left its **sentence** hardcoded:
   `seriesWarnings.length > 0` rendered "Some parts show more of a book than ESV allows on one
   page". But `assessPlan()` pushes _two_ kinds into that array — retrieval failures
   (`reason: 'exceeds-request'`, from `checkSinglePassageSupport()`) and display violations (no
   `reason`, from `validateStudyDisplayLimits()`). Matthew at 13 chapters per part puts 532
   verses in part 2: over the 500-verse **request** cap, but only about half of Matthew, so
   almost certainly _within_ the display allowance. The alert named the wrong clause on the wrong
   axis, and did it in yellow while Save was disabled.

   It also **duplicated** the red alert above the passage list, necessarily: both resolve from
   the same `checkSinglePassageSupport()` call on the same parts, so they could never disagree
   or appear apart. One fact, two alerts, reading as two problems.

   Now partitioned on `reason` in `StudyForm.svelte` — red "too many verses … to load" for
   retrieval, yellow "more of a book than … allows on one page" for display, `{:else if}` so
   retrieval outranks display exactly as `assessPlan()` does per part. The upper alert is
   suppressed under a series; the lower one survives because it sits beside the stepper that
   fixes it and the part list that shows which part is at fault, and Save is below it either way.
   Pinned by `verify-study-size-unit.mjs` with Matthew@13 and Galatians@5 as the discriminating
   pair, plus an exhaustiveness check so a third warning kind cannot silently adopt one of the
   two sentences.

   **The lesson, stated generally:** a hardcoded sentence gated on a count is a claim about data
   it never reads. Fixing _when_ such an alert fires does not fix _what it says_ — those are two
   defects and this repository has now shipped both, twice, in the same alert. When an array
   carries tagged variants, branch on the tag or do not render prose about it.

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
    `part-join` and `warning`; `warning` is no longer in either list. A later pass replaced the
    first three with `series`, `series-part`, `series-split` and `series-join` and deleted them.
    Re-count before quoting.

    ✅ **The last two live ids are fixed, and the fix was not to add them.** `split` and `join` were
    referenced by the passage toolbar's Split Segment / Join Segment buttons
    (`src/lib/utils/toolbarConfig.js:402`, `:407`) and absent from the registry, so **both buttons
    rendered blank space** — `Icon.svelte`'s empty-`d` fallback, a console warning, no throw. They
    now point at **`segment-split` / `segment-join`**, which already existed and which
    `MenuStructure.svelte:286`/`:298` already used _for the same two commands_. So the menu drew an
    icon and the toolbar drew nothing, from one registry, for one pair of commands.

    ⚠️ **Registering `split` and `join` was the obvious fix and would have been the wrong one.** It
    would have added two bare, unqualified verbs to a registry that is uniformly object-then-verb,
    at the exact level where §3's collision rule applies — beside `column-split` and `section-split`
    in the same toolbar. The missing icon was a symptom; the wrong _name_ was the defect. Repointing
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
    block at the top of `Toolbar.svelte` — lines 30, 39 and 40, every one a `*` comment line
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

    Recorded because the missing journal entry _looks_ exactly like an oversight, and the obvious
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
    "so it is ready" is not obviously safe. A column that is _authoritative but unwritten_ is a
    latent inconsistency, and the decision to add it early is only sound when the same phase gives
    it a writer.

---

## 13. Open questions

Highest-stakes first — the first two are hard to reverse once code exists, because both are
migration shape. Q23, Q40, Q41 and Q42 all follow from the five-command decision in §8; none of
them existed in this form before it.

⚠️ **All four are now answered, and this list was the last place still saying otherwise.** As of
2026-08-10 the only genuinely open question in this section is **Q35 (undo)**, which is settled as a
deliberate *no* rather than pending. Entries below are kept with their original wording quoted, because
what each one got wrong is more useful than a clean list — three of them described as "blocking" or
"undecided" work that was already live, verified and mutation-tested.

1. ⚠️ **Q23 is answered and no longer open** — strategy **(c) preserve**, as edge stubs. This read
   "Biggest technical risk … it decides whether phase 1's migration adds `segmentConnection.seriesId`",
   and every part of it is now discharged: `0046` added the column, `preserveCrossPartConnections()`
   stamps surviving rows, the layout widens its query to the series, each part draws an inert labelled
   stub, and the 409 "this will break N connections" gates are gone because nothing is destroyed.

   The last loose thread named here — "`countTouchingConnections()` silently under-reports" — was
   **fixed on 2026-08-10**, and it outlived the rest of the answer by a full phase. Its deferral was
   conditional ("belongs to the phase shipping boundary moves"); that phase shipped, and nobody re-read
   the sentence. Same shape as COMPLIANCE.md §1.9's `maxVerses: 1000`: **a justification that depends
   on a condition must name the condition, so whoever removes it knows what they invalidated.** Proven
   by `npm run probe:conn-count` against a real database, mutation-tested.
2. ⚠️ **Q42 is answered and no longer open** — this read "**Blocks the phase-1 migration**, and
   pairs with Q23 — adding `seriesId` beside a `.notNull()` `studyId` fixes nothing, so these two
   must be decided together." Migration `0046` has shipped: `studyId` stays `.notNull()`, `seriesId`
   is nullable and additive, no `CHECK` (§4). The pairing with Q23 was real, but resolves the other
   way round — cross-part rows arrive from **boundary moves**, so Q23 above now carries it whole.
   Kept in place rather than deleted because "blocks the migration" is what made it #2, and the
   migration shipping is precisely what a future reader needs to see.

3. ⚠️ **Q40 is answered and no longer open** — overlapping boundaries are **ineligible**, resolved in
   full at §8 above. This entry read "a third case with no answer" and "blocks **two** features", both
   of which were already false: `classifyBoundary()` has returned `'overlap'` as its own excluded state
   since phase 2, `computeRuns()` ends a run there, and the disabled command names the real reason
   ("These parts overlap, so this boundary has no defined position") rather than claiming the parts are
   not adjacent. Pinned by `verify-sequence-scope.mjs` ("overlap is its own third state") and
   `verify-series-restructure.mjs` ("overlapping parts cannot be joined").

   Kept rather than deleted because the *contradiction* is the lesson: this list said "undecided" while
   §8 said "SETTLED" and the code agreed with §8. **A question is closed when the code and its
   verifier agree — not when every list has been updated.** Q7 is untouched: overlap remains a
   legitimate way to divide a series; it just does not support structural editing across the seam.
4. ⚠️ **Q4 is answered and no longer open** — `study_series` table, shipped in `0046`. This entry
   used to say it was "listed here as open, but treated as decided everywhere else", and offered a
   choice: promote it, or state what would reopen it. **Promoted.** §4's heading is "Recommendation:
   a `study_series` table", both alternatives carry explicit "**Rejected —**" subsections, phase 1
   committed to it, and the table has existed in the database for three phases. It is in the closed
   list below.

   **What would reopen it:** nothing short of needing a series to nest inside another series, which
   §6/Q14 rules out. A flat ordered sequence with invariants is what the table encodes; if series ever
   became arbitrarily nestable, `seriesParentId` would be worth re-reading — and that is a different
   feature, not a revision of this one.
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
precedent), **Q4** (`study_series` table, shipped in `0046`; `study.seriesParentId` rejected — see the
reopening condition at #4 above), **Q23** (preserve as edge stubs — strategy (c); the
`countTouchingConnections()` under-report closed 2026-08-10), **Q40** (overlapping boundaries
ineligible; `'overlap'` is its own excluded state, so the refusal names it), **Q31** (no `series-part` icon — numbering is text), **Q33** (aggregate reported at
creation, informationally; binding at export), **Q42** (`studyId` stays `.notNull()`; `seriesId`
nullable and additive; no `CHECK` — cross-part rows arrive from boundary moves, not authoring),
**Q18** (the title opens the SERIES page; `studySeries.lastPartId`, `set null`, falling back to part
1, now drives an explicit "Continue reading" button there rather than the click itself — REVISED
2026-08-29, see §Q18 for why resume-on-click made a series impossible to select), **Q43** (a part delete cannot create a compliance breach — recorded so no check is
written for it). See §14.

---

## 14. Decisions log

Decisions with live consequences. Reasoning included so they are not relitigated.

| Question                                                  | Decision                                                                             | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where limits are enforced                                 | Request at fetch, display at create/edit, distribution at export                     | Three different boundaries; conflating them is the recurring bug in this codebase                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 500-verse rule as the series trigger                      | **Rejected** as primary driver                                                       | No chapter exceeds 500 verses; multi-passage already absorbs long books                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| What the feature _is_                                     | **A series of studies that belong together**                                         | Teaching cadence, Analyze ergonomics and Finder navigability justify it; the verse caps are guardrails on parts, not the reason it exists. Not a workaround for length, and not a route to whole-book ESV study (Q1)                                                                                                                                                                                                                                                                                                                                        |
| Series / Part as the vocabulary                           | **Adopted**                                                                          | "Series" is how teachers speak and does not collide with `Connection`, which already means "link between two things"; "Part" is neutral where "Session" presumes teaching and "Chapter" collides with Bible chapters. Label reads "Part 3 of 16" (Q2)                                                                                                                                                                                                                                                                                                       |
| Split/Join collision with columns                         | **Qualify the verb by its object at study level**                                    | `column-split.svg` / `column-join.svg` / `passageJoin.js` already own the bare verbs, so study-level commands are "Split Part" / "Join Parts" / "Split into a series" — never a bare Split or Join. Divide/Merge was rejected as a second name for one concept (Q3)                                                                                                                                                                                                                                                                                         |
| Chunk NET?                                                | **Yes**                                                                              | Its cap is our own guardrail with no server-side control, so chunking routes around nothing. Psalms = 1 passage, 6 requests                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Chunk ESV?                                                | **No**                                                                               | Crossway polices completeness server-side; sub-whole chunks would each succeed and defeat a deliberate control                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Auto-split user selections                                | **Removed**                                                                          | Turning one requested passage into six was surprising; passage shape is a document-structure decision belonging to the user (former Q38)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Split rule, where it lives                                | Fetch layer only                                                                     | Chapter-boundary greedy fill, invisible to the user (`splitRangeIntoPassages`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Auto-split in the edit flow                               | **Not applied**                                                                      | Edits diff by passage `id`; split parts have none, so a remove would cascade and destroy structure                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ESV whole-book truncation                                 | **Confirmed** by probe                                                               | HTTP 200, `canonical: "Revelation 1–12:8"`, 202/404 verses, no error field — silent                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ESV truncation trigger                                    | **Completeness, not size**                                                           | Galatians (149v) halved; Romans 1:18–8:39 (208v) returned whole                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Short-book exemption                                      | **Structural, not a verse floor**                                                    | Single- and double-chapter books, six of them. No bisecting probe needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Truncation detection method                               | Verse-count ratio, not `canonical`                                                   | String comparison gave 4 false positives in 9 probes; verse counting gave 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Detection thresholds                                      | <90% **and** >15 verses short                                                        | ESV legitimately omits late-manuscript verses (Mark 9 = 48/50, John 5 = 46/47)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| "Chunking = circumvention" argument                       | **Withdrawn**                                                                        | A study can already show a whole book as several passages, so chunking reproduces no extra text with no extra requests. Replaced by "don't defeat a server-side control"                                                                                                                                                                                                                                                                                                                                                                                    |
| Hard cap on study verse count                             | **Rejected**                                                                         | Choppiness starts ~400 verses, below any round cap — a 500 cap would permit the bad case and block legitimate ones. Advisory only                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `distribution.maxBookPortion`                             | **`null` for both**                                                                  | Crossway's 50% there measures the ESV's share of the user's document, not of the biblical book                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `display.maxBookPortion`                                  | **`0.5` for ESV**                                                                    | The terms cap display per page in those words, excepting single/double-chapter books                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Safari choppiness                                         | Out of scope, tracked in §11.1                                                       | A rendering issue; must not shape the data model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Limit message attribution                                 | `source`-aware                                                                       | `validatePassageLimits` once blamed the provider for our own cap. Any new limit copy must check `source` first                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Which commands work across a part boundary                | **Join Column, Join Section, Join Segment, Move Text Up, Move Text Down — all five** | They are shipped commands with menu items and toolbar buttons, so a user reaches for them at a boundary immediately. Granularity was never ours to choose; Q24's recommendation to skip raw word moves was withdrawn because Move Text _is_ that move                                                                                                                                                                                                                                                                                                       |
| Which boundaries are eligible                             | **Canonically contiguous only**                                                      | Different books, or a gap between parts, are never joined. The predicate is "does part _n−1_ end at the word before part _n_ begins", a pure function of canonical `startingWordId` order — not "is this part _n−1_". Overlap is a third excluded state rather than a gap, so the refusal names it (Q40, settled)                                                                                                                                                                                                                                                                                                            |
| Cross-passage vs cross-part first                         | **Straight to cross-part**                                                           | The cheaper stepping stone was cross-passage-within-one-study, which is broken today and needs the same generalisation. Recorded consequence: it is fixed incidentally only if the helper takes an ordered passage sequence rather than a part pair                                                                                                                                                                                                                                                                                                         |
| Export re-validation on boundary move                     | **Not needed — provably**                                                            | Boundary moves are verse-conservative: coverage is unchanged, verses only relocate between parts, and `validateExportLimits()`'s verse-identity `Set` is indifferent to which part holds a verse                                                                                                                                                                                                                                                                                                                                                            |
| Display re-validation on boundary move                    | **Required, on both parts**                                                          | The receiver may cross `min(500, half the book)` — e.g. a part at Rom 1:1–8:25 (211 verses) tipped past 216 by a few Move Text Up gestures — and the donor's existing warning may now clear, which a stale on-screen warning would misreport. ⚠️ This cell read "Rom 1–8 sits at exactly 216": wrong, it is **225**, which already exceeds half of Romans (216.5). See §10.1                                                                                                                                                                                |
| Is a series ever created automatically?                   | **No — always opt-in**                                                               | No range length, book size or verse count triggers one. Length as a reason to restructure is the framing Q1 already rejected; letting it back in through the UI would undo that decision quietly                                                                                                                                                                                                                                                                                                                                                            |
| Default in the create-as-series offer                     | **Always "One study"**                                                               | Pre-selecting "series" for a long range is the same rejected instinct expressed as a default. Applies even to Psalms                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Series eligibility threshold                              | **Any range of 2+ chapters, never restricted**                                       | Two sessions on Haggai and three on Habakkuk are real teaching plans; there is no principle by which the app knows better. "Split into a series…" stays available from the study menu for any eligible study, so the capability never depends on the app having offered it                                                                                                                                                                                                                                                                                  |
| Solicitation threshold                                    | **Tunable UX judgement, not a constraint**                                           | Distinct from eligibility. A prompt that fires when the answer is obvious teaches users to dismiss prompts unread, which is when it stops working on Psalms. Change it freely; nothing depends on the number                                                                                                                                                                                                                                                                                                                                                |
| Chapters per part                                         | **User's choice, default 1, live preview**                                           | The preview matters more than the stepper: it is where 150 parts for Psalms becomes visible before committing (Q9)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Where the compliance position is shown                    | **At creation, live in the preview**                                                 | By export there are 21 parts holding structure and notes, and restructuring is §8's expensive operation — a warning that arrives then cannot be acted on cheaply. Per-part status, the series-level aggregate, and `checkSinglePassageSupport()` per proposed part, all recomputed as the stepper moves                                                                                                                                                                                                                                                     |
| Creation-time vs export-time strength                     | **Informational at creation, binding at export**                                     | Not an inconsistency: per-part display genuinely is compliant, so creation only informs; the aggregate is a distribution question, so whole-series export blocks (Q32/Q33)                                                                                                                                                                                                                                                                                                                                                                                  |
| May a user create a series that will fail export?         | **Yes, knowingly**                                                                   | Compliance is the study owner's obligation (`COMPLIANCE.md` §1.6) and `enforcement` is `'warn'` throughout. The alternative is refusing creation, which removes the choice §5 exists to protect. Logged so it is not later "fixed" by blocking                                                                                                                                                                                                                                                                                                              |
| Restrict series creation to contiguous same-book studies? | **No**                                                                               | It would contradict Q7/Q8, which allow non-contiguous and multi-book studies to exist, and would forbid the case needing the _least_ machinery: a Prison Epistles study divides part-per-passage with no arithmetic at all, while the contiguous case needs a stepper, a preview and chapter maths                                                                                                                                                                                                                                                          |
| What contiguity actually constrains                       | **The parting strategy, not eligibility**                                            | "Chapters per part" requires contiguous single-book text because `splitRangeIntoPassages()` takes a scalar `book`; across a gap the arithmetic is unanswerable, not merely undefined. Multi-passage studies get part-per-passage instead. Do not generalise the scalar `book` in service of the stepper                                                                                                                                                                                                                                                     |
| Part-per-passage: automatic or offered?                   | **Offered, never automatic**                                                         | Even with seams already drawn and nothing to compute, an automatic conversion would be a series imposed by the app's reading of the study's shape, contradicting "the app never decides, it offers". The absence of arithmetic is not the absence of a decision                                                                                                                                                                                                                                                                                             |
| What may be reordered                                     | **Runs, not parts**                                                                  | A series decomposes into maximal canonically-contiguous runs; runs permute freely, parts within a run are rigid, runs are never interleaved. Reuses §8's adjacency predicate, so one function governs both boundary-move eligibility and drag legality. Consequence: a contiguous Romans series is one run and cannot be reordered at all — teaching Rom 8 first means shaping the study as Rom 1–7 + Rom 8, two runs (Q5)                                                                                                                                  |
| `seriesOrder` after a mutation                            | **Left alone — canonical order seeds it once**                                       | Re-normalising from canonical order after every mutation, as two earlier passages of this document said to do, would clobber a deliberate arrangement. Explicit, seeded at creation, user-editable within the run rule                                                                                                                                                                                                                                                                                                                                      |
| Runs: stored or derived?                                  | **Derived, never stored**                                                            | Part delete, Split Part, Join Parts and boundary moves all change run membership — four chances for a stored `runId` to go stale. One helper folding the adjacency predicate over parts in canonical order; three callers                                                                                                                                                                                                                                                                                                                                   |
| On series delete                                          | **Cascade — everything goes**                                                        | Reverses the earlier `set null` recommendation (Q6). Matches `0009_cascade_delete_studies.sql`, and dissolves the cross-part-connection problem via the FK. Cost: one action destroys every part's structure, notes and commentary, so the confirmation must state the part count and irreversibility                                                                                                                                                                                                                                                       |
| Deleting a single part                                    | **Allowed, warned; the run splits in two**                                           | The part's verses leave the series entirely — handing them to a neighbour would be Join Parts under the wrong name. Three consequences the warning must name: that seam is permanently dead for all five structural commands, previously-rigid parts become reorderable, and the series is now non-contiguous (Q7). Deleting to one part dissolves the series into a standalone study                                                                                                                                                                       |
| `segmentConnection.studyId`                               | **Stays `.notNull()`; `seriesId` added nullable (Q42, shipped in `0046`)**           | ⚠️ This read "**Must change; strategy open (Q42)**". Neither branch was taken: cross-part connections cannot be _authored_ (two parts are never on screen together), so they arrive only when a **boundary move** slides under a link drawn inside one part. A `CHECK` would therefore not block a bad gesture — it would decide the fate of already-valid user work mid-move. Under-reporting in `countTouchingConnections()` was real and is now **fixed** (2026-08-10): it filters on `studyId OR seriesId`, the same predicate the layout uses to draw edge stubs, so the Join confirm modal and the rendered page cannot disagree. The deferral said it "belongs to the phase shipping boundary moves" — that phase shipped, which expired the condition, and the fix waited only because nobody re-read the sentence. Proven by `npm run probe:conn-count` (6 checks, real database), mutation-tested by reverting the argument. See §4 |
| Icon for a standalone study                               | **`book` — unchanged**                                                               | Reverses the earlier recommendation of `book-open`, which is **not in `icons.json`** and would have rendered as blank space via the documented missing-icon fallback. `StudyItem.svelte` already uses `book` at three call sites, so the old advice was churn dressed as reuse (trap 13)                                                                                                                                                                                                                                                                    |
| Icon for a series                                         | **`series`** (was `books`)                                                           | ⚠️ Reverses the `folder` → `folders` precedent argument. That justified a *placeholder*; the glyph itself was wrong, because plurality reads as "several studies" — a group — and §4 rejected modelling a series as one. A series is an **ordered** sequence, which purpose-drawn artwork can say and a plural cannot. `books` is deleted from the registry. The Finder reads `book` = study, `series-part` = part, `series` = series, `folder` = container (Q29)                                                                                            |
| Icon for a part of a series                               | **`series-part`** (was `book`, shared with standalone studies)                       | A part drawn with plain `book` is indistinguishable from a standalone study — the one distinction the Finder exists to draw. Passed as a prop from `StudySeries.svelte` rather than branched inside `StudyItem.svelte`, which renders every study in the app and defaults to `book`. Does **not** carry the number; see the Q31 reversal in §9                                                                                                                                                                                                              |
| In-part prev/next navigation                              | **Built, then removed**                                                              | The Finder already lists every part of an expanded series, in order, with titles visible, and stays open while the study is read. A second view-local navigator duplicated that with a worse affordance — a bare arrow pair showing one part's name at a time — while adding a `<nav>` to the Analyze titling row and a chrome bar above the Document gutter that had to be kept out of both the paginator's measurements and print. Took `SeriesPartNav.svelte`, `seriesContext.previousPart`/`nextPart`, and `⌥←`/`⌥→` with it. `seriesContext` itself stays: §8's boundary reasoning and §10's export check both read it (§7, Q19/Q21/Q22/Q30 now moot) |
| What titles a part's study page                           | **The series name + series subtitle**, not the part's own                            | Removing the nav removed the only place a part's page named its series. A part's title is *derived from its range*, so heading the page with it restated the passage reference two lines below while the part's actual context — which series it belongs to — appeared nowhere. The part still identifies itself by that reference heading. Display only: `study.title`/`study.subtitle` are untouched in the database and still drive the Finder, export and everything else. Matters most in Document, which prints — a handout headed "Ephesians 1" does not say where it came from (§7) |
| What a part's Finder row shows                            | **Its passage reference, on one line** (`referenceAsTitle`)                          | Same derived-title problem, other surface: the default two-line row printed "Romans 1" directly above "Romans 1:1-32" — the same fact twice, at double the row height, times 16 or 150 parts. The reference is the more precise of the two, so it is the one that stays. Standalone and grouped studies keep both lines, because their titles are authored rather than derived and carry meaning the reference cannot (§6) |
| Which Finder rows can be dragged                          | **A series can (into a group); a part cannot (anywhere)**                            | Both had defaulted rather than been decided. A series occupies its own Finder slot (§4) and "Move to…" could already file it, but `onSeriesMouseDown={null}` meant the gesture could not — two answers to "is a series movable", depending on the affordance reached for. A part's place IS its series (`seriesOrder`), so dragging one into a group is a membership change wearing a placement gesture, performed silently, when every legitimate exit states its consequences first (Delete Part, Join Parts, extent review). ⚠️ The part refusal lives in the composable, not in `StudySeries`: a part also travels inside a multi-selection grabbed by a standalone study, which no guard in that file could see. Series get their own `draggedSeries` array — sharing `draggedStudies` would PATCH `/api/studies/[id]` with a series id, which matches nothing and reports success (Q17) |
| What a generated part is CALLED                           | **Its full passage reference** — `Romans 1:1-32`, from the book name                 | `partTitle()` is the single source of every part name: two creation previews, Join/Split Part's copy, the review page's deleted-part and discarded-title lists, and the delete-consequence sentences all render it, so fixing any one surface puts it at odds with six others. `Romans 1` also *dropped information that matters at a range's edges* — Rom 1:18–8:39 produced a part titled "Romans 1" that does not begin where Romans 1 begins (Q12). Converges with Split Part, which always named its new part this way. Hyphen via `formatPassageReference`, matching the Finder. Study title no longer leaks in — a citation must open with a book name. **No migration**: `study.title` is user-editable and a rename is indistinguishable from a generated title, so rewriting would destroy renames (§6) |
| What the series landing page shows                        | **No part count; Continue names the part by reference**                               | `/series/[id]` carried a `Series · N parts` line because the page should name the thing the way the row that led there does — and that reasoning is what removed it, since the row no longer says it (Q16). The emptiness case already covers the one count that changes what the user can do. Its button became `Continue: Ephesians 1:1-23 [ESV]` for the same derived-title reason as the part rows; the reference is built in the page loader from passages it already fetched, so there is no extra query (§6) |
| Split/Join Part icon names                                | **`series-split` / `series-join`** (was `part-split` / `part-join`)                  | Third naming: `study-split`/`study-join` contradicted §3's "Split Part"/"Join Parts"; `part-split`/`part-join` matched *its* artwork (two books parting) but the drawn icons make the **series** the object, and the id follows the drawing. Still object-then-verb, as the whole registry is (`column-split`, `section-join`, `segment-split`). Both old entries deleted                                                                                                                                                                                   |
| Split/Join Part icon design                               | **The book metaphor, not a divided page**                                            | Icons are a single fill-only `d` path in a 32×32 viewBox, so the old "vertical dashed rule" needs hand-placed rects that merge at menu size. And it would be a fourth variation on "a divided rectangle" beside the three page-level split icons. The geometry cannot carry the level distinction, so the metaphor must                                                                                                                                                                                                                                     |
| Icon cost of the five commands                            | **Zero**                                                                             | Move Text Up/Down already use `arrow-up`/`arrow-down`, and the three Joins already have icons. §8's commitment adds no icon work — four entries total for the whole feature (`series`, `series-part`, `series-split`, `series-join`), plus `warning`, and the three placeholders they replaced were deleted so the net registry growth is one. ⚠️ This cell ended "plus registering `warning`, **which is already broken**" — all four are now registered (phase 1), so the whole icon cost of this feature is paid. `split` / `join` were not ours either, and are fixed by repointing at the existing `segment-split` / `segment-join` — no new artwork (trap 13) |
| Auto-select on a series page                             | **Latched on the active id changing, like the study branch**                         | Clicking a series' first part left the SERIES highlighted. `goto()` is async, so the auto-select effect re-ran while the URL was still `/series/[id]`: the part had just replaced the series in the selection, which made `!isItemSelected('series', ...)` true, so the branch re-imposed the series. Intermittent because the study branch usually repaired it on arrival — unless the part was already `previousActiveStudyId`, in which case that branch skipped its own auto-select and the stale series selection survived. `previousActiveSeriesId` must be RESET in the other branches or it fires once per session
