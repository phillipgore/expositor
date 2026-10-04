# Cross-Part Selection, Connections and Focus (Serialized Studies)

**Branch:** `dev-cross-part-functionality`. Merge to `main` (and run any production migrations)
only when **every step below is done and approved** — the user asked that neither Focus nor
Connections ship on their own.

## Goal

In a serialized study each part is its own page, so selection, Focus and connections were
limited to one part. These steps let the user work across parts.

## What already existed

| Piece | Before this work | Consequence |
|---|---|---|
| Selection | Page-local (`activeColumns/Sections/Segments` on the Analyze page); lost on navigating to another part. | Needed a store that survives part navigation. |
| Cmd-click | Adds/removes items within one part; holding Cmd reveals every selection control. | Reused as-is; no new gesture. |
| Focus | Hides everything on the current page except the selection. | Can only show one part. |
| Cross-part connections | Representable (`segment_connection.series_id`, migration 0046). The study loader fetches every connection in the series and draws one with an end in another part as an **edge stub** (short line + chevron to the page edge, `<title>` "Continues in Part N"). | Drawing was solved; only **creating** them was missing. |

## Decisions (from the user)

- A **plain click** replaces the selection in every part; **Cmd-click** keeps other parts' items.
- The selection **survives a page reload** for the session (sessionStorage), not closing the tab.
- Cross-part Focus shows the selected items of every part on the **normal study page** (no
  separate page, no extra header text). Option B was built, then dropped.
  Nothing merges until everything is done.
- Header indicator label: **"N Selections"** (blue button, toolbar triangle caret). Dropdown grouped
  by part, "(Current Part)" on the open part, solid structure icons, red × remove, red **Clear All**,
  light-gray hover.

## Steps

1. **Selection that lasts across parts + header indicator** — ✅ done.
   - `src/lib/stores/seriesSelection.js` — per-series items `{ partId, type, id, label }`.
   - `src/lib/componentWidgets/SeriesSelectionChip.svelte` — header button + dropdown.
   - Analyze page mirrors its selection into the store and restores it when a part opens; Cmd works
     after navigating (including via the Finder); Escape clears without leaving full screen.
2. **Creating cross-part connections** — ✅ built (awaiting browser testing).
   - With exactly two items selected across parts (one may be in the current part), Connect is
     enabled; Remove is enabled when they're already linked.
   - `POST /api/segments/connections` accepts `seriesId`; it checks that both ends belong to parts of
     that series owned by the user, and stores the row under one endpoint's part with `series_id` set.
   - Stubs are clickable: a "Part N" label at the page edge goes to the other part and scrolls to the
     other end. Stub direction now uses the part being viewed (it previously used the row's owning
     part, which pointed the wrong way when viewed from the other end).
3. ~~**Focus that travels with you (Option B)**~~ — **dropped** at the user's request. Per-part
   Focus and the "Focus: Part 1 · Part 3" header row were removed; the Selections dropdown gives
   per-part detail instead.
4. **Focus across parts** — ✅ built (awaiting browser testing). Uses the **normal study page**.
   - Pressing Focus with items selected in more than one part (or a selected cross-part
     connection) reloads the same Analyze page as `/study/<part>/analyze?focus=<partId>,…`.
   - The study loader (`+layout.server.js`) reads `?focus=`, checks each part is in the same series
     and owned by the user, and adds those parts' passages, text and structure in series order.
     It also returns which part owns each item, so selection and connections tag them correctly.
   - Focus then hides everything except the selected items, exactly as in one part. Header,
     Selections dropdown, toolbar, styling and View settings are the normal ones. Cross-part
     connection lines are drawn in full (style, bend, colour, Quick Note) because both ends are on
     the page.
   - Pressing Focus again returns to the plain address and restores the part's selection. Leaving
     any other way (Finder, part arrows) also ends Focus. A reload keeps Focus (snapshot in
     sessionStorage).
   - The separate `/series/[id]/focus` page and its API were built and then removed.

5. **Test everything together, then merge** — run production migrations at merge time only.

## Known limits / open questions

- Stubs are still not selectable as connections (no Quick Note, colour or style changes from the stub
  side); select both endpoints and use Remove to delete one.
- No migration has been needed so far.
