# StudiesPanel WCAG 2.2 AA Compliance Implementation Plan

## Phase 1: Critical Accessibility Fixes (Level A - Must Fix)

### Step 1: Add Search Input Label
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Missing label for search input (WCAG 1.3.1)
**Changes:**
- Add `aria-label="Search studies"` to the Input component

**Implementation:**
```svelte
<Input 
  id="search-studies" 
  name="search" 
  type="search" 
  placeholder="Search"
  aria-label="Search studies"
  bind:value={searchQuery}
/>
```

**Note:** If the Input component doesn't accept `aria-label` as a prop, you'll need to add that capability first by ensuring the component forwards all additional attributes to the underlying `<input>` element.

### Step 2: Add aria-selected States
**Files:** 
- `src/lib/componentWidgets/studies/StudyItem.svelte`
- `src/lib/componentWidgets/studies/StudyGroup.svelte`

**Issue:** Missing selection states (WCAG 4.1.2)
**Changes:**

**StudyItem.svelte:**
- Add `aria-selected={isSelected}` to the button/link element
- Add `aria-current={isActive ? "page" : undefined}` to indicate active page

**StudyGroup.svelte:**
- Add `aria-selected={isSelected}` to `.group-select-button`
- Add `aria-current={isActive ? "page" : undefined}` to indicate active group

### Step 3: Fix List Semantics
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** role="presentation" breaks list structure (WCAG 1.3.1)
**Changes:**
- Remove `role="presentation"` from wrapper divs around list items
- Change animate:flip wrapper from `<div>` to `<li>` in the studies-container section:

```svelte
{#each sortedGroupsAndStudies as item (item.type === 'group' ? 'group-' + item.data.id : 'study-' + item.data.id)}
  <li animate:flip={{ duration: 300 }}>
    {#if item.type === 'group'}
      <StudyGroup ... />
    {:else}
      <div class="study-wrapper">
        <StudyItem ... />
      </div>
    {/if}
  </li>
{/each}
```

- Wrap `.studies-container` content in `<ul>` with appropriate styling

### Step 4: Add Keyboard Support for Resize Handle
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Resize handle not keyboard accessible (WCAG 2.1.1)
**Changes:**
- Convert `.resize-handle` div to a button or add tabindex="0"
- Add keyboard event handlers:
  - `onkeydown` to handle arrow keys
  - Left/Right arrows to decrease/increase width by 10px
  - Ctrl+Left/Right for larger increments (50px)
- Add ARIA attributes:
  - `role="separator"`
  - `aria-orientation="vertical"`
  - `aria-label="Resize studies panel"`
  - `aria-valuenow={panelWidth}`
  - `aria-valuemin="300"`
  - `aria-valuemax="600"`
- Add focus styling that matches the design

**Example implementation:**

**JavaScript (add keyboard handler function):**
```javascript
function handleResizeKeydown(event) {
  const step = event.ctrlKey || event.metaKey ? 50 : 10;
  
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    panelWidth = Math.max(300, panelWidth - step);
    savePanelWidth();
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    panelWidth = Math.min(600, Math.min(panelWidth + step, window.innerWidth * 0.5));
    savePanelWidth();
  }
}

async function savePanelWidth() {
  // Save to localStorage
  localStorage.setItem('studiesPanelWidth', panelWidth.toString());
  
  // Save to database (background)
  try {
    await fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studiesPanelWidth: panelWidth })
    });
  } catch (error) {
    console.error('Failed to save panel width:', error);
  }
}
```

**HTML:**
```svelte
<div 
  class="resize-handle" 
  role="separator"
  tabindex="0"
  aria-orientation="vertical"
  aria-label="Resize studies panel"
  aria-valuenow={panelWidth}
  aria-valuemin="300"
  aria-valuemax="600"
  onmousedown={handleResizeStart}
  onkeydown={handleResizeKeydown}
></div>
```

**CSS (update existing .resize-handle styles):**
```css
.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 10;
  background-color: transparent;
  transition: background-color 0.2s; /* Add smooth transition */
}

/* Focus styling - only shows on keyboard navigation */
.resize-handle:focus-visible {
  outline: none;
  background-color: var(--blue-light); /* Subtle blue background */
  box-shadow: 0 0 0 0.1rem var(--blue); /* Thin blue border for definition */
}
```

**Note:** The `:focus-visible` pseudo-class ensures the focus indicator only appears when navigating with keyboard (Tab key), not when clicking with mouse. This provides clear accessibility without unnecessary visual noise.

### Step 5: Fix Double-Click Expand/Collapse
**File:** `src/lib/componentWidgets/studies/StudyGroup.svelte`
**Issue:** Double-click is not accessible (WCAG 2.1.1)
**Changes:**
- Remove `ondblclick` handler from `.group-select-button`
- Remove click delay logic (`clickTimeout`, `CLICK_DELAY`)
- Make chevron button the ONLY way to expand/collapse
- Group name button only selects/navigates (doesn't toggle)
- Update `handleClick` to remove setTimeout logic:

```svelte
function handleClick(event) {
  onGroupHeaderClick?.(event, group);
}
```

## Phase 2: Live Regions and Announcements (Level AA)

### Step 6: Add Selection Announcement
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Selection changes not announced (WCAG 4.1.3)
**Changes:**
- Add a live region to announce selection count
- Create derived state for announcement text:

```svelte
let selectionAnnouncement = $derived.by(() => {
  const count = multiSelect.selectedItems.length;
  if (count === 0) return '';
  const types = {
    studies: multiSelect.selectedItems.filter(i => i.type === 'study').length,
    groups: multiSelect.selectedItems.filter(i => i.type === 'group').length
  };
  const parts = [];
  if (types.studies > 0) parts.push(`${types.studies} ${types.studies === 1 ? 'study' : 'studies'}`);
  if (types.groups > 0) parts.push(`${types.groups} ${types.groups === 1 ? 'group' : 'groups'}`);
  return `${parts.join(' and ')} selected`;
});
```

- Add live region in markup:
```svelte
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {selectionAnnouncement}
</div>
```

### Step 7: Add Search Results Announcement
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Search results not announced (WCAG 4.1.3)
**Changes:**
- Add derived state for search results count:

```svelte
let searchResultsAnnouncement = $derived.by(() => {
  if (searchQuery.trim() === '') return '';
  const groupCount = filteredGroups.length;
  const studyCount = filteredUngroupedStudies.length;
  const total = groupCount + studyCount;
  
  if (total === 0) return 'No results found';
  
  const parts = [];
  if (groupCount > 0) parts.push(`${groupCount} ${groupCount === 1 ? 'group' : 'groups'}`);
  if (studyCount > 0) parts.push(`${studyCount} ${studyCount === 1 ? 'study' : 'studies'}`);
  return `Found ${parts.join(' and ')}`;
});
```

- Add live region:
```svelte
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {searchResultsAnnouncement}
</div>
```

### Step 8: Add Empty State Announcement
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Empty state not announced (WCAG 4.1.3)
**Changes:**
- Add `role="status"` to empty message paragraph:

```svelte
<p class="empty-message" role="status">
  No studies yet.<br>Create one to get started.
</p>
```

## Phase 3: Semantic Structure Improvements

### Step 9: Add ARIA Landmarks
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Missing landmarks (WCAG 1.3.1)
**Changes:**
- Wrap entire panel in `<nav>` with aria-label:

```svelte
<aside class="studies-panel" ... >
  <nav aria-label="Studies navigation">
    <div class="panel-content" ...>
      <!-- existing content -->
    </div>
  </nav>
  <!-- resize handle -->
</aside>
```

- Add search landmark to search input area:

```svelte
<div class="panel-header" role="search">
  <Input 
    id="search-studies"
    aria-label="Search studies"
    ... 
  />
</div>
```

### Step 10: Add Accessible Names to Interactive Elements
**Files:**
- `src/lib/componentWidgets/studies/StudyItem.svelte`
- `src/lib/componentWidgets/studies/StudyGroup.svelte`

**StudyItem.svelte changes:**
- Add `aria-label` that includes title and passage refs:

```svelte
<button 
  class="study-item"
  aria-label="{study.title}{study.passages?.length ? ': ' + study.passages.map(p => formatPassageReference(p)).join(', ') : ''}"
  ...
>
```

**StudyGroup.svelte changes:**
- Update group select button aria-label to include count:

```svelte
<button 
  class="group-select-button"
  aria-label="{group.name} ({(group.studies?.length || 0) + (group.subgroups?.length || 0)} items)"
  ...
>
```

### Step 11: Fix Being-Dragged Visibility
**File:** `src/lib/componentWidgets/studies/StudyItem.svelte`
**Issue:** Opacity 0 hides from screen readers (WCAG 1.3.1)
**Changes:**
- Modify `.being-dragged` styles to use visibility instead:

```css
.study-item.being-dragged * {
  visibility: hidden;
}

.study-item.being-dragged :global(.icon) {
  visibility: hidden;
}
```

- OR add `aria-hidden="true"` to being-dragged items:

```svelte
<button 
  class="study-item"
  aria-hidden={beingDragged}
  ...
>
```

## Phase 4: Keyboard Alternatives for Drag-and-Drop

### Step 12: Implement Cut/Copy/Paste for Studies
**File:** `src/lib/composables/useMultiSelect.svelte.js`
**Issue:** Drag-and-drop not keyboard accessible (WCAG 2.1.1)
**Changes:**
- Add clipboard state:

```javascript
let clipboardItems = $state([]);
let clipboardOperation = $state(null); // 'cut' or 'copy'
```

- Add functions:

```javascript
function cutSelection() {
  if (selectedItems.length === 0) return;
  clipboardItems = [...selectedItems];
  clipboardOperation = 'cut';
  // Mark items visually as cut
}

function copySelection() {
  if (selectedItems.length === 0) return;
  clipboardItems = [...selectedItems];
  clipboardOperation = 'copy';
}

async function pasteToGroup(targetGroupId) {
  if (clipboardItems.length === 0) return;
  // Implementation to move/copy items to target group
  // Call appropriate API endpoints
  if (clipboardOperation === 'cut') {
    clipboardItems = [];
    clipboardOperation = null;
  }
}
```

- Export these functions from composable

### Step 13: Add Keyboard Event Handlers for Clipboard
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Changes:**
- Add global keyboard handler:

```svelte
$effect(() => {
  function handleKeyDown(event) {
    // Ctrl/Cmd + X for cut
    if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
      if (multiSelect.selectedItems.length > 0) {
        event.preventDefault();
        multiSelect.cutSelection();
        // Show toast: "Items cut to clipboard"
      }
    }
    
    // Ctrl/Cmd + C for copy
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      if (multiSelect.selectedItems.length > 0) {
        event.preventDefault();
        multiSelect.copySelection();
        // Show toast: "Items copied to clipboard"
      }
    }
    
    // Ctrl/Cmd + V for paste
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      if (multiSelect.clipboardItems.length > 0 && multiSelect.selectedItems.length === 1) {
        const target = multiSelect.selectedItems[0];
        if (target.type === 'group') {
          event.preventDefault();
          multiSelect.pasteToGroup(target.id);
          // Show toast: "Items pasted"
        }
      }
    }
  }
  
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
});
```

### Step 14: Add Context Menu for Move Operations
**File:** Create `src/lib/componentWidgets/studies/StudyContextMenu.svelte`
**Changes:**
- Create new component for context menu with options:
  - Cut
  - Copy
  - Move to Group... (opens submenu/dialog)
  - Remove from Group
  - Delete

- Add keyboard trigger (Shift+F10 or context menu key)
- Position menu near focused item
- Make menu keyboard navigable

**Integrate into StudiesPanel:**
- Show context menu on right-click or keyboard trigger
- Pass selected items and available groups to menu

## Phase 5: Focus Management

### Step 15: Implement Focus Management When Panel Opens
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** Focus doesn't move to panel (WCAG 2.4.3)
**Changes:**
- Add ref to search input:

```svelte
let searchInputRef = $state(null);

<Input 
  bind:this={searchInputRef}
  id="search-studies" 
  ...
/>
```

- Add effect to focus search when panel opens:

```svelte
$effect(() => {
  if (isOpen && searchInputRef) {
    // Small delay to allow transition
    setTimeout(() => {
      searchInputRef?.focus();
    }, 100);
  }
});
```

### Step 16: Implement Focus Return When Panel Closes
**File:** Parent component that controls panel (likely layout file)
**Changes:**
- Store reference to button that opens panel
- When panel closes, return focus to that button
- Add `returnFocusRef` prop to StudiesPanel

### Step 17: Ensure Focus Visible During Drag
**File:** `src/lib/composables/useDragAndDrop.svelte.js`
**Issue:** Focus may be lost during drag (WCAG 2.4.11)
**Changes:**
- Ensure dragged items maintain focus indicator
- Don't blur focused element when starting drag
- Return focus to appropriate item after drag completes

### Step 17.5: Implement Keyboard Navigation for Study List
**Files:** 
- `src/lib/componentWidgets/StudiesPanel.svelte`
- `src/lib/componentWidgets/studies/StudyItem.svelte`
- `src/lib/componentWidgets/studies/StudyGroup.svelte`

**Issue:** Cannot navigate through studies/groups with keyboard (WCAG 2.1.1, 2.4.3)

**Implementation Approach:** Use the "Roving Tabindex" pattern (ARIA Authoring Practices Guide)

#### Changes to StudiesPanel.svelte

**Add state for keyboard navigation:**
```javascript
let focusedItemIndex = $state(-1);
let flattenedItems = $derived.by(() => {
  // Flatten the hierarchical structure into a linear array for keyboard nav
  const items = [];
  sortedGroupsAndStudies.forEach(item => {
    if (item.type === 'group') {
      items.push({ type: 'group', id: item.data.id, element: null });
      if (item.data.isExpanded) {
        // Add nested items if expanded
        item.data.studies?.forEach(study => {
          items.push({ type: 'study', id: study.id, element: null });
        });
        // Recursively add nested groups
        // ... (similar logic for nested groups)
      }
    } else {
      items.push({ type: 'study', id: item.data.id, element: null });
    }
  });
  return items;
});
```

**Add keyboard event handler:**
```javascript
function handleListKeyDown(event) {
  const itemCount = flattenedItems.length;
  if (itemCount === 0) return;

  // Initialize focus if not set
  if (focusedItemIndex === -1 && itemCount > 0) {
    focusedItemIndex = 0;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusedItemIndex = Math.min(focusedItemIndex + 1, itemCount - 1);
      focusItem(focusedItemIndex);
      break;

    case 'ArrowUp':
      event.preventDefault();
      focusedItemIndex = Math.max(focusedItemIndex - 1, 0);
      focusItem(focusedItemIndex);
      break;

    case 'Home':
      event.preventDefault();
      focusedItemIndex = 0;
      focusItem(focusedItemIndex);
      break;

    case 'End':
      event.preventDefault();
      focusedItemIndex = itemCount - 1;
      focusItem(focusedItemIndex);
      break;

    case 'PageDown':
      event.preventDefault();
      // Jump 10 items or to end
      focusedItemIndex = Math.min(focusedItemIndex + 10, itemCount - 1);
      focusItem(focusedItemIndex);
      break;

    case 'PageUp':
      event.preventDefault();
      // Jump 10 items or to start
      focusedItemIndex = Math.max(focusedItemIndex - 10, 0);
      focusItem(focusedItemIndex);
      break;
  }
}

function focusItem(index) {
  const item = flattenedItems[index];
  if (!item) return;

  // Find the DOM element and focus it
  const selector = item.type === 'group' 
    ? `[data-group-id="${item.id}"]`
    : `[data-study-id="${item.id}"]`;
  
  const element = document.querySelector(selector);
  if (element) {
    element.focus();
    // Scroll into view if needed
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
```

**Update markup:**
```svelte
<div 
  class="studies-container"
  onkeydown={handleListKeyDown}
  role="list"
>
  {#each sortedGroupsAndStudies as item, index (item.type === 'group' ? 'group-' + item.data.id : 'study-' + item.data.id)}
    <div role="listitem">
      {#if item.type === 'group'}
        <StudyGroup
          group={item.data}
          tabindex={index === 0 ? 0 : -1}
          data-group-id={item.data.id}
          onfocus={() => focusedItemIndex = index}
          ...
        />
      {:else}
        <StudyItem
          study={item.data}
          tabindex={index === 0 ? 0 : -1}
          data-study-id={item.data.id}
          onfocus={() => focusedItemIndex = index}
          ...
        />
      {/if}
    </div>
  {/each}
</div>
```

#### Changes to StudyItem.svelte

**Add tabindex prop:**
```javascript
let { 
  study,
  tabindex = -1,  // New prop
  ...otherProps 
} = $props();
```

**Update button/link:**
```svelte
<button 
  class="study-item"
  tabindex={tabindex}
  data-study-id={study.id}
  ...
>
```

#### Changes to StudyGroup.svelte

**Add tabindex prop:**
```javascript
let { 
  group,
  tabindex = -1,  // New prop
  ...otherProps 
} = $props();
```

**Update button:**
```svelte
<button 
  class="group-select-button"
  tabindex={tabindex}
  data-group-id={group.id}
  ...
>
```

#### Key Features:

1. **Roving Tabindex:** Only one item in the list is tabbable (tabindex="0") at a time
2. **Arrow Keys:** Navigate up/down through visible items
3. **Home/End:** Jump to first/last item
4. **Page Up/Down:** Jump by 10 items
5. **Auto-scroll:** Focused item scrolls into view
6. **Respects Hierarchy:** Only navigates through currently visible items (respects collapsed groups)
7. **Focus Tracking:** Updates focused index when items receive focus

#### Accessibility Benefits:

- ✅ WCAG 2.1.1: Keyboard accessible
- ✅ WCAG 2.4.3: Focus order is logical
- ✅ WCAG 2.4.7: Focus visible
- ✅ ARIA 1.2: Follows roving tabindex pattern
- ✅ Efficient: Only one Tab stop for entire list
- ✅ Intuitive: Arrow keys for navigation (standard pattern)

## Phase 6: Instructions and Help

### Step 18: Add Instructions for Multi-Select
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Issue:** No instructions provided (WCAG 3.3.2)
**Changes:**
- Add info icon button in panel header:

```svelte
<div class="panel-header">
  <Input ... />
  <button 
    class="help-button" 
    aria-label="Keyboard shortcuts help"
    onclick={() => showHelpModal = true}
  >
    <Icon iconId="help" />
  </button>
</div>
```

- Create help modal with instructions:
  - Click to select
  - Shift+Click for range selection
  - Cmd/Ctrl+Click for multi-selection
  - Arrow keys for navigation
  - Enter to open
  - Ctrl+X/C/V for cut/copy/paste
  - Right-click or Shift+F10 for context menu
  - Esc to deselect all

### Step 19: Add Tooltip for Resize Handle
**File:** `src/lib/componentWidgets/StudiesPanel.svelte`
**Changes:**
- Add title attribute or tooltip component to resize handle:

```svelte
<div 
  class="resize-handle"
  title="Drag to resize panel, or use arrow keys when focused"
  ...
>
```

## Phase 7: Color and Visual Verification

### Step 20: Verify Color Contrast Ratios
**Action:** Use browser DevTools or contrast checker
**Check:**
- Search input text vs background: minimum 4.5:1
- Study titles (--black) vs background (--gray-lighter): minimum 4.5:1
- Study references (--gray-300) vs background: minimum 4.5:1
- Empty message (--gray-400) vs background: minimum 4.5:1
- Selected background (--blue-light) vs text: minimum 4.5:1
- Active background (--blue) vs white text: minimum 4.5:1
- Icons fills vs backgrounds: minimum 3:1

**If any fail:**
- Adjust CSS custom properties in `src/lib/stylesheets/_color-variables.css`
- Re-test until all pass

### Step 21: Verify Non-Text Contrast
**Action:** Use browser DevTools or contrast checker
**Check:**
- Border colors vs backgrounds: minimum 3:1
- Focus indicators (--blue) vs backgrounds: minimum 3:1
- Resize handle vs panel background: minimum 3:1
- Selection borders vs background: minimum 3:1
- Drop target indicator vs background: minimum 3:1

**If any fail:**
- Adjust border widths or colors
- Add additional visual cues if needed

### Step 22: Verify Focus Indicators
**Action:** Tab through all interactive elements
**Check:**
- Focus visible on all elements
- Focus not obscured by overlays or scroll containers
- Focus indicator has 3:1 contrast
- Focus indicator at least 2px thick or equivalent area

**If any fail:**
- Adjust focus styles in component CSS
- Ensure z-index doesn't hide focus
- Scroll focused element into view

## Phase 8: Testing and Refinement

### Step 23: Screen Reader Testing
**Action:** Test with NVDA (Windows) or VoiceOver (Mac)
**Test scenarios:**
- Navigate through studies with Tab
- Use search and verify results announced
- Select items and verify selection announced
- Try keyboard shortcuts (cut/copy/paste)
- Navigate with arrow keys
- Verify all labels and descriptions are clear

**Document and fix any issues found**

### Step 24: Keyboard-Only Testing
**Action:** Navigate without mouse
**Test scenarios:**
- Open panel with keyboard
- Search for studies
- Navigate through filtered results
- Select multiple items with Shift/Ctrl
- Use cut/copy/paste to move items
- Resize panel with keyboard
- Expand/collapse groups
- Access all functionality

**Document and fix any issues found**

### Step 25: Mobile/Touch Testing
**Action:** Test on touch devices
**Test scenarios:**
- Tap targets easy to hit (24x24px minimum)
- Gestures work consistently
- No hover-only functionality
- Focus indicators visible when using keyboard on tablet

**Document and fix any issues found**

### Step 26: Automated Accessibility Testing
**Action:** Run automated tools
**Tools:**
- axe DevTools browser extension
- WAVE browser extension
- Lighthouse accessibility audit

**Fix any issues reported by automated tools**

### Step 27: Create Accessibility Documentation
**Action:** Document keyboard shortcuts and patterns
**Create:**
- Keyboard shortcuts reference
- Component accessibility features documentation
- Testing checklist for future changes

## Summary

This plan addresses all 21 WCAG 2.2 AA issues identified, organized into 27 implementation steps across 8 phases:

1. **Phase 1:** Critical Level A fixes (Steps 1-5)
2. **Phase 2:** Live regions and announcements (Steps 6-8)
3. **Phase 3:** Semantic structure (Steps 9-11)
4. **Phase 4:** Keyboard drag-and-drop alternatives (Steps 12-14)
5. **Phase 5:** Focus management (Steps 15-17)
6. **Phase 6:** Instructions and help (Steps 18-19)
7. **Phase 7:** Color and visual verification (Steps 20-22)
8. **Phase 8:** Testing and refinement (Steps 23-27)

Each step can be reviewed and implemented independently, with testing after each phase.

## Priority Order Recommendation

For maximum impact with minimal effort, consider this implementation order:

**Week 1: Critical Fixes**
- Steps 1-5 (Phase 1)
- Steps 6-8 (Phase 2)

**Week 2: Semantic & Keyboard Navigation**
- Steps 9-11 (Phase 3)
- Steps 15-17 (Phase 5)

**Week 3: Advanced Keyboard Features**
- Steps 12-14 (Phase 4)
- Steps 18-19 (Phase 6)

**Week 4: Testing & Polish**
- Steps 20-22 (Phase 7)
- Steps 23-27 (Phase 8)

This staged approach ensures critical accessibility barriers are removed first, while allowing time for thorough testing of more complex features.
