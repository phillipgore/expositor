<script>
	/**
	 * # SplitIntoSeriesModal Component
	 *
	 * Turns an existing study into a series (SERIES_PLAN §5, "Split into a series…").
	 *
	 * ## The preview is the point, not the stepper
	 *
	 * §5: "The preview matters more than the control — it is how the user notices that Psalms at
	 * one chapter per part means 150 parts BEFORE committing." So the part list, the counts and
	 * the compliance position are all recomputed live as the stepper moves, and none of it is
	 * deferred to the server. `planSeriesParts()` is the same function the creation endpoint
	 * runs, so what is previewed here is exactly what gets built — a second, "close enough"
	 * preview implementation would be free to drift from the thing it is previewing.
	 *
	 * ## Compliance is shown, never enforced
	 *
	 * Warnings appear as the stepper moves (§5, "the preview is where compliance lives"), but
	 * Create is never disabled because of them. A user may knowingly create an ESV series that
	 * will warn — later block — at export; §5 records that as the correct outcome and asks that
	 * nobody "fix" it by blocking creation. Create is disabled only when the plan is not a
	 * series at all (fewer than 2 parts).
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {Object} study - The source study (with `passages` and `translation`)
	 * @property {string|null} error - Server-side failure to surface, if any
	 * @property {Function} onCreate - (chaptersPerPart:number, options:{balanceByLength:boolean, targetParts:number}) => Promise<void>
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Stepper from '$lib/componentElements/Stepper.svelte';
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import { planSeriesParts, getPartingStrategy } from '$lib/utils/seriesPlanning.js';

	let { isOpen = false, study = null, error = null, onCreate, onClose } = $props();

	// §5/Q9: the default is 1, and the user chooses. Never derived from range length.
	//
	// Held as a string because `Input` surfaces strings; `chaptersPerPart` below is the parsed,
	// clamped number everything else uses. Binding a number straight to `Input` types-errors and,
	// worse, lets a blank or half-typed field ("1" → "" → "12") reach the planner as NaN.
	let chaptersInput = $state('1');
	let isSubmitting = $state(false);

	$effect(() => {
		if (isOpen) {
			chaptersInput = '1';
			isSubmitting = false;
		}
	});

	let passages = $derived(study?.passages ?? []);

	let strategy = $derived(getPartingStrategy(passages));

	// Only the chapters-per-part strategy has anything to steer; one-part-per-passage is
	// already decided by the seams the user drew, so the stepper would be a lie there.
	let showStepper = $derived(strategy === 'chapters-per-part');

	// The chapter span, used to bound the stepper. A setting beyond this yields one part, which
	// is not a series.
	let totalChapters = $derived(
		strategy === 'chapters-per-part' && passages[0]
			? passages[0].toChapter - passages[0].fromChapter + 1
			: 0
	);

	// Half the span is the largest setting that can still produce 2 parts.
	let maxChaptersPerPart = $derived(totalChapters > 1 ? Math.floor(totalChapters / 2) : 1);

	// The parsed, clamped setting. Falls back to 1 while the field is mid-edit rather than
	// letting NaN reach the planner and blank the preview.
	let chaptersPerPart = $derived.by(() => {
		const parsed = parseInt(chaptersInput, 10);
		if (!Number.isFinite(parsed) || parsed < 1) return 1;
		return Math.min(parsed, Math.max(1, maxChaptersPerPart));
	});

	// ── "Balance by length" (§5 option (b), Q11) ──────────────────────────────────
	//
	// §5: fixed chapters-per-part is the default because "chapter boundaries are meaningful to readers
	// in a way equal verse counts are not", and balancing is "an option the user may choose, never a
	// re-balancing the app applies on their behalf". So this is off unless ticked, and the control it
	// replaces stays visible — the user can see which of the two they are getting.
	// Held as a MODE rather than a boolean, because the two strategies are now mutually exclusive
	// radio options rather than a default plus a modifier. `balanceByLength` is derived from it so
	// the planner call and `onCreate` payload are untouched — the planner's contract did not change,
	// only the control that feeds it.
	/** @type {'chapters' | 'balance'} */
	let partingMode = $state(/** @type {'chapters' | 'balance'} */ ('chapters'));
	let balanceByLength = $derived(partingMode === 'balance');

	const PARTING_MODES = [
		{ id: 'parting-chapters', value: 'chapters', text: 'Chapters per part' },
		{ id: 'parting-balance', value: 'balance', text: 'Balance by length' }
	];

	// The part count to balance into. Seeded from whatever the chapters-per-part stepper currently
	// implies, so switching mode does not jump to an unrelated shape: the user keeps roughly the number
	// of parts they were already looking at, now evened out.
	let balanceTargetInput = $state('');

	$effect(() => {
		if (isOpen) partingMode = 'chapters';
	});

	// Seeded when the mode is selected, and left alone afterwards so the user's own number survives
	// a stepper nudge. Held as a string because `Input` surfaces strings.
	//
	// Cleared on the way back to chapters, which is what makes the seeding happen again on the next
	// switch rather than restoring a stale number from two modes ago. The chapters value is NOT
	// cleared in return: it is the default mode and the field the user starts in, so it keeps its
	// own position across a round trip.
	$effect(() => {
		if (balanceByLength && balanceTargetInput === '') {
			balanceTargetInput = String(Math.max(2, fixedPartCount));
		}
		if (!balanceByLength) balanceTargetInput = '';
	});

	let balanceTarget = $derived.by(() => {
		const parsed = parseInt(balanceTargetInput, 10);
		if (!Number.isFinite(parsed) || parsed < 2) return 2;
		return Math.min(parsed, Math.max(2, totalChapters));
	});

	/** Ranges in the shape the planner reads, normalised once. */
	let plannerPassages = $derived(
		passages.map((p) => ({
			testament: p.testament,
			book: p.bookId ?? p.book,
			fromChapter: p.fromChapter,
			fromVerse: p.fromVerse,
			toChapter: p.toChapter,
			toVerse: p.toVerse
		}))
	);

	// How many parts the CHAPTERS-PER-PART setting yields, used only to seed the balance target above.
	// Computed from the planner rather than by dividing, so the two cannot disagree about rounding.
	let fixedPartCount = $derived(
		planSeriesParts({
			passages: plannerPassages,
			chaptersPerPart,
			translationId: study?.translation,
			baseTitle: ''
		}).parts.length
	);

	let plan = $derived(
		planSeriesParts({
			passages: plannerPassages,
			chaptersPerPart,
			translationId: study?.translation,
			baseTitle: study?.title ?? '',
			balanceByLength,
			targetParts: balanceByLength ? balanceTarget : 0
		})
	);

	let parts = $derived(plan.parts);
	let partWarnings = $derived(plan.warnings.filter((w) => w.scope === 'part'));
	let seriesWarnings = $derived(plan.warnings.filter((w) => w.scope === 'series'));

	/** Which parts are individually over a limit, so the list can mark them. */
	let flaggedOrders = $derived(new Set(partWarnings.map((w) => w.seriesOrder)));

	// Part-scoped findings first, then series-scoped: the same precedence the markup used when
	// these were two loops inside one panel. Flattened to strings here so the template can tell
	// which is LAST and append the "you can still create this" sentence to it.
	let complianceMessages = $derived([
		...partWarnings.map((w) => w.message),
		...seriesWarnings.map((w) => w.message)
	]);

	let averageVerses = $derived(parts.length > 0 ? Math.round(plan.totalVerses / parts.length) : 0);

	// Q10: soft-warn above ~30 parts, confirm at 150. A refusal is wrong here — 150 parts is
	// probably a mis-click, but it is also exactly what a Psalms series legitimately is.
	let isLargePartCount = $derived(parts.length > 30);
	let needsConfirmation = $derived(parts.length >= 150);
	let hasConfirmedLarge = $state(false);

	$effect(() => {
		// Re-arm the confirmation whenever the count drops back under the threshold, so the
		// checkbox cannot stay silently ticked from a previous stepper position.
		if (!needsConfirmation) hasConfirmedLarge = false;
	});

	// Create is blocked only when the plan is not a series. NOT for compliance warnings (§5).
	let canCreate = $derived(
		parts.length >= 2 && (!needsConfirmation || hasConfirmedLarge) && !isSubmitting
	);

	function stepDown() {
		if (chaptersPerPart > 1) chaptersInput = String(chaptersPerPart - 1);
	}

	function stepUp() {
		if (chaptersPerPart < maxChaptersPerPart) chaptersInput = String(chaptersPerPart + 1);
	}

	async function handleCreate() {
		if (!canCreate) return;
		isSubmitting = true;
		try {
			// The balance options travel with the setting, because the endpoint re-plans server-side.
			// Sending only `chaptersPerPart` would rebuild the series with the DEFAULT shape while the
			// user had approved a balanced preview — §5's "the preview a user approves is the parting
			// they get" broken by omission.
			await onCreate?.(chaptersPerPart, {
				balanceByLength,
				targetParts: balanceByLength ? balanceTarget : 0
			});
		} finally {
			isSubmitting = false;
		}
	}

	function handleClose() {
		onClose?.();
	}
</script>

<Modal
	{isOpen}
	title="Split into a Series"
	size="medium"
	confirmLabel={isSubmitting ? 'Creating…' : 'Create Series'}
	cancelLabel="Cancel"
	confirmDisabled={!canCreate}
	onConfirm={handleCreate}
	onCancel={handleClose}
	onClose={handleClose}
>
	{#if strategy === 'ineligible'}
		<p class="explain">
			This study covers a single chapter, so there is nothing to divide. A series needs at least two
			chapters.
		</p>
	{:else}
		{#if showStepper}
			<!-- §5 option (b), Q11, now a RADIO PAIR rather than a checkbox modifying the stepper.
			     The two are mutually exclusive strategies, and a checkbox said otherwise: it read as
			     "chapters per part, and also balanced", which is not a shape the planner has. One
			     stepper serves both, its meaning named by whichever option is selected.

			     Controlled mode (`bind:value`). The uncontrolled path re-derives the selection from
			     `isChecked` in an `$effect`, which fights a caller-owned binding and resets it on every
			     props rebuild — the failure RadioButtons' own docblock records against `createAsSeries`.

			     Chapters is the default: §5 keeps chapter boundaries first because they are meaningful
			     to readers in a way equal verse counts are not. -->
			<div class="parting-modes">
				<RadioButtons
					RadioButtonProperties={PARTING_MODES}
					name="parting-mode"
					isInline
					bind:value={partingMode}
				/>
			</div>

			<!--
				ONE stepper, its meaning following the mode above. The summary §5 sketches —
				"16 parts · avg 27 verses each" — is the same either way, because it describes the
				RESULT rather than the input.

				The bounds genuinely differ: chapters-per-part cannot exceed half the span or it
				yields one part, while a target part count runs up to one part per chapter. So the
				two values live in separate state and are seeded on switch rather than carried
				across — clamping 8 chapters into 8 parts would be a different shape wearing the
				same number.

				No visible `label`: the radio pair directly above already names what the number
				means, and a second name under it would be the same word twice. `ariaLabel` carries
				the accessible name instead, so the field is still named for a screen reader.
			-->
			{#if balanceByLength}
				<Stepper
					id="balance-parts"
					name="balance-parts"
					ariaLabel="Number of parts"
					unit={balanceTarget === 1 ? 'Part' : 'Parts'}
					bind:value={balanceTargetInput}
					min={2}
					max={Math.max(2, totalChapters)}
					decrementDisabled={balanceTarget <= 2}
					incrementDisabled={balanceTarget >= Math.max(2, totalChapters)}
					decrementLabel="Fewer parts"
					incrementLabel="More parts"
					summary={`${parts.length} parts · avg ${averageVerses} verses each`}
				/>
			{:else}
				<Stepper
					id="chapters-per-part"
					name="chapters-per-part"
					ariaLabel="Chapters per part"
					unit={chaptersPerPart === 1 ? 'Chapter' : 'Chapters'}
					bind:value={chaptersInput}
					min={1}
					max={maxChaptersPerPart}
					onDecrement={stepDown}
					onIncrement={stepUp}
					decrementDisabled={chaptersPerPart <= 1}
					incrementDisabled={chaptersPerPart >= maxChaptersPerPart}
					decrementLabel="Fewer chapters per part"
					incrementLabel="More chapters per part"
					summary={`${parts.length} parts · avg ${averageVerses} verses each`}
				/>
			{/if}

		{:else}
			<p class="explain">
				This study has {passages.length} passages, so it will divide into
				{passages.length} parts — one per passage, keeping the divisions you already made.
			</p>
		{/if}

		<!-- Live part list. Scrolls rather than truncates: seeing that the list runs to 150 IS
		     the information §5 wants the user to have before committing. -->
		<ul class="parts" aria-live="polite">
			{#each parts as part (part.seriesOrder)}
				<li class:flagged={flaggedOrders.has(part.seriesOrder)}>
					<span class="part-order">Part {part.seriesOrder}</span>
					<span class="part-title">{part.title}</span>
					<span class="part-verses">
						{part.verseCount} verses
						{#if flaggedOrders.has(part.seriesOrder)}
							<span class="flag" title="Over this translation's page limit">⚠</span>
						{/if}
					</span>
				</li>
			{/each}
		</ul>

		<!--
			One yellow Alert per part-scoped warning, then the series-scoped ones. The closing
			reassurance rides on the LAST alert rather than sitting in its own box: it is the
			absence of an action, not a finding, and a second yellow box saying nothing is wrong
			is how a wall of alerts starts.

			⚠️ Says nothing about export, deliberately. This read "…These limits are
			enforced when you export" until 2026-08-29 — premature (export is an act the
			user has not chosen here) and imprecise (whole-series export blocks per Q32,
			per-part export warns, and this cannot know which the user will ask for).
			Creation surfaces state the position and the remedy; `ExportComplianceModal` owns
			the export moment, and its header sets out why the two are separate. The sentence
			that remains is the one doing the work: compliance is the owner's call (COMPLIANCE
			§1.6), so the modal has to say the series may still be created.
		-->
		{#if complianceMessages.length > 0}
			{#each complianceMessages as message, i}
				<Alert
					color="yellow"
					look="subtle"
					message={i === complianceMessages.length - 1
						? `${message} You can still create this series.`
						: message}
					spacingBottom="0.8rem"
				/>
			{/each}
		{/if}

		{#if error}
			<Alert color="red" look="subtle" message={error} spacingBottom="0.8rem" />
		{/if}

		{#if needsConfirmation}
			<Checkbox id="confirm-large-split" bind:checked={hasConfirmedLarge} spacingBottom="1.2rem">
				Yes, create {parts.length} parts.
			</Checkbox>
		{:else if isLargePartCount}
			<!-- Blue, and the same sentence StudyForm renders as a blue Alert for the identical
			     condition: navigational advice, not a compliance finding. -->
			<Alert
				color="blue"
				look="subtle"
				message={`${parts.length} parts is a lot to navigate. Consider more chapters per part.`}
				spacingBottom="0rem"
			/>
		{/if}
	{/if}
</Modal>

<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	/* The stepper, its unit and its summary badge are all the Stepper element's own; nothing to
	   add here.

	   A previous pass pushed the summary right with `:global(.stepper-row .stepper-summary)`,
	   commented as being local to this modal. It was not: `:global()` is not scoped to the
	   component, so that rule applied wherever a Stepper rendered — which is why the New Study
	   page showed its stats jammed against the far right edge. The element now right-aligns its
	   own badge for stacked layouts, so no override is wanted here. */

	/* Centred, per the design. `RadioButtons` has no centring option of its own and should not
	   grow one for a single caller, so the wrapper does it here — scoped to this modal, not
	   reached in with `:global`, which is the mistake the comment above records. */
	.parting-modes {
		display: flex;
		justify-content: center;
	}

	/* The group's own 1.8rem bottom margin is the gap to the stepper; nothing to add. */

	.parts {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
		max-height: 24rem;
		overflow-y: auto;
		border: 1px solid var(--gray-900);
		border-radius: 0.4rem;
	}

	.parts li {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-900);
	}

	.parts li:last-child {
		border-bottom: none;
	}

	.parts li.flagged {
		background: var(--yellow-lighter);
	}

	.part-order {
		color: var(--gray-300);
		min-width: 5rem;
	}

	.part-title {
		flex: 1;
		color: var(--black);
	}

	.part-verses {
		color: var(--gray-300);
		white-space: nowrap;
	}

	.flag {
		color: var(--red);
	}

</style>
