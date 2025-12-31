<script>
	/**
	 * LinkPopover Component
	 * 
	 * A popover for editing link display text and URL.
	 * Features auto-save, remove, and open functionality.
	 * 
	 * @typedef {Object} LinkPopoverPosition
	 * @property {number} top - Top position in pixels
	 * @property {number} left - Left position in pixels
	 * @property {'top' | 'bottom'} arrowPosition - Arrow direction
	 */

	/**
	 * @type {{
	 *   linkDisplayText: string,
	 *   linkUrl: string,
	 *   position: LinkPopoverPosition,
	 *   isRemoveDisabled: boolean,
	 *   isOpenDisabled: boolean,
	 *   onUpdate: () => void,
	 *   onRemove: () => void,
	 *   onOpen: () => void,
	 *   onClose: () => void,
	 *   popoverElement?: HTMLElement
	 * }}
	 */
	let {
		linkDisplayText = $bindable(''),
		linkUrl = $bindable(''),
		position,
		isRemoveDisabled,
		isOpenDisabled,
		onUpdate,
		onRemove,
		onOpen,
		onClose,
		popoverElement = $bindable()
	} = $props();
</script>

<div 
	class="link-popover" 
	class:arrow-top={position.arrowPosition === 'top'} 
	bind:this={popoverElement} 
	style="top: {position.top}px; left: {position.left}px;"
>
	<div class="popover-arrow"></div>
	<label class="field-label">
		<span>Display:</span>
		<input
			type="text"
			bind:value={linkDisplayText}
			placeholder="Link text"
			autofocus
			oninput={onUpdate}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					onClose();
				}
			}}
		/>
	</label>
	<label class="field-label">
		<span>Link:</span>
		<input
			type="url"
			bind:value={linkUrl}
			placeholder="https://example.com"
			oninput={onUpdate}
			onkeydown={(e) => {
				if (e.key === 'Escape') {
					e.preventDefault();
					onClose();
				}
			}}
		/>
	</label>
	<div class="button-group">
		<button 
			type="button" 
			onclick={onRemove} 
			disabled={isRemoveDisabled}
			class="remove"
		>
			Remove
		</button>
		<button 
			type="button" 
			onclick={onOpen} 
			disabled={isOpenDisabled}
			class="blue"
		>
			Open
		</button>
	</div>
</div>

<style>
	/* Link Popover with JavaScript Positioning */
	.link-popover {
		/* Fixed positioning relative to viewport */
		position: fixed;
		/* top and left set via inline styles */
		transform: translate(-50%, -100%); /* Center horizontally, position above */
		
		/* Fixed width */
		width: 32rem;
		
		/* Popup styling */
		padding: 1.2rem;
		background: var(--white);
		border: 1px solid var(--gray-700);
		border-radius: 0.4rem;
		box-shadow: 0rem 0.4rem 1.2rem var(--black-alpha);
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		z-index: 1000;
	}

	/* When popover is below cursor */
	.link-popover.arrow-top {
		transform: translate(-50%, 0); /* Position below instead of above */
	}

	/* Popover Arrow - points down when popover is above cursor */
	.popover-arrow {
		position: absolute;
		bottom: -0.6rem;
		left: 50%;
		transform: translateX(-50%) rotate(45deg);
		width: 1.2rem;
		height: 1.2rem;
		background: var(--white);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		z-index: -1;
	}

	/* Arrow points up when popover is below cursor */
	.link-popover.arrow-top .popover-arrow {
		bottom: auto;
		top: -0.6rem;
		transform: translateX(-50%) rotate(225deg);
		border-right: 1px solid var(--gray-700);
		border-bottom: 1px solid var(--gray-700);
		border-left: none;
		border-top: none;
	}

	/* Field Labels - Horizontal layout with label on left */
	.field-label {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.9rem;
	}

	.field-label span {
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--gray-400);
		min-width: 5.2rem;
		flex-shrink: 0;
		text-align: right;
	}

	/* Field Inputs - Match Input component styles */
	.field-label input {
		appearance: none;
		height: 2.8rem;
		padding: 0rem 0.9rem;
		border: 0.1rem solid var(--gray-700);
		border-radius: 0.3rem;
		font-size: 1.4rem;
		font-family: inherit;
		color: var(--black);
		background-color: var(--white);
		flex: 1;
	}

	.field-label input:focus {
		outline: none;
		border-color: var(--blue);
		box-shadow: 0rem 0rem 0.6rem var(--blue-alpha);
	}

	/* Button Group - Full width with equal buttons */
	.link-popover .button-group {
		display: flex;
		gap: 0.6rem;
		justify-content: stretch;
	}

	/* Buttons - Equal width filling container */
	.link-popover button {
		display: flex;
		justify-content: center;
		align-items: center;
		white-space: nowrap;
		flex: 1;
		height: 2.8rem;
		padding: 0rem 0.6rem;
		border-radius: 0.3rem;
		border: none;
		outline: 0;
		font-size: 1.2rem;
		font-weight: 500;
		color: var(--white);
		background-color: var(--gray-400);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.link-popover button:hover {
		opacity: 0.9;
	}

	.link-popover button:active {
		opacity: 0.8;
	}

	.link-popover button:focus-visible {
		outline: 0.2rem solid var(--gray-400);
		outline-offset: 0.1rem;
	}

	.link-popover button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
</style>
