# Finder Performance Report

Investigation and fixes for the Finder (`StudiesPanel.svelte` + `studies/*` + its composables and the
`(app)/+layout.server.js` load it is built from). Measured in **Safari and Chrome**. Safari is the
browser users report problems in, so it gets equal weight here.

## How it was measured

```bash
npm run perf:seed-finder                       # perf@expositor.dev: 100 nested groups, 20 series,
                                               # 500 studies, 999 passages, 20 KB cached text each
npm run build:local && npm run preview:local   # production build on :4173
npm run perf:finder -- --runs 5                # Safari (safaridriver) + Chrome (DevTools protocol)
node scripts/perf-seed-finder.mjs --clean      # remove the perf user afterwards
```

Safari needs **Settings › Developer › Allow remote automation** enabled once. Both browsers run the same
in-page script (`scripts/perf-finder-inpage.mjs`). Interaction times are main-thread cost (handler,
Svelte update and forced layout), not time-to-next-frame. Time-to-next-frame is pinned to vsync and
hides any difference under 16 ms. Each value is the median of 5 runs on macOS, Safari 27.0.1, with
620 Finder rows.

## Results

| Metric | Safari before | Safari after | Chrome before | Chrome after |
|---|---|---|---|---|
| Layout data sent to browser | **20,404 KB** | **297 KB** (−98.5%) | 20,404 KB | 297 KB |
| Layout load (server + transfer) | 347 ms | 44 ms (−87%) | 235 ms | 23 ms (−90%) |
| Initial Finder render | 643 ms | 248 ms (−61%) | 422 ms | 132 ms (−69%) |
| Typing "romans" (6 keys, total) | 124 ms | 58 ms (−53%) | 86 ms | 36 ms (−57%) |
| Worst single keystroke | 52 ms | 42 ms | 30 ms | 23 ms |
| 30 Cmd-click selections | 72 ms | 57 ms (−21%) | 80 ms | 55 ms (−32%) |
| 60 arrow-key presses | 22 ms | 22 ms | 7.7 ms | 5.5 ms |
| Expand / collapse a folder | PATCH + full layout reload | instant (PATCH in background) | same | same |

Safari is consistently the slower engine, about 1.5–4× Chrome on interaction work. The fixes help it
proportionally as much as Chrome.

## Root causes, ranked by impact

1. **The layout shipped every study's cached Bible text to the browser.** `select()` on `passage`
   included `cachedText` (full passage HTML, migration 0035). This layout runs on every page and after
   every `invalidate('app:studies')`. Its payload grew with how much text the user had, and in this
   test library it was 20 MB. The Finder only needs reference fields.
2. **N+1 passage queries**: one query per study, so 501 queries for 500 studies.
3. **No indexes** on `passage.study_id`, `study.user_id` or `study_group.user_id`, so every read was a
   full table scan across all users.
4. **Quadratic tree build**: a `filter()` over all studies, series and groups for each group and series.
5. **Search animated the whole tree.** Searching force-expands everything, so every row ran `flip`
   and every group or series ran a `slide`. This was ~80% of search cost in Safari (an experimental
   build with no motion took typing from 136 ms to 31 ms).
6. **Per-row selection checks**: each row did a linear scan of the selection, and
   `getSelectionPosition` re-sorted the selection once per row.
7. **The tree was re-flattened** in every click handler, every row `onfocus` (so every arrow key) and
   the auto-select effect.
8. **Filtering ran twice per keystroke**, and each keystroke re-formatted and lower-cased every
   passage reference.
9. **Collapse waited for the server**: it did a PATCH, then a full layout reload, before the chevron moved.

## Changes

| File | Change |
|---|---|
| `src/routes/(app)/+layout.server.js` | One passage query (join on `study.userId`) with named columns and no `cachedText`, grouped with a `Map`. Tree built from pre-grouped `Map`s. |
| `drizzle/0054_add_finder_indexes.sql`, `scripts/run-migration-54.js`, `schema.ts` | `passage(study_id, display_order)`, `study(user_id)`, `study_group(user_id)`. Additive and idempotent. |
| `useMultiSelect.svelte.js` | Selection positions derived once into a `Map`. Shift-range uses a local `Set` and a single assignment. |
| `useStudiesFilter.svelte.js` | Search keys cached per study object (`WeakMap`). New `getFilteredView()` does one filtering pass. |
| `StudiesPanel.svelte` | `flatItems` / `flatItemFor` derived once. Optimistic collapse (`collapseOverrides`, cleared when fresh data arrives, reverted on failure). Motion off while searching. |
| `useKeyboardNavigation.svelte.js` | Takes the already-flattened list instead of re-flattening on every key. |
| `src/lib/utils/finderMotion.js`, `StudyGroup.svelte`, `StudySeries.svelte` | `finderFlip` / `finderSlide` with an `enabled` switch, via a `motion` prop. Moves, drags and manual expand/collapse still animate. |
| `scripts/verify-finder-performance.mjs` (in `npm run verify`) | 19 checks that fail if any of the above is reverted. |
| `scripts/perf-seed-finder.mjs`, `scripts/perf-finder*.mjs` | Repeatable benchmark (`npm run perf:seed-finder`, `npm run perf:finder`). |

## Deploying

Run the index migration on each environment: `node scripts/run-migration-54.js`. For production, use
`ENV_FILE=.env.production node scripts/run-migration-54.js`. The code works without the indexes, but
the database won't get the speed-up from them.

## Not done (measured as not worth it yet)

- **List virtualisation.** At 620 rows, initial render is now 132–248 ms. Revisit at a few thousand rows.
- **Drag mousemove throttling** (`elementFromPoint` on every move) and **bulk move endpoints**. These are
  only reachable during a drag, and the in-page benchmark can't drive a real pointer drag. Check them
  manually in Safari with Web Inspector › Timelines if drags feel heavy.
- Remaining Safari search cost is Svelte re-rendering the result list. The worst keystroke is 42 ms,
  which is about two frames.
