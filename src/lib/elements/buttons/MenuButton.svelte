<script>
	import Button from './Button.svelte';
	import Icon from '../Icon.svelte';

	// MenuButton Component (Modern - CSS Popover & Anchor Positioning)
	// Button that opens a dropdown menu using native CSS Popover API and Anchor Positioning.
	// Significantly simplified from legacy version - no manual positioning or click handlers needed.
	
	/** @type {'button' | 'submit' | 'reset'} */
	let typeDefault = 'button';
	
	let {
		id = undefined,
		classes = undefined,
		menuId,
		iconId = undefined,
		label = undefined,
		underLabel = undefined,
		underLabelClasses = undefined,
		isDisabled = false,
		isFullWidth = false,
		isRound = false,
		type = typeDefault
	} = $props();

	// Generate unique anchor name for CSS anchor positioning
	let anchorName = `--anchor-${menuId}`;

	// Derive icon classes based on whether label is present
	let iconClasses = $derived.by(() => {
		if (!iconId) return '';
		let iconSpace = label ? 'icon-space' : '';
		let blank = iconId === 'blank' ? 'blank' : '';
		return `${iconSpace} ${blank}`.trim();
	});
</script>

<!-- Wrapper for menu dropdowns -->
{#snippet menuWrapper()}
	<span class="menu-wrapper">
		<Button
			{id}
			{classes}
			{isDisabled}
			{isFullWidth}
			{isRound}
			{type}
			ariaHaspopup="true"
			popovertarget={menuId}
			style="anchor-name: {anchorName}"
		>
			{#if iconId}
				<Icon {iconId} classes={iconClasses} />
			{/if}
			{#if label}
				{label}
			{/if}
			<Icon iconId="caret-down" classes="menu-caret" />
		</Button>
	</span>
{/snippet}

{#if underLabel}
	<div class="button-container">
		<div class="button-wrapper">
			{@render menuWrapper()}
			<div class="button-under-label {underLabelClasses} {isDisabled ? 'disabled' : ''}">
				{underLabel}
			</div>
		</div>
	</div>
{:else}
	{@render menuWrapper()}
{/if}

<style>
	.menu-wrapper {
		display: flex;
		flex-direction: column;
	}

	.button-container {
		display: inline-block;

		.button-wrapper {
			display: flex;
			flex-direction: column;
			position: relative;
		}

		.button-under-label {
			text-align: center;
			font-size: 1.1rem;
			letter-spacing: 0.04rem;
			cursor: default;
			padding: 0rem 0.4rem;
			z-index: 5;
			display: block;
			margin-top: 0.3rem;
			font-weight: 400;
			color: var(--black);

			&.light {
				color: var(--white);
			}

			&.disabled {
				opacity: 0.65;
			}
		}

		.menu-wrapper {
			display: flex;
			flex-direction: column;
		}
	}
</style>
