<script>
	/**
	 * # ManageSerializationModal Component
	 *
	 * The parting controls for the New Study form: how a study is divided into a series.
	 *
	 * ## Why a modal
	 *
	 * These controls used to sit inline in `StudyForm`, below the passage selector. The part
	 * list alone can run to 150 rows (Psalms at one chapter per part), which pushed Save far
	 * off-screen and made the form's shape depend on a setting most studies never touch.
	 *
	 * ONE modal covering every passage, rather than one per passage. The two-part minimum (§4)
	 * is a property of the SERIES, so a per-passage modal would have had no vantage point from
	 * which to see it — each would know its own passage and nothing else, and the form would
	 * have had to re-derive globally what the modals were deciding locally.
	 *
	 * ## It edits a draft, and commits on confirm
	 *
	 * Cancel must leave the form exactly as it was, so the modal works on its own copies and
	 * writes back only when confirmed. Binding the form's state directly would make every
	 * stepper press permanent and Cancel a lie.
	 *
	 * ## It creates nothing
	 *
	 * Unlike `SplitIntoSeriesModal` — which converts a SAVED study and calls the API — this one
	 * only collects settings. The form still owns saving, so Save remains the single point at
	 * which a study is created (§5 route 1: create-then-part).
	 *
	 * @property {boolean} isOpen
	 * @property {Array<Object>} passages - The form's passages, as currently selected
	 * @property {string} translationId
	 * @property {string} title - Study title, used to name the previewed parts
	 * @property {string} chaptersPerPart - Committed value (a string, as `Stepper` surfaces)
	 * @property {Record<string, string>} chaptersPerPassage - Committed per-passage divisions
	 * @property {(settings: Object) => void} onConfirm
	 * @property {() => void} onClose
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Stepper from '$lib/componentElements/Stepper.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import { planSeriesParts, getPartingStrategy } from '$lib/utils/seriesPlanning.js';
	import { getBook } from '$lib/utils/bibleData.js';

	let {
		isOpen = false,
		passages = [],
		translationId = 'esv',
		title = '',
		chaptersPerPart = '1',
		chaptersPerPassage = {},
		onConfirm,
		onClose
	} = $props();

	// --- Draft state -------------------------------------------------------
	//
	// Seeded from the committed values each time the modal opens, so re-opening after a Cancel
	// shows what the form actually holds rather than the abandoned edit.
	let draftChapters = $state('1');
	/** @type {Record<string, string>} */
	let draftPerPassage = $state({});

	// Which of the two parting strategies the user is steering. A MODE rather than a boolean,
	// because the two are mutually exclusive: a checkbox would read as "chapters per part, and also
	// balanced", which is not a shape the planner has. Matches SplitIntoSeriesModal, so the two
	// surfaces that divide a study offer the same choice in the same words.
	/** @type {'chapters' | 'balance'} */
	let partingMode = $state(/** @type {'chapters' | 'balance'} */ ('chapters'));
	let balanceByLength = $derived(partingMode === 'balance');

	const PARTING_MODES = [
		{ id: 'serialize-mode-chapters', value: 'chapters', text: 'Chapters per part' },
		{ id: 'serialize-mode-balance', value: 'balance', text: 'Balance by length' }
	];

	// The part count to balance into, held separately from `draftChapters` because the two mean
	// different things and have different bounds — carrying 8 chapters across as 8 parts would be a
	// different shape wearing the same number. Seeded on switch instead; see below.
	let draftBalanceTarget = $state('');

	// Per-passage balance targets, for the multi-passage strategy. Keyed by passage id like
	// `draftPerPassage`, and held separately from it for the same reason the two scalars are held
	// apart: chapters and parts are different quantities with different bounds.
	/** @type {Record<string, string>} */
	let draftBalancePerPassage = $state({});

	$effect(() => {
		if (isOpen) {
			draftChapters = chaptersPerPart;
			// Chapters is the default (§5: chapter boundaries are meaningful to readers in a way equal
			// verse counts are not), and re-opening after a Cancel must show the committed shape
			// rather than the abandoned edit — the same rule the drafts above follow.
			partingMode = 'chapters';
			draftBalanceTarget = '';
			draftBalancePerPassage = {};
			// Every passage gets an EXPLICIT entry, defaulted rather than left absent. The form
			// reads an absent key as "leave whole", so a sparse draft would show 1 ch here and
			// mean 0 there — the preview in the modal and the pill on the form would disagree
			// about the same study. Seeding on open makes the two read the same map.
			/** @type {Record<string, string>} */
			const seeded = {};
			for (const p of passages) {
				seeded[p.id] = chaptersPerPassage[p.id] ?? String(DEFAULT_CHAPTERS_PER_PASSAGE);
			}
			draftPerPassage = seeded;
		}
	});

	/**
	 * Every passage starts divided at one chapter per part.
	 *
	 * Previously an untouched passage meant "leave whole", so a two-passage study opened at
	 * two parts and the steppers all read "Whole" — the user had to discover that each row
	 * was even divisible before the control did anything legible. Starting at 1 makes the
	 * modal open on the finest division, which is the shape the part list is most useful for
	 * confirming, and every stepper press from there is a coarsening the user can see.
	 *
	 * `0` is still reachable — stepping below 1 returns a passage to undivided — so nothing
	 * is taken away; only the starting point moves.
	 */
	const DEFAULT_CHAPTERS_PER_PASSAGE = 1;

	let strategy = $derived(getPartingStrategy(passages));

	// A single contiguous range steers with ONE stepper; a multi-passage study steers with one
	// stepper PER PASSAGE. The seams between passages are the user's own, but the chapters
	// inside each passage are still divisible.
	let showChaptersStepper = $derived(strategy === 'chapters-per-part');

	let totalChapters = $derived(
		strategy === 'chapters-per-part' && passages[0]
			? passages[0].toChapter - passages[0].fromChapter + 1
			: 0
	);

	// Half the span is the largest setting that still yields the 2 parts a series requires (§4).
	let maxChaptersPerPart = $derived(totalChapters > 1 ? Math.floor(totalChapters / 2) : 1);

	// Parsed and clamped. Falls back to 1 mid-edit so a half-typed field cannot reach the
	// planner as NaN and blank the preview.
	let parsedChapters = $derived.by(() => {
		const parsed = parseInt(draftChapters, 10);
		if (!Number.isFinite(parsed) || parsed < 1) return 1;
		return Math.min(parsed, Math.max(1, maxChaptersPerPart));
	});

	/**
	 * A passage's human reference, e.g. "Revelation 1–22". Used to label its stepper, so the
	 * user can tell which control governs which passage without counting rows.
	 */
	function passageLabel(p) {
		const book = getBook(p.testament, p.book)?.title || p.book || '';
		const from = p.fromChapter;
		const to = p.toChapter;
		return from === to ? `${book} ${from}` : `${book} ${from}–${to}`;
	}

	/**
	 * How many chapters each passage spans, and whether it can be divided at all.
	 * A one-chapter passage has no internal seam — same rule as `getPartingStrategy`.
	 */
	let passageParting = $derived(
		passages.map((p) => {
			const chapterSpan = (p.toChapter ?? p.fromChapter) - (p.fromChapter ?? 0) + 1;
			const raw = draftPerPassage[p.id];
			// Absent means "not yet touched", which now seeds to 1 rather than 0. See
			// `DEFAULT_CHAPTERS_PER_PASSAGE` below for why the undivided default was dropped.
			const parsed = raw === undefined ? DEFAULT_CHAPTERS_PER_PASSAGE : parseInt(raw, 10);
			// One short of the span — every setting that genuinely divides this passage.
			//
			// NOT `floor(span / 2)`, which the study-wide stepper uses. There it enforces §4's
			// "a series needs 2+ parts" by making a single passage yield two. Here that
			// reasoning does not transfer: the 2-part minimum is a property of the SERIES, and
			// the other passages contribute parts too.
			const maxPer = Math.max(0, chapterSpan - 1);
			const chapters = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maxPer) : 0;

			// The balance target for this row. Seeded from whatever the chapters setting currently
			// yields, so switching mode keeps roughly the shape the user was already looking at.
			// A part must hold at least one chapter, so the ceiling is the chapter span itself.
			const chapterParts = chapters > 0 ? Math.ceil(chapterSpan / chapters) : 1;
			const rawBalance = draftBalancePerPassage[p.id];
			const parsedBalance = parseInt(rawBalance, 10);
			const balanceTarget = Number.isFinite(parsedBalance)
				? Math.max(1, Math.min(parsedBalance, chapterSpan))
				: Math.max(1, Math.min(chapterParts, chapterSpan));

			const partCount = balanceByLength ? balanceTarget : chapterParts;

			// Planned in isolation so the row's pill can report THIS passage's average verse
			// count, not the series'. Reusing the whole-series plan would mean slicing its
			// flat part list back apart by passage, which is exactly the bookkeeping
			// `planByPassage` exists to own.
			const ownPlan = planSeriesParts({
				passages: [p],
				chaptersPerPart: Math.max(1, chapters),
				chaptersPerPassage: [chapters],
				balancePerPassage: [balanceByLength ? balanceTarget : 0],
				translationId,
				baseTitle: title
			});
			const ownParts = ownPlan?.parts ?? [];
			const ownAverage =
				ownParts.length > 0 ? Math.round(ownPlan.totalVerses / ownParts.length) : 0;

			return {
				id: p.id,
				label: passageLabel(p),
				canDivide: chapterSpan > 1,
				chapters,
				maxPer,
				chapterSpan,
				balanceTarget,
				// ⚠️ The ACTUAL count, read back from the plan rather than the requested target.
				// `planByBalance()` clamps to the chapter count, so a target above it silently yields
				// fewer parts — reporting the request would make the row's pill disagree with the part
				// list directly below it.
				partCount: ownParts.length || partCount,
				averageVerses: ownAverage
			};
		})
	);

	/** The per-passage divisions in the positional shape the planner takes. */
	let chaptersPerPassageList = $derived(passageParting.map((entry) => entry.chapters));

	/** The per-passage balance targets, positionally. Zeroed unless the mode asks for them. */
	let balancePerPassageList = $derived(
		passageParting.map((entry) => (balanceByLength ? entry.balanceTarget : 0))
	);

	function setPassageBalance(id, value) {
		draftBalancePerPassage = { ...draftBalancePerPassage, [id]: String(value) };
	}

	function stepBalanceDown(entry) {
		if (entry.balanceTarget > 1) setPassageBalance(entry.id, entry.balanceTarget - 1);
	}

	function stepBalanceUp(entry) {
		if (entry.balanceTarget < entry.chapterSpan) setPassageBalance(entry.id, entry.balanceTarget + 1);
	}

	// How many parts the CHAPTERS setting currently yields, used only to seed the balance target so
	// switching mode does not jump to an unrelated shape: the user keeps roughly the number of parts
	// they were already looking at, now evened out. Computed from the planner rather than by
	// dividing, so the two cannot disagree about rounding.
	let fixedPartCount = $derived(
		planSeriesParts({
			passages,
			chaptersPerPart: parsedChapters,
			chaptersPerPassage: chaptersPerPassageList,
			translationId,
			baseTitle: ''
		}).parts.length
	);

	// Seeded when the mode is selected, then left alone so a stepper nudge survives. Cleared on the
	// way back to chapters, which is what makes the seeding happen again on the next switch rather
	// than restoring a stale number from two switches ago.
	$effect(() => {
		if (balanceByLength && draftBalanceTarget === '') {
			draftBalanceTarget = String(Math.max(2, fixedPartCount));
		}
		if (!balanceByLength) draftBalanceTarget = '';
	});

	let parsedBalanceTarget = $derived.by(() => {
		const parsed = parseInt(draftBalanceTarget, 10);
		if (!Number.isFinite(parsed) || parsed < 2) return 2;
		return Math.min(parsed, Math.max(2, totalChapters));
	});

	// The SAME planner the server action runs, so this preview cannot promise a shape the save
	// will not produce.
	let plan = $derived(
		planSeriesParts({
			passages,
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

	// Retrieval outranks display, the same precedence `assessPlan()` applies per part: a part
	// that cannot be fetched has no page, so what it would display there is not yet a question.
	let retrievalWarnings = $derived(
		(plan?.warnings ?? []).filter(
			(w) => w.reason === 'exceeds-request' || w.reason === 'complete-book'
		)
	);
	let displayWarnings = $derived(
		(plan?.warnings ?? []).filter((w) => w.scope === 'part' && !retrievalWarnings.includes(w))
	);

	// A series needs 2+ parts (§4): a one-part series is a study wearing a costume.
	let canConfirm = $derived(parts.length >= 2);

	function stepChaptersDown() {
		if (parsedChapters > 1) draftChapters = String(parsedChapters - 1);
	}

	function stepChaptersUp() {
		if (parsedChapters < maxChaptersPerPart) draftChapters = String(parsedChapters + 1);
	}

	/** Set one passage's chapters-per-part. `0` means "leave whole" (one part). */
	function setPassageChapters(id, value) {
		draftPerPassage = { ...draftPerPassage, [id]: String(value) };
	}

	function stepPassageDown(entry) {
		// Stepping below 1 returns the passage to undivided, which is the only way back to
		// "one part" once a stepper has been touched.
		setPassageChapters(entry.id, entry.chapters <= 1 ? 0 : entry.chapters - 1);
	}

	function stepPassageUp(entry) {
		if (entry.chapters === 0) {
			setPassageChapters(entry.id, 1);
			return;
		}
		if (entry.chapters < entry.maxPer) setPassageChapters(entry.id, entry.chapters + 1);
	}

	function handleConfirm() {
		// The balance setting travels with the division, because the server re-plans rather than
		// receiving the parts: sending only `chaptersPerPart` would rebuild the study with the DEFAULT
		// shape while the user had approved a balanced preview — §5's "the preview a user approves is
		// the parting they get", broken by omission.
		onConfirm?.({
			chaptersPerPart: String(parsedChapters),
			chaptersPerPassage: { ...draftPerPassage },
			balanceByLength,
			targetParts: balanceByLength ? parsedBalanceTarget : 0,
			// Positional, matching `passages`, because that is the shape the planner and the wire
			// format already use for per-passage division. Zeroed unless the mode asks for it.
			balancePerPassage: [...balancePerPassageList]
		});
	}

	function handleClose() {
		onClose?.();
	}
</script>

<Modal
	{isOpen}
	title="Manage Serialization"
	size="medium"
	confirmLabel="Done"
	cancelLabel="Cancel"
	confirmDisabled={!canConfirm}
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
>
	<!-- The two strategies, offered the same way SplitIntoSeriesModal offers them: a radio pair,
	     centred, in controlled mode (`bind:value`). Uncontrolled would re-derive the selection from
	     `isChecked` in an `$effect` and fight the binding on every props rebuild — the failure
	     RadioButtons' own docblock records against `createAsSeries`.

	     Shown for BOTH strategies. Under one stepper it switches that stepper; under one stepper per
	     passage it switches every row, so a multi-passage study balances each passage on its own
	     terms. The seams between passages are the user's either way and are never crossed. -->
	<div class="parting-modes">
		<RadioButtons
			RadioButtonProperties={PARTING_MODES}
			name="serialize-parting-mode"
			isInline
			bind:value={partingMode}
		/>
	</div>

	{#if showChaptersStepper}
		<!--
			ONE stepper, its meaning following the mode above. The summary is the same either way
			because it describes the RESULT rather than the input.

			No visible `label`: the radio pair directly above already names what the number means, and
			a second name under it would be the same word twice. `ariaLabel` carries the accessible
			name instead, so the field is still named for a screen reader.
		-->
		{#if balanceByLength}
			<Stepper
				id="balance-parts"
				ariaLabel="Number of parts"
				unit={parsedBalanceTarget === 1 ? 'Part' : 'Parts'}
				bind:value={draftBalanceTarget}
				min={2}
				max={Math.max(2, totalChapters)}
				decrementDisabled={parsedBalanceTarget <= 2}
				incrementDisabled={parsedBalanceTarget >= Math.max(2, totalChapters)}
				decrementLabel="Fewer parts"
				incrementLabel="More parts"
				summary={`${parts.length} parts · avg ${averageVerses} verses each`}
			/>
		{:else}
			<Stepper
				id="chapters-per-part"
				ariaLabel="Chapters per part"
				unit={parsedChapters === 1 ? 'Chapter' : 'Chapters'}
				bind:value={draftChapters}
				min={1}
				max={maxChaptersPerPart}
				onDecrement={stepChaptersDown}
				onIncrement={stepChaptersUp}
				decrementDisabled={parsedChapters <= 1}
				incrementDisabled={parsedChapters >= maxChaptersPerPart}
				decrementLabel="Fewer chapters per part"
				incrementLabel="More chapters per part"
				summary={`${parts.length} parts · avg ${averageVerses} verses each`}
			/>
		{/if}
	{:else}
		<!--
			One stepper PER PASSAGE (§5, trap 15).

			Each stepper governs ONE passage, so every division is a single contiguous
			single-book range. The scalar `book` is never generalised and no part ever spans two
			passages — the seams the user drew stay exactly where they drew them.
		-->
		<!--
			ONE heading over the whole group, not a label per row.

			Each stepper previously carried "Chapters per part" implicitly in its own summary
			text, which meant the phrase either repeated down the column or went unsaid. Hoisted
			here it reads once and governs every row beneath it, the same way the single-passage
			stepper's own label does — so the two strategies now say the same thing in the same
			place, and each row is left to identify only its passage.
		-->
		<ul class="passage-parting">
			{#each passageParting as entry (entry.id)}
				<li>
					{#if entry.canDivide}
						<!-- The row's stepper follows the study-wide mode: chapters-per-part, or the
						     number of parts to balance THIS passage into. One control either way, so
						     the label column and the right-aligned pill keep their geometry. -->
						<Stepper
							id={`passage-parting-${entry.id}`}
							label={entry.label}
							isInline
							classes="passage-parting-stepper"
							displayValue={balanceByLength
								? `${entry.balanceTarget} ${entry.balanceTarget === 1 ? 'part' : 'parts'}`
								: entry.chapters === 0
									? 'Whole'
									: `${entry.chapters} ch`}
							onDecrement={() =>
								balanceByLength ? stepBalanceDown(entry) : stepPassageDown(entry)}
							onIncrement={() => (balanceByLength ? stepBalanceUp(entry) : stepPassageUp(entry))}
							decrementDisabled={balanceByLength
								? entry.balanceTarget <= 1
								: entry.chapters === 0}
							incrementDisabled={balanceByLength
								? entry.balanceTarget >= entry.chapterSpan
								: entry.chapters >= entry.maxPer}
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
						<!-- One chapter has no internal seam, so there is nothing to steer. Stated
						     rather than shown as a disabled control. -->
						<span class="passage-parting-label">{entry.label}</span>
						<span class="passage-parting-summary">1 part · single chapter</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<!-- The preview §5 cares about more than the control: seeing the list run to 150 IS the
	     information the user needs before committing. Scrolls, never truncates. -->
	<ul class="series-parts" aria-live="polite">
		{#each parts as part (part.seriesOrder)}
			<li>
				<span class="part-order">Part {part.seriesOrder}</span>
				<span class="part-title">{part.title}</span>
				<span class="part-verses">{part.verseCount} verses</span>
			</li>
		{/each}
	</ul>

	<!--
		Shown, never enforced (§5, COMPLIANCE §1.6). Collapsed to ONE generic line: finer
		parting multiplies part-scoped warnings — a 50-part series can emit one per part — and a
		wall of near-identical alerts is read as decoration and scrolled past.
	-->
	{#if retrievalWarnings.length > 0}
		<Alert
			color="red"
			look="subtle"
			message={`Some parts have too many verses for ${translationId.toUpperCase()} to load. Use fewer chapters per part, or switch to ${translationId === 'esv' ? 'NET' : 'ESV'}.`}
		/>
	{:else if displayWarnings.length > 0}
		<Alert
			color="yellow"
			look="subtle"
			message={`Some parts show more of a book than ${translationId.toUpperCase()} allows on one page. Use fewer chapters per part.`}
		/>
	{/if}

	<!--
		Done is disabled below 2 parts, so the reason is stated rather than left to guesswork.

		⚠️ RED because it BLOCKS. Gated on `!canConfirm`, the exact negation of the
		`confirmDisabled` above — so whenever this alert is on screen, Done is dead. That is
		the one condition red is reserved for across both this modal and StudyForm, where the
		rule is written out beside the series retrieval alert: "RED, because this one blocks…
		Yellow would have promised a study the form refuses to save."

		It was blue until 2026-08-29, which presented a hard stop as neutral information —
		the same defect that comment warns against, one step further along. The user read a
		calm note and then found the primary button unresponsive with no colour explaining
		why, which is exactly the guesswork this alert exists to remove.

		Sharing `canConfirm` with `confirmDisabled` is what keeps the colour honest: there is
		no second predicate to forget. If Done ever stops being gated on part count, this
		alert's colour has to be revisited with it.
	-->
	{#if !canConfirm}
		<Alert
			color="red"
			look="subtle"
			message="A series needs at least two parts. Use fewer chapters per part."
		/>
	{/if}
</Modal>

<style>
	/* Centred, matching SplitIntoSeriesModal. `RadioButtons` has no centring option of its own and
	   should not grow one for two callers, so the wrapper does it here — scoped to this component,
	   never reached in with `:global`. */
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

	/* A COLUMN, not a flexible gap. `flex: 1` let each label take exactly the width of its own
	   text, so "Ephesians 1–6" and "Colossians 1–4" pushed their steppers to different x
	   positions and the minus buttons formed a ragged edge. A shared minimum turns the labels
	   into a column and the steppers line up beneath each other, as in the mockup. It is a
	   minimum rather than a fixed width so a long book name still gets its space instead of
	   being clipped — the rest of the row simply shifts. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper label.stepper-label) {
		min-width: 14rem;
	}

	/* Hard right, past the stepper. The Stepper element only does this for its stacked
	   (non-inline) layout, where the pill has a full-width row to travel across; these rows are
	   inline, so the push is applied here, by the caller that wants the mockup's column. */
	.passage-parting li :global(.stepper-row.passage-parting-stepper .stepper-controls) {
		flex: 1;
	}

	.passage-parting li :global(.stepper-row.passage-parting-stepper .badge.stepper-summary) {
		margin-left: auto;
	}

	/* The undividable single-chapter row, which has no Stepper to inherit the columns from and
	   so restates them: same label column, same right-aligned summary. */
	.passage-parting-label {
		min-width: 14rem;
		color: var(--black);
	}

	.passage-parting-summary {
		margin-left: auto;
		text-align: right;
		color: var(--gray-300);
	}

	/* Scrolls rather than truncating: seeing that the list runs to 150 IS the information §5
	   wants visible before committing. */
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
	}
</style>
