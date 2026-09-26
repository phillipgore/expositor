<script>
	/**
	 * # Edit Series — Review Changes (full page)
	 *
	 * Reached from the Edit Series form when an edit needs decisions before saving. The pending
	 * edit is handed off via sessionStorage and is NOT yet persisted.
	 *
	 * ## Why this page is mandatory rather than a confirmation dialog
	 *
	 * Editing a serialized study can do three things at once: narrow a part, delete whole parts,
	 * and add text. Only the first is reversible in any sense — a deleted part takes its columns,
	 * sections, segments, headings, notes and commentary with it, and Q35 leaves no undo. So the
	 * user is shown what each doomed part CONTAINS (counted server-side before anything is written)
	 * and must tick an explicit acknowledgement.
	 *
	 * The narrowing decisions reuse `PassageReview` unchanged — the same Merge/Delete choices a
	 * single-study edit offers, because it is the same question about the same kind of content.
	 *
	 * ## Refresh / deep-link handling
	 * Mirrors the study review page: a one-time "armed" flag is consumed on first mount, so a
	 * refresh (or a direct visit) redirects back to the form rather than showing a stale review.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Checkbox from '$lib/componentElements/Checkbox.svelte';
	import PassageReview from '$lib/componentWidgets/PassageReview.svelte';
	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';

	const seriesId = $page.params.id;
	const editHref = `/series/${seriesId}/edit`;
	const seriesHref = `/series/${seriesId}`;

	let pending = $state(null);
	let decisions = $state({});
	let isSaving = $state(false);
	let saveError = $state('');
	let ready = $state(false);
	let confirmedDeletion = $state(false);

	onMount(() => {
		const armed = sessionStorage.getItem(armedKey(seriesId));
		const raw = sessionStorage.getItem(pendingEditKey(seriesId));

		// Consume the flag immediately so a refresh falls through to the redirect below.
		if (armed) sessionStorage.removeItem(armedKey(seriesId));

		if (!armed || !raw) {
			goto(editHref, { replaceState: true });
			return;
		}

		try {
			pending = JSON.parse(raw);
		} catch {
			goto(editHref, { replaceState: true });
			return;
		}

		if (!pending?.report) {
			goto(editHref, { replaceState: true });
			return;
		}

		ready = true;
	});

	let deletedParts = $derived(pending?.report?.deletedParts ?? []);
	let addedRanges = $derived(pending?.report?.addedRanges ?? []);
	let dissolves = $derived(Boolean(pending?.report?.dissolves));
	let divisionSplits = $derived(pending?.report?.division?.splits ?? []);
	let divisionJoins = $derived(pending?.report?.division?.joins ?? []);

	/**
	 * Titles that a join will destroy (Q28: the earlier part keeps its own).
	 *
	 * Surfaced on its own because it is the one LOSS a re-division causes. Everything else a split
	 * or join does is re-parented intact, so a section that listed the operations without naming
	 * the discarded titles would describe the shape change and hide the only irreversible part
	 * of it.
	 */
	let discardedTitles = $derived(divisionJoins.flatMap((j) => j.discardedTitles ?? []));

	/** Saving is blocked until the user acknowledges any part deletion. */
	let saveBlocked = $derived(deletedParts.length > 0 && !confirmedDeletion);

	/**
	 * A plain-English summary of what a doomed part contains.
	 *
	 * Only non-zero kinds are named: padding the list with "0 notes" would make an empty part look
	 * as costly as one holding a chapter of commentary, which is the opposite of what this page is
	 * for. An entirely empty part says so, rather than showing a bare reference the user has to
	 * interpret.
	 */
	function describeContents(contents) {
		if (!contents) return 'nothing recorded';
		const bits = [];
		if (contents.columns)
			bits.push(`${contents.columns} column${contents.columns === 1 ? '' : 's'}`);
		if (contents.segments)
			bits.push(`${contents.segments} segment${contents.segments === 1 ? '' : 's'}`);
		if (contents.headings)
			bits.push(`${contents.headings} heading${contents.headings === 1 ? '' : 's'}`);
		if (contents.notes) bits.push(`${contents.notes} note${contents.notes === 1 ? '' : 's'}`);
		if (contents.commentary)
			bits.push(
				`${contents.commentary} commentary ${contents.commentary === 1 ? 'entry' : 'entries'}`
			);
		return bits.length > 0 ? bits.join(', ') : 'no structure or notes';
	}

	function handleBack() {
		goto(editHref);
	}

	/** Discard the pending edit entirely and return to the series. */
	function handleCancel() {
		if (isSaving) return;
		sessionStorage.removeItem(pendingEditKey(seriesId));
		sessionStorage.removeItem(armedKey(seriesId));
		goto(seriesHref);
	}

	async function handleSave() {
		if (isSaving || !pending || saveBlocked) return;
		isSaving = true;
		saveError = '';

		try {
			const response = await fetch(`/api/series/${seriesId}/reserialize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: pending.title,
					subtitle: pending.subtitle,
					passages: pending.passages,
					// Present only when the user actually changed the division. Absent means "leave the
					// seams alone", so a passage-only edit cannot re-divide the series by accident.
					//
					// ⚠️ The WHOLE request is forwarded, balance included. This used to copy only the two
					// chapters fields, so a balanced division survived the analysis — the review listed
					// its splits and joins — and was then committed as a chapters division: the page
					// the user approved and the save it made described different series.
					...(pending.chaptersPerPart != null
						? {
								chaptersPerPart: pending.chaptersPerPart,
								chaptersPerPassage: pending.chaptersPerPassage,
								balanceByLength: pending.balanceByLength ?? false,
								targetParts: pending.targetParts ?? 0,
								balancePerPassage: pending.balancePerPassage ?? []
							}
						: {}),
					decisions,
					// Recomputed server-side and compared: refuses if the series changed while this
					// page was open, rather than applying decisions to parts that no longer exist.
					partsFingerprint: pending.report?.partsFingerprint ?? null,
					confirmPartDeletion: deletedParts.length === 0 || confirmedDeletion
				})
			});

			const result = await response.json();

			if (!response.ok) {
				saveError = result?.error || 'Failed to save changes. Please try again.';
				return;
			}

			sessionStorage.removeItem(pendingEditKey(seriesId));

			// A dissolved series no longer exists, so returning to its page would 404. The survivor
			// is a standalone study now, and that is where the user's work is.
			const destination = result.dissolved ? `/study/${result.dissolvedIntoStudyId}` : seriesHref;
			await goto(destination, { invalidateAll: true });
		} catch (err) {
			console.error('Error saving series edit:', err);
			saveError = 'Failed to save changes. Please try again.';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="review-page">
	{#if ready && pending}
		<Heading heading="h1">Review Changes</Heading>

		{#if saveError}
			<Alert color="red" look="subtle" message={saveError} />
		{/if}

		<!--
			⚠️ The destructive section comes FIRST, before the reversible narrowing decisions.
			A user who reads top-to-bottom must meet "three parts will be deleted" before they meet
			a set of radio buttons about segment placement — the opposite order buries the only
			consequence that cannot be undone.
		-->
		{#if deletedParts.length > 0}
			<section class="danger">
				<Heading heading="h2">
					{deletedParts.length}
					{deletedParts.length === 1 ? 'part' : 'parts'} will be deleted
				</Heading>

				<Alert
					color="red"
					look="subtle"
					message="These parts cover verses that are no longer in the study. Deleting them permanently removes their structure, notes and commentary. This cannot be undone."
				/>

				<ul class="doomed-list">
					{#each deletedParts as part (part.partId)}
						<li>
							<span class="doomed-title">{part.title}</span>
							<span class="doomed-reference">{part.reference}</span>
							<!-- Counted server-side BEFORE anything is written: after the delete the
							     rows are gone and the number is unrecoverable. -->
							<span class="doomed-contents">{describeContents(part.contents)}</span>
						</li>
					{/each}
				</ul>

				{#if dissolves}
					<Alert
						color="yellow"
						look="subtle"
						message="This leaves a single part, so the series will be dissolved and that part will become a standalone study."
					/>
				{/if}

				<Checkbox id="confirm-part-deletion" bind:checked={confirmedDeletion} spacingBottom="0rem">
					Yes, delete {deletedParts.length}
					{deletedParts.length === 1 ? 'part' : 'parts'} and everything in them.
				</Checkbox>
			</section>
		{/if}

		{#if addedRanges.length > 0}
			<section class="added">
				<Heading heading="h2">New text</Heading>
				<ul class="added-list">
					{#each addedRanges as range, i (range.reference ?? i)}
						<li>{range.reference}</li>
					{/each}
				</ul>
				<!-- Stated plainly rather than silently handled: added text does not become a new
				     part on its own, and a user expecting one would otherwise be puzzled by the
				     unchanged part count. -->
				<Alert
					color="blue"
					look="subtle"
					message="These verses join the part next to them. To give them a part of their own, use Split Part afterwards."
				/>
			</section>
		{/if}

		{#if divisionSplits.length > 0 || divisionJoins.length > 0}
			<section class="division">
				<Heading heading="h2">Division</Heading>

				<!-- ⚠️ The DISCARDED TITLES come first. Joining re-parents every column, note and
				     comment intact, so the only thing a re-division destroys is the absorbed part's
				     title (Q28) — and with no undo, that has to be named before it happens rather
				     than found missing in the Finder afterwards. -->
				{#if discardedTitles.length > 0}
					<Alert
						color="yellow"
						look="subtle"
						message={`Joining parts keeps the earlier part's title. ${discardedTitles.length === 1 ? 'This title will be lost' : 'These titles will be lost'}: ${discardedTitles.join(', ')}.`}
					/>
				{/if}

				<ul class="division-list">
					{#each divisionJoins as join (join.keepId)}
						<li>
							<span class="division-verb">Join</span>
							<span class="division-detail">
								{join.discardedTitles.join(', ')} into “{join.keepTitle}”
							</span>
						</li>
					{/each}
					{#each divisionSplits as split (split.partId)}
						<li>
							<span class="division-verb">Split</span>
							<span class="division-detail">
								“{split.title}” into {split.intoParts} parts
							</span>
						</li>
					{/each}
				</ul>

				<!-- Said explicitly because it is the reassuring half, and a user looking at a list
				     of joins has every reason to fear otherwise. -->
				<p class="division-note">
					Structure, notes and commentary are carried across — only the titles above are lost.
				</p>
			</section>
		{/if}

		{#if pending.report?.passages?.length > 0}
			<section>
				<Heading heading="h2">Passage changes</Heading>
				<PassageReview report={pending.report} bind:decisions />
			</section>
		{/if}

		<FormButtonBar marginTop>
			<Button label="Cancel" classes="gray" handleClick={handleCancel} isDisabled={isSaving} />
			<Button label="Back" classes="gray" handleClick={handleBack} isDisabled={isSaving} />
			<Button classes="blue" handleClick={handleSave} isDisabled={isSaving || saveBlocked}>
				{#if isSaving}
					<Spinner size="sm" inline color="var(--white)" label="Saving…" showLabel />
				{:else}
					Save Changes
				{/if}
			</Button>
		</FormButtonBar>
	{/if}
</div>

<style>
	.review-page {
		margin: 3.6rem 0;
		padding: 0 2.4rem;
	}

	.review-page :global(h1) {
		margin-bottom: 2.4rem;
	}

	.review-page section {
		margin-bottom: 3.6rem;
	}

	/* Bordered and tinted, so the irreversible section is distinguishable at a glance from the
	   reversible ones below it — not merely first in the flow. */
	.danger {
		border: 1px solid var(--red);
		border-radius: 0.4rem;
		padding: 1.8rem;
		background-color: var(--white);
	}

	.doomed-list {
		list-style: none;
		margin: 1.2rem 0;
		padding: 0;
	}

	.doomed-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.8rem 0;
		border-bottom: 1px solid var(--gray-100);
		font-size: 1.4rem;
	}

	.doomed-list li:last-child {
		border-bottom: none;
	}

	.doomed-title {
		font-weight: 600;
		color: var(--black);
		min-width: 14rem;
	}

	.doomed-reference {
		color: var(--gray-400);
	}

	.doomed-contents {
		margin-left: auto;
		color: var(--red);
	}

	.added-list {
		list-style: none;
		margin: 0 0 1.2rem;
		padding: 0;
	}

	.added-list li {
		padding: 0.6rem 0;
		font-size: 1.5rem;
		color: var(--black);
	}

	.division-list {
		list-style: none;
		margin: 1.2rem 0;
		padding: 0;
	}

	.division-list li {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		padding: 0.6rem 0;
		font-size: 1.4rem;
		border-bottom: 1px solid var(--gray-100);
	}

	.division-list li:last-child {
		border-bottom: none;
	}

	.division-verb {
		min-width: 5rem;
		font-weight: 600;
		color: var(--black);
	}

	.division-detail {
		color: var(--gray-400);
	}

	.division-note {
		margin: 0;
		font-size: 1.3rem;
		color: var(--gray-300);
	}
</style>
