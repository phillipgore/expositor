<script>
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import InstructionText from '$lib/componentElements/InstructionText.svelte';
	import messages from '$lib/data/messages.json';

	const email = $page.url.searchParams.get('email') || '';
	const message = email
		? `${messages.auth.signupSuccess} We've sent a verification link to ${email}`
		: messages.auth.signupSuccess;

	function handleBackToSignIn() {
		goto('/signin');
	}
</script>

<Heading heading="h1" classes="h4">Check Your Email</Heading>

<Alert color="green" look="subtle" message={message} />

<InstructionText>
	<p>To complete your registration:</p>
	<ol>
		<li>Check your email inbox (maybe spam).</li>
		<li>Click the verification link in the email.</li>
		<li>You'll be redirected to the app automatically.</li>
	</ol>
</InstructionText>
