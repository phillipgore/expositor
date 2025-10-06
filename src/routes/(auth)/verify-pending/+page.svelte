<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';

	const email = $page.url.searchParams.get('email') || '';
    const message = email? `Account created successfully! We've sent a verification link to ${email}` : `Account created successfully!`;

	function handleBackToSignIn() {
		goto('/signin');
	}
</script>

<Heading heading="h1" classes="h4">Check Your Email</Heading>

<Alert 
	type="success" 
	message={message} 
/>

<div class="instructions">
	<p>To complete your registration:</p>
	<ol>
		<li>Check your email inbox (and spam folder if needed).</li>
		<li>Click the verification link in the email.</li>
		<li>You'll be redirected to the app automatically.</li>
	</ol>
</div>

<style>
	.instructions,
	.instructions p {
		color: var(--gray-500);
		line-height: 1.5;
		margin: 0.0rem 0.0rem 1.8rem;
	}

	.instructions ol {
		margin: 0;
		padding-left: 2.4rem;
	}

	.instructions li {
		margin-bottom: 0.9rem;
	}
</style>
