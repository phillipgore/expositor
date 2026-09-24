<script>
	/**
	 * # SplitPartModal Component
	 *
	 * Divides one part of a series into two (SERIES_PLAN §8, "Split Part").
	 *
	 * ## The preview comes from the server, not from a second implementation
	 *
	 * `SplitIntoSeriesModal` can preview locally because `planSeriesParts()` is pure. A split
	 * cannot: how many connections the split would break is a fact about stored structure, so only
	 * the server can answer it. This therefore calls the split endpoint with `dryRun: true` and
	 * renders what comes back — the same code path the commit runs, so the dialog cannot promise an
	 * outcome the endpoint will not produce.
	 *
	 * That is also why the split point is a `<select>` populated from the server's `splitPoints`
	 * rather than a stepper computed here: the set of legal points is `getSplitPoints()`'s answer,
	 * and duplicating that rule client-side would be a second place for it to drift.
	 *
	 * ## Compliance is shown; connection loss must be acknowledged
	 *
	 * Warnings never block — §5 records that a user may knowingly build a part that will warn at
	 * export. Broken connections are different: they are destroyed, and Q35 leaves no undo, so the
	 * checkbox is required before the endpoint will proceed (it answers 409 without it).
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} part - The part being split (`id`, `title`)
	 * @property {string} seriesId
	 * @property {Function} onDone - Called after a successful split
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import { messageForFailure } from '$lib/utils/apiErrors.js';

	let { isOpen = false, part = null, seriesId = null, onDone, onClose } = $props();

	let preview = $state(null);
	let loading = $state(false);
	let error = $state('');
	let submitting = $state(false);
	let acknowledgedConnectionLoss = $state(false);

	/** The chosen split point. A string because `<select>` values are strings. */
	let choice = $state('');

	// Reset per opening: a preview left from a previously selected part would describe a split of a
	// different part entirely.
	$effect(() => {
		if (isOpen) {
			preview = null;
			error = '';
			choice = '';
			acknowledgedConnectionLoss = false;
			submitting = false;
			void loadPoints();
		}
	});

	/**
	 * Fetch the legal split points, then preview the first one.
	 *
	 * Asking with no point selected returns the planner's refusal *plus* `splitPoints`, which is
	 * exactly what the control needs — so the rejection is useful rather than merely an error.
	 */
	async function loadPoints() {
		const points = await request({ dryRun: true });
		if (!points) return;

		const found = points.splitPoints;
		const first =
			found?.kind === 'chapter'
				? found.chapters?.[0]
				: found?.kind === 'passage'
					? found.seams?.[0]
					: null;

		if (first != null) {
			choice = String(first);
			await refresh();
		}
	}

	/** Re-run the dry run for the currently chosen point. */
	async function refresh() {
		const result = await request({ dryRun: true });
		if (result?.ok) {
			preview = result;
			error = '';
		}
	}

	/** One request shape for both the dry run and the commit, so they cannot diverge. */
	async function request({ dryRun, confirmConnectionLoss = false }) {
		if (!seriesId || !part?.id) return null;
		loading = dryRun;
		try {
			/** @type {Record<string, unknown>} */
			const body = { partId: part.id, dryRun, confirmConnectionLoss };

			// Which field to send depends on how this part divides. Sending both would let a stale
			// value select the wrong branch server-side.
			if (choice !== '') {
				if (preview?.splitPoints?.kind === 'passage') body.atPassageSeam = Number(choice);
				else body.afterChapter = Number(choice);
			}

			const response = await fetch(`/api/series/${seriesId}/split`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json();

			if (!response.ok) {
				// A 409 is not a failure: it means "acknowledge the loss first", and the payload still
				// carries the full preview, so it is kept rather than discarded.
				if (result?.needsConnectionConfirmation) {
					preview = result;
					error = result.error ?? '';
					return null;
				}
				// Keep any points that came back so the control still works after a rejected point.
				if (result?.splitPoints) {
					preview = { ...(preview ?? {}), splitPoints: result.splitPoints };
				}
				error = messageForFailure(
					response,
					result,
					'Could not prepare the split.',
					'split this part'
				);
				return dryRun ? { splitPoints: result?.splitPoints } : null;
			}

			return result;
		} catch (err) {
			console.error('Split request failed:', err);
			error = 'Could not reach the server.';
			return null;
		} finally {
			loading = false;
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		submitting = true;
		error = '';
		try {
			const result = await request({
				dryRun: false,
				confirmConnectionLoss: acknowledgedConnectionLoss
			});
			if (result?.ok) onDone?.(result);
		} finally {
			submitting = false;
		}
	}

	let splitPoints = $derived(preview?.splitPoints ?? null);
	let kind = $derived(splitPoints?.kind ?? 'none');
	let brokenCount = $derived(preview?.connections?.broken ?? 0);

	// The only hard gate. Compliance warnings deliberately do NOT disable Split (§5).
	let confirmDisabled = $derived(
		submitting ||
			loading ||
			choice === '' ||
			kind === 'none' ||
			(brokenCount > 0 && !acknowledgedConnectionLoss)
	);

	// Both parts' display warnings (§10.1 requires re-checking the donor too, because its existing
	// warning may now clear and a stale warning is its own bug).
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
	confirmLabel={submitting ? 'Splitting…' : 'Split'}
	confirmClasses="blue"
	{confirmDisabled}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	{#if kind === 'none'}
		<!-- §11's rule for a dead control: say why, and never imply a fix that is not coming. -->
		<p class="explain">{splitPoints?.reason ?? 'This part cannot be divided.'}</p>
	{:else}
		<p class="explain">
			Divide <strong>{part?.title ?? 'this part'}</strong> into two parts. The later verses move to a
			new part directly after it; every other part keeps its position.
		</p>

		<div class="point-row">
			<label class="point-label" for="split-point">
				{kind === 'chapter' ? 'Split after chapter' : 'Split before passage'}
			</label>
			<select id="split-point" bind:value={choice} onchange={refresh} disabled={submitting}>
				{#if kind === 'chapter'}
					{#each splitPoints.chapters as chapter}
						<option value={String(chapter)}>{chapter}</option>
					{/each}
				{:else}
					<!-- Seams are 0-based internally; shown 1-based, matching the Finder's part numbers. -->
					{#each splitPoints.seams as seam}
						<option value={String(seam)}>{seam + 1}</option>
					{/each}
				{/if}
			</select>
		</div>

		{#if preview?.ok}
			<ul class="halves">
				<li>
					<span class="half-label">Keeps</span>
					<span class="half-ref">{preview.firstReference}</span>
				</li>
				<li>
					<span class="half-label">New part</span>
					<span class="half-ref">{preview.secondReference}</span>
				</li>
			</ul>
		{/if}

		<!-- One yellow Alert per message, and the closing reassurance rides on the LAST of them
		     rather than sitting in its own box. It is the absence of an action, not a finding of
		     its own — StudyForm makes the same argument for keeping "You can still save it" inside
		     the alert it qualifies. A separate Alert would also have been a second yellow box
		     saying nothing was wrong, which is how a wall of alerts starts.

		     No mention of export, matching the other compliance footers; see SplitIntoSeriesModal
		     for the reasoning. -->
		{#if complianceMessages.length > 0}
			{#each complianceMessages as message, i}
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

		{#if brokenCount > 0}
			<!-- Q23 strategy (b): warn with the count, then delete only on acknowledgement. Phase 3
			     replaces this with edge stubs that keep the connections instead. -->
			<Checkbox
				id="split-part-confirm"
				bind:checked={acknowledgedConnectionLoss}
				alignTop
				spacingBottom="0.8rem"
			>
				Delete {brokenCount}
				{brokenCount === 1 ? 'connection' : 'connections'} crossing the new boundary. This cannot be
				undone.
			</Checkbox>
		{/if}

		{#if error}
			<Alert color="red" look="subtle" message={error} spacingBottom="0rem" />
		{/if}
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	.point-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-bottom: 1.2rem;
	}

	.point-label {
		font-size: 1.4rem;
		color: var(--black);
	}

	select {
		font-size: 1.4rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--gray-200);
		border-radius: 0.4rem;
		background: var(--white);
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
