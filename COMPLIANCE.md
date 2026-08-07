# Scripture Licensing & Compliance

How Expositor stays within its Bible-text licences, and **why** the rules are enforced
where they are. Read this before changing anything in `translations.json` under
`api.requestLimits`, `restrictions.display` or `restrictions.distribution`.

**Status:** current posture, single-user (developer-only) deployment.
**Last reviewed:** 2026-08-07 — **substantially corrected after reading the actual ESV
API terms** (<https://api.esv.org/>, retrieved 2026-08-07). Several conclusions in the
previous revision were wrong; see §1 and §3.

**Disclaimer:** this document records engineering reasoning, not legal advice. The open
items in §5 should be confirmed with Crossway before public release.

---

## 0. What changed on 2026-08-07, and why it matters

Earlier revisions of this file reasoned from the copyright-page paragraph and from
observed API behaviour, **without anyone having read the ESV API Terms of Use.** That
produced a confident, internally-consistent, and partly wrong document. The terms
turned out to answer directly several questions this file had treated as open, and to
contradict its central claim.

| Previous claim                                    | Reality per the API terms                                     |
| ------------------------------------------------- | ------------------------------------------------------------- |
| On-screen display has no book-portion limit       | **False.** Display is capped explicitly, per page             |
| "Half a book" is not a request limit              | **False.** It is stated as a per-query limit                  |
| The ~50% truncation is a probable provider defect | **Documented enforcement** of that query limit                |
| An unmeasured "completeness floor" exists         | **No floor.** Single/double-chapter books are simply excepted |
| Distribution ceiling is 1,000 verses              | **500** for text obtained via the API                         |
| No fraction-of-the-book rule exists               | It exists, alongside the fraction-of-the-work rule            |

**The lesson, recorded deliberately:** the reasoning was sound and the sources were
not checked. Plausibility is not verification. Where this file now states a licence
term, it quotes it and cites where it came from.

---

## 1. The core distinction

**Three** different rules govern what we do with ESV text. They come from different
places and govern different acts; conflating them caused a real bug (§3).

|                         | Source document                            | Governs                                       | Enforced                       |
| ----------------------- | ------------------------------------------ | --------------------------------------------- | ------------------------------ |
| **Request limits**      | ESV **API Terms of Use**                   | One HTTP request                              | Fetch time — study create/edit |
| **Display limits**      | ESV **API Terms of Use**                   | How much is on one **page**                   | Study create/edit — see §1.6   |
| **Retrieval policy**    | Provider behaviour + published query limit | Whether SEVERAL requests assemble one passage | Fetch time — see §1.5          |
| **Distribution limits** | ESV **API terms** + quotation permission   | Reproducing text in a distributable work      | Export/print time              |

### The terms, quoted

From <https://api.esv.org/> (retrieved 2026-08-07):

> "You may request up to **500 verses per query, or half a book, whichever is less**
> (excepting single-chapter and double-chapter books)."
>
> "You may not **display** more than 500 verses or one-half of any book (whichever is
> less) **on any page**."
>
> "You may not **locally store** more than 500 verses or one-half of any book of the
> Bible (whichever is less)."
>
> "You may **distribute up to 500 verses**, as long as the verses quoted do not amount
> to 50% of a complete book of the Bible and do not make up 50% or more of the total
> text of the work in which they are quoted."

### The claim this replaces

This section previously argued that **on-screen study is service operation, not
publication**, and therefore that no book-portion limit applied to display. The
distinction is defensible in the abstract, and it is beside the point: the API terms
restrict **display** in their own words, whatever one concludes about publication. That
argument has been withdrawn.

### The single/double-chapter exception

The parenthesis in the first clause is the key to behaviour that previously looked
mysterious. Six books have ≤2 chapters, verified against `bible.json`:

| Book      | Chapters | Verses | Whole-book study? |
| --------- | -------- | ------ | ----------------- |
| Obadiah   | 1        | 21     | ✅ permitted      |
| Philemon  | 1        | 25     | ✅ permitted      |
| 2 John    | 1        | 13     | ✅ permitted      |
| 3 John    | 1        | 14     | ✅ permitted      |
| Jude      | 1        | 25     | ✅ permitted      |
| Haggai    | 2        | 38     | ✅ permitted      |
| Galatians | 6        | 149    | ❌ half only      |
| Romans    | 16       | 433    | ❌ half only      |

These six are the **only** books the ESV permits displaying in full, and the exception
also explains why Crossway's server returns them intact — the carve-out is in the same
sentence as the cap. The user's own heuristic turned out to be exactly right: _if they
return the whole book, I may display the whole book._

### The probe evidence: completeness, not size

Direct requests against the ESV API, 2026-08-07. Every response was **HTTP 200 with no
error field** — `canonical` is the only signal that anything was withheld:

| Requested                  | Verses | Returned | canonical           |
| -------------------------- | ------ | -------- | ------------------- |
| Revelation (whole)         | 404    | 202      | `Revelation 1–12:8` |
| Romans (whole)             | 433    | 216      | `Romans 1–8:30`     |
| Galatians (whole)          | 149    | 74       | `Galatians 1–3`     |
| Romans 1:18–8:39 (partial) | 208    | **208**  | `Romans 1:18–8:39`  |

The last two rows are the ones that matter. Galatians is **149 verses and still halved**;
Romans 1:18–8:39 is **208 verses and returns whole**. So the trigger is not a verse count —
it is whether the request names a **complete book**.

⚠️ **This retires the "verse floor" theory.** Because Philemon and Jude return intact, it
is natural to infer some size threshold below which whole books are served, and to go
looking for it by bisecting book sizes. There is no such threshold: those books are exempt
because they have **one chapter**, per the parenthesis quoted above. A bisecting probe over
book sizes would have found no boundary and produced a confident wrong number. One such
probe was planned and cancelled on reading the terms.

### Detecting the truncation — why two thresholds, not one

`fetchESVPassage()` compares verses received against `countVersesInRange()` and flags
truncation only when **both** conditions hold:

| Condition              | Value          | Why it is needed                                          |
| ---------------------- | -------------- | --------------------------------------------------------- |
| Proportional shortfall | received < 90% | Catches the ~50% half-book cut                            |
| Absolute shortfall     | > 15 verses    | Prevents false positives on legitimately short deliveries |

⚠️ **The ESV omits some verses on purpose, and a naive check flags them as truncation.**
Verses attested only in later manuscripts are absent from the text: **Mark 9 returns 48 of
50**, and **John 5 returns 46 of 47**. Neither is a licence event, and neither is flagged,
because each falls short by fewer than 15 verses. Remove the absolute condition and both
become spurious warnings on ordinary chapters.

Detection deliberately does **not** parse `canonical`. String comparison against the
requested range gave **4 false positives in 9 probes** — the API's own formatting of a
reference differs harmlessly from ours. Verse counting gave none.

### Current posture — what we do, and what we knowingly do not

Functionality is **unchanged by decision** (2026-08-07). Crossway enforces server-side
what they can observe and rely on the licence for the rest. Recording the gaps here
rather than closing them all is a choice, not an oversight:

| Clause                             | They can enforce?          | Our position                                            |
| ---------------------------------- | -------------------------- | ------------------------------------------------------- |
| Half a book **per query**          | ✅ Server-side truncation  | Compliant — necessarily                                 |
| Half a book **displayed per page** | ❌ Cannot see our DOM      | **Now warned** at study level (§1.6)                    |
| ≤500 verses **locally stored**     | ❌ Cannot see our database | ⚠️ **Not compliant.** `passage.cachedText` is unbounded |
| ≤500 verses **distributed**        | ❌ Cannot see our exports  | Checked, but the checker has no caller (§5)             |

| Surface                                 | Rule applied                                                                |
| --------------------------------------- | --------------------------------------------------------------------------- |
| **On-screen study** (Analyze, Document) | 500 verses per request; ≤50% of a book per page, warned, short books exempt |
| **Export / Print** (PNG, PDF, print)    | Not a complete book; attribution mandatory. Verse ceiling — see §5          |

---

## 1.5 The third axis: retrieval

_Added 2026-08-07. This was missing, and its absence is why §3 below contains an
argument that had to be withdrawn._

Request limits and distribution limits are both about **quantity**. Retrieval is about
**method**: may a single passage be assembled from several sequential requests?

```
api.retrieval.chunking   NET: true      ESV: false
```

It depends on a fact about each provider:

|         | Where the cap comes from                   | Server-side completeness control?                  | Chunk? |
| ------- | ------------------------------------------ | -------------------------------------------------- | ------ |
| **NET** | Our own guardrail (`source: self-imposed`) | No                                                 | ✅ Yes |
| **ESV** | Crossway, **published**                    | **Yes** — whole-book requests silently return ~50% | ❌ No  |

**The principle: do not route around a control a provider deliberately applied.**

Crossway enforces the half-book query limit on their server. Ask for a whole book and
you get half of it — HTTP 200, no error field, `canonical` quietly narrowed. Sub-whole
chunks would each succeed, so stitching them would hand us text their server declined to
serve in one piece.

**Correction (2026-08-07):** this section previously described the truncation as merely
"observed provider behaviour," a fact about their server with no document behind it.
It is in fact enforcement of a **published term** — "up to 500 verses per query, or half
a book, whichever is less." Chunking ESV would therefore circumvent a **licence term**,
not just a server control. The conclusion is unchanged; the ground under it is firmer.

NET has no such control, and its 500-verse cap is **ours**. Chunking it routes around
nothing. Psalms is one passage fetched as six requests.

### ⚠️ What this principle is _not_

It is **not** "assembling a whole book from several requests reproduces too much text."
That argument is false, and §3 below records it being made. It fails because a study can
**already** display a whole book as several passages — same text, same number of
requests, no new feature required. An argument that condemned chunking on those grounds
would equally condemn multi-passage studies, which are the intended mechanism.

The objection to chunking ESV is narrow and factual: **a deliberate, published control
would be defeated.**

### ⚠️ And the limit of "let their server arbitrate"

This section's practical advice was: don't interpret the licence, let Crossway's server
decide what we may retrieve. That is sound **for one passage**, and it silently stops
working for a study — see §1.6, which is the third instance of this document's recurring
error, measuring at the request boundary when the rule is written about the page.

---

## 1.6 The multi-passage display gap

_Added 2026-08-07, after the user asked the right question._

The reasoning in §1.5 — let Crossway's server arbitrate — has a hole, and it is worth
stating precisely because the same shape of error has now occurred three times in this
document.

**The rule is about the page:**

> "You may not display more than 500 verses or one-half of any book (whichever is less)
> **on any page**."

**Server arbitration is per query.** One passage is one query, so for a single passage
the two coincide and their truncation is sufficient. A **study**, however, may hold
several passages:

| Study                             | Queries | Each compliant? | Page result            |
| --------------------------------- | ------- | --------------- | ---------------------- |
| Galatians 1–6 (one passage)       | 1       | —               | Truncated to 74/149 ✅ |
| Galatians 1–3 **+** Galatians 4–6 | 2       | ✅ 74 + 75      | **Complete book** ❌   |
| Romans 1–8 **+** Romans 9–16      | 2       | ✅ 208 + 225    | **Complete book** ❌   |

Two individually-permitted queries assemble one page that the licence does not permit.
**Crossway's server cannot see the assembled page — only we can.** So the arbitration
principle silently stops covering the case, with nothing in the app noticing.

Note the corroboration: Galatians 1–3 is **74 verses**, exactly the count Crossway's
server returns when asked for the whole book. The same figure arrived at independently
from `bible.json` arithmetic and from their truncation confirms the half-book rule is
what the server enforces.

### The fix

`validateStudyDisplayLimits(passages, translationId)` aggregates verse coverage **per
book across all of a study's passages** and compares against half the book, applying the
single/double-chapter exception. Verse identities go into a `Set`, so overlapping
passages (Galatians 1–3 + 3–6) count chapter 3 once rather than twice.

Surfaced in `StudyForm` as a yellow advisory alert.

### Why it warns rather than blocks

Chosen deliberately (option "B", 2026-08-07):

- It matches `enforcement: 'warn'`, the existing posture for every licence limit here.
- A study grows over time. Blocking would refuse to save at the moment a passage tips it
  over, stranding work already done — the worst possible moment to enforce.
- Compliance is the study owner's obligation; the app's job is to make the position
  visible, not to decide it for them.
- Tightening later is a one-word JSON edit: `"enforcement": "block"`.

The mechanism now exists and is exercised, so if licensing becomes binding at release the
decision is a data change rather than a feature to discover and build under pressure.

---

## 1.7 "Whichever is less" is one limit — the fourth instance of the same error

_Added 2026-08-07, after the user pointed at a form showing four alerts at once._

Selecting the whole of John produced **four** simultaneous alerts, two of which restated
each other. The cause was the clause in §1.6 being implemented as **two independent
checks that both fired**:

> "500 verses **or** one-half of any book **(whichever is less)**"

That is a single limit with two inputs, and `min()` is doing real work in it. Splitting
it into separate checks meant any single-book study over the line warned twice at two
different thresholds — for John, "at most 500" beside "at most 439" — when only the
smaller number ever binds. Same failure as §0, §1.5 and §1.6: **the numbers were
transcribed correctly and the sentence's logic was dropped.** Fourth instance.

### The fix

Resolve the limit per book before reporting: `min(maxVersesPerPage, bookTotal ×
maxBookPortion)`, then emit one message naming the number that actually binds and why —
_"ESV allows at most 439 — half of John — on one page."_

The 500-verse check is **not** redundant in general, so it is kept for the case where it
binds alone. It is now gated on `reducedTotal`: what the study would display if every
over-limit book were trimmed to its own limit. If that is still over 500, the total is
independently binding and worth saying; otherwise the per-book warnings already covered
it. Matthew 1–10 + Luke 1–8 is the case that needs it — 723 verses with neither book past
half.

Verified across single-book, multi-book, overlapping, short-book and
just-over-the-threshold studies; every case now yields exactly one warning:

| Study                      | Warning                                    |
| -------------------------- | ------------------------------------------ |
| John whole (879)           | complete book, at most **439** — half      |
| Galatians 1–3 + 4–6 (149)  | complete book, at most **74** — half       |
| Romans whole (433)         | complete book, at most **216** — half      |
| Psalms whole (2,461)       | at most **500** — page cap binds, not half |
| Matthew 1–10 + Luke 1–8    | **723 across 2 books**, at most 500        |
| Jonah whole (4 ch, 48)     | complete book, at most **24** — half       |
| Philemon / Jude / 2–3 John | none — single-chapter exception            |
| Haggai whole (2 ch)        | none — double-chapter exception            |
| Galatians 1–3 alone (74)   | none — exactly half, compliant             |

Psalms is the case proving both branches are needed: half of Psalms is 1,230, so the
500-verse page cap is what binds, and the message says so rather than citing half.

### Two further defects found in the same pass

1. **A remedy that could not work.** The blocking retrieval error advised "Add it as
   several smaller passages" for a complete book. Splitting fixes _retrieval_ and does
   nothing about the _display_ limit — §1.6 is precisely the case where several legal
   queries assemble an illegal page. A user following that advice would clear the error
   and be met by the display warning for the same underlying reason. The message now
   states that the whole book is unavailable in this translation by any route, and names
   the only two honest remedies: a shorter range, or a different translation.

2. **An internal id leaked into user copy** — "the complete book of **JN**".
   `checkSinglePassageSupport()` was not using `bookMeta.title` the way the newer
   validator was. Fixed.

### Alert stacking

Both advisories are now suppressed while a **blocking** retrieval error is present. The
performance note describes how a study would perform once saved, and the display notice
restates part of what the blocker already explains — neither is useful advice about a
study that cannot be saved. They reappear once the blocker is resolved, if they still
apply. Four alerts became one while blocked, and one after.

The performance note is deliberately **not** merged into the licence warning: one is our
own rendering guess, the other is a published restriction, and §6 rule 6 exists to keep
those distinct.

---

## 2. Where each rule lives in code

Single source of truth is `src/lib/data/translations.json`. No limit is hard-coded.

```
api.requestLimits.maxVerses          → getRequestLimits()      → validatePassageLimits()
api.retrieval.chunking               → getRetrievalPolicy()    → fetchPassageText() chunk loop
restrictions.display.*               → getDisplayLimits()      → validateStudyDisplayLimits()
restrictions.distribution.*          → getDistributionLimits() → validateExportLimits()
```

The four validators answer four different questions. Using the wrong one is how this
document's recurring error keeps happening:

| Function                       | Question                                 | Scope          |
| ------------------------------ | ---------------------------------------- | -------------- |
| `validatePassageLimits()`      | Can the API serve this **one range**?    | One request    |
| `checkSinglePassageSupport()`  | Can this range be **one passage**?       | One request    |
| `validateStudyDisplayLimits()` | May this much be **displayed together**? | Whole study    |
| `validateExportLimits()`       | May this much **leave the app**?         | Whole artifact |

Both accessors and validators are in `src/lib/utils/translationLimits.js`.

`splitRangeIntoPassages()` divides one passage into the requests needed to fetch it;
`fetchPassageText()` in `src/lib/server/bibleApi.js` concatenates the responses.

⚠️ **`validatePassageLimits()` is a no-op for chunkable translations.** When
`getRetrievalPolicy().chunking` is true it returns valid unconditionally, because the
request cap is then a transport parameter with no passage-level meaning. Do not read a
passing validation as "this range is small" — for NET it always passes.

`checkSinglePassageSupport(range, translationId)` answers the different question the UI
needs: can this translation serve this range as _one_ passage, and if not, why —
`'exceeds-request'` or `'complete-book'`.

**One limit in this area is not a licence limit at all.**
`src/lib/config/studyLimits.js` holds _our_ advisory thresholds on total study size
(600 / 1,200 verses, `assessStudySize()`), which exist for rendering performance. It
lives in `src/lib/config/` rather than `translations.json` deliberately: filing our own
numbers beside publisher limits is precisely the mistake §3 documents.

`restrictions.distribution.enforcement` is `'warn'` or `'block'`, per translation.
Today both translations are `'warn'`. Flipping to `'block'` at public release is a
JSON edit — no code change. This is the main reason the seam was built now.

---

## 3. The bug this structure fixed

> ⚠️ **This section was substantially corrected on 2026-08-07.** Its original claim was
> that `maxBookPortion: 0.5` under `api.requestLimits` was "a publication rule filed at
> the fetch boundary" — a copyright rule in the wrong block. **That diagnosis was wrong.**
> The ESV API terms state a half-book limit **as a per-query limit**, in the API terms
> themselves: "up to 500 verses per query, or half a book, whichever is less." So the
> rule genuinely belonged in `api.requestLimits`. What was wrong was the **missing
> exception** and the **missing distinction from the distribution rule** — not its
> location. See "What was actually wrong" below.

`maxBookPortion: 0.5` was stored under `api.requestLimits` and enforced by
`validatePassageLimits`, with **no single/double-chapter exception**.

The effective per-passage cap became `min(500, ½ book)`. Only 24 of 66 books exceed
500 verses, so for most of the Bible the binding limit was half-a-book — well under 500. Verified against `bible.json`:

| Book        | Verses | Old effective cap | Whole book studyable? |
| ----------- | ------ | ----------------- | --------------------- |
| 3 John      | 14     | 7                 | ❌                    |
| 2 John      | 13     | 6                 | ❌                    |
| Philemon    | 25     | 12                | ❌                    |
| Jude        | 25     | 12                | ❌                    |
| Obadiah     | 21     | 10                | ❌                    |
| Titus       | 46     | 23                | ❌                    |
| Philippians | 104    | 52                | ❌                    |
| Galatians   | 149    | 74                | ❌                    |
| Romans      | 433    | 216               | ❌                    |

**All 66 books failed.** No complete book of the Bible could be studied, in any
translation. A 25-verse letter had to be broken into two studies.

### What was actually wrong

The symptom above was real. The **diagnosis** was not. Three distinct faults were
collapsed into one, and only the first was correctly identified at the time:

| Fault                                               | Real?  | Correctly diagnosed?                         |
| --------------------------------------------------- | ------ | -------------------------------------------- |
| Every book unstudyable, including 25-verse Philemon | ✅ Yes | ✅ Yes                                       |
| **Missing single/double-chapter exception**         | ✅ Yes | ❌ **No — this was the actual cause**        |
| Rule filed in the wrong block                       | ❌ No  | ❌ It belonged there                         |
| The half-book limit doesn't exist as a query rule   | ❌ No  | ❌ It is published, and enforced server-side |

The licence says "half a book **(excepting single-chapter and double-chapter books)**."
The code implemented the cap and dropped the parenthesis. That is why Philemon — a
single-chapter book the ESV explicitly permits whole — was capped at 12 verses. The rule
was right, the exception was missing, and removing the rule outright cured the symptom
while discarding a legitimate provider limit.

**The deeper error, and the reason this section is worth keeping:** nobody had read the
API terms. A plausible story was constructed from the copyright-page paragraph — that a
publication rule had been misfiled — and it fitted the evidence well enough that it was
never checked against the source. It then compounded: §5 of this document was drafted to
report the truncation to Crossway as a **defect in their service**, when it is their
documented enforcement of the very clause the code had mis-implemented.

Verified 2026-08-07 against `bible.json`: the six ≤2-chapter books are Obadiah, Haggai,
Philemon, 2 John, 3 John and Jude.

### Why splitting the API call was not the fix — and the flawed version of that argument

The obvious workaround was: fetch Philemon 1–12 and 13–25 in two calls, then display all
25 verses. Rejecting it was right, but the **reason first given was wrong**, and it is
recorded here because it went on to cause a second error elsewhere.

**The flawed argument:** _"Two calls rendered on one screen reproduce 100% of Philemon,
legally identical to one call."_

The trouble is that this proves far too much. Multi-passage studies **already** reproduce
100% of Philemon on one screen, via exactly the same two requests, and multi-passage is
the intended mechanism — the same section that made this argument recommends it. Taken
seriously, the argument forbids the very fix being proposed.

The error was measuring a quantity at the wrong boundary — though note the sub-argument
"on-screen display is not distribution, so quantity is not the question" is **itself now
withdrawn** (§1). Display _is_ limited, by the API terms. The multi-passage rebuttal above
still stands on its own: chunking reproduces nothing that multi-passage does not.

**Why splitting genuinely wasn't the fix:** for Philemon it was never needed — a
single-chapter book is excepted, so the correct fix was to honour the exception. For a
longer book it would circumvent a published query limit (§1.5).

The real conclusion, which took three passes to reach: **whole-book ESV study is not
available under these terms at all**, except for the six short books. Not by chunking,
not by multi-passage — the display clause covers the page however it was assembled.

### After

- `maxBookPortion` removed from `api.requestLimits` for both translations.
- 42 of 66 books fit in a single passage; the other 24 need several passages, bounded by
  the 500-verse API ceiling.
- Complete-book and portion checks run in `validateExportLimits()` for exports and, since
  2026-08-07, in `validateStudyDisplayLimits()` for on-screen studies — both aggregated
  **per book across all passages**, so Romans 1–8 + Romans 9–16 is recognised as a
  complete book however it was assembled.

⚠️ **The half-book limit was not restored to `api.requestLimits`,** though the terms would
justify it. Crossway already enforces it server-side, and duplicating it would give one
rule two error paths — with ours firing first and attributing the refusal to us. It is
enforced instead where their server has no visibility: at study level (§1.6). Functionality
is deliberately unchanged; see "Current posture" in §1.

### NET

NET's half-book cap was **self-imposed**, not published by the provider — the old JSON
comment said so explicitly. NET is free-with-attribution and sets no verse or
book-portion limit on distribution, so `maxBookPortion` and `maxVerses` are now `null`
and `allowCompleteBook` is `true`. Attribution remains mandatory.

---

## 4. Attribution

Both publishers require their notice wherever their text appears.

| Surface                       | Status                                         |
| ----------------------------- | ---------------------------------------------- |
| Analyze (on screen)           | ✅ `.copyright-notice` in the scroll container |
| Document (on screen)          | ✅ flows as the final `doc-flow-item`          |
| Document print                | ✅ inherited from the Document DOM             |
| **Analyze PNG / PDF / print** | ✅ **fixed 2026-08-03 — was missing**          |

### The gap that was found and fixed

Analyze exports capture `.analyze-content-inner`. The copyright notice is deliberately
a **sibling outside** that element, so it stays a constant readable size instead of
scaling with the zoom transform. Consequence: **every PNG, PDF and printout was
produced with no attribution at all** — the exact artifacts where attribution matters
most, since they can be shared with no surrounding context.

Fixed by `attachExportAttribution()` in `exportAnalyze.js`, which clones the live
notice into the captured subtree before measuring and removes it in `restore()`.
It clones rather than duplicating the legal text so the two copies cannot drift.

---

## 5. Open items

1. **⚠️ Local storage exceeds the licence — the one genuine violation.**

   > "You may not locally store more than 500 verses or one-half of any book of the
   > Bible (whichever is less)."

   `passage.cachedText` (migration 0035) persists fetched ESV text **indefinitely and
   without bound**. A user with several studies is over 500 verses quickly, and nothing
   caps, ages out or clears it. `restrictions.caching.maxVerses: 500` is recorded in the
   JSON and **read by nothing**.

   Previously filed as item 5, "worth a look." That was too mild: the other gaps in §1
   are positions one could defend, whereas this one contradicts an explicit clause. It is
   listed first because it is the only item here that is simply wrong rather than
   arguable.

   Likely remedies: a TTL on `cachedText`, eviction once the total passes 500 verses, or
   a back-office "clear cached Scripture" action. Note the clause governs _storage_, not
   _display_, so clearing the cache does not restrict what a user may study — the text
   is re-fetched on demand.

2. **Optional: ask Crossway about a whole-book licence tier.** Genuinely optional; the
   answer under the current terms is already plain, and nothing is blocked meanwhile.

   ### ⚠️ Two things NOT to ask — both were previously drafted here

   **Do not report the truncation as a bug.** An earlier revision of this section
   included a detailed defect report about whole-book requests returning ~50% with no
   error. **That is documented behaviour** — Crossway enforcing "half a book per query"
   — and reporting it as a defect would have advertised that we had not read the terms
   while asking for a favour. The probe figures were accurate; the conclusion drawn from
   them was not.

   **Do not ask whether the quotation limits apply to on-screen display.** Also
   previously drafted here, and also answered in the terms: "You may not display more
   than 500 verses or one-half of any book on any page." Asking a question whose answer
   is published is the same error in a second costume.

   **Do not ask permission to chunk whole-book requests.** It reads as "may I bypass your
   control?" and invites a policy answer to a product question. Ask for a **capability**,
   not tolerance of a workaround.

   ### Suggested wording

   > Subject: ESV API — whole-book access for a study application
   >
   > I'm developing a Bible-study application that retrieves ESV text via the ESV API.
   > It displays passages on screen to the user who requested them, for study and
   > annotation; it does not redistribute or publish the text. It is currently for my own
   > personal use, and I would seek proper licensing before any release.
   >
   > I understand from the API terms that a query returns at most 500 verses or half a
   > book, whichever is less, excepting single- and double-chapter books, and that the
   > same limit applies to what may be displayed on a page. My application honours this:
   > it detects the truncated response and reports it rather than assembling a book from
   > several smaller queries.
   >
   > My question is whether a licence tier or API scope exists that permits retrieving
   > and displaying a complete book for on-screen study. Studying a whole epistle in one
   > view is a common need, and I would rather have it granted properly than work around
   > the limit.

   Note this states our compliance as a fact, which it now is — the truncation detector
   in `fetchESVPassage()` and the study-level check in §1.6 are both real.

   ⚠️ **Contact address: not verified — look it up before sending.** An earlier draft of
   this line named a specific licensing address as "the only address in the API
   documentation, retrieved 2026-08-07." That citation was fabricated; the address was
   plausible but never checked. Struck immediately, and recorded rather than quietly
   deleted because it is the same failure mode as §0 — a confident citation standing in
   for a verified one — committed while documenting that failure mode. Get the current
   address from Crossway's API or licensing page. `translations.json` records only
   `https://www.esv.org`, which is the attribution link, not a support address.

   ### ⚠️ "It's only personal use" — what that does and does not license
   - It does **not** make display unrestricted. That argument was withdrawn in §1; the
     terms limit display regardless of audience size.
   - It does **not** make circumventing a technical control acceptable. It reduces the
     practical stakes to nearly zero; it does not change what the act is.
   - The real risk is **residue**: code added under "it's only me" is still in the
     repository at launch, and by then it looks load-bearing. §3 and §12 of
     `LINKED_STUDIES_PLAN.md` are both records of a workaround outliving the reasoning
     that produced it. **Do not implement ESV chunking while awaiting a reply.** Nothing
     is blocked meanwhile: NET serves whole books today.

3. **Correct the distribution verse ceiling.** `restrictions.distribution.maxVerses` is
   `1000`, from the print copyright page. The API terms say **500** for text obtained via
   the API, which is our case. Left unchanged for now only because
   `validateExportLimits()` has no caller, so the number has no observable effect —
   see `maxVersesNote` in `translations.json`. Fix it together with item 4.

4. **Wire `validateExportLimits()` into the export flow.** The function exists and is
   exercised by construction, but `MenuExport` / `exportAnalyze.js` do not call it.
   Deferred deliberately — the warning copy should be designed alongside the export UI.

5. **Flip `enforcement` to `'block'` at public release**, for both
   `restrictions.display` and `restrictions.distribution`. JSON-only change, no code.

6. **Consider adding a public-domain translation** (WEB — modern, actively maintained,
   explicitly public domain). This is now more attractive than it looked: whole-book ESV
   study is not available under the current terms at all (§3), so a translation with no
   book-portion limit is the only clean path to whole-book work besides NET.

---

## 6. Rules for future changes

1. **⚠️ Read the provider's terms before reasoning about them.** Corrected 2026-08-07.
   This rule previously read "never put a copyright rule in `api.requestLimits`," which
   sounds principled and is **the rule that produced the wrong diagnosis in §3** — the
   half-book limit _is_ in the API terms as a query limit, so it belonged there. Sort
   rules by **which document states them and which act they govern**, not by whether they
   feel like "copyright." Quote the clause and cite the URL when you file one.
2. **A limit and its exceptions are one unit.** The §3 bug was a correctly-implemented
   cap with its parenthetical exception dropped — "(excepting single-chapter and
   double-chapter books)". A cap without its carve-out is not a conservative
   approximation; it is a different rule.
3. **Never hard-code a limit.** Read it from `translations.json` so a licence change
   is a data edit.
4. **Match the rule's scope to the check's scope.** A per-page rule needs a per-page
   check; validating one request at a time misses what several assemble (§1.6). This is
   the error that has recurred most often here.
5. **Splitting requests is not a _compliance_ strategy** — it is an engineering one.
   Chunking is fine where it routes around nothing (NET) and wrong where it would defeat
   a deliberate provider control (ESV). Judge it by §1.5, never by counting verses, and
   do not repeat the "same amount of text" argument corrected in §3.
6. **Distinguish our limits from theirs, by file.** Publisher limits live in
   `translations.json`; ours live in `src/lib/config/`. A number in the wrong file gets
   attributed to the wrong party, which is how both bugs in this document started.
7. **Check `source` before writing user-facing limit copy.** `api.requestLimits.source`
   is `provider` or `self-imposed`; never blame a publisher for a cap we chose.
8. **Any new surface that emits Scripture outside the app** (new export format, share
   link, API, clipboard) must call `validateExportLimits()` and include attribution.
9. **Update this file** when a limit, posture or publisher position changes — and when a
   claim in it turns out to be wrong, correct it _in place with the correction visible_
   rather than silently. §0, §1.5, §3 and §5 are all more useful for showing their own
   errors than they would be if the errors had simply been deleted.
