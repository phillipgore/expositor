<script>
	import Heading from '$lib/componentElements/Heading.svelte';
	import SignupForm from '$lib/componentWidgets/forms/SignupForm.svelte';
	import { signUp } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	let isLoading = false;
	let error = '';

	/** @param {{ firstName: string, lastName: string, email: string, password: string }} values */
	async function handleSubmit({ firstName, lastName, email, password }) {
		isLoading = true;
		error = '';

		// Pass first and last name separately
		const result = await signUp(firstName, lastName, email, password);

		if (result.success) {
			if (result.requiresVerification) {
				// Redirect to verify-pending page with email parameter
				goto(`/verify-pending?email=${encodeURIComponent(result.email)}`);
			} else {
				// Fallback in case verification is not required
				goto('/new-study');
			}
		} else {
			error = result.error;
		}

		isLoading = false;
	}
</script>

<Heading heading="h1">Sign Up</Heading>

<SignupForm {isLoading} {error} onSubmit={handleSubmit} />
