<script>
	/**
	 * StudyForm Component
	 *
	 * Reusable form for creating or editing a study.
	 * Handles title input, passage selection, validation, and submission UI.
	 *
	 * @property {string} mode - 'new' or 'edit'
	 * @property {Object} initialData - Initial form data for edit mode
	 * @property {Array} existingStudies - List of existing studies for duplicate check
	 * @property {Object} form - Form state from SvelteKit form actions
	 * @property {Function} onSubmittingChange - Callback when submitting state changes
	 */
	import { onMount } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';

	import bibleData from '$lib/data/bible.json';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Label from '$lib/componentElements/Label.svelte';
	import InputField from '$lib/componentWidgets/InputField.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import PassageSelector from '$lib/componentWidgets/PassageSelector.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import RadioButtons from '$lib/componentElements/RadioButtons.svelte';
	import messages from '$lib/data/messages.json';
	import { getAllTranslationsMetadata } from '$lib/utils/translationConfig';
	import {
		checkSinglePassageSupport,
		validateStudyDisplayLimits
	} from '$lib/utils/translationLimits.js';

	import {
		isSeriesEligible,
		getPartingStrategy,
		planSeriesParts
	} from '$lib/utils/seriesPlanning.js';

	import { assessStudySize } from '$lib/config/studyLimits.js';

	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';

	import { setStudyEditDirty, clearStudyEditDirty } from '$lib/stores/studyEditDirty.js';

	let {
		mode = 'new',
		initialData = null,
		existingStudies = [],
		form = null,
		onSubmittingChange = null,
		cancelHref = '/',
		groupId = null,
		groupName = null
	} = $props();

	let isSubmitting = $state(false);

	// --- Edit-mode review flow state ---------------------------------------
	let formElement = $state(null);
	let isAnalyzing = $state(false);

	const testamentData = bibleData[0].testamentData;
	const ntBookData = testamentData[1].bookData;

	// Get translation metadata for radio button options
	const translationsMetadata = getAllTranslationsMetadata();
	const translationOptions = translationsMetadata.map((t) => ({
		id: `translation-${t.id}`,
		value: t.id,
		text: t.abbreviation,
		title: t.name,
		isChecked: t.id === 'esv'
	}));

	// Initialize form state
	let studyTitle = $state(initialData?.title || form?.title || '');
	let studySubtitle = $state(initialData?.subtitle || form?.subtitle || '');
	let passages = $state(
		initialData?.passages || [
			{
				id: uuidv4(),
				testament: testamentData[1]._id,
				book: ntBookData[0]._id,
				fromChapter: 1,
				toChapter: 1,
				fromVerse: 1,
				toVerse: ntBookData[0].chapterData[0]['1']
			}
		]
	);

	// Duplicate title validation
	let duplicateTitleMessage = $derived(getDuplicateTitleMessage(studyTitle));
	let hasDuplicateTitle = $derived(duplicateTitleMessage.length > 0);

	// --- Passage retrieval + size feedback ---------------------------------
	//
	// The point of doing this here rather than server-side is TIMING: the user
	// finds out that a range won't work, or that a study will be very large,
	// while they are still choosing it — not after they have committed and been
	// bounced back by an error. The server still validates (see the New Study
	// action); this is the part that arrives early enough to be useful.
	//
	// In edit mode the translation is fixed by the study and not part of this
	// form, so fall back to the study's own translation.
	let selectedTranslation = $state(mode === 'edit' ? initialData?.translation || 'esv' : 'esv');

	/**
	 * Per-passage retrieval problems for the chosen translation.
	 *
	 * Empty for a translation that can chunk (a passage may span a whole book).
	 * For ESV this reports ranges too large for one request, and complete books
	 * Crossway will not serve whole.
	 */
	let passageIssues = $derived(
		passages
			.map((p, index) => ({ index, ...checkSinglePassageSupport(p, selectedTranslation) }))
			.filter((r) => !r.canBeSinglePassage)
	);

	let hasPassageIssues = $derived(passageIssues.length > 0);

	/**
	 * Rendering-performance assessment for the study as a whole.
	 *
	 * Deliberately advisory: total verses is summed across passages because DOM
	 * cost is a property of the whole study, not of any one passage. Never blocks
	 * — see src/lib/config/studyLimits.js for why there is no hard cap.
	 */
	let studySizeAssessment = $derived(
		assessStudySize(
			passages.reduce(
				(total, p) => total + checkSinglePassageSupport(p, selectedTranslation).verseCount,
				0
			)
		)
	);

	/**
	 * Licence-compliance assessment for the study's total on-screen footprint.
	 *
	 * Distinct from `passageIssues` above, which asks of each passage separately
	 * "can the API serve this?". This asks of the study as a whole "may this much
	 * text be displayed together?" — a question no single passage can answer.
	 *
	 * The ESV terms limit display per PAGE, so several individually-valid passages
	 * can still add up to a page that exceeds the limit: Galatians 1–3 plus 4–6 is
	 * two requests Crossway will happily serve, assembling into a complete book
	 * they do not permit displaying. Their server cannot see the assembled page,
	 * which is why this check has to live here.
	 *
	 * Advisory by design — it informs and never blocks submission, matching the
	 * translation's `enforcement: 'warn'` posture. See COMPLIANCE.md.
	 */
	let displayComplianceWarnings = $derived(
		validateStudyDisplayLimits(passages, selectedTranslation).warnings
	);

	// --- One study, or a series? (SERIES_PLAN §5, entry point 1) ------------
	//
	// §5's three rules, in the order they constrain this code:
	//
	//   1. A series is never imposed. This is a choice the user makes; nothing below reacts to
	//      passage length by switching it on.
	//   2. The default is always one study. `createAsSeries` starts false and the radio pair
	//      renders with "One study" selected, so a user who ignores this section entirely gets
	//      exactly what they got before the section existed.
	//   3. The preview matters more than the control. Hence the live part list rather than a
	//      bare number — "Psalms at one chapter per part means 150 parts" has to be visible
	//      BEFORE committing, not discovered in the Finder afterwards.
	//
	// Offered only in `new` mode: converting an existing study is the study menu's job, and an
	// edit-mode radio here would collide with the passage-reconciliation review flow.
	let createAsSeries = $state(false);
	let chaptersInput = $state('1');

	// Eligibility is the SHARED rule, not a local re-derivation: 2+ chapters, never tightened
	// (§5, trap 10). A single-chapter study simply has no seam to cut on.
	let seriesEligible = $derived(mode === 'new' && isSeriesEligible(passages));

	let seriesStrategy = $derived(getPartingStrategy(passages));

	// Only chapters-per-part has anything to steer. For a multi-passage study the user already
	// drew the seams, so a stepper would imply a choice that isn't theirs to make here.
	let showChaptersStepper = $derived(seriesStrategy === 'chapters-per-part');

	let totalChapters = $derived(
		seriesStrategy === 'chapters-per-part' && passages[0]
			? passages[0].toChapter - passages[0].fromChapter + 1
			: 0
	);

	// Half the span is the largest setting that still yields the 2 parts a series requires (§4).
	let maxChaptersPerPart = $derived(totalChapters > 1 ? Math.floor(totalChapters / 2) : 1);

	// Parsed and clamped. Falls back to 1 mid-edit so a half-typed field cannot reach the
	// planner as NaN and blank the preview.
	let chaptersPerPart = $derived.by(() => {
		const parsed = parseInt(chaptersInput, 10);
		if (!Number.isFinite(parsed) || parsed < 1) return 1;
		return Math.min(parsed, Math.max(1, maxChaptersPerPart));
	});

	// The SAME planner the server action's endpoint runs, so this preview cannot promise a shape
	// the creation produces differently.
	let seriesPlan = $derived(
		createAsSeries && seriesEligible
			? planSeriesParts({
					passages,
					chaptersPerPart,
					translationId: selectedTranslation,
					baseTitle: studyTitle
				})
			: null
	);

	let seriesParts = $derived(seriesPlan?.parts ?? []);

	// Compliance is SHOWN, never enforced (§5, COMPLIANCE §1.6): a user may knowingly create a
	// series that will warn at export. Note these are the planner's series-aware warnings, which
	// include the series-level aggregate the per-part checks would otherwise silence (trap 8).
	let seriesWarnings = $derived(seriesPlan?.warnings ?? []);

	let seriesAverageVerses = $derived(
		seriesParts.length > 0 ? Math.round(seriesPlan.totalVerses / seriesParts.length) : 0
	);

	// Q10: soft-warn past ~30 parts, require confirmation at 150. Never a refusal — 150 parts is
	// probably a mis-click, but it is also exactly what a Psalms series legitimately is.
	let isLargePartCount = $derived(seriesParts.length > 30);
	let needsSeriesConfirmation = $derived(seriesParts.length >= 150);
	let hasConfirmedLargeSeries = $state(false);

	$effect(() => {
		// Re-arm whenever the count falls back under the threshold, so the checkbox cannot stay
		// silently ticked from a previous stepper position.
		if (!needsSeriesConfirmation) hasConfirmedLargeSeries = false;
	});

	// A series needs 2+ parts (§4): a one-part series is a study wearing a costume. Blocks submit
	// only while the user is actually asking for a series.
	let seriesBlocksSubmit = $derived(
		createAsSeries &&
			seriesEligible &&
			(seriesParts.length < 2 || (needsSeriesConfirmation && !hasConfirmedLargeSeries))
	);

	// Passage edits can make a chosen series impossible (down to one chapter) or move the
	// stepper out of range. Reset rather than submit a stale setting.
	$effect(() => {
		if (!seriesEligible && createAsSeries) createAsSeries = false;
	});

	function stepChaptersDown() {
		if (chaptersPerPart > 1) chaptersInput = String(chaptersPerPart - 1);
	}

	function stepChaptersUp() {
		if (chaptersPerPart < maxChaptersPerPart) chaptersInput = String(chaptersPerPart + 1);
	}


	// --- Unsaved-changes (dirty) tracking, edit mode only ------------------
	// Baseline snapshot of the last-saved values. The edit-flow layout watches
	// the shared `studyEditDirty` store (set below) to decide whether to prompt
	// before the user navigates away and discards in-progress edits.
	const savedSnapshot = JSON.stringify({
		title: initialData?.title || '',
		subtitle: initialData?.subtitle || '',
		passages: initialData?.passages || []
	});

	/** Current form values serialized the same way as `savedSnapshot`. */
	let currentSnapshot = $derived(
		JSON.stringify({ title: studyTitle, subtitle: studySubtitle, passages })
	);

	/** Dirty when editing and the current values differ from the saved baseline. */
	let isDirty = $derived(mode === 'edit' && !!initialData?.id && currentSnapshot !== savedSnapshot);

	/**
	 * Get duplicate title message if a study with this title already exists
	 * @param {string} title
	 * @returns {string}
	 */
	function getDuplicateTitleMessage(title) {
		if (!title || !title.trim()) return '';
		const trimmedTitle = title.trim().toLowerCase();

		// When editing, exclude the current study from duplicate check
		const studiesToCheck =
			mode === 'edit' && initialData?.id
				? existingStudies.filter((s) => s.id !== initialData.id)
				: existingStudies;

		const hasDuplicate =
			studiesToCheck?.some((study) => study.title.toLowerCase() === trimmedTitle) || false;

		return hasDuplicate ? messages.validation.duplicateStudyTitle : '';
	}

	const handlePassagesChange = (updatedPassages) => {
		passages = updatedPassages;
	};

	/**
	 * Track the chosen translation so the retrieval checks re-run when it changes.
	 *
	 * This matters because the SAME set of passages can be valid in one
	 * translation and not another: switching from NET to ESV can turn a working
	 * whole-book passage into a blocked one, and the user needs to see that at the
	 * moment they switch rather than at save time.
	 *
	 * @param {Event} event
	 */
	function handleTranslationChange(event) {
		const target = /** @type {HTMLInputElement} */ (event.currentTarget);
		selectedTranslation = target.value;
	}

	/**
	 * Discard any in-progress review hand-off payload. Called when the user
	 * cancels the edit so a later fresh edit session starts from saved data
	 * rather than rehydrating abandoned changes.
	 */
	function clearPendingEdit() {
		if (mode !== 'edit' || !initialData?.id) return;
		// Also drop the dirty flag so the edit-flow layout's navigation guard
		// doesn't prompt on this intentional Cancel.
		clearStudyEditDirty();
		try {
			sessionStorage.removeItem(pendingEditKey(initialData.id));
			sessionStorage.removeItem(armedKey(initialData.id));
		} catch {
			// sessionStorage unavailable — nothing to clear.
		}
	}

	/**
	 * Restore in-progress edits when the user returns from the full-page review
	 * via "Back". The review hand-off payload lives in sessionStorage until the
	 * edit is actually saved, so if it's still present (and the user hasn't yet
	 * persisted) we rehydrate the title/subtitle/passages they were editing
	 * rather than resetting to the last-saved `initialData`.
	 */
	onMount(() => {
		if (mode !== 'edit' || !initialData?.id) return;
		let raw;
		try {
			raw = sessionStorage.getItem(pendingEditKey(initialData.id));
		} catch {
			return;
		}
		if (!raw) return;
		try {
			const pending = JSON.parse(raw);
			if (pending && typeof pending === 'object') {
				if (typeof pending.title === 'string') studyTitle = pending.title;
				if (typeof pending.subtitle === 'string') studySubtitle = pending.subtitle;
				if (Array.isArray(pending.passages) && pending.passages.length) {
					passages = pending.passages;
				}
			}
		} catch {
			// Ignore a corrupt payload — fall back to the saved initialData.
		}
	});

	// Notify parent of submitting state changes
	$effect(() => {
		onSubmittingChange?.(isSubmitting);
	});

	// Publish dirtiness to the shared store the edit-flow layout reads from its
	// `beforeNavigate` guard. Cleared on unmount so a stale "true" never lingers
	// after the form is gone (cancel/save clear it explicitly as well).
	$effect(() => {
		setStudyEditDirty(isDirty);
	});

	onMount(() => {
		return () => clearStudyEditDirty();
	});

	/**
	 * In edit mode, the first submit must be intercepted so we can analyze the
	 * passage changes and decide whether the user needs to make decisions before
	 * anything is written. We do this from inside `use:enhance` using its
	 * `cancel()` callback — `event.preventDefault()` from a separate onsubmit
	 * handler does NOT stop enhance from posting.
	 *
	 * - If the edit needs review, the proposed edit + report are stashed in
	 *   sessionStorage and we navigate to the dedicated full-page review.
	 * - Otherwise the edit is submitted straight through with empty decisions.
	 *
	 * @param {{ cancel: () => void }} param0
	 */
	async function runAnalysisGate({ cancel }) {
		// Stop this submission; we'll either navigate to review or submit directly.
		cancel();

		if (hasDuplicateTitle || isAnalyzing || isSubmitting) return;

		isAnalyzing = true;
		try {
			const res = await fetch(`/api/studies/${initialData.id}/analyze-edit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ passages })
			});

			if (!res.ok) {
				// If analysis fails, fall back to a normal submit rather than blocking.
				await submitDirect();
				return;
			}

			const report = await res.json();
			if (report?.requiresReview) {
				// Hand the pending edit off to the full-page review. The payload is
				// NOT yet persisted; the "armed" flag is consumed on the review
				// page's first mount so a refresh redirects back here.
				const studyId = initialData.id;
				sessionStorage.setItem(
					pendingEditKey(studyId),
					JSON.stringify({
						title: studyTitle,
						subtitle: studySubtitle,
						passages,
						report
					})
				);
				sessionStorage.setItem(armedKey(studyId), '1');
				await goto(`/study/${studyId}/edit/review`);
			} else {
				// Nothing needs a decision — submit with empty decisions.
				await submitDirect();
			}
		} catch (err) {
			console.error('Edit analysis failed:', err);
			await submitDirect();
		} finally {
			isAnalyzing = false;
		}
	}

	/**
	 * Submit the edit directly via fetch with empty decisions (no review needed).
	 * Posting the form data directly is immune to navigation/enhance edge cases,
	 * and we apply the redirect result ourselves.
	 */
	async function submitDirect() {
		if (isSubmitting) return;
		isSubmitting = true;
		try {
			const data = new FormData(formElement);
			data.set('decisions', JSON.stringify({}));

			const response = await fetch(formElement.action || window.location.pathname, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: data
			});

			const result = deserialize(await response.text());

			if (result.type === 'redirect') {
				// Saved successfully — drop the dirty flag so the edit-flow layout
				// won't prompt as we navigate away to the saved study.
				clearStudyEditDirty();
				await goto(result.location, { invalidateAll: true });
				return;
			}

			if (result.type === 'error') {
				console.error('Save failed:', result.error);
				await applyAction(result);
				return;
			}

			// failure / success without redirect: surface via form prop
			await applyAction(result);
			await invalidateAll();
		} catch (err) {
			console.error('Error saving study:', err);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<form
	bind:this={formElement}
	method="POST"
	use:enhance={({ cancel }) => {
		// In edit mode, gate EVERY submit on analysis/review. The analysis step
		// decides whether to navigate to the full-page review or submit straight
		// through. New studies post normally below.
		if (mode === 'edit' && initialData?.id) {
			runAnalysisGate({ cancel });
			return;
		}

		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}}
>
	<Heading heading="h1" hasSub={groupName ? true : false}
		>{mode === 'new' ? 'New Study' : 'Edit Study'}</Heading
	>
	{#if groupName}
		<Heading heading="h2" isMuted notBold>{`To be created in "${groupName}".`}</Heading>
	{/if}

	{#if form?.error}
		<Alert color="red" look="subtle" message={form.error} />
	{/if}

	<InputField
		label="Title"
		id="title"
		name="title"
		bind:value={studyTitle}
		isLarge
		required
		infoMessage={duplicateTitleMessage}
	/>

	<InputField label="Subtitle" id="subtitle" name="subtitle" bind:value={studySubtitle} />

	{#if mode === 'new'}
		<Label text="Translation"></Label>
		<RadioButtons
			RadioButtonProperties={translationOptions}
			name="translation"
			isInline
			handleChange={handleTranslationChange}
		/>
	{/if}

	<!--
		Retrieval problems BLOCK submission: the fetch would fail (or silently
		truncate), so letting the user proceed only defers the same error to a point
		where they've already lost the form. Each message names the remedy.
	-->
	{#each passageIssues as issue (issue.index)}
		<Alert color="red" look="subtle" message={`Passage ${issue.index + 1}: ${issue.message}`} />
	{/each}

	<!--
		Size feedback NEVER blocks. It's our own rendering-performance guess, not a
		correctness or licensing matter, and the underlying cause is unconfirmed —
		so we inform and let the user decide. See src/lib/config/studyLimits.js.

		Suppressed while a retrieval error blocks submission: it describes how a
		study would PERFORM once saved, which is premature advice about a study
		that cannot be saved yet. A whole-book ESV selection otherwise stacked four
		alerts at once, and this was the least actionable of them.
	-->
	{#if studySizeAssessment.message && !hasPassageIssues}
		<Alert
			color={studySizeAssessment.level === 'warning' ? 'yellow' : 'blue'}
			look="subtle"
			message={studySizeAssessment.message}
		/>
	{/if}

	<!--
		Licence-compliance notices also NEVER block, but for a different reason than
		the size warning above: this one is a real published restriction rather than
		a performance guess, yet it is the STUDY OWNER's obligation and not something
		we can decide for them. Blocking would also be the wrong shape — a study
		assembled over weeks could become non-compliant on the passage that tips it
		over, and refusing to save at that moment would strand work already done.
		So we state the position plainly and let the user act on it.

		Also suppressed while a retrieval error blocks submission. The blocking
		message already explains that the selection exceeds both what one request
		may return and what one page may display, so repeating the page half as a
		separate advisory says the same thing twice about a study that cannot be
		saved. Once the blocker is resolved these reappear if they still apply.
	-->
	{#if !hasPassageIssues}
		{#each displayComplianceWarnings as warning (warning)}
			<Alert color="yellow" look="subtle" message={warning} />
		{/each}
	{/if}

	<input type="hidden" name="passages" value={JSON.stringify(passages)} />
	{#if groupId}
		<input type="hidden" name="groupId" value={groupId} />
	{/if}

	<Label text="Passages"></Label>

	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
	<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

	<!--
		§5 entry point 1: "One study" or "A series of studies".

		Placed AFTER the passage selector because the choice is only meaningful once there is a
		range to divide, and eligibility (2+ chapters) is a property of that range. Shown only
		when eligible: offering a disabled radio pair on a single-chapter study would advertise
		a capability and refuse it in the same breath.

		Plain radios rather than the RadioButtons component: that component owns its own checked
		state and re-derives it from its props, which fights a boolean this form needs to control
		directly. The `name` doubles as the field the server action reads, so no hidden mirror of
		the choice is needed — one less thing to get out of step.
	-->
	{#if seriesEligible}
		<Label text="Create as"></Label>
		<div class="series-choice">
			<div class="series-option">
				<input
					type="radio"
					id="create-one-study"
					name="createAsSeries"
					value="false"
					checked={!createAsSeries}
					onchange={() => (createAsSeries = false)}
				/>
				<label for="create-one-study">One study</label>
			</div>
			<div class="series-option">
				<input
					type="radio"
					id="create-as-series"
					name="createAsSeries"
					value="true"
					checked={createAsSeries}
					onchange={() => (createAsSeries = true)}
				/>
				<label for="create-as-series">A series of studies</label>
			</div>
		</div>

		{#if createAsSeries}
			<!-- The setting the preview below was computed from, sent so the server plans the
			     same parts the user is looking at. -->
			<input type="hidden" name="chaptersPerPart" value={chaptersPerPart} />

			{#if showChaptersStepper}
				<div class="stepper-row">
					<label class="stepper-label" for="chapters-per-part">Chapters per part:</label>
					<div class="stepper">
						<button
							type="button"
							class="step"
							onclick={stepChaptersDown}
							disabled={chaptersPerPart <= 1}
							aria-label="Fewer chapters per part"
						>−</button>
						<input
							id="chapters-per-part"
							type="number"
							min="1"
							max={maxChaptersPerPart}
							bind:value={chaptersInput}
						/>
						<button
							type="button"
							class="step"
							onclick={stepChaptersUp}
							disabled={chaptersPerPart >= maxChaptersPerPart}
							aria-label="More chapters per part"
						>+</button>
					</div>
					<span class="stepper-summary" aria-live="polite">
						{seriesParts.length} parts · avg {seriesAverageVerses} verses each
					</span>
				</div>
			{:else}
				<!-- §5: "the absence of arithmetic is not the absence of a decision" — a
				     multi-passage study has no stepper, but the user is still told what the
				     parting will be before committing. -->
				<p class="series-explain">
					This study has {passages.length} passages, so it will be created as
					{passages.length} parts — one per passage, keeping the divisions you made above.
				</p>
			{/if}

			<!-- The preview §5 cares about more than the control: seeing the list run to 150 IS
			     the information the user needs before committing. Scrolls, never truncates. -->
			<ul class="series-parts" aria-live="polite">
				{#each seriesParts as part (part.seriesOrder)}
					<li>
						<span class="part-order">Part {part.seriesOrder}</span>
						<span class="part-title">{part.title}</span>
						<span class="part-verses">{part.verseCount} verses</span>
					</li>
				{/each}
			</ul>

			<!-- Shown, never enforced (§5, COMPLIANCE §1.6). Includes the series-level aggregate
			     that per-part parting would otherwise silence. -->
			{#each seriesWarnings as warning (warning.message)}
				<Alert
					color={warning.level === 'notice' ? 'blue' : 'yellow'}
					look="subtle"
					message={warning.message}
				/>
			{/each}

			{#if needsSeriesConfirmation}
				<label class="series-confirm">
					<input type="checkbox" bind:checked={hasConfirmedLargeSeries} />
					Yes, create {seriesParts.length} parts.
				</label>
			{:else if isLargePartCount}
				<Alert
					color="blue"
					look="subtle"
					message={`${seriesParts.length} parts is a lot to navigate. Consider more chapters per part.`}
				/>
			{/if}
		{/if}

		<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>
	{/if}

	<FormButtonBar>

		<Button
			href={cancelHref}
			label="Cancel"
			classes="gray"
			isDisabled={isSubmitting || isAnalyzing}
			handleClick={clearPendingEdit}
		></Button>

		<Button
			type="submit"
			classes="blue"
			isDisabled={isSubmitting ||
				isAnalyzing ||
				hasDuplicateTitle ||
				hasPassageIssues ||
				seriesBlocksSubmit}
		>

			{#if isAnalyzing}
				<Spinner size="sm" inline color="var(--white)" label="Checking…" showLabel />
			{:else if isSubmitting}
				<Spinner size="sm" inline color="var(--white)" label="Saving…" showLabel />
			{:else}
				Save
			{/if}
		</Button>
	</FormButtonBar>
</form>

<style>
	form {
		width: 41.4rem;
		min-width: 36rem;
	}

	/* --- Series choice + preview (§5 entry point 1) ----------------------- */

	.series-choice {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.8rem;
	}

	.series-option {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.series-option input {
		accent-color: var(--blue);
	}

	.series-option label {
		font-size: 1.4rem;
		color: var(--black);
	}

	.stepper-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		margin-bottom: 1.2rem;
	}

	.stepper-label {
		font-size: 1.4rem;
		color: var(--black);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.stepper input {
		width: 6rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--gray-200);
		border-radius: 0.4rem;
		font-size: 1.4rem;
	}

	.step {
		width: 2.8rem;
		height: 2.8rem;
		border: 1px solid var(--gray-200);
		border-radius: 0.4rem;
		background: var(--white);
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
	}

	.step:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.stepper-summary {
		font-size: 1.3rem;
		color: var(--gray-300);
	}

	.series-explain {
		margin: 0 0 1.2rem;
		font-size: 1.4rem;
		color: var(--black);
	}

	/* Scrolls rather than truncating: seeing that the list runs to 150 IS the
	   information §5 wants visible before committing. */
	.series-parts {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
		max-height: 24rem;
		overflow-y: auto;
		border: 1px solid var(--gray-100);
		border-radius: 0.4rem;
	}

	.series-parts li {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.6rem 0.8rem;
		font-size: 1.3rem;
		border-bottom: 1px solid var(--gray-100);
	}

	.series-parts li:last-child {
		border-bottom: none;
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

	.series-confirm {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
		font-size: 1.3rem;
		color: var(--black);
	}
</style>

