<script>
	/**
	 * # Back Office — Settings Page
	 *
	 * Application-wide settings. Currently hosts the "New User Sign Ups"
	 * toggle: when off, the Sign Up button/page are hidden and new sign-ups are
	 * blocked server-side (seeded admin/dev accounts excepted).
	 */

	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import ToggleSwitch from '$lib/componentElements/ToggleSwitch.svelte';
	import { invalidateAll } from '$app/navigation';

	/** @type {import('./$types').PageData} */
	export let data;

	let signupsEnabled = data.signupsEnabled;
	let isSaving = false;
	let error = '';

	// Keep local state in sync if the load re-runs (e.g. after invalidateAll).
	$: signupsEnabled = data.signupsEnabled;

	async function handleToggle(enabled) {
		// Optimistic update; reverted on failure.
		const previous = signupsEnabled;
		signupsEnabled = enabled;
		isSaving = true;
		error = '';

		try {
			const body = new FormData();
			body.set('signupsEnabled', String(enabled));

			const response = await fetch('?/updateSignups', { method: 'POST', body });
			const result = await response.json();

			if (result.type !== 'success') {
				throw new Error('Failed to update setting');
			}

			// Refresh layout data so the auth toolbar reflects the change.
			await invalidateAll();
		} catch (e) {
			console.error('Failed to update sign up setting:', e);
			signupsEnabled = previous;
			error = 'Failed to update the sign up setting. Please try again.';
		}

		isSaving = false;
	}
</script>

<svelte:head>
	<title>Settings — Back Office — Expositor App</title>
</svelte:head>

<Heading heading="h1">Settings</Heading>

<Alert color="red" look="subtle" message={error} />

<section class="setting">
	<ToggleSwitch
		id="signups-enabled"
		label="New User Sign Ups"
		checked={signupsEnabled}
		isDisabled={isSaving}
		onToggle={handleToggle}
	/>
</section>

<style>
	.setting {
		margin-top: 1.8rem;
	}

	.setting-description {
		margin-top: 0.9rem;
		color: var(--gray-400);
	}
</style>
