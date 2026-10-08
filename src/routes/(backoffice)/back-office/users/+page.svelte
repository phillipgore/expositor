<script>
	/**
	 * # Back Office — Users Page
	 *
	 * Lists all user accounts with their email-verification status. Unverified
	 * users show a "Verify" button that lets the admin verify them directly,
	 * bypassing email verification. Every user has a "Reset" button that opens a
	 * modal for setting a new password. An "Add User" form (to the left of the
	 * table) lets the admin create new, pre-verified accounts.
	 */

	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Badge from '$lib/componentElements/Badge.svelte';
	import Spinner from '$lib/componentElements/Spinner.svelte';
	import SignupForm from '$lib/componentWidgets/forms/SignupForm.svelte';
	import ResetUserPasswordModal from '$lib/componentWidgets/modals/ResetUserPasswordModal.svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	let error = '';

	/** Id of the user whose Verify form is currently submitting (disables its button). */
	let verifyingId = '';

	/** Add User form state. */
	let signupForm;
	let isCreating = false;
	let createError = '';
	let createSuccess = '';

	/** Reset Password modal state. */
	/** @type {{ id: string, firstName: string, lastName: string, email: string } | null} */
	let resetUser = null;
	let isResetting = false;
	let resetError = '';
	let resetSuccess = '';

	/** @param {{ id: string, firstName: string, lastName: string, email: string }} user */
	function openResetModal(user) {
		resetUser = user;
		resetError = '';
		resetSuccess = '';
	}

	function closeResetModal() {
		resetUser = null;
		resetError = '';
	}

	/**
	 * Submit the new password to the `resetPassword` action.
	 * @param {string} newPassword
	 */
	async function handleResetPassword(newPassword) {
		if (!resetUser) return;

		isResetting = true;
		resetError = '';

		const body = new FormData();
		body.append('userId', resetUser.id);
		body.append('newPassword', newPassword);

		try {
			const response = await fetch('?/resetPassword', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());

			if (result.type === 'success') {
				resetSuccess = `Password reset for ${resetUser.email}.`;
				resetUser = null;
			} else {
				const failureMessage =
					result.type === 'failure' && typeof result.data?.error === 'string'
						? result.data.error
						: '';
				resetError = failureMessage || 'Failed to reset password. Please try again.';
			}
		} catch {
			resetError = 'Failed to reset password. Please try again.';
		}

		isResetting = false;
	}

	/**
	 * Submit the Add User form to the `createUser` action.
	 * @param {{ firstName: string, lastName: string, email: string, password: string }} values
	 */
	async function handleCreateUser(values) {
		isCreating = true;
		createError = '';
		createSuccess = '';

		const body = new FormData();
		for (const [key, value] of Object.entries(values)) body.append(key, value);

		try {
			const response = await fetch('?/createUser', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());

			if (result.type === 'success') {
				createSuccess = `User ${values.email} created.`;
				signupForm.reset();
				await invalidateAll();
			} else {
				const failureMessage =
					result.type === 'failure' && typeof result.data?.error === 'string'
						? result.data.error
						: '';
				createError = failureMessage || 'Failed to create user. Please try again.';
			}
		} catch {
			createError = 'Failed to create user. Please try again.';
		}

		isCreating = false;
	}

	/**
	 * Format a date for the "Joined" column.
	 * @param {Date | string | null} value
	 */
	function formatDate(value) {
		if (!value) return '—';
		return new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Users — Back Office — Expositor App</title>
</svelte:head>

<Heading heading="h1">Users</Heading>

<div class="users-layout">
	<section class="add-user">
		<Heading heading="h2">Add User</Heading>
		<Alert color="green" look="subtle" message={createSuccess} />
		<SignupForm
			bind:this={signupForm}
			idPrefix="new-user-"
			submitLabel="Create User"
			loadingLabel="Creating…"
			isLoading={isCreating}
			error={createError}
			onSubmit={handleCreateUser}
		/>
	</section>

	<div class="layout-divider" role="separator" aria-orientation="vertical"></div>

	<section class="users-list">
		<Heading heading="h2">Existing Users</Heading>
		<Alert color="red" look="subtle" message={error} />
		<Alert color="green" look="subtle" message={resetSuccess} />

		{#if data.users.length === 0}
			<p class="empty-message">No users found.</p>
		{:else}
			<table class="users-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Joined</th>
						<th>Status</th>
						<th>Password</th>
						<th class="actions-column"><span class="visually-hidden">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as user (user.id)}
						<tr>
							<td>{user.firstName} {user.lastName}</td>
							<td>{user.email}</td>
							<td>{formatDate(user.createdAt)}</td>
							<td>
								{#if user.emailVerified}
									<Badge color="green" size="small" look="subtle" message="Verified" />
								{:else}
									<Badge color="yellow" size="small" look="subtle" message="Unverified" />
								{/if}
							</td>
							<td>
								<button
									type="button"
									class="table-button"
									aria-label="Reset password for {user.email}"
									title={user.isAdmin
										? 'The admin password is managed by SEED_ADMIN_PASSWORD'
										: undefined}
									disabled={user.isAdmin}
									on:click={() => openResetModal(user)}
								>
									Reset
								</button>
							</td>
							<td class="actions-column">
								{#if !user.emailVerified}
									<form
										method="POST"
										action="?/verifyUser"
										use:enhance={() => {
											verifyingId = user.id;
											error = '';

											return async ({ result }) => {
												verifyingId = '';

												if (result.type === 'success') {
													await invalidateAll();
												} else {
													const failureMessage =
														result.type === 'failure' && typeof result.data?.error === 'string'
															? result.data.error
															: '';
													error = failureMessage || 'Failed to verify user. Please try again.';
												}
											};
										}}
									>
										<input type="hidden" name="userId" value={user.id} />
										<button type="submit" class="table-button" disabled={verifyingId === user.id}>
											{#if verifyingId === user.id}
												<Spinner
													size="sm"
													inline
													color="var(--white)"
													label="Verifying…"
													showLabel
												/>
											{:else}
												Verify
											{/if}
										</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>
</div>

<ResetUserPasswordModal
	isOpen={resetUser !== null}
	user={resetUser}
	isSaving={isResetting}
	error={resetError}
	onSubmit={handleResetPassword}
	onClose={closeResetModal}
/>

<style>
	.users-layout {
		display: flex;
		align-items: stretch;
		gap: 3.6rem;
		margin-top: 1.8rem;
	}

	.add-user {
		flex: 0 0 36rem;
		max-width: 100%;
	}

	.users-list {
		flex: 1 1 auto;
		min-width: 0;
	}

	.layout-divider {
		flex: 0 0 1px;
		background-color: var(--gray-light);
	}

	@media (max-width: 900px) {
		.users-layout {
			flex-direction: column;
		}

		.add-user {
			flex-basis: auto;
			width: 100%;
		}

		.layout-divider {
			flex-basis: auto;
			height: 1px;
		}
	}

	.empty-message {
		color: var(--gray-400);
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 1.3rem;
	}

	.users-table th,
	.users-table td {
		text-align: left;
		padding: 0.9rem 1.2rem;
		border-bottom: 1px solid var(--gray-light);
		vertical-align: middle;
	}

	/* Size/weight match the form field labels (componentElements/Label.svelte). */
	.users-table th {
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--gray-darker);
		background-color: var(--gray-light);
	}

	.users-table tbody tr:hover {
		background-color: var(--gray-lighter);
	}

	.users-table td :global(.badge) {
		display: inline-block;
	}

	.actions-column {
		width: 9rem;
		text-align: right;
	}

	.table-button {
		height: 2.8rem;
		min-width: 6.4rem;
		padding: 0 1.2rem;
		border: none;
		border-radius: 0.3rem;
		background-color: var(--blue);
		color: var(--white);
		font-size: 1.2rem;
		font-weight: 500;
		cursor: pointer;
	}

	.table-button:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.table-button:focus-visible {
		outline: 0.2rem solid var(--blue);
		outline-offset: 0.2rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
