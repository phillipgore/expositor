<script>
	/**
	 * # SeriesPartingControls Component
	 *
	 * The body of BOTH dialogs that divide a study into a series: Manage Serialization (New Study
	 * form, unsaved passages) and Split into a Series (a saved study). The mode radios, the steppers,
	 * the part list and the alerts are all here, so the two dialogs cannot drift in look or
	 * behaviour. Each dialog keeps only what is genuinely its own: the shell, the button labels, and
	 * what Done / Create does.
	 *
	 * The rules live in `$lib/utils/partingDraft.js`, where `scripts/verify-parting-draft.mjs` checks
	 * them in plain Node. This file wires them to controls.
	 *
	 * ## Settings in, result out
	 *
	 * `settings` is bound and edited here — the parent seeds it when its dialog opens, so Cancel
	 * can throw a draft away by simply not reading it. `result` is bound out: the clamped values the
	 * preview was built from, the parts, and `canConfirm`. The parent sends `result`, never the raw
	 * settings, so what is saved is exactly what was shown.
	 *
	 * @typedef {Object} PartingSettings
	 * @property {'chapters' | 'balance'} mode
	 * @property {string} chapters - Single-passage chapters per part, as typed
	 * @property {string} balanceTarget - Single-passage part count; '' = seed on next switch
	 * @property {Record<string, string>} perPassage - Chapters per part per passage id; '0' = whole
	 * @property {Record<string, string>} balancePerPassage - Part count per passage id
	 *
	 * @typedef {Object} SeriesPartingControlsProps
	 * @property {boolean} isActive - True while the dialog is open; bounds are only computed then
	 * @property {Array<Object>} passages
	 * @property {string} translationId
	 * @property {string} [title] - Base title for previewed parts
	 * @property {string} [idPrefix='parting'] - Keeps ids unique when both dialogs are mounted
	 * @property {boolean} [confirmsLargeHere=false] - The parent renders its own 150-part
	 *   confirmation (as `children`), so the blue "a lot to navigate" note steps aside there
	 * @property {PartingSettings} settings - Bindable
	 * @property {Object} result - Bindable output
	 * @property {import('svelte').Snippet} [children] - Rendered after the alerts
	 *
	 * @component
	 */
	import Stepper from '$lib/componentElements/Stepper.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import {
		planSeriesParts,
		getPartingStrategy,
		allowedDivisionBounds,
		findRefusedPart
	} from '$lib/utils/seriesPlanning.js';
	import {
		normalizePassage,
		singleBounds,
		clampInt,
		derivePassageRow,
		rowCanStep,
		isRowLocked,
		stepRow,
		clampTypedRow,
		lockedRowsMessage
	} from '$lib/utils/partingDraft.js';

	/** @type {SeriesPartingControlsProps} */
	let {
		isActive = false,
		passages = [],
		translationId = 'esv',
		title = '',
		idPrefix = 'parting',
		confirmsLargeHere = false,
		settings = $bindable(),
		result = $bindable(),
		children
	} = $props();

	let ranges = $derived(passages.map(normalizePassage));
	let strategy = $derived(getPartingStrategy(ranges));
	let balanceByLength = $derived(settings.mode === 'balance');

	// Radios with ids under `idPrefix`, so the two dialogs' radios never share an id.
	let partingModes = $derived([
		{ id: `${idPrefix}-mode-chapters`, value: 'chapters', text: 'Chapters per part' },
		{ id: `${idPrefix}-mode-balance`, value: 'balance', text: 'Balance by length' }
	]);

	// `settings` is the parent's `$state` object, bound here, so its fields are written in place
	// (`settings.mode = …` via `bind:value`, `settings.perPassage[id] = …` below).

	// --- One passage -----------------------------------------------------------

	let totalChapters = $derived(
		strategy === 'chapters-per-part' && ranges[0]
			? ranges[0].toChapter - ranges[0].fromChapter + 1
			: 0
	);

	// Only while open: for Psalms this plans a few hundred candidate divisions.
	let singleLimits = $derived(
		isActive && strategy === 'chapters-per-part' && ranges[0]
			? allowedDivisionBounds(ranges[0], translationId)
			: null
	);

	let bounds = $derived(singleBounds(totalChapters, singleLimits));
	let parsedChapters = $derived(clampInt(settings.chapters, 1, bounds.maxChaptersPerPart, 1));
	let parsedBalanceTarget = $derived(
		clampInt(
			settings.balanceTarget,
			bounds.minBalanceParts,
			bounds.maxBalanceParts,
			bounds.minBalanceParts
		)
	);

	// --- One row per passage ---------------------------------------------------

	let passageLimits = $derived(
		isActive && strategy === 'passage-per-part'
			? ranges.map((p) => allowedDivisionBounds(p, translationId))
			: []
	);

	let rows = $derived(
		strategy === 'passage-per-part'
			? ranges.map((p, index) =>
					derivePassageRow(p, passageLimits[index] ?? null, {
						chaptersRaw: settings.perPassage?.[p.id],
						balanceRaw: settings.balancePerPassage?.[p.id],
						balanceByLength,
						translationId,
						title
					})
				)
			: []
	);

	let chaptersPerPassageList = $derived(rows.map((entry) => entry.chapters));
	let balancePerPassageList = $derived(
		rows.map((entry) => (balanceByLength ? entry.balanceTarget : 0))
	);
	let lockedMessage = $derived(lockedRowsMessage(rows, balanceByLength, translationId));

	function setRow(entry, value) {
		const key = balanceByLength ? 'balancePerPassage' : 'perPassage';
		settings[key] = { ...settings[key], [entry.id]: String(value) };
	}

	function stepSingle(direction) {
		if (balanceByLength) {
			settings.balanceTarget = String(
				clampInt(
					String(parsedBalanceTarget + direction),
					bounds.minBalanceParts,
					bounds.maxBalanceParts
				)
			);
		} else {
			settings.chapters = String(
				clampInt(String(parsedChapters + direction), 1, bounds.maxChaptersPerPart)
			);
		}
	}

	// --- Balance seeding ------------------------------------------------------
	//
	// Seeded from the shape the CHAPTERS setting currently yields, so switching mode keeps roughly
	// the number of parts on screen, now evened out. Cleared on the way back to chapters, so the
	// next switch seeds again rather than restoring a number from two switches ago. Seeded inside
	// the translation's bounds, so the field never reads a number the plan is silently overriding.
	let chaptersPlanCount = $derived(
		planSeriesParts({
			passages: ranges,
			chaptersPerPart: parsedChapters,
			chaptersPerPassage: chaptersPerPassageList,
			translationId,
			baseTitle: ''
		}).parts.length
	);

	$effect(() => {
		if (balanceByLength && settings.balanceTarget === '') {
			settings.balanceTarget = String(
				Math.min(Math.max(bounds.minBalanceParts, chaptersPlanCount), bounds.maxBalanceParts)
			);
		}
		if (!balanceByLength && settings.balanceTarget !== '') settings.balanceTarget = '';
	});

	// --- The plan --------------------------------------------------------------
	//
	// The SAME planner the save paths run, so this preview cannot promise a shape the save will
	// not produce.
	let plan = $derived(
		planSeriesParts({
			passages: ranges,
			chaptersPerPart: parsedChapters,
			chaptersPerPassage: chaptersPerPassageList,
			balancePerPassage: balancePerPassageList,
			translationId,
			baseTitle: title,
			balanceByLength,
			targetParts: balanceByLength ? parsedBalanceTarget : 0
		})
	);

	let parts = $derived(plan?.parts ?? []);
	let averageVerses = $derived(parts.length > 0 ? Math.round(plan.totalVerses / parts.length) : 0);

	// Per-part findings, marked in the list. Retrieval outranks display, as in `assessPlan()`.
	let flaggedOrders = $derived(
		new Set((plan?.warnings ?? []).filter((w) => w.scope === 'part').map((w) => w.seriesOrder))
	);

	// The first part a save would refuse, or null. The bounds keep every reachable setting clear
	// of this; it gates Done / Create as the backstop, asked of the same helper the server uses.
	let refusedPart = $derived(findRefusedPart(parts, translationId));
	let hasEnoughParts = $derived(parts.length >= 2);
	let canConfirm = $derived(hasEnoughParts && !refusedPart);

	// The remedy names the control that fixes it, which follows the mode.
	let limitRemedy = $derived(balanceByLength ? 'Use more parts.' : 'Use fewer chapters per part.');

	// Findings a translation states but enforces only as `warn`: shown, not blocking.
	let displayWarnings = $derived(
		(plan?.warnings ?? []).filter(
			(w) => w.scope === 'part' && w.reason !== 'exceeds-request' && w.reason !== 'complete-book'
		)
	);

	let isLargePartCount = $derived(parts.length > 30);

	// Bound out. Positional per-passage arrays, matching `passages`, are the wire format the
	// planner, the form and `/api/series` all read.
	$effect(() => {
		result = {
			strategy,
			parts,
			canConfirm,
			chaptersPerPart: parsedChapters,
			chaptersPerPassage: chaptersPerPassageList,
			// A single-chapter passage keeps its draft value. The planner builds the same one part
			// from any value, but StudyForm compares these against its baseline to decide whether
			// the division changed; rewriting '1' as '0' would make a no-op Done look like one.
			chaptersPerPassageById: Object.fromEntries(
				rows.map((entry) => [
					entry.id,
					entry.canDivide ? String(entry.chapters) : (settings.perPassage?.[entry.id] ?? '1')
				])
			),
			balanceByLength,
			targetParts: balanceByLength ? parsedBalanceTarget : 0,
			balancePerPassage: balancePerPassageList
		};
	});

	function pressRow(entry, direction) {
		const next = stepRow(entry, balanceByLength, direction);
		if (next !== null) setRow(entry, next);
	}

	function typeRow(entry, raw) {
		const next = clampTypedRow(entry, balanceByLength, raw);
		if (next !== null) setRow(entry, next);
	}
</script>

{#if strategy === 'ineligible'}
	<p class="explain">
		This study covers a single chapter, so there is nothing to divide. A series needs at least two
		chapters.
	</p>
{:else}
	<!-- Controlled radios (`bind:value`): the uncontrolled path re-derives selection in an
	     `$effect` and fights the binding — the failure RadioButtons' own docblock records. -->
	<div class="parting-modes">
		<RadioButtons
			RadioButtonProperties={partingModes}
			name={`${idPrefix}-parting-mode`}
			isInline
			bind:value={settings.mode}
		/>
	</div>

	{#if strategy === 'chapters-per-part'}
		<!-- ONE stepper; the radios above name what it counts, so no visible label. -->
		{#if balanceByLength}
			<Stepper
				id={`${idPrefix}-balance-parts`}
				ariaLabel="Number of parts"
				unit={parsedBalanceTarget === 1 ? 'Part' : 'Parts'}
				bind:value={settings.balanceTarget}
				min={bounds.minBalanceParts}
				max={bounds.maxBalanceParts}
				onDecrement={() => stepSingle(-1)}
				onIncrement={() => stepSingle(1)}
				decrementDisabled={parsedBalanceTarget <= bounds.minBalanceParts}
				incrementDisabled={parsedBalanceTarget >= bounds.maxBalanceParts}
				inputDisabled={bounds.minBalanceParts >= bounds.maxBalanceParts}
				decrementLabel="Fewer parts"
				incrementLabel="More parts"
				summary={`${parts.length} parts · avg ${averageVerses} verses each`}
			/>
		{:else}
			<Stepper
				id={`${idPrefix}-chapters-per-part`}
				ariaLabel="Chapters per part"
				unit={parsedChapters === 1 ? 'Chapter' : 'Chapters'}
				bind:value={settings.chapters}
				min={1}
				max={bounds.maxChaptersPerPart}
				onDecrement={() => stepSingle(-1)}
				onIncrement={() => stepSingle(1)}
				decrementDisabled={parsedChapters <= 1}
				incrementDisabled={parsedChapters >= bounds.maxChaptersPerPart}
				inputDisabled={bounds.maxChaptersPerPart <= 1}
				decrementLabel="Fewer chapters per part"
				incrementLabel="More chapters per part"
				summary={`${parts.length} parts · avg ${averageVerses} verses each`}
			/>
		{/if}
	{:else}
		<!-- One stepper PER PASSAGE (§5, trap 15): each governs one contiguous passage, so no part
		     ever spans two passages and the seams the user drew stay put. -->
		<ul class="passage-parting">
			{#each rows as entry (entry.id)}
				{@const can = rowCanStep(entry, balanceByLength)}
				<li>
					{#if entry.canDivide}
						<Stepper
							id={`${idPrefix}-passage-${entry.id}`}
							label={entry.label}
							isInline
							classes="passage-parting-stepper"
							displayValue={balanceByLength
								? String(entry.balanceTarget)
								: entry.chapters === 0
									? 'Whole'
									: String(entry.chapters)}
							unit={balanceByLength
								? entry.balanceTarget === 1
									? 'Part'
									: 'Parts'
								: entry.chapters === 0
									? ''
									: entry.chapters === 1
										? 'Chapter'
										: 'Chapters'}
							onDecrement={() => pressRow(entry, -1)}
							onIncrement={() => pressRow(entry, 1)}
							onInput={(raw) => typeRow(entry, raw)}
							decrementDisabled={!can.down}
							incrementDisabled={!can.up}
							inputDisabled={isRowLocked(entry, balanceByLength)}
							ariaLabel={balanceByLength
								? `Parts for ${entry.label}`
								: `Chapters per part for ${entry.label}`}
							decrementLabel={balanceByLength
								? `Fewer parts for ${entry.label}`
								: `Fewer chapters per part for ${entry.label}`}
							incrementLabel={balanceByLength
								? `More parts for ${entry.label}`
								: `More chapters per part for ${entry.label}`}
							summary={!balanceByLength && entry.chapters === 0
								? '1 part · whole passage'
								: `${entry.partCount} ${entry.partCount === 1 ? 'part' : 'parts'} · avg ${entry.averageVerses} verses each`}
						/>
					{:else}
						<!-- One chapter has no internal seam, so there is nothing to steer. -->
						<span class="passage-parting-label">{entry.label}</span>
						<span class="passage-parting-summary">1 part · single chapter</span>
					{/if}
				</li>
			{/each}
		</ul>

		<!-- Blue: nothing is refused. It explains why a row's control is disabled. -->
		{#if lockedMessage}
			<Alert color="blue" look="subtle" message={lockedMessage} spacingBottom="1.2rem" />
		{/if}
	{/if}


	<!-- The preview matters more than the control (§5): seeing the list run to 150 IS the
	     information. Scrolls, never truncates. -->
	<ul class="series-parts" aria-live="polite">
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
		ONE line per kind of finding, not one per part: finer parting multiplies findings, and a
		wall of near-identical alerts is scrolled past. RED only where Done / Create is disabled.
	-->
	{#if refusedPart}
		<Alert
			color="red"
			look="subtle"
			message={`Part ${refusedPart.seriesOrder} cannot be ${refusedPart.kind === 'retrieval' ? 'loaded' : 'displayed'}: ${refusedPart.message ?? ''} ${limitRemedy}`}
			spacingBottom="0.8rem"
		/>
	{:else if displayWarnings.length > 0}
		<Alert
			color="yellow"
			look="subtle"
			message={`Some parts show more of a book than ${translationId.toUpperCase()} allows on one page. ${limitRemedy} You can still create this series.`}
			spacingBottom="0.8rem"
		/>
	{/if}

	{#if !hasEnoughParts}
		<Alert
			color="red"
			look="subtle"
			message={`A series needs at least two parts. ${balanceByLength ? 'Use more parts.' : 'Use fewer chapters per part.'}`}
			spacingBottom="0.8rem"
		/>
	{/if}

	<!-- At 150+ a parent with `confirmsLargeHere` shows its own checkbox instead (via children). -->
	{#if isLargePartCount && !(confirmsLargeHere && parts.length >= 150)}
		<Alert
			color="blue"
			look="subtle"
			message={`${parts.length} parts is a lot to navigate. Consider more chapters per part.`}
			spacingBottom="0.8rem"
		/>
	{/if}

	{@render children?.()}
{/if}


<style>
	.explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	/* Centred. `RadioButtons` has no centring option of its own, so the wrapper does it here. */
	.parting-modes {
		display: flex;
		justify-content: center;
	}

	.passage-parting {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
	}

	.passage-parting li {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.5rem 0;
		font-size: 1.3rem;
	}

	.passage-parting li :global(.stepper-row.passage-parting-stepper) {
		flex: 1;
		margin-bottom: 0rem;
	}

	/* A shared minimum turns the labels into a column, so the steppers line up beneath each
	   other. A minimum rather than a fixed width, so a long book name is never clipped. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper label.stepper-label) {
		min-width: 14rem;
	}

	/* The Stepper element only right-aligns its pill in the stacked layout; these rows are inline. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper .stepper-controls) {
		flex: 1;
	}

	/* One line per row: the pill never wraps below the stepper. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper),
	.passage-parting li :global(.stepper-row.passage-parting-stepper .stepper-controls) {
		flex-wrap: nowrap;
	}

	/* A fixed unit width, so "Chapter" vs "Chapters" (or "Part" vs "Parts") never shifts the
	   pill or changes whether the row fits. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper .stepper-unit) {
		display: inline-block;
		min-width: 6.4rem;
	}

	.passage-parting li :global(.stepper-row.passage-parting-stepper .badge.stepper-summary) {
		margin-left: auto;
		white-space: nowrap;
	}

	/* The single-chapter row has no Stepper, so it restates the same columns. */
	.passage-parting-label {
		min-width: 14rem;
		color: var(--black);
	}

	.passage-parting-summary {
		margin-left: auto;
		text-align: right;
		color: var(--gray-300);
	}

	.series-parts {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
		max-height: 24rem;
		overflow-y: auto;
		border: 1px solid var(--gray-900);
		border-radius: 0.4rem;
	}

	.series-parts li {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-900);
	}

	.series-parts li:last-child {
		border-bottom: none;
	}

	.series-parts li.flagged {
		background: var(--yellow-lighter);
	}

	.part-order {
		min-width: 6rem;
		color: var(--gray-300);
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
