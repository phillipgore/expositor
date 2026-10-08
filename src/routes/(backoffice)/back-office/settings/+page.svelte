<script>
	/**
	 * # Back Office — Settings Page
	 *
	 * Application-wide settings:
	 * - "New User Sign Ups": when off, the Sign Up button/page are hidden and new
	 *   sign-ups are blocked server-side (seeded admin/dev accounts excepted).
	 * - "Password Reset": when off, the Password button is hidden, the password
	 *   reset pages redirect to sign in, and the reset APIs are blocked.
	 */

	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import ToggleSwitch from '$lib/componentElements/ToggleSwitch.svelte';
	import { invalidateAll } from '$app/navigation';

	/** @type {import('./$types').PageData} */
	export let data;

	let signupsEnabled = data.signupsEnabled;
	let passwordResetEnabled = data.passwordResetEnabled;
	let isSaving = false;
	let error = '';

	// Keep local state in sync if the load re-runs (e.g. after invalidateAll).
	$: signupsEnabled = data.signupsEnabled;
	$: passwordResetEnabled = data.passwordResetEnabled;

	/**
	 * Persist a boolean setting via a form action.
	 * @param {string} action - Form action name (e.g. 'updateSignups')
	 * @param {string} field - Form field name (e.g. 'signupsEnabled')
	 * @param {boolean} enabled
	 */
	async function saveSetting(action, field, enabled) {
		const body = new FormData();
		body.set(field, String(enabled));

		const response = await fetch(`?/${action}`, { method: 'POST', body });
		const result = await response.json();

		if (result.type !== 'success') {
			throw new Error('Failed to update setting');
		}

		// Refresh layout data so the auth toolbar reflects the change.
		await invalidateAll();
	}

	async function handleSignupsToggle(enabled) {
		// Optimistic update; reverted on failure.
		const previous = signupsEnabled;
		signupsEnabled = enabled;
		isSaving = true;
		error = '';

		try {
			await saveSetting('updateSignups', 'signupsEnabled', enabled);
		} catch (e) {
			console.error('Failed to update sign up setting:', e);
			signupsEnabled = previous;
			error = 'Failed to update the sign up setting. Please try again.';
		}

		isSaving = false;
	}

	async function handlePasswordResetToggle(enabled) {
		// Optimistic update; reverted on failure.
		const previous = passwordResetEnabled;
		passwordResetEnabled = enabled;
		isSaving = true;
		error = '';

		try {
			await saveSetting('updatePasswordReset', 'passwordResetEnabled', enabled);
		} catch (e) {
			console.error('Failed to update password reset setting:', e);
			passwordResetEnabled = previous;
			error = 'Failed to update the password reset setting. Please try again.';
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
		onToggle={handleSignupsToggle}
	/>
</section>

<section class="setting">
	<ToggleSwitch
		id="password-reset-enabled"
		label="Password Reset"
		checked={passwordResetEnabled}
		isDisabled={isSaving}
		onToggle={handlePasswordResetToggle}
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
