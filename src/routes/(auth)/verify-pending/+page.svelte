<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Heading from '$lib/elements/Heading.svelte';
	import Alert from '$lib/elements/Alert.svelte';
	import InstructionText from '$lib/elements/InstructionText.svelte';

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

<InstructionText>
	<p>To complete your registration:</p>
	<ol>
		<li>Check your email inbox (maybe spam).</li>
		<li>Click the verification link in the email.</li>
		<li>You'll be redirected to the app automatically.</li>
	</ol>
</InstructionText>
