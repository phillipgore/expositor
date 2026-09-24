<script>
	/**
	 * # AddToSeriesModal Component
	 *
	 * Adds an existing standalone study to a series as a new part (SERIES_PLAN Q17, phase 3).
	 *
	 * ## Refusals are shown; warnings are not
	 *
	 * §4's invariant table is deliberately uneven: a translation mismatch **refuses**, while a gap, an
	 * overlap or a different book only **warn**. Only the refusal is surfaced, because only the refusal
	 * is actionable — it is the reason Add is disabled, and picking a different series is the response.
	 * A warning has no response: Prison Epistles is four books with three permanently dead boundaries
	 * and is §4's own example of a legitimate series, so "structural commands will not work across that
	 * boundary" was a paragraph the user could only read and dismiss. The dry run still fetches them
	 * (the planner that judges the add is the planner that performs it), and they remain on the response
	 * for anything that needs them; this dialog simply does not lecture.
	 *
	 * ## One sentence, one control, one line
	 *
	 * The dialog says what will happen ("… as the last part of the series you select"), offers the
	 * one decision it needs (which series), and keeps a single line beneath the picker for the one
	 * thing that can stop it. There is no outcome table: "Part 5 of 5" only restates "the last
	 * part", which the sentence already promised. Both the study and each series carry their
	 * translation badge, because translation is the one invariant that can refuse the add (§4) —
	 * showing it on both sides means a mismatch is visible before the line has to say so.
	 *
	 * ## The error line is always laid out
	 *
	 * Changing the selection re-runs the dry run, so the line can appear or disappear on any pick.
	 * If it only occupied space when filled, the dialog's height would change — and a centred
	 * `<dialog>` grows from both edges, so the whole thing visibly jumps while the pointer is still
	 * on the dropdown the user just used. The paragraph is therefore always rendered and reserved
	 * with `min-height`, and only its text changes. `visibility` rather than `display` because the
	 * box must keep its layout while empty.
	 *
	 * ## Two entry points, one dialog
	 *
	 * The menu command leaves the target open, so the user picks a series. The drag gesture has already
	 * named one by dropping on its row, so `fixedSeriesId` preselects it and the picker goes away — an
	 * enabled dropdown there would invite the user to contradict the gesture they just made, and a
	 * disabled one would be a control that cannot be operated. The confirmation itself is NOT skipped:
	 * the drop chose a target, it did not read §4's warnings.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} study - The standalone study being added
	 * @property {Array} series - Every series available to the user
	 * @property {string|null} [fixedSeriesId] - Target chosen by a drop; hides the picker when set
	 * @property {Function} onDone - Called after a successful add
	 * @property {Function} onClose
	 *
	 * @component
	 */
	import { untrack } from 'svelte';
	import Modal from '$lib/componentElements/Modal.svelte';
	import Select from '$lib/componentElements/Select.svelte';
	import { getTranslationAbbreviation } from '$lib/utils/translationConfig.js';

	let {
		isOpen = false,
		study = null,
		series = [],
		fixedSeriesId = null,
		onDone,
		onClose
	} = $props();

	let selectedSeriesId = $state('');
	let error = $state('');
	let submitting = $state(false);

	/**
	 * Reset to the default target each time the dialog opens.
	 *
	 * ⚠️ `untrack` is load-bearing, not defensive. `refresh()` reads `selectedSeriesId` (to build
	 * the request URL), so calling it inside a tracked effect subscribes this effect to the state
	 * it resets: picking a series re-ran the effect, which set the value straight back to
	 * `series[0]` and made the dropdown look like it ignored the click. Keyed on `isOpen` alone —
	 * the open transition is the only thing that should re-seed the selection.
	 */
	$effect(() => {
		if (!isOpen) return;
		untrack(() => {
			// A dropped target wins over the first-series default: the gesture already said which one.
			selectedSeriesId = fixedSeriesId ?? series?.[0]?.id ?? '';
			error = '';
			submitting = false;
			void refresh();
		});
	});

	/**
	 * Dry-run the add so a refusal is known before the user presses Add rather than after.
	 *
	 * The result itself is discarded — the dialog shows nothing from a successful plan, since
	 * "the last part" is already promised by the sentence and the warnings are not surfaced. What
	 * this call is for is the failure path: `request()` sets `error`, which is what disables Add
	 * and fills the line under the picker.
	 */
	async function refresh() {
		if (!selectedSeriesId || !study?.id) return;
		await request(true);
	}

	/** One request shape for the dry run and the commit, so they cannot diverge. */
	async function request(dryRun) {
		error = '';
		try {
			const response = await fetch(`/api/series/${selectedSeriesId}/parts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ studyId: study.id, dryRun })
			});
			const result = await response.json();
			if (!response.ok) {
				// The planner's refusal names both translations, or says the study already belongs
				// somewhere — more use to the reader than a generic failure.
				error = result?.error ?? 'Could not add this study to the series.';
				return null;
			}
			return result;
		} catch (err) {
			console.error('Add to series failed:', err);
			error = 'Could not reach the server.';
			return null;
		}
	}

	async function handleConfirm() {
		if (submitting) return;
		submitting = true;
		try {
			const result = await request(false);
			if (result?.ok) onDone?.(result);
		} finally {
			submitting = false;
		}
	}

	let targetSeries = $derived(series?.find((s) => s.id === selectedSeriesId) ?? null);

	// Shared with the Finder's rows, so a study and a series read the same way here as they do in
	// the tree they were just selected in.
	const abbr = getTranslationAbbreviation;

	/**
	 * A series' translation: `studySeries.translation` is authoritative (§4), but a row loaded
	 * without it still has parts, and every part of a series shares one translation by
	 * construction — so the first part answers the question when the column is absent.
	 */
	function seriesTranslation(row) {
		return row?.translation ?? row?.parts?.[0]?.translation ?? null;
	}

	let studyAbbr = $derived(abbr(study?.translation));

	// `Select` takes `{ value, text }`, so the badge is baked into the option text: a native
	// <option> cannot carry the styled span the title line uses.
	let seriesOptions = $derived(
		(series ?? []).map((option) => ({
			value: option.id,
			text: `${option.name} [${abbr(seriesTranslation(option))}]`
		}))
	);

	/**
	 * The one line under the picker: why this series cannot be used, or nothing.
	 *
	 * Warnings are deliberately absent (see the note above) — they never disable Add, so they had
	 * no response for the user to make. A translation mismatch is stated in the compact
	 * `(ESV/NET)` form the badges on both sides have already taught the user to read; the server's
	 * longer sentence is kept for every other refusal, which has no badge to lean on.
	 */
	let errorText = $derived.by(() => {
		if (!error) return '';
		const target = seriesTranslation(targetSeries);
		if (target && study?.translation && target !== study.translation) {
			return `Translation mismatch (${studyAbbr}/${abbr(target)}).`;
		}
		return error;
	});

	// Only a refusal disables Add. Warnings never do — §4 makes contiguity a warning, and blocking on it
	// would forbid the Prison Epistles series the plan names as legitimate.
	let confirmDisabled = $derived(submitting || !selectedSeriesId || Boolean(error));
</script>

<Modal
	{isOpen}
	title="Add to Series"
	size="medium"
	confirmLabel={submitting ? 'Adding…' : 'Add to Series'}
	confirmClasses="blue"
	{confirmDisabled}
	onConfirm={handleConfirm}
	onCancel={onClose}
	{onClose}
>
	{#if !series?.length}
		<p class="explain">There are no series yet. Split a study into a series first.</p>
	{:else}
		<p class="explain">
			Add <strong>{study?.title ?? 'this study'}</strong>
			<span class="translation-badge" aria-label="Translation: {studyAbbr}">[{studyAbbr}]</span> as the
			last part of the series you select.
		</p>

		{#if fixedSeriesId}
			<!-- The drop named the target, so it is stated rather than offered (see the note above).
			     Same line, same place as the picker it replaces, so the dialog does not reflow
			     between the two entry points. -->
			<p class="fixed-target">
				{targetSeries?.name ?? 'Selected series'}
				<span class="translation-badge" aria-label="Translation: {abbr(seriesTranslation(targetSeries))}"
					>[{abbr(seriesTranslation(targetSeries))}]</span
				>
			</p>
		{:else}
			<!-- Unlabelled by design: the sentence above ends in "the series you select", so a
			     "Series" label would be the third statement of the same word. -->
			<Select
				id="target-series"
				name="target-series"
				optionProperties={seriesOptions}
				selectedValue={selectedSeriesId}
				isDisabled={submitting}
				isFullWidth={true}
				handleChange={(event) => {
					selectedSeriesId = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
					void refresh();
				}}
			/>
		{/if}

		<!-- Always present so the dialog's height never changes with the selection (see the note
		     above). `role="alert"` because when it does fill, it has just disabled Add. -->
		<p class="error" class:is-empty={!errorText} role="alert">{errorText}</p>
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	/* Matches the Finder's badge (StudyItem.svelte): the bracketed translation reads as an
	   annotation on the title, not as part of the sentence. */
	.translation-badge {
		font-size: 1.4rem;
		color: var(--gray-300);
	}

	.fixed-target {
		margin: 0;
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--black);
	}

	/* Sits directly under the picker, so it reads as that control's consequence.
	   `min-height` reserves one line permanently: the dry run on every selection change can add or
	   remove this text, and a centred <dialog> that changes height appears to jump. Two lines'
	   worth is NOT reserved — a refusal long enough to wrap is the rare case, and reserving for it
	   would leave a visible hole under the picker in the common one. */
	.error {
		margin: 0.8rem 0 0;
		min-height: 1.9rem;
		font-size: 1.4rem;
		line-height: 1.35;
		color: var(--red);
	}

	/* Keeps the reserved box in the layout while it has nothing to say. `display: none` would
	   collapse it and restore the jump this exists to prevent. */
	.error.is-empty {
		visibility: hidden;
	}
</style>
