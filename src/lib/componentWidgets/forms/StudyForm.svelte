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
	import { onMount, untrack } from 'svelte';
	import { v4 as uuidv4 } from 'uuid';
	import { enhance, applyAction, deserialize } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';

	import bibleData from '$lib/data/bible.json';
	import { getBook } from '$lib/utils/bibleData.js';
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
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import Badge from '$lib/componentElements/Badge.svelte';
	import ToggleSwitch from '$lib/componentElements/ToggleSwitch.svelte';
	import ManageSerializationModal from '$lib/componentWidgets/modals/ManageSerializationModal.svelte';
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

	/**
	 * A failure from the series analysis step.
	 *
	 * Held separately from `form?.error`, which carries SvelteKit action failures. The series path
	 * never posts to an action — it fetches, then navigates — so it has no `form` prop to populate,
	 * and reusing that one would mean an error from a previous save could reappear here.
	 */
	let seriesEditError = $state('');

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
	let selectedTranslation = $state(
		mode === 'edit' || mode === 'series-edit' ? initialData?.translation || 'esv' : 'esv'
	);

	/**
	 * Editing an existing thing, whether a standalone study or a whole series.
	 *
	 * Several rules below apply to both — the translation is fixed, the title must not collide with
	 * OTHER studies, and unsaved changes must be guarded. Naming the shared case once stops those
	 * rules being re-derived (and drifting) per mode.
	 */
	let isEditing = $derived(mode === 'edit' || mode === 'series-edit');

	/**
	 * Per-passage retrieval problems for the chosen translation.
	 *
	 * Empty for a translation that can chunk (a passage may span a whole book).
	 * For ESV this reports ranges too large for one request, and complete books
	 * Crossway will not serve whole.
	 *
	 * The per-passage `index` and `message` are no longer rendered — the form shows one
	 * generic alert instead — but both are kept rather than reduced to a bare count. They
	 * are what a passage-level affordance would need (highlighting the offending fieldset,
	 * or a tooltip), which is the known follow-up if the generic copy proves too vague, and
	 * discarding them here would mean re-deriving them there.
	 */
	let passageIssues = $derived(
		passages
			.map((p, index) => ({ index, ...checkSinglePassageSupport(p, selectedTranslation) }))
			.filter((r) => !r.canBeSinglePassage)
	);

	let hasPassageIssues = $derived(passageIssues.length > 0);

	// NOTE: what actually BLOCKS submission is `submissionBlockedByPassages`, declared with the
	// series planning below because it depends on the planned parts. `hasPassageIssues` alone is
	// the one-study answer and is no longer the whole story.

	/**
	 * Verses this study would render on ONE page, if created as one study.
	 *
	 * Summed across passages because DOM cost is a property of the whole page, not of
	 * any one passage.
	 */
	let singleStudyVerses = $derived(
		passages.reduce(
			(total, p) => total + checkSinglePassageSupport(p, selectedTranslation).verseCount,
			0
		)
	);

	// NOTE: the rendering-performance assessment that consumes `singleStudyVerses` is declared
	// AFTER the series planning below, because it also reads `seriesParts`.

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
	 * Advisory or blocking, per the translation's `enforcement` posture — the assessment
	 * carries its own `blocked` flag and this form now reads it. See `displayAssessment`
	 * below and COMPLIANCE.md §1.6.
	 */
	let displayAssessment = $derived(validateStudyDisplayLimits(passages, selectedTranslation));

	let displayComplianceWarnings = $derived(displayAssessment.warnings);

	/**
	 * Whether ANY display limit is exceeded — the only thing this form now asks of the
	 * assessment above.
	 *
	 * The individual messages are still computed, and deliberately so: the per-book
	 * `min(pageCap, bookTotal × maxBookPortion)` resolution that COMPLIANCE.md §1.7 exists
	 * to enforce is what decides whether this is true at all. What changed is that the
	 * resolved numbers are no longer printed on this form — not that they stopped being
	 * derived. `validateStudyDisplayLimits()` remains the single source of that judgement,
	 * and export/print still shows its full text.
	 */
	let hasDisplayComplianceIssue = $derived(displayComplianceWarnings.length > 0);

	/**
	 * Whether the display breach is a REFUSAL rather than a notice.
	 *
	 * `blocked` is `!compliant && enforcement === 'block'`, resolved from the translation's own
	 * JSON, so this is a data-driven posture and not a second opinion held by the form. Under NET
	 * every display limit is null, the study is compliant unconditionally, and this is always
	 * false.
	 *
	 * ⚠️ This is about whether the study WILL LOAD, not about licence etiquette. Crossway enforces
	 * the half-book rule server-side and silently: a request for a whole Ephesians returns HTTP 200
	 * with roughly half the verses and a truncated `canonical` field, and the analyze view then
	 * shows "Error loading Ephesians 1:1-6:24". `checkSinglePassageSupport()` does NOT catch this —
	 * it refuses a complete book only when the book also exceeds the 500-verse request ceiling, so
	 * Ephesians (155), Galatians (149) and Romans (433) all pass retrieval and fail at fetch. The
	 * display check is the accurate predictor, which is why it is the one that gates Save.
	 */
	let displayBlocked = $derived(displayAssessment.blocked);

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
	// Offered in `new` (create as a series) and `series-edit` (re-divide an existing one). NOT in
	// plain `edit`: converting a standalone study is the study menu's job, and a toggle here would
	// collide with the passage-reconciliation review flow.
	//
	// In `series-edit` the study ALREADY is a series, so the switch starts on and reflects reality
	// rather than proposing a change. Turning it off means dissolving the series, which is
	// destructive and confirmed separately.
	let createAsSeries = $state(mode === 'series-edit');

	// Seeded from the series' CURRENT division when editing one, so the modal opens on the shape the
	// user has rather than proposing a re-division they did not ask for. `null` means the series is
	// hand-shaped and has no single chapters-per-part, in which case the default stands and nothing
	// happens unless the user moves the stepper.
	let chaptersInput = $state(
		mode === 'series-edit' && initialData?.chaptersPerPart
			? String(initialData.chaptersPerPart)
			: '1'
	);

	// Eligibility is the SHARED rule, not a local re-derivation: 2+ chapters, never tightened
	// (§5, trap 10). A single-chapter study simply has no seam to cut on.
	let seriesEligible = $derived(mode !== 'edit' && isSeriesEligible(passages));

	let seriesStrategy = $derived(getPartingStrategy(passages));

	// A single contiguous range steers with ONE stepper. A multi-passage study steers with one
	// stepper PER PASSAGE (see `passageParting` below) — the seams between passages are the
	// user's, but the chapters inside each one are still divisible.
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

	// --- Per-passage division (multi-passage studies) -----------------------
	//
	// Keyed by passage id, NOT by index: a passage the user deletes or drags must take its own
	// setting with it, and an index-keyed map would silently hand passage 2's division to
	// whatever slid into slot 2.
	//
	// Absent key = "leave this passage whole", which is what every multi-passage series did
	// before this existed. So the default shape is unchanged and the user opts in per passage.
	/** @type {Record<string, string>} */
	let chaptersPerPassageInput = $state({});

	// "Balance by length" (§5 option (b), Q11), chosen in ManageSerializationModal and held here
	// because the FORM is what submits. The modal edits a draft and commits on Done; these are the
	// committed values, and they must travel to the server or it would re-plan with the default
	// shape while the user had approved a balanced preview.
	let balanceByLengthInput = $state(false);
	let balanceTargetInput = $state(0);

	/** Per-passage balance targets, positional, for a multi-passage study. @type {number[]} */
	let balancePerPassageInput = $state([]);

	/**
	 * How many chapters each passage spans, and whether it can be divided at all.
	 * A one-chapter passage has no internal seam — same rule as `getPartingStrategy`.
	 */
	let passageParting = $derived(
		passages.map((p, index) => {
			const chapterSpan = (p.toChapter ?? p.fromChapter) - (p.fromChapter ?? 0) + 1;
			const raw = chaptersPerPassageInput[p.id];
			// Untouched passages start divided at ONE chapter per part, matching
			// `ManageSerializationModal.DEFAULT_CHAPTERS_PER_PASSAGE`. An absent key used to
			// mean "leave whole", which made the form's summary pill contradict the modal the
			// moment it opened: the modal seeded 1 ch per row while this still read 0. The two
			// defaults have to be the same number or the pill describes a plan nobody chose.
			const parsed = raw === undefined ? 1 : parseInt(raw, 10);
			// One short of the span — every setting that genuinely divides this passage.
			//
			// NOT `floor(span / 2)`, which the study-wide stepper uses. There it enforces §4's
			// "a series needs 2+ parts" by making a single passage yield two. Here that reasoning
			// does not transfer: the 2-part minimum is a property of the SERIES, and the other
			// passages contribute parts too. Copying the bound across would have refused 2
			// chapters per part on a 3-chapter passage — a division into 2 parts, which is both
			// valid and the obvious thing to want. `seriesBlocksSubmit` still enforces the real
			// minimum on the assembled plan, which is where it belongs.
			const maxPer = chapterSpan > 1 ? chapterSpan - 1 : 0;
			const chapters =
				Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, Math.max(1, maxPer)) : 0;
			// No `label` here any more: the only consumer was the per-passage stepper row, which
			// moved into `ManageSerializationModal` and derives its own. What survives in this
			// file is the arithmetic feeding the hidden `chaptersPerPassage` input and the
			// series preview, none of which needs a human reference.
			return {
				id: p.id,
				index,
				chapterSpan,
				canDivide: chapterSpan > 1,
				maxPer,
				chapters,
				// What this passage contributes to the series, for the summary beside the stepper.
				partCount: chapters >= 1 ? Math.ceil(chapterSpan / chapters) : 1
			};
		})
	);

	/** Positional array in the shape `planSeriesParts()` and the endpoint expect. */
	let chaptersPerPassage = $derived(passageParting.map((entry) => entry.chapters));

	/**
	 * Has the user actually asked to RE-DIVIDE an existing series?
	 *
	 * Only true when the stepper differs from the division the series already has. Sending the
	 * setting unconditionally would make every save a re-division: opening the form and changing
	 * only the subtitle would re-plan the seams, and a series whose current shape has no single
	 * chapters-per-part (hand-split with Split Part) would be flattened to a uniform one it never
	 * asked for.
	 */
	/**
	 * The division as the form would SEND it: every field the planner reads, in the shape
	 * `readDivisionRequest()` accepts on the server. Balance fields are zeroed unless balancing,
	 * matching that reader, so the comparison below cannot see a difference the server would not.
	 */
	let divisionRequest = $derived({
		chaptersPerPart,
		chaptersPerPassage,
		balanceByLength: balanceByLengthInput,
		targetParts: balanceByLengthInput ? balanceTargetInput : 0,
		balancePerPassage: balanceByLengthInput ? balancePerPassageInput : []
	});

	/**
	 * What `divisionRequest` read when the form first rendered, before the user touched anything.
	 *
	 * ⚠️ Captured from the form's own state, NOT from `initialData.chaptersPerPart`. The old test
	 * compared the stepper against that number and missed three things:
	 *
	 *   - balance by length, which changes the division without moving chapters-per-part;
	 *   - per-passage steppers, which it never looked at;
	 *   - and, worst, a multi-passage series. There the loader reports the division it found
	 *     (say 2) while the form's own chapters-per-part clamps to 1, because the single-passage
	 *     stepper does not apply — so the test read "changed" on load, and a save that touched
	 *     nothing but the subtitle re-divided the series (5 parts became 10).
	 *
	 * Comparing the whole request with its own starting value asks the only question that
	 * matters — did the user change the division? — whatever shape the division takes.
	 */
	const divisionBaseline = untrack(() => JSON.stringify(divisionRequest));

	let divisionChanged = $derived(
		mode === 'series-edit' &&
			createAsSeries &&
			JSON.stringify(divisionRequest) !== divisionBaseline
	);

	// Drop settings for passages that no longer exist, so a deleted passage cannot leave a stale
	// entry that a later passage reusing its id would inherit.
	//
	// Rebuilt in one pass and only reassigned when something actually changed — assigning
	// unconditionally would re-trigger this effect on its own write.
	$effect(() => {
		const live = new Set(passages.map((p) => p.id));
		/** @type {Record<string, string>} */
		const kept = {};
		let dropped = false;
		for (const [key, value] of Object.entries(chaptersPerPassageInput)) {
			if (live.has(key)) kept[key] = value;
			else dropped = true;
		}
		if (dropped) chaptersPerPassageInput = kept;
	});

	// The SAME planner the server action's endpoint runs, so this preview cannot promise a shape
	// the creation produces differently.
	let seriesPlan = $derived(
		createAsSeries && seriesEligible
			? planSeriesParts({
					passages,
					chaptersPerPart,
					chaptersPerPassage,
					translationId: selectedTranslation,
					baseTitle: studyTitle,
					// The same balance setting the modal previewed with. Without these the form's own
					// part count and the "N parts" badge beside the Passages heading would describe a
					// DIFFERENT parting from the one the user just approved and the server will build.
					balanceByLength: balanceByLengthInput,
					targetParts: balanceByLengthInput ? balanceTargetInput : 0,
					balancePerPassage: balanceByLengthInput ? balancePerPassageInput : []
				})
			: null
	);

	let seriesParts = $derived(seriesPlan?.parts ?? []);

	// Compliance is SHOWN, never enforced (§5, COMPLIANCE §1.6): a user may knowingly create a
	// series that will warn at export. Note these are the planner's series-aware warnings, which
	// include the series-level aggregate the per-part checks would otherwise silence (trap 8).
	/**
	 * Planned parts ESV genuinely cannot serve, each asked on its own terms.
	 *
	 * This is the series-aware counterpart to `passageIssues`, and it is deliberately the
	 * SAME function: a part is a study, so "can this be fetched and shown" has one answer,
	 * not a per-context variant. Reusing `checkSinglePassageSupport()` is what keeps the
	 * blocking rule honest — if a part really were unservable, this still catches it.
	 *
	 * In practice it is empty for chapter-sized parts, and that is a fact about the canon
	 * rather than luck: the longest chapter in the Bible is Psalm 119 at 176 verses, about a
	 * third of ESV's 500-verse ceiling (pinned by `verify-chapter-verse-bounds.mjs`, so this
	 * claim fails loudly if the data ever contradicts it).
	 */
	let seriesPartIssues = $derived(
		(seriesPlan?.parts ?? [])
			.map((part) => ({
				seriesOrder: part.seriesOrder,
				...checkSinglePassageSupport(part.passages[0], selectedTranslation)
			}))
			.filter((r) => !r.canBeSinglePassage)
	);

	/**
	 * The same question asked of each PLANNED PART, for the series case.
	 *
	 * A part is its own study on its own page fetched by its own request, so the page rule governs
	 * the parts and not the source range they were derived from (COMPLIANCE §1.10). Whole-book study
	 * through Serialization is therefore legitimate and must stay possible: Ephesians at 2 chapters
	 * per part is three parts of 45, 53 and 57 verses, every one of them under half the book.
	 *
	 * ⚠️ Deliberately NOT the aggregate across parts. `assessPlan()` emits nothing series-wide and
	 * its comment forbids reinstating it — a series is many pages, so a per-page rule has no
	 * meaning for the whole. The export gate owns that boundary.
	 */
	let seriesPartDisplayIssues = $derived(
		(seriesPlan?.parts ?? [])
			.map((part) => ({
				seriesOrder: part.seriesOrder,
				...validateStudyDisplayLimits(part.passages, selectedTranslation)
			}))
			.filter((r) => r.blocked)
	);

	/**
	 * Whether retrieval problems should BLOCK submission.
	 *
	 * ⚠️ Not simply `hasPassageIssues`. That asks "can ESV serve this passage as one study?",
	 * which is the wrong question the moment the user has asked for a series — and it was
	 * asked anyway, because §5 creates-then-parts, so the form's passages stay whole-book
	 * right up to submit. The consequence was a dead end with no exit: a whole-Matthew series
	 * had Save disabled at 7, 4, 2 AND 1 chapters per part, because the check never looked at
	 * the parts. No stepper setting could satisfy a test that was not reading the stepper.
	 *
	 * Crossway's limits are scoped per REQUEST and per PAGE (api.esv.org, retrieved
	 * 2026-08-28: "up to 500 verses per query"; "may not display more than 500 verses or
	 * one-half of any book (whichever is less) on any page"). A series part is its own study
	 * on its own page, fetched by its own request, so the parts are what those clauses govern
	 * — not the source range they were derived from. See COMPLIANCE.md §1.10.
	 *
	 * Still strict: a part ESV genuinely cannot serve blocks exactly as before. What no longer
	 * blocks is a range that is only too large *undivided*, which is the case the series
	 * feature exists to solve.
	 *
	 * ## Display now blocks too, on the same series-aware terms
	 *
	 * Retrieval alone was not enough, and the gap was user-visible: a whole Ephesians ESV study
	 * passed every check here and then rendered "Error loading Ephesians 1:1-6:24", because
	 * Crossway truncates a complete-book request silently and `checkSinglePassageSupport()` only
	 * refuses complete books that ALSO exceed the 500-verse request cap. Ephesians is 155 verses,
	 * so it sailed through a check that cannot see the rule it breaks.
	 *
	 * `validateStudyDisplayLimits()` does see it, and is the accurate predictor of whether a study
	 * will load. Blocking on it is therefore not licence etiquette; it is refusing to create a
	 * study that provably cannot be displayed. The remedy is Serialization, which the alert names.
	 *
	 * ⚠️ Series-aware for the SAME reason retrieval is, and the reason is worth restating because
	 * getting it wrong reproduces the whole-Matthew dead end above: under a series the form's
	 * passages stay the undivided whole-book range right up to submit, so asking the display
	 * question of `passages` would refuse every whole-book series at every stepper setting —
	 * including the settings that produce a perfectly compliant series. The PARTS are what the
	 * page rule governs. Ephesians at 2 chapters per part is three compliant parts, and must save.
	 */
	let submissionBlockedByPassages = $derived(
		createAsSeries && seriesPlan
			? seriesPartIssues.length > 0 || seriesPartDisplayIssues.length > 0
			: hasPassageIssues || displayBlocked
	);

	/**
	 * Rendering-performance assessment, measured on the unit that actually renders.
	 *
	 * ⚠️ NOT always the cross-passage sum. Under a series the sum is a number no page
	 * ever displays: whole Psalms reported 2,461 verses while its largest part renders
	 * 176, and whole Matthew reported 1,071 against a largest part of 228. Both alerts
	 * were false, and their advice ("consider a smaller range") was the very thing the
	 * user had already done by choosing a series.
	 *
	 * The thresholds in studyLimits.js are per-PAGE — DOM spans in one Analyze view — so
	 * the count handed to them must be the largest thing that becomes a page. For a
	 * series that is the biggest part. This mirrors the licence alert in the markup
	 * below, withheld under a series on the same ground: a series is not one page.
	 *
	 * Deliberately still ASKED rather than suppressed outright. On ESV the question is
	 * moot — `maxVerses` is 500 with `chunking: false`, so any part big enough to reach
	 * VERSE_COUNT_NOTICE (600) is blocked by `seriesPartIssues` before it can exist. But
	 * NET sets `chunking: true`, so that 500 is a chunk size and nothing caps a part:
	 * Psalms at 75 chapters per part is two creatable parts of ~1,200 verses each, and
	 * suppressing under `createAsSeries` would render exactly that case silent.
	 *
	 * Declared here, below the planner, because it reads `seriesParts`.
	 *
	 * Never blocks — see src/lib/config/studyLimits.js for why there is no hard cap.
	 */
	let studySizeAssessment = $derived.by(() => {
		if (createAsSeries && seriesParts.length > 0) {
			const largest = seriesParts.reduce((max, part) => Math.max(max, part.verseCount ?? 0), 0);
			return assessStudySize(largest, { unit: 'part' });
		}
		return assessStudySize(singleStudyVerses);
	});

	let seriesWarnings = $derived(seriesPlan?.warnings ?? []);

	/**
	 * The planner's part warnings, split by WHICH LIMIT they came from.
	 *
	 * `assessPlan()` emits two kinds into one array and tags them: a retrieval failure
	 * carries `reason` (`'exceeds-request'` / `'complete-book'`, from
	 * `checkSinglePassageSupport()`), a display violation does not (it comes from
	 * `validateStudyDisplayLimits()`). The form was reading neither and printing one
	 * hardcoded sentence about display over both.
	 *
	 * That sentence was wrong for the commoner case. Matthew at 13 chapters per part puts
	 * 532 verses in part 2 — over ESV's 500-verse REQUEST cap, but roughly half of Matthew,
	 * so plausibly within the DISPLAY allowance. The alert said "shows more of a book than
	 * ESV allows on one page", which is a different clause on a different axis (COMPLIANCE
	 * §1.7). The part cannot be fetched; what it would display never arises.
	 *
	 * ⚠️ This is trap 8's lesson recurring: a hardcoded sentence gated on a count is a claim
	 * about data it never reads. The comment on the alert below already records this bug from
	 * the last time — that pass fixed the COUNT and left the SENTENCE. Split the data, then
	 * let each branch write its own copy; do not re-merge these.
	 *
	 * Partition is exhaustive by construction (`reason` present or absent), so a third kind
	 * cannot silently fall into the wrong sentence — it would land in `display` and be
	 * visible as wrong, rather than vanishing.
	 */
	let seriesRetrievalWarnings = $derived(seriesWarnings.filter((w) => Boolean(w.reason)));
	let seriesDisplayWarnings = $derived(seriesWarnings.filter((w) => !w.reason));

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
	//
	// ⚠️ NOT in `series-edit`. There the study already IS a series, and silently flipping the switch
	// off would turn "your passage edit left one chapter" into an unannounced request to DISSOLVE
	// the series — a destructive act arrived at by a side effect. The save path refuses that case
	// with an explanation instead, which is a refusal the user can act on.
	$effect(() => {
		if (mode !== 'series-edit' && !seriesEligible && createAsSeries) createAsSeries = false;
	});

	/**
	 * Whether the parting controls are open. They live in `ManageSerializationModal` now, so
	 * the steppers, the per-passage rows and the part list that used to be inline here moved
	 * with them — along with `passageLabel`, `setPassageChapters` and the step handlers.
	 */
	let isSerializationModalOpen = $state(false);

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
	let isDirty = $derived(isEditing && !!initialData?.id && currentSnapshot !== savedSnapshot);

	/**
	 * Get duplicate title message if a study with this title already exists
	 * @param {string} title
	 * @returns {string}
	 */
	function getDuplicateTitleMessage(title) {
		if (!title || !title.trim()) return '';
		const trimmedTitle = title.trim().toLowerCase();

		// When editing, exclude the current study from duplicate check. In series-edit the loader
		// has already excluded this series' own parts — their titles are derived from the parting
		// ("Matthew 3"), so treating them as user-chosen names would make the series collide with
		// itself on every keystroke.
		const studiesToCheck =
			isEditing && initialData?.id
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
	/**
	 * Editing a SERIES always goes through review.
	 *
	 * Unlike a study edit — which submits straight through when nothing needs a decision — a series
	 * edit can delete whole parts, and that must never happen without the user having seen what each
	 * doomed part contains. The endpoint refuses a commit without `confirmPartDeletion` anyway, so
	 * bypassing review here would only produce a 409 the user could not act on.
	 */
	async function runSeriesAnalysisGate({ cancel }) {
		cancel();

		if (hasDuplicateTitle || isAnalyzing || isSubmitting) return;

		isAnalyzing = true;
		try {
			const res = await fetch(`/api/series/${initialData.id}/analyze-edit`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				// The division travels with the analysis so the report can name what a join would
				// DISCARD (Q28). Sent only when the user actually changed it — chapters, per-passage
				// steppers or balance — see `divisionChanged`.
				body: JSON.stringify({
					passages,
					...(divisionChanged ? divisionRequest : {})
				})
			});

			const report = await res.json();

			if (!res.ok) {
				// Surfaced rather than swallowed: a limit breach or a missing series is something
				// the user can act on, and falling through to a save would fail anyway.
				seriesEditError = report?.error || 'Could not check these changes. Please try again.';
				return;
			}

			const seriesId = initialData.id;
			sessionStorage.setItem(
				pendingEditKey(seriesId),
				JSON.stringify({
					title: studyTitle,
					subtitle: studySubtitle,
					passages,
					// The requested DIVISION, carried through the review so the save applies the
					// shape the user approved. Sent only when it actually differs from what the
					// series already has — otherwise an edit that merely changed a passage would
					// re-divide the series as a side effect.
					...(divisionChanged ? divisionRequest : {}),
					report
				})
			);
			sessionStorage.setItem(armedKey(seriesId), '1');
			await goto(`/series/${seriesId}/edit/review`);
		} catch (err) {
			console.error('Series edit analysis failed:', err);
			seriesEditError = 'Could not check these changes. Please try again.';
		} finally {
			isAnalyzing = false;
		}
	}

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
		// A SERIES edit never posts to an action: its save spans several parts, so it goes through
		// the reserialize endpoint after the review page collects decisions.
		if (mode === 'series-edit' && initialData?.id) {
			runSeriesAnalysisGate({ cancel });
			return;
		}

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
	<Heading heading="h1" hasSub={groupName ? true : false}>
		{#if mode === 'new'}
			New Study
		{:else if mode === 'series-edit'}
			Edit Series
		{:else}
			Edit Study
		{/if}
	</Heading>
	{#if groupName}
		<Heading heading="h2" isMuted notBold>{`To be created in "${groupName}".`}</Heading>
	{/if}

	{#if form?.error}
		<Alert color="red" look="subtle" message={form.error} />
	{/if}

	{#if seriesEditError}
		<Alert color="red" look="subtle" message={seriesEditError} />
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
		where they've already lost the form.

		ONE generic alert, no verse counts and no passage names. This was previously one
		alert PER offending passage, each carrying the util's full prose — verse count,
		the resolved limit, and two sentences of licence mechanics. Selecting two whole
		books produced two paragraph-sized red blocks explaining a rule the user cannot
		change, at the moment they are still typing chapter numbers. Length was what
		registered, not content.

		⚠️ The translation name STAYS while the numbers go. It is the one variable the
		user can actually act on, and the limit is not universal: NET has no display
		restriction at all, so "too many verses" unqualified would state a rule of
		Scripture rather than of this licence.

		The numbers are not lost — `checkSinglePassageSupport()` still returns the full
		message, and export/print still shows it, where there is room and the legal
		stakes are higher. Only this form's presentation changed.

		Accepted cost: with Save disabled and no passage named, a multi-passage study
		makes the user find the long passage themselves. Deliberate (see COMPLIANCE.md
		§1.7's addendum); a fieldset highlight is the fix if it proves annoying.

		⚠️ "Serialize it" is offered FIRST, and only when `seriesEligible`. First because
		it is the only remedy that costs the user nothing — the other two mean studying less
		text or accepting a different translation. Conditional because the toggle it refers
		to is gated on the same flag (`mode === 'new'` plus 2+ chapters), so in edit mode,
		or for a study of single-chapter passages, the sentence would point at a control that
		is not on screen. Advice naming an absent control is the defect this form has already
		shipped once, in the series warning that survived its own data.

		Sharing `seriesEligible` with the toggle is what keeps the two in step: there is no
		second predicate to forget to update.

		⚠️ The verb is "Serialize" because that is the LABEL ON THE SWITCH. It read "Create a
		series" until 2026-08-29, from when the control was a radio pair reading "One study /
		A series of studies". Advice naming a control by a name it no longer carries is the
		absent-control defect at lower cost — the toggle is right there, but not findable by
		the word the sentence uses. If the switch is ever relabelled, this and the display
		advisory below both follow it.

		⚠️ ONE-STUDY ONLY. Under a series this said the same thing as the alert beside the part
		list — necessarily so, since both resolve from the same `checkSinglePassageSupport()`
		call on the same parts, so they could never disagree or appear apart. Two alerts for one
		fact reads as two problems.

		The lower one is the survivor because position is the argument: it sits with the stepper
		that fixes it and the part list that shows WHICH part is at fault, neither of which this
		one can point at from up here. Nothing is lost by suppressing it — Save is below the part
		list, so the retained alert cannot be scrolled past on the way to it.

		⚠️ NOT "too many verses for ESV", which this said until 2026-08-29.
		`checkSinglePassageSupport()` returns TWO reasons and only one of them is a verse
		count: `exceeds-request` genuinely is, but `complete-book` is a licence refusal —
		ESV will not serve a whole book by any route, at any length. Describing that as a
		verse problem invites the remedy §1.9 already recorded as a dead end (split it up),
		since splitting fixes retrieval and does nothing about the portion clause. "More
		than ESV can load at once" is true of both reasons and prejudges neither.
	-->
	{#if hasPassageIssues && !createAsSeries}
		<Alert
			color="red"
			look="subtle"
			message={`This selection is more than ${selectedTranslation.toUpperCase()} can load at once. ${
				seriesEligible
					? `Serialize it, shorten a passage, or switch to ${selectedTranslation === 'esv' ? 'NET' : 'ESV'}.`
					: `Shorten a passage, or switch to ${selectedTranslation === 'esv' ? 'NET' : 'ESV'}.`
			}`}
		/>
	{/if}

	<!--
		The DISPLAY refusal, and a different finding from the retrieval alert above: these verses
		can be fetched, but not shown together. Separate alert rather than a widened condition on
		that one, because "more than ESV can load at once" is false here — Ephesians' 155 verses are
		well inside the 500-verse request cap. The study fails on the half-book PAGE rule instead,
		which Crossway enforces by silently truncating the response.

		⚠️ "cannot be loaded" is deliberate, and is what separates this from the yellow alert it
		replaced. This is not a licence courtesy the owner may weigh: a study in this state renders
		"Error loading Ephesians 1:1-6:24" in the analyze view. Saying "you can still save it" here,
		as the yellow copy does, would be offering to create something already known to be broken.

		Serialization FIRST, and it is a real remedy rather than a deflection: the page rule governs
		each part separately, so Ephesians at 2 chapters per part is three compliant parts and a
		legitimate whole-book study. Only offered when `seriesEligible`, which is already false in
		plain `edit` mode — there is no series toggle on that form, so naming one would point at a
		control the user cannot see (the Actions menu owns that conversion).
	-->
	{#if displayBlocked && !hasPassageIssues && !createAsSeries}
		<Alert
			color="red"
			look="subtle"
			message={`This study shows more of a book than ${selectedTranslation.toUpperCase()} allows on one page, so it cannot be loaded. ${
				seriesEligible ? 'Serialize it, or shorten a passage.' : 'Shorten a passage.'
			}`}
		/>
	{/if}

	<!--
		Size feedback NEVER blocks. It's our own rendering-performance guess, not a
		correctness or licensing matter, and the underlying cause is unconfirmed —
		so we inform and let the user decide. See src/lib/config/studyLimits.js.

		Suppressed while a retrieval error blocks submission: it describes how a
		study would PERFORM once saved, which is premature advice about a study
		that cannot be saved yet. A whole-book ESV selection otherwise stacked four
		alerts at once, and this was the least actionable of them.
	-->
	{#if studySizeAssessment.message && !submissionBlockedByPassages}
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

		Also suppressed while a retrieval error blocks submission. Now that both alerts
		are generic they say very nearly the same sentence, so showing them together
		would read as a stutter; and the yellow one's "you can still save it" is false
		while the red one has Save disabled. Reappears once the blocker is resolved, if
		it still applies.

		Collapsed to ONE generic line for the same reason as the blocking alert above: this
		was one yellow alert PER over-limit book, each naming a verse count and a resolved
		cap. The resolution still happens — it is what decides whether this appears at all —
		it is simply no longer printed here. See COMPLIANCE.md §1.7 and its addendum.
	-->
	<!--
		Also withheld once a series is chosen. This measures the SOURCE passages as one
		page, and a series is not one page — its parts are separate studies with separate
		URLs, which is the unit Crossway's "on any page" clause names. Leaving it on would
		report a page violation for something that will never be rendered as a page, and
		the series preview runs its own per-part checks below.
	-->
	<!--
		⚠️ "more of a book", NOT "more verses". This read "more verses than ESV allows on one
		page" and was WRONG in the case that fires most often. The limit is
		`min(500, bookTotal × 0.5)` — `validateStudyDisplayLimits()` resolves it and tracks
		`boundByPortion` precisely because "half of Ephesians" and "500 verses" are different
		explanations. For most books the PORTION binds: Ephesians 1-5 is 131 verses, nowhere
		near 500, but well past the 77 that half of 155 allows. Naming the verse cap there
		gave a number the user could check against the licence and find innocent — §1.7's
		defect inverted, reporting the threshold that did not bind instead of both at once.

		The neutral phrasing is deliberate over the accurate-but-longer "more verses or a
		greater percentage of a book": that spells out both branches and leaves the user to
		work out which applies, which is the confusion §1.7's addendum removed from this form
		when it dropped the numbers. "More of a book" is true under either branch. It also
		now matches the per-part copy below, which had the right words all along.

		The honest fix is to return `boundByPortion` from `validateStudyDisplayLimits()` so
		this can branch the way the export copy does. Until then this sentence is true both
		ways rather than true by construction — do not add a number to it without that.

		⚠️ NO MENTION OF EXPORT. This ended "You can still save it; export may be limited"
		until 2026-08-29, and that clause was wrong twice over. Wrong in FACT: whole-series
		export BLOCKS in `MenuExport.guardExport()` (Q32) while per-part export warns, and
		which one a study meets depends on what the user later asks for — so "may be limited"
		understates one case and misdescribes the other. A fixed sentence making a claim about
		a subsystem it never reads, the same shape as the stale string recorded in the series
		branch below. Wrong in PLACE, because export is an act the
		user has not chosen to perform yet; `ExportComplianceModal`'s own header sets out
		why that boundary exists and why display limits are handled inline while
		distribution limits wait for the button press. The series branch was scrubbed of
		export at that time and this line was missed.

		The remedies replace it, ordered as the red alert above orders them and gated on the
		same `seriesEligible` — series first because it costs the user nothing. "You can
		still save it" stays as its own sentence rather than a third list item: it is the
		absence of an action, and a list whose last entry undoes the premise reads as
		padding. But it must be SAID. Compliance is the owner's call (COMPLIANCE §1.6; the
		"May a user create a series that will fail export? Yes, knowingly" row in
		SERIES_PLAN), and a yellow alert offering only fixes reads as a precondition.
	-->
	{#if !submissionBlockedByPassages && !createAsSeries && hasDisplayComplianceIssue && !displayBlocked}
		<Alert
			color="yellow"
			look="subtle"
			message={`This study shows more of a book than ${selectedTranslation.toUpperCase()} allows on one page. ${
				seriesEligible ? 'Serialize it or shorten a passage.' : 'Shorten a passage.'
			} You can still save it.`}
		/>
	{/if}

	<!--
		Hoisted to sit with the other form-level notices, above the Passages heading, rather
		than under the passage list where it used to trail the inline parting controls. Those
		controls are gone — the stepper is in the modal now — so there was nothing left down
		there for these alerts to be adjacent TO, and they read as a footer to the passage
		list instead of as a statement about the study. All four study-level alerts now stack
		in one place, in one order, whether or not a series is chosen.
	-->
	{#if seriesEligible}
		{#if createAsSeries}
			<!-- The setting the preview below was computed from, sent so the server plans the
			     same parts the user is looking at. -->
			<input type="hidden" name="chaptersPerPart" value={chaptersPerPart} />
			<!-- The per-passage divisions, in the positional shape the planner takes. Sent so the
			     server re-plans the parts the user is looking at rather than a default shape. -->
			<input type="hidden" name="chaptersPerPassage" value={JSON.stringify(chaptersPerPassage)} />
			<!-- The balance setting, sent for the same reason as the two above: the server re-plans
			     from these values, so a preview the user approved has to be reproducible from them.
			     `targetParts` is ignored by the planner unless `balanceByLength` is true. -->
			<input type="hidden" name="balanceByLength" value={balanceByLengthInput ? 'true' : 'false'} />
			<input type="hidden" name="targetParts" value={balanceTargetInput} />
			<input
				type="hidden"
				name="balancePerPassage"
				value={JSON.stringify(balancePerPassageInput)}
			/>

			<!-- The summary pill this block used to open with now rides on the Passages
			     heading instead. It is a status readout, not a notice, so stacking it with
			     the alerts gave a neutral fact the same weight as a compliance warning. -->

			<!--
				Shown, never enforced (§5, COMPLIANCE §1.6). Includes the series-level aggregate
				that per-part parting would otherwise silence.

				Collapsed to ONE generic line, matching the two alerts above the passage list.
				Volume is the whole problem here: finer parting multiplies part-scoped warnings —
				a 50-part series can emit one per part — and a wall of near-identical yellow
				alerts is read as decoration and scrolled past, so the compliance position the
				user is responsible for lands *less* often than if one line were shown.

				A previous pass tried an ordered, de-duplicated, truncated list with a "show all"
				toggle. It was still a list of paragraphs, which was solving the wrong half: the
				per-part detail is not information the user acts on while choosing a parting, and
				the parts it names are about to be renumbered by the next stepper press anyway.

				⚠️ Every warning reaching here is now PER-PART and fixable by the stepper above,
				so the copy names that remedy. It previously read "…You can still create the
				series; export may be limited", which was a hardcoded string firing on
				`seriesWarnings.length > 0` — and after the series-wide notice was re-scoped to
				export, a whole-book Matthew series rendered it with ZERO part-scoped warnings.
				The alert asserted a page violation that provably did not exist. A fixed sentence
				gated on a count is a claim about data it never reads; keep the two in step.

				Nothing here mentions export any more. `MenuExport.guardExport()` owns that, sees
				the real loaded ranges, and BLOCKS (Q32) rather than mentioning.
			-->
			{#if seriesRetrievalWarnings.length > 0}
				<!--
					RED, because this one blocks: an unservable part is what
					`submissionBlockedByPassages` is computed from, so Save is disabled whenever
					this shows. Yellow would have promised a study the form refuses to save.

					This is also the alert the user sees INSTEAD of the red one above the passage
					list, which is suppressed under a series precisely so this fact is stated once.
				-->
				<Alert
					color="red"
					look="subtle"
					message={`Some parts have too many verses for ${selectedTranslation.toUpperCase()} to load. Use fewer chapters per part, or switch to ${selectedTranslation === 'esv' ? 'NET' : 'ESV'}.`}
				/>
			{:else if seriesPartDisplayIssues.length > 0}
				<!--
					RED, and a genuinely different finding from the branch above: the parts fetch
					fine, but one shows more of a book than the licence permits on a page (Galatians
					at 5 chapters per part — 131 of 149 verses, against a half-book cap of 74).

					Red because it BLOCKS, under a translation whose display `enforcement` is
					'block': `seriesPartDisplayIssues` is one of the two inputs to
					`submissionBlockedByPassages`, so Save is disabled whenever this shows. Gated on
					that same derived value rather than on `seriesDisplayWarnings`, which counts
					PLAN warnings and would stay non-empty under a warn-posture translation where
					nothing is blocked — a red alert beside an enabled Save.

					The remedy is real and sits directly above: fewer chapters per part makes every
					part compliant. Whole-book study stays possible through Serialization precisely
					because the page rule is per part.

					`{:else if}` rather than a second `{#if}`: retrieval outranks display, the same
					precedence `assessPlan()` applies per part. A part that cannot be fetched has no
					page, so what it would display there is not yet a question.
				-->
				<Alert
					color="red"
					look="subtle"
					message={`Some parts show more of a book than ${selectedTranslation.toUpperCase()} allows on one page, so they cannot be loaded. Use fewer chapters per part.`}
				/>
			{:else if seriesDisplayWarnings.length > 0}
				<!-- Warn-posture translations only: a display finding that does NOT block. Same
				     copy as before, minus the claim that anything is refused. -->
				<Alert
					color="yellow"
					look="subtle"
					message={`Some parts show more of a book than ${selectedTranslation.toUpperCase()} allows on one page. Use fewer chapters per part.`}
				/>
			{/if}

			<!-- The large-series confirmation now sits in the button bar, beside the Save it
			     gates. See FormButtonBar below. -->
			{#if !needsSeriesConfirmation && isLargePartCount}
				<Alert
					color="blue"
					look="subtle"
					message={`${seriesParts.length} parts is a lot to navigate. Consider more chapters per part.`}
				/>
			{/if}
		{/if}
	{/if}

	<input type="hidden" name="passages" value={JSON.stringify(passages)} />
	{#if groupId}
		<input type="hidden" name="groupId" value={groupId} />
	{/if}

	<!--
		§5 entry point 1, as a switch plus a modal.

		⚠️ DISABLED, NEVER HIDDEN. This block previously rendered only when `seriesEligible`,
		on the reasoning that "offering a disabled control on a single-chapter study would
		advertise a capability and refuse it in the same breath". That judgement is reversed:
		a greyed switch with a `title` explaining WHY tells the user the capability exists and
		what would unlock it, whereas a control that simply is not there tells them nothing and
		reads as a missing feature.

		The parting controls themselves live in `ManageSerializationModal`. Inline, the part
		list ran to 150 rows for Psalms, pushing Save off-screen and making the form's shape
		depend on a setting most studies never touch.

		`createAsSeries` is a plain hidden input rather than a radio `name`, since a switch has
		no value attribute to submit.
	-->
	<input type="hidden" name="createAsSeries" value={createAsSeries ? 'true' : 'false'} />

	<!--
		The heading carries the series status readout at its far right: it describes the
		passage list below it, so it belongs on that list's title bar rather than in the
		alert stack, where a neutral "2 parts" fact sat among compliance warnings and
		borrowed their urgency.

		Label's `margin-bottom` is zeroed by `.passages-heading :global(label)` — it carries
		0.6rem for its usual stacked-above-a-field position, which on a flex row is dead
		space that lifts the text off the pill's centre line.
	-->
	<div class="passages-heading">
		<Label text="Passages"></Label>

		{#if seriesEligible && createAsSeries}
			<Badge
				color="blue"
				look="subtle"
				size="small"
				ariaLive="polite"
				message={`${seriesParts.length} parts · avg ${seriesAverageVerses} verses each`}
			/>
		{/if}
	</div>

	<!--
		1.8rem, matched by `.serialize-row`'s bottom margin, so the Serialize row sits in a
		band of its own rather than crowding the divider above it and the passage card below.
		The two numbers are a PAIR — the row reads as centred only while they agree, so change
		both or neither.
	-->
	<DividerHorizontal spacingTop="0.0rem" spacingBottom="1.8rem"></DividerHorizontal>

	<div class="serialize-row">
		<ToggleSwitch
			id="serialize"
			label="Serialize"
			checked={createAsSeries}
			isDisabled={!seriesEligible}
			title={!seriesEligible
				? 'A series needs a passage spanning at least two chapters'
				: mode === 'series-edit'
					? 'This study is a series. Turning this off will dissolve it into one study.'
					: 'Divide this study into a series of parts'}
			onToggle={(next) => (createAsSeries = next)}
		/>

		<Button
			label="Manage Serialization"
			classes="gray"
			isDisabled={!createAsSeries}
			handleClick={() => (isSerializationModalOpen = true)}
			title={createAsSeries
				? 'Choose how this study is divided into parts'
				: 'Turn on Serialize to divide this study into parts'}
		></Button>
	</div>
	<PassageSelector bind:passages onPassagesChange={handlePassagesChange} />
	<DividerHorizontal spacingTop="0.0rem" spacingBottom="2.7rem"></DividerHorizontal>

	<FormButtonBar>
		{#if needsSeriesConfirmation}
			<!--
				A hard gate: `seriesBlocksSubmit` disables Save until this is ticked, so the
				checkbox is the only thing standing between a mis-click and 150 studies. It is
				also exactly what a Psalms series legitimately is, hence a confirmation rather
				than a refusal.

				Placed in the button bar, at the far left, so it sits beside the Save it governs
				— the count that provokes it is now behind the modal, so a confirmation left up
				there would have referred to a number no longer on screen.
			-->
			<Checkbox
				id="confirm-large-series"
				bind:checked={hasConfirmedLargeSeries}
				spacingBottom="0rem"
				data-align="start"
			>
				Yes, create {seriesParts.length} parts.
			</Checkbox>
		{/if}

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
				submissionBlockedByPassages ||
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

<!--
	Outside the <form> deliberately: `Modal` renders a native <dialog>, and a dialog nested in a
	form makes its buttons implicit form submitters in some browsers — a stepper press inside the
	modal could submit the study.
-->
<ManageSerializationModal
	isOpen={isSerializationModalOpen}
	{passages}
	translationId={selectedTranslation}
	title={studyTitle}
	chaptersPerPart={chaptersInput}
	chaptersPerPassage={chaptersPerPassageInput}
	onConfirm={(settings) => {
		chaptersInput = settings.chaptersPerPart;
		chaptersPerPassageInput = settings.chaptersPerPassage;
		balanceByLengthInput = settings.balanceByLength ?? false;
		balanceTargetInput = settings.targetParts ?? 0;
		balancePerPassageInput = settings.balancePerPassage ?? [];
		isSerializationModalOpen = false;
	}}
	onClose={() => (isSerializationModalOpen = false)}
/>

<style>
	form {
		width: 41.4rem;
		min-width: 36rem;
	}

	/* --- Series choice + preview (§5 entry point 1) ----------------------- */

	/* "Passages" on the left, the series summary pill hard right, on one line.

	   Deliberately identical to `InputField`'s `.label-wrapper`, which is what puts "Title"
	   above its "Required" pill: same `space-between`, same 0.6rem below, same -0.3rem badge
	   nudge. This heading is the same construct one level up — a label with a status chip —
	   so it should measure the same rather than be tuned by eye. */
	.passages-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.6rem;
	}

	/* Label ships 0.6rem of bottom margin for its usual stacked-above-a-field position. On a
	   flex row that margin is dead space that lifts the text off the pill's centre line, so
	   it is cancelled here rather than made conditional inside Label. */
	.passages-heading :global(label) {
		margin-bottom: 0;
	}

	/* The pill's padding makes it optically sit low against the label's cap height; the same
	   correction `InputField` applies to the "Required" badge. */
	.passages-heading :global(.badge) {
		margin-top: -0.3rem;
	}

	/* The switch and its modal trigger keep their own line below the divider, at opposite
	   ends: the button lands on the passage card's right edge, under the pill it explains.

	   1.8rem below MATCHES the divider's `spacingBottom` above, which is the whole point:
	   the row is a band between two rules of its own, and equal margins are what make it
	   read as centred there. Both were 1.2rem and the row looked pinched against the
	   passage card. They are a pair — changing one alone reintroduces the imbalance. */
	.serialize-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.8rem;
	}

	/* The radio pair, stepper and confirmation checkbox that used to be styled here now live
	   in RadioButtons, Stepper and Checkbox respectively. */

	/* The per-passage rows, the part list and their styles moved to
	   `ManageSerializationModal` along with the markup they dressed. */

	/* Layout AND spacing are the Checkbox element's; the spacing this form wants is passed in
	   as `spacingBottom` rather than reached in through `:global`, which was never scoped to
	   this component and so fought two other copies of the same rule. */
</style>
