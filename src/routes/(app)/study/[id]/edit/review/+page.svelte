<script>
	/**
	 * # Edit Study — Review Passage Changes (full page)
	 *
	 * Reached from the Edit Study form's "Next" button when the proposed passage
	 * changes need decisions before saving. The pending edit (title, subtitle,
	 * passages, and the analyze-edit report) is handed off from the form via
	 * sessionStorage — it is NOT yet persisted.
	 *
	 * ## Refresh / deep-link handling
	 * The form sets a one-time "armed" flag alongside the payload. On first mount
	 * we consume that flag. A page refresh re-runs onMount with the flag already
	 * gone (and a direct visit never had it), so either case redirects straight
	 * back to the Edit Study page rather than showing a stale/empty review.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Button from '$lib/componentElements/buttons/Button.svelte';
	import FormButtonBar from '$lib/componentElements/FormButtonBar.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import PassageReview from '$lib/componentWidgets/PassageReview.svelte';
	import { pendingEditKey, armedKey } from '$lib/utils/pendingEdit.js';

	const studyId = $page.params.id;
	const editHref = `/study/${studyId}/edit`;
	const studyHref = `/study/${studyId}`;


	let pending = $state(null);
	let decisions = $state({});
	let isSaving = $state(false);
	let saveError = $state('');
	let ready = $state(false);

	onMount(() => {
		const armed = sessionStorage.getItem(armedKey(studyId));
		const raw = sessionStorage.getItem(pendingEditKey(studyId));

		// A legitimate arrival from the form has BOTH the armed flag and payload.
		// Consume the flag immediately so a refresh (which re-runs onMount with
		// the flag already gone) falls through to the redirect below.
		if (armed) sessionStorage.removeItem(armedKey(studyId));

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

		if (!pending?.report?.passages) {
			goto(editHref, { replaceState: true });
			return;
		}

		ready = true;
	});

	function handleBack() {
		goto(editHref);
	}

	/**
	 * Discard the entire pending edit (no changes saved) and return to the study
	 * view. Clears the hand-off payload so the edit form won't rehydrate the
	 * abandoned changes on a later visit.
	 */
	function handleCancel() {
		if (isSaving) return;
		sessionStorage.removeItem(pendingEditKey(studyId));
		sessionStorage.removeItem(armedKey(studyId));
		goto(studyHref);
	}


	async function handleSave() {
		if (isSaving || !pending) return;
		isSaving = true;
		saveError = '';
		try {
			const data = new FormData();
			data.set('title', pending.title ?? '');
			data.set('subtitle', pending.subtitle ?? '');
			data.set('passages', JSON.stringify(pending.passages ?? []));
			data.set('decisions', JSON.stringify(decisions ?? {}));

			const response = await fetch(editHref, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: data
			});

			const result = deserialize(await response.text());

			if (result.type === 'redirect') {
				// Success — clear the hand-off payload and follow the redirect.
				sessionStorage.removeItem(pendingEditKey(studyId));
				await goto(result.location, { invalidateAll: true });
				return;
			}

			if (result.type === 'failure' || result.type === 'error') {
				saveError =
					/** @type {any} */ (result).data?.error ||
					/** @type {any} */ (result).error?.message ||
					'Failed to save changes. Please try again.';
			}
		} catch (err) {
			console.error('Error saving reviewed edit:', err);
			saveError = 'Failed to save changes. Please try again.';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="review-page">
	{#if ready && pending}
		<Heading heading="h1">Review Passage Changes</Heading>

		{#if saveError}
			<Alert color="red" look="subtle" message={saveError} />
		{/if}

		<!-- The button bar is passed as PassageReview's footer so it renders INSIDE
		     the passage card grid (as a column-spanning row). That makes its width
		     track the actual rendered card row, so the right-aligned buttons line
		     up with the cards' right edge for any number of cards (1, 2, 3+) and
		     any wrapping — rather than floating to the far edge of this full-width
		     page. -->
		<PassageReview report={pending.report} bind:decisions footer={buttonBar} />
	{/if}
</div>

{#snippet buttonBar()}
	<FormButtonBar marginTop>
		<Button label="Cancel" classes="gray" handleClick={handleCancel} isDisabled={isSaving} />
		<Button label="Back" classes="gray" handleClick={handleBack} isDisabled={isSaving} />
		<Button
			label={isSaving ? 'Saving...' : 'Save Changes'}
			classes="blue"
			handleClick={handleSave}
			isDisabled={isSaving}
		/>
	</FormButtonBar>
{/snippet}


<style>
	/* Full-width so the card grid can fit as many columns as the content area
	   allows before wrapping (no artificial max-width / horizontal scroll). */
	.review-page {
		margin: 3.6rem 0;
		padding: 0 2.4rem;
	}



	.review-page :global(h1) {
		margin-bottom: 2.4rem;
	}
</style>
