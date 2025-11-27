<script>
	/**
	 * Modal Component
	 * 
	 * A flexible, reusable modal dialog component built with the native <dialog> element.
	 * Provides semantic HTML, native accessibility, and keyboard support.
	 * 
	 * ## Features
	 * - Native dialog element with built-in accessibility
	 * - Flexible slot-based content system
	 * - Customizable actions (confirm/cancel)
	 * - Keyboard support (ESC to close)
	 * - Optional backdrop click to close
	 * - Focus management
	 * - Multiple size options
	 * 
	 * ## Usage
	 * ```svelte
	 * <Modal
	 *   isOpen={showModal}
	 *   title="Delete Confirmation"
	 *   confirmLabel="Delete"
	 *   confirmVariant="danger"
	 *   onConfirm={handleDelete}
	 *   onCancel={() => showModal = false}
	 *   onClose={() => showModal = false}
	 * >
	 *   <p>Are you sure you want to delete this item?</p>
	 * </Modal>
	 * ```
	 * 
	 * @component
	 */
	import Icon from './Icon.svelte';
	import Button from './buttons/Button.svelte';

	let {
		isOpen = false,
		title = '',
		showCloseButton = true,
		size = 'medium',
		closeOnBackdropClick = true,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		confirmClasses = 'blue',
		showConfirm = true,
		showCancel = true,
		focusCancelOnOpen = false,
		onClose = () => {},
		onConfirm = null,
		onCancel = null,
		children
	} = $props();

	let dialogElement = $state(null);
	let cancelButtonElement = $state(null);

	/**
	 * Open or close the dialog based on isOpen prop
	 */
	$effect(() => {
		if (!dialogElement) return;

		if (isOpen && !dialogElement.open) {
			dialogElement.showModal();
		} else if (!isOpen && dialogElement.open) {
			dialogElement.close();
		}
	});

	/**
	 * Manage focus when dialog opens
	 * - If opened via keyboard (focusCancelOnOpen=true): focus Cancel button for safety
	 * - If opened via mouse (focusCancelOnOpen=false): focus dialog itself (no button focused)
	 */
	$effect(() => {
		if (!dialogElement || !isOpen) return;

		// Use requestAnimationFrame to ensure dialog is fully rendered and open
		requestAnimationFrame(() => {
			if (focusCancelOnOpen && cancelButtonElement) {
				// Keyboard interaction - focus Cancel button for safe default
				cancelButtonElement.focus();
			} else if (dialogElement.open) {
				// Mouse interaction - focus dialog itself to remove button focus
				dialogElement.focus();
			}
		});
	});

	/**
	 * Handle backdrop click
	 */
	function handleBackdropClick(event) {
		if (!closeOnBackdropClick) return;
		
		// Only close if clicking on the dialog itself (backdrop), not its children
		if (event.target === dialogElement) {
			handleClose();
		}
	}

	/**
	 * Handle close button click
	 */
	function handleClose() {
		onClose();
	}

	/**
	 * Handle cancel button click
	 */
	function handleCancel() {
		if (onCancel) {
			onCancel();
		} else {
			handleClose();
		}
	}

	/**
	 * Handle confirm button click
	 */
	function handleConfirm() {
		if (onConfirm) {
			onConfirm();
		}
	}

	/**
	 * Handle dialog close event (triggered by ESC key or close())
	 */
	function handleDialogClose() {
		if (isOpen) {
			onClose();
		}
	}
</script>

<dialog
	bind:this={dialogElement}
	tabindex="-1"
	class="modal"
	class:modal-small={size === 'small'}
	class:modal-medium={size === 'medium'}
	class:modal-large={size === 'large'}
	onclick={handleBackdropClick}
	onclose={handleDialogClose}
>
	<div class="modal-content" onclick={(e) => e.stopPropagation()}>
		{#if title || showCloseButton}
			<div class="modal-header">
				{#if title}
					<h2 class="modal-title">{title}</h2>
				{/if}
				{#if showCloseButton}
					<button class="modal-close-button" onclick={handleClose} aria-label="Close modal">
						<Icon iconId="x" />
					</button>
				{/if}
			</div>
		{/if}

		<div class="modal-body">
			{@render children?.()}
		</div>

		{#if showConfirm || showCancel}
			<div class="modal-footer">
				{#if showCancel}
					<Button
						bind:buttonElement={cancelButtonElement}
						label={cancelLabel}
						classes="gray"
						handleClick={handleCancel}
					/>
				{/if}
				{#if showConfirm}
					<Button
						label={confirmLabel}
						classes={confirmClasses}
						handleClick={handleConfirm}
					/>
				{/if}
			</div>
		{/if}
	</div>
</dialog>

<style>
	.modal {
		border: none;
		border-radius: 0.8rem;
		padding: 0;
		box-shadow: 0rem 0rem 0.7rem var(--black-alpha);
		max-width: 90vw;
		max-height: 90vh;
	}

	.modal:focus-visible {
		outline: none;
	}

	.modal::backdrop {
		background-color: var(--black-alpha);
		/* backdrop-filter: blur(0.2rem); */
	}

	/* Size variants */
	.modal-small {
		width: 40rem;
	}

	.modal-medium {
		width: 54rem;
	}

	.modal-large {
		width: 72rem;
	}

	/* Ensure modal doesn't exceed viewport on small screens */
	@media (max-width: 600px) {
		.modal-small,
		.modal-medium,
		.modal-large {
			width: 90vw;
		}
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.2rem;
	}

	.modal-title {
		margin: 0.0rem;
		font-size: 2.4rem;
		font-weight: 600;
		color: var(--black);
	}

	.modal-close-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.2rem;
		height: 3.2rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.4rem;
		cursor: pointer;
		color: var(--gray-300);
		transition: background-color 0.2s, color 0.2s;
	}

	.modal-close-button:hover {
		background-color: var(--gray-lighter);
		color: var(--black);
	}

	.modal-close-button :global(.icon) {
		height: 1.6rem;
		width: 1.6rem;
		fill: currentColor;
	}

	.modal-body {
		padding: 1.2rem 1.2rem;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1rem;
		padding: 1.2rem;
	}
</style>
