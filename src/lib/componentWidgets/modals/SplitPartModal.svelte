<script>
	/**
	 * # SplitPartModal Component
	 *
	 * Divides one part of a series into two at the CARET (SERIES_PLAN §8, "Split Part";
	 * word-granular parts stage 2).
	 *
	 * ## Like the other split commands
	 *
	 * Split Column, Split Section and Split Segment divide where the caret is. Split Part now does
	 * too: `boundaryWordId` is the caret's insertion word — the first word of the new part — and it
	 * may fall anywhere, including part-way through a verse. There is no point picker. This dialog
	 * exists only because a split restructures the series and has no undo (Q35), so the user sees
	 * the two resulting references before committing.
	 *
	 * ## The preview comes from the server, not from a second implementation
	 *
	 * The dialog calls the split endpoint with `dryRun: true` and renders what comes back — the
	 * same code path the commit runs, so it cannot promise an outcome the endpoint will not produce.
	 * A refusal (e.g. the caret is at the very start of the part) is shown as the server's own reason.
	 *
	 * ## Compliance is shown, never blocking
	 *
	 * §5 records that a user may knowingly build a part that will warn at export. Connections that
	 * cross the new boundary are preserved as edge stubs (§8 strategy (c)), so nothing needs
	 * acknowledging.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} part - The part being split (only `id` is read)
	 * @property {string} seriesId
	 * @property {string|null} boundaryWordId - First word of the new part (the caret's insertion word)
	 * @property {Function} onDone - Called after a successful split
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import { untrack } from 'svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import LoadingText from '$lib/componentElements/LoadingText.svelte';
	import { messageForFailure } from '$lib/utils/apiErrors.js';

	let {
		isOpen = false,
		part = null,
		seriesId = null,
		boundaryWordId = null,
		onDone,
		onClose
	} = $props();

	let preview = $state(null);
	let error = $state('');
	let submitting = $state(false);
	/** False until this opening's dry run has answered (or failed). */
	let ready = $state(false);

	/**
	 * Reset per opening, keyed on `isOpen` alone. ⚠️ `untrack` is load-bearing: `request()` reads
	 * props before its first `await`, and without it this effect would subscribe to them and re-run
	 * its own load in a loop — the trap `AddToSeriesModal` and `JoinPartsModal` record.
	 */
	$effect(() => {
		if (!isOpen) return;
		untrack(() => {
			preview = null;
			error = '';
			submitting = false;
			ready = false;
			void loadPreview();
		});
	});

	async function loadPreview() {
		try {
			const result = await request({ dryRun: true });
			if (result?.ok) preview = result;
		} finally {
			ready = true;
		}
	}

	/** One request shape for both the dry run and the commit, so they cannot diverge. */
	async function request({ dryRun }) {
		if (!seriesId || !part?.id || !boundaryWordId) {
			error = 'Place the caret where the new part should begin.';
			return null;
		}
		try {
			const response = await fetch(`/api/series/${seriesId}/split`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ partId: part.id, boundaryWordId, dryRun })
			});
			const result = await response.json();
			if (!response.ok) {
				error = messageForFailure(
					response,
					result,
					'Could not prepare the split.',
					'split this part'
				);
				return null;
			}
			return result;
		} catch (err) {
			console.error('Split request failed:', err);
			error = 'Could not reach the server.';
			return null;
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		submitting = true;
		error = '';
		try {
			const result = await request({ dryRun: false });
			if (result?.ok) onDone?.(result);
		} finally {
			submitting = false;
		}
	}

	let confirmDisabled = $derived(submitting || !ready || !preview?.ok);
	let crossPartCount = $derived(preview?.connections?.crossPart ?? 0);

	// Both parts' display warnings (§10.1 requires re-checking the donor too).
	let complianceMessages = $derived([
		...(preview?.warnings ?? []).map((w) => w.message),
		...(preview?.display?.first ?? []),
		...(preview?.display?.second ?? [])
	]);
</script>

<Modal
	{isOpen}
	title="Split Part"
	size="medium"
	confirmLabel="Split"
	confirmBusy={submitting}
	confirmBusyLabel="Splitting…"
	confirmClasses="blue"
	{confirmDisabled}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	{#if !ready}
		<div class="loading">
			<LoadingText label="Preparing the split…" />
		</div>
	{:else if preview?.ok}
		<p class="explain">This part will be divided at the caret.</p>
		<ul class="halves">
			<li>
				<span class="half-label">Original</span>
				<span class="half-ref">{preview.firstReference}</span>
			</li>
			<li>
				<span class="half-label">New</span>
				<span class="half-ref">{preview.secondReference}</span>
			</li>
		</ul>

		{#if crossPartCount > 0}
			<!-- Information, not a warning: §8 strategy (c) keeps these as edge stubs. -->
			<p class="explain">
				{crossPartCount}
				{crossPartCount === 1 ? 'connection continues' : 'connections continue'} across the new
				boundary and will be shown in both parts.
			</p>
		{/if}

		<!-- One yellow Alert per message; the reassurance rides on the last (see StudyForm). -->
		{#each complianceMessages as message, i (i)}
			<Alert
				color="yellow"
				look="subtle"
				message={i === complianceMessages.length - 1
					? `${message} You can still split this part.`
					: message}
				spacingBottom="0.8rem"
			/>
		{/each}
	{/if}

	{#if ready && error}
		<Alert color="red" look="subtle" message={error} spacingBottom="0rem" />
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	/* Same bottom margin as `.explain`, so the one-line placeholder sits where the first line of
	   the answer will. */
	.loading {
		margin: 0 0 1.2rem;
	}

	.halves {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
		border: 1px solid var(--gray-100);
		border-radius: 0.4rem;
	}

	.halves li {
		display: flex;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-100);
	}

	.halves li:last-child {
		border-bottom: none;
	}

	.half-label {
		min-width: 7rem;
		color: var(--gray-300);
	}

	.half-ref {
		color: var(--black);
	}

	/* Layout AND spacing are the Checkbox element's; the spacing this modal wants is passed
	   in as `spacingBottom` rather than reached in through `:global`, which was never scoped
	   to this component and so fought two other copies of the same rule. The Alerts above take
	   the same prop, for the same reason. */
</style>
