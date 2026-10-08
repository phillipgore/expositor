<script>
	/**
	 * # ResetUserPasswordModal Component
	 *
	 * Back Office modal that lets an admin set a new password for a user.
	 * Reuses `NewPasswordFields` (shared with the public /reset-password page)
	 * for the inputs and validation. The parent performs the actual save.
	 *
	 * ## Props
	 * @property {boolean} isOpen
	 * @property {{ id: string, firstName: string, lastName: string, email: string } | null} user
	 * @property {boolean} isSaving - Shows the busy spinner and disables inputs
	 * @property {string} error - Error message shown inside the modal
	 * @property {Function} onSubmit - (newPassword:string) => void
	 * @property {Function} onClose - () => void
	 *
	 * @component
	 */
	import Modal from '$lib/componentElements/Modal.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import NewPasswordFields from '$lib/componentWidgets/forms/NewPasswordFields.svelte';

	let { isOpen = false, user = null, isSaving = false, error = '', onSubmit, onClose } = $props();

	let newPassword = $state('');
	let isValid = $state(false);
	let formSubmitted = $state(false);

	// Start fresh each time the modal opens.
	$effect(() => {
		if (isOpen) {
			newPassword = '';
			formSubmitted = false;
		}
	});

	function handleConfirm() {
		formSubmitted = true;
		if (!isValid || isSaving) return;
		onSubmit?.(newPassword);
	}

	/** Submit on Enter from within the inputs. */
	function handleSubmit(event) {
		event.preventDefault();
		handleConfirm();
	}

	function handleClose() {
		if (isSaving) return;
		onClose?.();
	}
</script>

<Modal
	{isOpen}
	title="Reset Password"
	size="small"
	confirmLabel="Reset Password"
	confirmBusy={isSaving}
	confirmBusyLabel="Resetting…"
	onConfirm={handleConfirm}
	onCancel={handleClose}
	onClose={handleClose}
>
	{#if user}
		<p class="user-name">{user.firstName} {user.lastName}</p>
		<p class="user-email">{user.email}</p>
	{/if}

	<Alert color="red" look="subtle" message={error} />

	<!-- Remount fields on each open so the confirm field is cleared too. -->
	{#if isOpen}
		<form onsubmit={handleSubmit}>
			<NewPasswordFields
				bind:newPassword
				bind:isValid
				isLoading={isSaving}
				{formSubmitted}
				idPrefix="reset-user-"
			/>
			<!-- Hidden submit so Enter submits the form. -->
			<button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
		</form>
	{/if}

	<p class="note">The user will be signed out of all devices.</p>
</Modal>

<style>
	.user-name {
		font-weight: 600;
	}

	.user-email {
		margin-bottom: 1.8rem;
		color: var(--gray-400);
	}

	.note {
		margin-top: 0.9rem;
		font-size: 1.2rem;
		color: var(--gray-400);
	}
</style>
