# Menu Icon Removals

A record of the menu-item icons that were removed, so they can be put back later.

## The rule

The approach follows macOS 26 Tahoe menus:

- A section (the items between two `DividerHorizontal`s) either has an icon on every item or on none.
- A section keeps its icons only if every icon passes all three tests:
  1. You can recognise it at 16px without reading the label.
  2. It's the same icon used for that action elsewhere, such as a toolbar button.
  3. It looks clearly different from the other icons in its section.
- Abstract settings commands (Set…/Reset) failed these tests, so their icons were removed.

`IconButton` only draws the icon when an `iconId` is given. Without one, the label sits flush left.

## How to restore an icon

Add the `iconId` line back to that item's `<IconButton>`, directly above its `label=` line:

```svelte
<IconButton
	classes="menu-light justify-content-left"
	iconId="note-slide"
	label="Set Quick Note Slide…"
	...
```

All of these icons are still in `src/lib/data/icons.json`. After restoring any, run `node scripts/verify-icon-ids.mjs`.

## Removed icons

### `src/lib/componentWidgets/menus/MenuConnect.svelte`

| Section | Label | `iconId` to restore |
|---|---|---|
| Quick Note Slide | Set Quick Note Slide… | `note-slide` |
| Quick Note Slide | Reset Quick Note Slide | `note-slide-reset` |
| Quick Note Position | Set Quick Note Position… | `note-positon` |
| Quick Note Position | Reset Quick Note Position | `note-positon-reset` |
| Quick Note Offset | Set Quick Note Offset… | `note-offset` |
| Quick Note Offset | Reset Quick Note Offset | `note-offset-reset` |

The position IDs are spelled `positon` (not `position`) in `icons.json`. Use that exact spelling unless the IDs are renamed there too.

### `src/lib/componentWidgets/menus/MenuLayout.svelte`

| Section | Label | `iconId` to restore |
|---|---|---|
| Column Spacing | Set Column Spacing… | `column-spacing` |
| Column Spacing | Reset Column Spacing | `column-spacing-reset` |
| Column Spacing | Link Column Spacing | _(none yet — new item)_ |
| Column Spacing | Unlink Column Spacing | _(none yet — new item)_ |
| Column Width | Set Column Width… | `column-width` |
| Column Width | Reset Column Width | `column-width-reset` |
| Column Width | Link Column Width | _(none yet — new item)_ |
| Column Width | Unlink Column Width | _(none yet — new item)_ |
| Section Spacing | Set Section Spacing… | `section-spacing` |
| Section Spacing | Reset Section Spacing | `section-spacing-reset` |
| Section Spacing | Link Section Spacing | _(none yet — new item)_ |
| Section Spacing | Unlink Section Spacing | _(none yet — new item)_ |
| Segment Height | Set Segment Height… | `segment-height` |
| Segment Height | Reset Segment Height | `segment-height-reset` |
| Segment Height | Link Segment Height | `segment-height-link` |
| Segment Height | Unlink Segment Height | `segment-height-unlink` |
| Segment Position | Set Segment Position… | `set-segment-position` |
| Segment Position | Reset Segment Position | `reset-segment-position` |

Link/Unlink Segment Height are easy to draw, so their icons work well on their own. They were removed only because they share a section with Set/Reset Segment Height. To get them back without the others, move them into their own section with a `<DividerHorizontal />`.

## Kept on purpose

These menus and sections still have their icons:

- **MenuStructure:** Split Column/Section/Segment, Join Selected Up/Down, Move Selected Up/Down, Move Text Up/Down.
- **MenuConnect:** Connect, Connection Quick Note, Curved/Straight/Cornered Connection, Reset Connection Shape/Points, Quick Note Above/Below/Right/Left.
- **MenuView and MenuText:** checkbox-style items that never had icons.
