<script>
	import Button from './Button.svelte';
	import Icon from '../Icon.svelte';

	/**
	 * # MenuToggleItem Component
	 * 
	 * A toggle item for use inside dropdown menus. Unlike regular menu items,
	 * clicking a MenuToggleItem does NOT close the menu — allowing the user to
	 * toggle multiple options in a single session before dismissing.
	 * 
	 * Uses the same check/blank icon pattern as MenuZoom: a check icon appears
	 * on the left when active, a blank placeholder when inactive.
	 * 
	 * ## Features
	 * - Proper `role="menuitemcheckbox"` + `aria-checked` ARIA semantics
	 * - Check/blank icon on the left indicates active state (matches MenuZoom pattern)
	 * - Menu stays open on click (no `hidePopover()` call)
	 * - Integrates with toolbar store state via `isActive` and `onToggle` props
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuToggleItem
	 *   iconId="wide"
	 *   label="Wide"
	 *   isActive={$toolbarState.wideLayout}
	 *   onToggle={toggleWide}
	 *   isDisabled={!$toolbarState.canToggleWide}
	 * />
	 * ```
	 * 
	 * @typedef {Object} MenuToggleItemProps
	 * @property {string} label - Text label for the item
	 * @property {boolean} [isActive=false] - Whether the toggle is currently on
	 * @property {() => void} [onToggle] - Callback fired when the item is clicked
	 * @property {boolean} [isDisabled=false] - Whether the item is disabled
	 */

	/** @type {MenuToggleItemProps} */
	let {
		label,
		isActive = false,
		onToggle,
		isDisabled = false
	} = $props();

	const handleClick = () => {
		if (onToggle) {
			onToggle();
		}
	};
</script>

<Button
	classes="menu-light justify-content-left"
	role="menuitemcheckbox"
	ariaChecked={isActive ? 'true' : 'false'}
	isActive={isActive}
	isDisabled={isDisabled}
	handleClick={handleClick}
>
	<Icon iconId={isActive ? 'checkbox-checked' : 'checkbox-unchecked'} isActive={false} classes="icon-space" />
	{label}
</Button>
