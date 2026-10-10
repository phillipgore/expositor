<script>
	/**
	 * # MenuSectionLabel Component
	 *
	 * Small, non-interactive caption naming the group of menu items beneath it
	 * (e.g. "Shape", "Quick Note Side"). Used in the longer dropdown menus so a
	 * section reads at a glance instead of relying on dividers alone.
	 *
	 * It is aria-hidden and is never matched by Menu.svelte's keyboard
	 * navigation (which only walks [role="menuitem"] / [role="menuitemcheckbox"]),
	 * so arrow keys skip straight over it.
	 *
	 * ## Usage
	 * ```svelte
	 * <MenuSectionLabel label="Shape" />
	 * ```
	 *
	 * @typedef {Object} MenuSectionLabelProps
	 * @property {string} label - Caption text
	 */

	/** @type {MenuSectionLabelProps} */
	let { label } = $props();
</script>

<!-- aria-hidden: purely visual. A loose text node isn't a valid child of role="menu",
     and every item's own label is already self-describing for screen readers. -->
<div class="menu-section-label" aria-hidden="true">{label}</div>

<style>
	/* Accessibility: 11px (html is 62.5%, so 1rem = 10px) and --gray-300 on the
	   --gray-800 menu background = 6.76:1, passing WCAG 1.4.3 (4.5:1). Normal case
	   reads more easily than small caps at this size. */
	.menu-section-label {
		padding: 0.4rem 0.6rem 0.2rem;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--gray-300);
		user-select: none;
		cursor: default;
	}
</style>
