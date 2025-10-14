# Toolbar State Management System

This document describes the toolbar state management system implemented using Svelte 5 stores and reactive patterns.

## Overview

The toolbar state system dynamically enables/disables toolbar buttons based on:
- **Current route/page** - Different pages have different available tools
- **Document state** - Whether a document is open, has content, etc.
- **User actions** - Selection changes, editing mode, etc.

## Architecture

### Store Location
`src/lib/stores/toolbar.ts`

### Key Components
1. **toolbarState** - Readonly store that components subscribe to
2. **Helper functions** - Functions to update toolbar state
3. **Route integration** - Automatic updates based on SvelteKit page changes

## Store Properties

```typescript
{
  canDelete: boolean,         // Delete button
  canFormat: boolean,         // Formatting tools (general)
  canToggleNotes: boolean,    // Notes toggle
  canToggleVerses: boolean,   // Verses toggle
  canToggleWide: boolean,     // Wide layout toggle
  canToggleOverview: boolean, // Overview toggle
  canZoom: boolean,           // Zoom menu
  canStructure: boolean,      // Outline/Structure menu
  canText: boolean,           // Text formatting menu
  canLiterary: boolean,       // Literary devices menu
  canColor: boolean           // Color scheme menu
}
```

## Usage Examples

### 1. Route-Based State (Automatic)

The toolbar automatically updates when navigating between pages:

```svelte
<!-- ToolbarApp.svelte -->
<script>
  import { page } from '$app/stores';
  import { toolbarState, updateToolbarForRoute } from '$lib/stores/toolbar';
  
  // Automatically update toolbar when route changes
  $effect(() => {
    updateToolbarForRoute($page.url.pathname);
  });
</script>

<!-- Buttons reactively enable/disable based on route -->
<IconButton
  iconId="trashcan"
  isDisabled={!$toolbarState.canDelete}
/>
```

**Current Route Logic:**
- `/document`, `/study` routes → Most tools enabled
- `/settings`, `/new-study`, `/open` routes → Document tools disabled
- Other routes → Maintains current state

### 2. Document Events

Call these functions when documents open/close:

```svelte
<script>
  import { onDocumentOpen, onDocumentClose } from '$lib/stores/toolbar';
  
  function handleOpenDocument() {
    // ... document loading logic
    onDocumentOpen(); // Enable document-specific tools
  }
  
  function handleCloseDocument() {
    // ... document closing logic
    onDocumentClose(); // Disable document-specific tools
  }
</script>
```

### 3. User Action Events

Update state based on user interactions:

```svelte
<script>
  import { onSelectionChange } from '$lib/stores/toolbar';
  
  function handleTextSelection(hasSelection) {
    onSelectionChange(hasSelection);
    // Formatting tools now enabled/disabled based on selection
  }
</script>
```

### 4. Manual State Updates

For custom scenarios, set individual properties:

```svelte
<script>
  import { setToolbarState } from '$lib/stores/toolbar';
  
  function handleFeatureToggle(enabled) {
    setToolbarState('canColor', enabled);
  }
</script>
```

### 5. Reading Current State (Non-Reactive)

Get state snapshot without subscribing:

```svelte
<script>
  import { getToolbarState } from '$lib/stores/toolbar';
  
  function logCurrentState() {
    const state = getToolbarState();
    console.log('Delete enabled:', state.canDelete);
  }
</script>
```

## Integration Points

### ToolbarApp Component

The main toolbar component (`src/lib/components/ToolbarApp.svelte`) automatically:
1. Subscribes to route changes via `$page` store
2. Updates toolbar state via `updateToolbarForRoute()`
3. Applies state to buttons via `$toolbarState` subscriptions

Example button integration:
```svelte
<!-- Delete button -->
<IconButton
  iconId="trashcan"
  isDisabled={!$toolbarState.canDelete}
/>

<!-- Menu buttons -->
<MenuButton
  menuId="MenuZoom"
  isDisabled={!$toolbarState.canZoom}
/>

<!-- Toggle buttons -->
<ToggleButton
  iconId="note"
  isDisabled={!$toolbarState.canToggleNotes}
/>
```

### Document Pages

Document/study pages should call toolbar functions:

```svelte
<!-- src/routes/(app)/document/[id]/+page.svelte -->
<script>
  import { onMount } from 'svelte';
  import { onDocumentOpen, onDocumentClose } from '$lib/stores/toolbar';
  
  onMount(() => {
    onDocumentOpen();
    return () => onDocumentClose();
  });
</script>
```

### Editor/Content Components

Components with selectable/editable content:

```svelte
<!-- Content editor component -->
<script>
  import { onSelectionChange } from '$lib/stores/toolbar';
  
  function handleSelection() {
    const hasSelection = window.getSelection()?.toString().length > 0;
    onSelectionChange(hasSelection);
  }
</script>

<div
  contenteditable
  onselectionchange={handleSelection}
>
  <!-- content -->
</div>
```

## API Reference

### Store

#### `toolbarState`
Readonly store containing current toolbar state. Subscribe using `$toolbarState` in components.

### Functions

#### `updateToolbarForRoute(pathname: string)`
Updates toolbar state based on current route. Called automatically in ToolbarApp.

**Parameters:**
- `pathname` - Current route pathname from `$page.url.pathname`

**Example:**
```javascript
updateToolbarForRoute('/document/123'); // Enables document tools
updateToolbarForRoute('/settings');     // Disables document tools
```

#### `onDocumentOpen()`
Enables all document-specific toolbar features. Call when a document is successfully opened.

#### `onDocumentClose()`
Disables all document-specific toolbar features. Call when a document is closed.

#### `onSelectionChange(hasSelection: boolean)`
Updates formatting tool availability based on content selection.

**Parameters:**
- `hasSelection` - Whether user has selected content

#### `setToolbarState(key: string, value: boolean)`
Manually sets a specific toolbar state property.

**Parameters:**
- `key` - Property name (e.g., 'canDelete', 'canZoom')
- `value` - New boolean value

**Example:**
```javascript
setToolbarState('canDelete', true);
setToolbarState('canZoom', false);
```

#### `resetToolbarState()`
Resets all toolbar state to defaults (mostly disabled).

#### `getToolbarState(): ToolbarState`
Returns current toolbar state snapshot (non-reactive). Useful for imperative code or logging.

## Adding New Toolbar Buttons

To add a new button with state management:

1. **Add property to store** (`src/lib/stores/toolbar.ts`):
```typescript
const defaultState = {
  // ... existing properties
  canNewFeature: false  // Add new property
};
```

2. **Update route logic** if needed:
```typescript
export function updateToolbarForRoute(pathname) {
  // ...
  if (isDocumentRoute) {
    return {
      // ... existing properties
      canNewFeature: true  // Enable on document routes
    };
  }
  // ...
}
```

3. **Apply to button** in ToolbarApp:
```svelte
<IconButton
  iconId="new-icon"
  isDisabled={!$toolbarState.canNewFeature}
/>
```

4. **Create helper function** if needed:
```typescript
export function onNewFeatureChange(enabled: boolean) {
  setToolbarState('canNewFeature', enabled);
}
```

## Best Practices

1. **Use route-based state as foundation** - Most buttons can be controlled by route alone
2. **Layer user actions on top** - Override route state with document/selection state as needed
3. **Keep state minimal** - Only track what's necessary for UI decisions
4. **Document state changes** - Comment why state changes in specific scenarios
5. **Test edge cases** - Verify state during navigation, document loads, errors, etc.

## Future Enhancements

Potential additions to consider:

- **Loading states** - Disable buttons during async operations
- **Permission-based state** - Check user permissions before enabling features
- **Feature flags** - Integrate with feature flag system
- **Undo/redo state** - Enable/disable based on history stack
- **Multi-document state** - Track state for multiple open documents
- **Persistent state** - Save user preferences for toolbar configuration

## Troubleshooting

### Buttons not updating on route change
- Verify `$effect()` is running in ToolbarApp
- Check `$page` store is imported correctly
- Ensure route matches logic in `updateToolbarForRoute()`

### State not persisting between pages
- This is expected behavior - state resets based on new route
- For persistent state, use localStorage or URL params

### Buttons disabled when they shouldn't be
- Check default state in toolbar.ts
- Verify route logic covers your specific case
- Add console.log to debug state updates

## Migration Notes

### From Static Config
Old approach:
```javascript
// toolbarConfig.js
isDisabled: false  // Static value
```

New approach:
```svelte
<!-- ToolbarApp.svelte -->
isDisabled={!$toolbarState.canFeature}  // Dynamic from store
```

### Backwards Compatibility
- Static `isDisabled` values still work as fallbacks
- Gradual migration possible - update buttons one at a time
- No breaking changes to existing buttons
