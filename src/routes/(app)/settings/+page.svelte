<script>
	import Button from '$lib/elements/buttons/Button.svelte';
	import Heading from '$lib/elements/Heading.svelte';
	import { signOut } from '$lib/stores/auth.js';
	import { goto } from '$app/navigation';

	const handleSignOut = async () => {
		const result = await signOut();
		if (result.success) {
			goto('/signin');
		}
	};
</script>

<div>
	<Heading heading="h1" classes="h4">Settings</Heading>
	<Button handleClick={handleSignOut} label="Sign Out"></Button>
</div>
