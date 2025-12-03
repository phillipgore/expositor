# Custom Tooltip System Implementation

## Overview

A custom tooltip system has been implemented to replace native browser tooltips with styled, smart-positioned tooltips featuring smooth animations.

## Files Created

### 1. **Tooltip Store** (`src/lib/stores/tooltipStore.svelte.js`)
Global state management for tooltip visibility, content, and positioning.

### 2. **Tooltip Component** (`src/lib/componentElements/Tooltip.svelte`)
Renders tooltips with:
- Smart auto-positioning with viewport collision detection
- Smooth fade in/out transitions (200ms)
- Arrow pointer to target element
- Multi-line text support
- Optional HTML content support

### 3. **Tooltip Action** (`src/lib/composables/useTooltip.svelte.js`)
Svelte action that:
- Intercepts and removes native `title` attributes
- Manages show/hide timing
- Handles keyboard, mouse, and touch events
- Respects disabled states
- Auto-cleanup on element removal

## Integration

### Root Layout
The `<Tooltip />` component has been added to `src/routes/+layout.svelte` to render all tooltips globally.

### Button Component
The `use:tooltip` action has been integrated into `src/lib/componentElements/buttons/Button.svelte`, automatically applying to all button variants (Button, IconButton, MenuButton, ToggleButton).

## Features

### ✅ Core Features
- **Delayed Show**: 500ms delay before tooltip appears (configurable)
- **Instant Hide**: Immediate hide on mouse leave
- **Smooth Fade**: CSS transitions for polished UX
- **Smart Positioning**: Auto-calculates best position (top, bottom, left, right)
- **Collision Detection**: Flips position if tooltip would overflow viewport
- **Keyboard Support**: Shows on focus, hides on blur (accessibility)
- **Touch Support**: Works on mobile devices
- **Disabled State**: Respects disabled elements (no tooltip)

### 🎨 Visual Design
- Dark gray background (`var(--gray-800)`)
- White text
- 0.4rem border radius
- Drop shadow for depth
- Arrow pointer to target element
- Max width: 25rem
- Font size: 1.2rem

## Usage Examples

### Automatic (uses existing title attribute)
```svelte
<Button label="Save" title="Save your changes" />
```

### Custom Options
```svelte
<Button 
  label="Delete" 
  title="Permanently delete this item"
  use:tooltip={{ placement: 'top', delay: 300 }}
/>
```

### HTML Content
```svelte
<IconButton 
  iconId="help"
  use:tooltip={{ 
    content: 'Click for <strong>detailed</strong> help',
    allowHtml: true 
  }}
/>
```

### Manual Application
For non-button elements:
```svelte
<script>
  import { tooltip } from '$lib/composables/useTooltip.svelte.js';
</script>

<div title="Helpful info" use:tooltip>
  Hover over me
</div>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `content` | string | (title attr) | Tooltip text content |
| `placement` | string | 'auto' | Preferred placement: top, bottom, left, right, auto |
| `delay` | number | 500 | Delay in ms before showing |
| `offset` | number | 8 | Distance from target element in pixels |
| `allowHtml` | boolean | false | Allow HTML in tooltip content |

## Positioning Logic

The tooltip uses a smart positioning algorithm:

1. **Try preferred placement** (or 'top' if auto)
2. **Check viewport collision**
3. **If collision detected**: Try fallback placements in order:
   - Opposite side
   - Adjacent sides
4. **Respect viewport padding**: Minimum 8px from screen edges

## Accessibility

- ✅ Keyboard accessible (focus/blur)
- ✅ Touch device support
- ✅ Respects disabled state
- ✅ Proper `role="tooltip"` attribute
- ✅ Hides on scroll for better UX

## Testing

### To Test Tooltips:
1. **Start the dev server**: `npm run dev`
2. **Navigate to any page with buttons**
3. **Hover over buttons** with `title` attributes
4. **Test behaviors**:
   - Hover → Wait 500ms → Tooltip appears
   - Move mouse away → Tooltip disappears immediately
   - Tab to button → Tooltip appears
   - Tab away → Tooltip disappears
   - Touch button (mobile) → Tooltip appears
   - Scroll → Tooltip hides

### Buttons with Existing Tooltips
Any button component that already has a `title` attribute will automatically use the custom tooltip system.

## Extending to Other Components

To add tooltips to other components:

```svelte
<script>
  import { tooltip } from '$lib/composables/useTooltip.svelte.js';
</script>

<your-element title="Tooltip text" use:tooltip>
  Content
</your-element>
```

## Performance Notes

- **Single tooltip instance**: Only one tooltip renders at a time (memory efficient)
- **Event cleanup**: Proper event listener removal prevents memory leaks
- **Portal rendering**: Tooltip renders at document body level (avoids z-index conflicts)
- **Lazy positioning**: Position calculated only when tooltip is visible

## Future Enhancements

Possible additions if needed:
- Theme variants (light/dark tooltips)
- Custom CSS class support
- Tooltip groups with delay coordination
- Programmatic show/hide API
- Custom arrow size/offset
- Animation customization

## Migration Path

**Current State**: All buttons automatically use custom tooltips if they have a `title` attribute.

**No Breaking Changes**: The system is backward compatible. Existing `title` attributes continue to work but now render as custom tooltips.

**Opt-out**: To disable tooltips on specific elements, simply omit the `title` attribute or don't apply the `use:tooltip` action.

## Architecture Benefits

1. **Centralized**: Single source of truth for all tooltips
2. **Reusable**: Works with any HTML element via action
3. **Non-intrusive**: Opt-in via `use:tooltip` directive
4. **Maintainable**: Easy to modify styles/behavior in one place
5. **Performant**: Minimal overhead, proper cleanup
6. **Accessible**: Keyboard and screen reader friendly

## Summary

The custom tooltip system provides a professional, accessible, and maintainable solution for displaying contextual help throughout the application. All button components are automatically enhanced, and the system can easily extend to other interactive elements as needed.
