# Scripture Licensing & Compliance

How Expositor stays within its Bible-text licences, and **why** the rules are enforced
where they are. Read this before changing anything in `translations.json` under
`api.requestLimits` or `restrictions.distribution`.

**Status:** current posture, single-user (developer-only) deployment.
**Last reviewed:** 2026-08-03
**Disclaimer:** this document records engineering reasoning, not legal advice. The
open item below should be confirmed with Crossway before public release.

---

## 1. The core distinction

Two different documents govern what we do with ESV text. They say different things
and they govern different acts. Conflating them caused a real bug (§3).

| | Source document | Governs | Enforced |
|---|---|---|---|
| **Request limits** | ESV **API Terms of Use** | One HTTP request | Fetch time — study create/edit |
| **Distribution limits** | ESV **quotation permission** (copyright-page paragraph) | Reproducing text in a distributable work | Export/print time |

**Request limit** is a technical ceiling: the ESV API rejects a request for more than
500 verses. It has nothing to do with copyright.

**Distribution limit** is the familiar permission: up to **1,000 verses**, provided the
quotation does **not amount to a complete book** and does **not exceed 50%** of the work
in which it is quoted.

Our position: **Expositor's on-screen study is service operation, not publication.**
Text is fetched live from a licensed API and displayed to the user who requested it;
no fixed work containing Scripture is distributed. The quotation permission becomes
relevant at the point text leaves the app as an artifact — the PNG/PDF/print exports.

| Surface | Rule applied |
|---|---|
| **On-screen study** (Analyze, Document) | 500 verses per API request. No book-portion limit. |
| **Export / Print** (PNG, PDF, print) | ≤1,000 verses, ≤50% of a book, not a complete book. Attribution mandatory. |

---

## 2. Where each rule lives in code

Single source of truth is `src/lib/data/translations.json`. No limit is hard-coded.

```
api.requestLimits.maxVerses          → getRequestLimits()      → validatePassageLimits()
restrictions.distribution.*          → getDistributionLimits() → validateExportLimits()
```

Both accessors and validators are in `src/lib/utils/translationLimits.js`.

`restrictions.distribution.enforcement` is `'warn'` or `'block'`, per translation.
Today both translations are `'warn'`. Flipping to `'block'` at public release is a
JSON edit — no code change. This is the main reason the seam was built now.

---

## 3. The bug this structure fixed

`maxBookPortion: 0.5` was previously stored under `api.requestLimits` and enforced by
`validatePassageLimits`. That applied a **publication** rule at **fetch** time.

The effective per-passage cap became `min(500, ½ book)`. Only 24 of 66 books exceed
500 verses, so for most of the Bible the binding limit was half-a-book — well under
500. Verified against `bible.json`:

| Book | Verses | Old effective cap | Whole book studyable? |
|---|---|---|---|
| 3 John | 14 | 7 | ❌ |
| 2 John | 13 | 6 | ❌ |
| Philemon | 25 | 12 | ❌ |
| Jude | 25 | 12 | ❌ |
| Obadiah | 21 | 10 | ❌ |
| Titus | 46 | 23 | ❌ |
| Philippians | 104 | 52 | ❌ |
| Galatians | 149 | 74 | ❌ |
| Romans | 433 | 216 | ❌ |

**All 66 books failed.** No complete book of the Bible could be studied, in any
translation. A 25-verse letter had to be broken into two studies.

### Why splitting the API call was not the fix

The obvious workaround — fetch Philemon 1–12 and 13–25 in two calls, then display all
25 verses — does not work as a *compliance* measure. The quotation permission's
"complete book" clause is about **how much text is reproduced**, not how many HTTP
requests produced it. Two calls rendered on one screen reproduce 100% of Philemon,
legally identical to one call. Same reasoning rules out splitting a short book across
two studies.

The fix was to move the rule to the boundary where distribution actually happens.

### After

- `maxBookPortion` removed from `api.requestLimits` for both translations.
- 42 of 66 books now fit in a single passage; the other 24 need several passages,
  bounded only by the genuine 500-verse API ceiling.
- Complete-book and 50% checks now run in `validateExportLimits()`, aggregated
  **per book across all passages** — so Romans 1–8 + Romans 9–16 is correctly
  recognised as a complete book, however it was assembled.

### NET

NET's half-book cap was **self-imposed**, not published by the provider — the old JSON
comment said so explicitly. NET is free-with-attribution and sets no verse or
book-portion limit on distribution, so `maxBookPortion` and `maxVerses` are now `null`
and `allowCompleteBook` is `true`. Attribution remains mandatory.

---

## 4. Attribution

Both publishers require their notice wherever their text appears.

| Surface | Status |
|---|---|
| Analyze (on screen) | ✅ `.copyright-notice` in the scroll container |
| Document (on screen) | ✅ flows as the final `doc-flow-item` |
| Document print | ✅ inherited from the Document DOM |
| **Analyze PNG / PDF / print** | ✅ **fixed 2026-08-03 — was missing** |

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

1. **Confirm with Crossway** (⚠️ before public release) — does the "complete book" /
   50% quotation limitation apply to on-screen display inside an application, or only
   to quotation in a published work? Our reading is the latter (§1). Suggested wording:

   > I'm developing a Bible-study application that retrieves ESV text via the ESV API.
   > The text is displayed on screen to the user who requested it; it is not
   > redistributed or published. Does the "complete book" / 50% quotation limitation
   > apply to on-screen display within such an application, or only to quotation in a
   > published work? I'd also like to understand licensing options for making the
   > application available to others.

2. **Flip `enforcement` to `'block'` for ESV at public release**, unless Crossway
   confirms the permissive reading. JSON-only change.

3. **Wire `validateExportLimits()` into the export flow.** The function exists and is
   tested by construction, but `MenuExport` / `exportAnalyze.js` do not yet call it.
   Deferred deliberately — no user-facing enforcement is needed at single-user scale,
   and the warning copy should be designed alongside the export UI.

4. **Consider adding a public-domain translation** (WEB — modern, actively maintained,
   explicitly public domain). Gives an unconditionally clean path for whole-book work
   and exercises the multi-translation architecture against a non-ESV-shaped provider.

5. **Caching.** ESV permits caching up to 500 verses with periodic clearing
   (`restrictions.caching`). `passage.cachedText` persists fetched text indefinitely
   and nothing enforces or clears it. Worth a look — likely wants a TTL or a
   back-office "clear cached Scripture" action.

---

## 6. Rules for future changes

1. **Never put a copyright rule in `api.requestLimits`.** That block is for provider
   technical ceilings only. Copyright rules go in `restrictions.distribution`.
2. **Never hard-code a limit.** Read it from `translations.json` so a licence change
   is a data edit.
3. **Splitting requests is not a compliance strategy.** It changes the plumbing, not
   the amount of text reproduced.
4. **Any new surface that emits Scripture outside the app** (new export format, share
   link, API, clipboard) must call `validateExportLimits()` and include attribution.
5. **Update this file** when a limit, posture or publisher position changes.
