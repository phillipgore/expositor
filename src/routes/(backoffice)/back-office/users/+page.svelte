<script>
	/**
	 * # Back Office — Users Page
	 *
	 * Lists all user accounts with their email-verification status. Unverified
	 * users show a "Verify" button that lets the admin verify them directly,
	 * bypassing email verification.
	 */

	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Heading from '$lib/componentElements/Heading.svelte';
	import Alert from '$lib/componentElements/Alert.svelte';
	import Badge from '$lib/componentElements/Badge.svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	let error = '';

	/** Id of the user whose Verify form is currently submitting (disables its button). */
	let verifyingId = '';

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

<Alert color="red" look="subtle" message={error} />

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
								<button type="submit" class="verify-button" disabled={verifyingId === user.id}>
									{verifyingId === user.id ? 'Verifying…' : 'Verify'}
								</button>
							</form>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.empty-message {
		margin-top: 1.8rem;
		color: var(--gray-400);
	}

	.users-table {
		margin-top: 1.8rem;
		width: 100%;
		max-width: 90rem;
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

	.users-table th {
		font-weight: 600;
		color: var(--gray-darker);
	}

	.users-table td :global(.badge) {
		display: inline-block;
	}

	.actions-column {
		width: 9rem;
		text-align: right;
	}

	.verify-button {
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

	.verify-button:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.verify-button:focus-visible {
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
