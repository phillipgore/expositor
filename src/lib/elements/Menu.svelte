<script>
	// Menu Component (Modern - CSS Popover & Anchor Positioning)
	// Dropdown menu container using native CSS Popover API and Anchor Positioning.
	// Significantly simplified from legacy version - no manual positioning needed.
	
	let {
		menuId,
		classes = '',
		alignment = 'start',
		ariaLabel = undefined,
		children
	} = $props();

	// Generate anchor reference from menuId
	let anchorName = `--anchor-${menuId}`;
	
	// Build alignment class (always apply for explicit control)
	let alignmentClass = `align-${alignment}`;

	// Keyboard navigation state
	let menuElement = $state(null);
	let currentFocusIndex = $state(0);
	let itemFocused = $state(false);

	/**
	 * Get all focusable menu items (buttons with role="menuitem")
	 * Excludes dividers and other non-interactive elements
	 */
	function getMenuItems() {
		if (!menuElement) return [];
		return Array.from(menuElement.querySelectorAll('[role="menuitem"]'));
	}

	/**
	 * Focus a menu item by index and update tabindex (roving tabindex pattern)
	 */
	function focusMenuItem(index) {
		const items = getMenuItems();
		
		if (items[index]) {
			// Remove tabindex from all items
			items.forEach(item => item.setAttribute('tabindex', '-1'));
			// Set tabindex on focused item
			items[index].setAttribute('tabindex', '0');
			
			// Focus the item
			currentFocusIndex = index;
			items[index].focus();
			itemFocused = true;
		}
	}

	/**
	 * Initialize tabindex for all menu items (roving tabindex pattern)
	 * All items get tabindex="-1" initially
	 */
	function initializeTabindex() {
		const items = getMenuItems();
		items.forEach((item, index) => {
			item.setAttribute('tabindex', '-1');
		});
	}

	/**
	 * Handle keyboard navigation within the menu
	 */
	function handleKeyDown(event) {
		const items = getMenuItems();
		if (items.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				if (!itemFocused) {
					// First arrow press: focus first item
					focusMenuItem(0);
				} else {
					// Move to next item, wrap to first if at end
					focusMenuItem((currentFocusIndex + 1) % items.length);
				}
				break;

			case 'ArrowUp':
				event.preventDefault();
				if (!itemFocused) {
					// First arrow press: focus last item
					focusMenuItem(items.length - 1);
				} else {
					// Move to previous item, wrap to last if at start
					focusMenuItem((currentFocusIndex - 1 + items.length) % items.length);
				}
				break;

			case 'Home':
				event.preventDefault();
				// Jump to first item
				focusMenuItem(0);
				break;

			case 'End':
				event.preventDefault();
				// Jump to last item
				focusMenuItem(items.length - 1);
				break;

			case 'Escape':
				event.preventDefault();
				// Close menu (popover API handles this)
				// Focus will return to trigger button automatically
				if (menuElement) {
					menuElement.hidePopover();
				}
				break;
		}
	}

	// Track if we've handled the current open state
	let lastOpenState = $state(false);

	// Attach event listeners once
	$effect(() => {
		if (!menuElement) return;

		// Attach keydown event listener
		menuElement.addEventListener('keydown', handleKeyDown);
		
		// Listen for custom event from Button when first item is focused
		const handleFirstItemFocused = () => {
			itemFocused = true;
			currentFocusIndex = 0;
		};
		menuElement.addEventListener('menufirstitemfocused', handleFirstItemFocused);
		
		// Close menu when focus leaves it (e.g., Tab key to next element)
		const handleFocusOut = (event) => {
			// Check if focus moved outside the menu
			setTimeout(() => {
				if (menuElement && menuElement.matches(':popover-open')) {
					const focusedElement = document.activeElement;
					if (focusedElement && !menuElement.contains(focusedElement)) {
						menuElement.hidePopover();
					}
				}
			}, 0);
		};
		menuElement.addEventListener('focusout', handleFocusOut);

		// Cleanup
		return () => {
			menuElement.removeEventListener('keydown', handleKeyDown);
			menuElement.removeEventListener('menufirstitemfocused', handleFirstItemFocused);
			menuElement.removeEventListener('focusout', handleFocusOut);
		};
	});

	// Separate effect to watch for menu opening
	$effect(() => {
		if (!menuElement) return;

		// Check if menu is currently open
		const isOpen = menuElement.matches(':popover-open');
		
		// If state changed to open and we haven't handled it yet
		if (isOpen && !lastOpenState) {
			lastOpenState = true;
			
			// Initialize navigation state - first item will be focused by Button component
			// We set itemFocused to true because Button.svelte will focus the first item
			currentFocusIndex = 0;
			itemFocused = true;  // Set to true since Button will focus item 0

			// Initialize tabindex on all items
			const items = getMenuItems();
			initializeTabindex();
			
			// Button.svelte will handle focusing the first item at 100ms
			// No need to duplicate that logic here
		} else if (!isOpen && lastOpenState) {
			// Menu closed
			lastOpenState = false;
		}
	});
</script>

<div
	bind:this={menuElement}
	id={menuId}
	popover="auto"
	role="menu"
	aria-label={ariaLabel}
	class="menu {classes} {alignmentClass}"
	style="position-anchor: {anchorName}"
	tabindex="-1"
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.menu {
		/* Reset popover defaults */
		margin: 0;
		border: none;
		padding: 0;
		
		/* Menu styling */
		border-radius: 0.3rem;
		padding: 0.3rem;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		background-color: var(--gray-800);
		display: flex;
		flex-direction: column;
		
		/* Remove outline when menu container is focused */
		outline: none;
		
		/* Hide scrollbar but allow scrolling */
		overflow-y: auto;
		-ms-overflow-style: none;
		scrollbar-width: none;
		
		/* CSS Anchor Positioning - position below button by default */
		position-anchor: var(--position-anchor);
		
		/* Position below the anchor, aligned to left edge */
		top: anchor(bottom);
		left: anchor(left);
		margin-top: 0.3rem;
		
		/* Alignment variants using anchor positioning */
		&.align-start {
			left: anchor(left);
		}
		
		&.align-end {
			right: anchor(right);
			left: auto;
		}
		
		&.align-center {
			left: anchor(center);
			translate: -50% 0;
		}
		
		/* Right-aligned menu (legacy support) */
		&.menu-right {
			right: anchor(right);
			left: auto;
		}
		
		/* Handle overflow - try flipping to top if no space below */
		position-try-options: flip-block;
		
		/* Constrain to viewport with some padding */
		max-block-size: calc(100vh - 2rem);
		
		/* Hide webkit scrollbar */
		&::-webkit-scrollbar {
			display: none;
		}
		
		/* Popover open animation */
		&:popover-open {
			animation: menuFadeIn 150ms ease-out;
		}
		
		/* Starting style for animation */
		@starting-style {
			&:popover-open {
				opacity: 0;
				transform: translateY(-0.5rem);
			}
		}
		
		/* Ensure hidden when not open (fallback for polyfill) */
		&:not(:popover-open) {
			display: none;
		}
	}
	
	@keyframes menuFadeIn {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
