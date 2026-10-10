# Icon Naming

Rules for icon `_id`s in `src/lib/data/icons.json` and their `.svg` files in `public/`.
`node scripts/verify-icon-ids.mjs` checks rules 1 and 2.

## Rules

1. **The `_id` and the file name are always the same** (`{_id}.svg`). Live icons sit at the top level of
   `public/`; icons set aside for restoring sit in `public/previously_used/`; `public/unused/` holds
   artwork with no `icons.json` entry.
2. **Lowercase words joined by hyphens, US spelling, no typos.**
3. **Subject, then qualifier, then action or variant.** The plain name is the default and suffixes add
   variants: `segment-height`, `segment-height-reset`, `segment-height-link`, `column-select-all`,
   `heading-promote`.
4. **Singular subject.** Use a plural only when the drawing shows several items (`sections`, `folders`).
5. **Directions and positions go last:** `join-up`, `text-down`, `note-left`, `arrow-curve-left`.
6. **Generic UI icons are named after what they show** (`check`, `x`, `gear`, `trashcan`); **app features
   after what they do** (`column-split`, `connect-reset-shape`).

Headings keep spelled-out levels (`heading-one`, not `heading-1`).

## Icon ids are not event names

Some icon ids share their spelling with `CustomEvent` names (e.g. the `select-all-columns` event).
When renaming an icon, change only `iconId` references and `icons.json` — never do a project-wide
find-and-replace.

## Renames (2026-10-10)

| Old | New |
|---|---|
| `note-positon`, `note-positon-reset` | `note-position`, `note-position-reset` |
| `literary-paralell` | `literary-parallel` |
| `set-segment-position`, `reset-segment-position` | `segment-position`, `segment-position-reset` |
| `select-all-columns` / `-sections` / `-segments` / `-connections` | `column-select-all` / `section-select-all` / `segment-select-all` / `connection-select-all` |
| `promote-heading`, `demote-heading` | `heading-promote`, `heading-demote` |
| `arrow-left-curve`, `arrow-right-curve` | `arrow-curve-left`, `arrow-curve-right` |

Files renamed to match existing ids: `note-offest*.svg` → `note-offset*.svg`. `books.svg` moved to
`unused/` (superseded by `series`). `minus.svg` created from its `icons.json` entry.
