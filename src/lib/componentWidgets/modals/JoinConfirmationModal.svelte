<script>
	/**
	 * # JoinConfirmationModal Component
	 *
	 * Lightweight confirm shown ONLY when joining a column/section/segment would
	 * fold authored content or affected connections into the preceding item.
	 * Empty joins skip this modal entirely (handled by the caller's dry-run).
	 *
	 * Offers a single global choice for the whole operation:
	 *   - **Merge** (default, non-destructive): headings fill empty slots,
	 *     note/commentary append, tags dedupe, connections re-anchor.
	 *   - **Delete**: discard the joined item's OWN content/connections. Note that
	 *     structural children (a section's segments, a column's sections) always
	 *     move to the previous item and are never lost.
	 *
	 * ## Props
	 * @property {boolean} isOpen - Whether the modal is open
	 * @property {'column'|'section'|'segment'} type - What is being joined
	 * @property {string} summary - Human summary of affected content (e.g. "headings, note, 2 connections")
	 * @property {boolean} noteWillTruncate - Whether Merging would exceed the Quick
	 *   Note character cap (the merged note would be truncated with an ellipsis).
	 *   Only surfaced as a heads-up under the Merge option; the join still proceeds.
	 * @property {Function} onConfirm - async (decision: 'merge'|'delete') => void
	 * @property {Function} onClose - Callback when modal closes/cancels
	 * @property {boolean} openedViaKeyboard - Focus the cancel button on open
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';

	let {
		isOpen = false,
		type = 'segment',
		summary = '',
		noteWillTruncate = false,
		onConfirm,
		onClose,
		openedViaKeyboard = false
	} = $props();

	let decision = $state('merge');
	let joinInProgress = $state(false);
	let joinError = $state('');

	const TYPE_LABEL = { column: 'Column', section: 'Section', segment: 'Segment' };

	// Reset transient state each time the modal opens.

	$effect(() => {
		if (isOpen) {
			decision = 'merge';
			joinError = '';
		}
	});

	async function handleConfirm() {
		if (joinInProgress) return;
		joinInProgress = true;
		joinError = '';
		try {
			if (onConfirm) await onConfirm(decision);
			// Parent handles closing on success.
		} catch (error) {
			console.error('Error confirming join:', error);
			joinError = error.message || 'Failed to join. Please try again.';
		} finally {
			joinInProgress = false;
		}
	}

	function handleClose() {
		if (!joinInProgress) {
			joinError = '';
			if (onClose) onClose();
		}
	}
</script>

<Modal
	{isOpen}
	title={`Join ${TYPE_LABEL[type] || 'Item'}`}
	size="small"
	confirmLabel={joinInProgress ? 'Joining...' : 'Join'}
	confirmClasses="blue"
	cancelLabel="Cancel"
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
	showCloseButton={false}
	closeOnBackdropClick={false}
	focusCancelOnOpen={openedViaKeyboard}
>
	{#if summary}
		<p class="summary">{summary}</p>
	{/if}

	<div class="options">
		<label class="opt">
			<input type="radio" name="join-decision" value="merge" bind:group={decision} />
			<span>Merge</span>
		</label>
		<label class="opt">
			<input type="radio" name="join-decision" value="delete" bind:group={decision} />
			<span>Delete</span>
		</label>
	</div>

	<!-- Quick Notes are capped; merging two long notes overflows the limit. We
	     still allow the Merge (no data is lost to a failed write) but warn that the
	     combined note will be shortened with an ellipsis so the user isn't
	     surprised. Only relevant while Merge is the chosen decision. -->
	{#if noteWillTruncate && decision === 'merge'}
		<p class="truncate-warning">
			The combined note exceeds the character limit and will be shortened (…) when merged.
		</p>
	{/if}


	{#if joinError}
		<p class="modal-message error">{joinError}</p>
	{/if}
</Modal>

<style>
	/* Affected-content summary line — matches PassageReview's removed-verse list
	   text (1.4rem, muted gray). */
	.summary {
		margin: 0;
		font-size: 1.4rem;
		line-height: 1.5;
		color: var(--gray-400);
	}

	/* Radio options matching the RadioButtons element / PassageReview: blue accent,
	   0.6rem gap, 1.4rem black labels. */
	.options {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 1.2rem 0 0;
	}

	.opt {
		display: inline-flex;
		align-self: flex-start;
		align-items: center;
		gap: 0.3rem;
		font-size: 1.4rem;
		color: var(--black);
		cursor: pointer;
	}

	.opt input {
		margin: 0;
		accent-color: var(--blue);
	}

	.opt input:focus,
	.opt input:focus-visible {
		box-shadow: 0rem 0rem 0rem 0rem;
	}

	/* Soft amber heads-up that the merged note will be truncated. Informational
	   (not an error) — the join still succeeds. */
	.truncate-warning {
		margin: 0.9rem 0 0;
		font-size: 1.3rem;
		line-height: 1.5;
		color: var(--gray-400);
		font-style: italic;
	}

	p.modal-message.error {
		margin: 1.2rem 0 0;
		font-size: 1.4rem;
		background-color: var(--red-lighter);
		color: var(--red-darker);
		border: 0.1rem solid var(--red-light);
		border-radius: 0.3rem;
		padding: 0.3rem 0.9rem;
	}
</style>

