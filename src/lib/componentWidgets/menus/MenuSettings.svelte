<script>
	/**
	 * # MenuSettings Component
	 * 
	 * Settings menu that displays current user information and provides sign out functionality.
	 * 
	 * ## Features
	 * - Displays current user's name and email
	 * - Back Office button (mug icon) — disabled unless the user is an admin in the app context
	 * - Application button (home icon) — disabled unless in the Back Office context
	 * - Sign Out button with power icon
	 * - Dark themed menu
	 * 
	 * ## Props
	 * @property {string} menuId - Unique identifier for the menu
	 * @property {boolean} [isAdmin=false] - Enables the Back Office button when true
	 * @property {boolean} [inBackOffice=false] - Back Office context: enables Application, disables Back Office
	 * 
	 * ## Usage
	 * ```svelte
	 * <MenuSettings menuId="MenuSettings" />
	 * ```
	 * 
	 * @component
	 */

	import { goto } from '$app/navigation';
	import Menu from '$lib/componentElements/Menu.svelte';
	import IconButton from '$lib/componentElements/buttons/IconButton.svelte';
	import DividerHorizontal from '$lib/componentElements/DividerHorizontal.svelte';
	import { user, signOut } from '$lib/stores/auth.js';

	/** @type {{ menuId: string, alignment?: string, isAdmin?: boolean, inBackOffice?: boolean }} Props */
	let { menuId, alignment = 'start', isAdmin = false, inBackOffice = false } = $props();

	/** Handle logout */
	const handleLogout = async () => {
		const result = await signOut();
		if (result.success) {
			goto('/signin');
		}
	};
</script>

<Menu {menuId} {alignment} classes="dark settings-menu">
	{#if $user}
		<div class="user-info">
			<div class="user-name">{$user.name || 'User'}</div>
			<div class="user-email">{$user.email}</div>
		</div>
		<DividerHorizontal />
		<IconButton
			iconId="mug"
			label="Back Office"
			classes="menu-light justify-content-left"
			role="menuitem"
			isDisabled={inBackOffice || !isAdmin}
			handleClick={() => goto('/back-office')}
		/>
		<IconButton
			iconId="home"
			label="Application"
			classes="menu-light justify-content-left"
			role="menuitem"
			isDisabled={!inBackOffice}
			handleClick={() => goto('/dashboard')}
		/>
		<DividerHorizontal />
		<IconButton
			iconId="power"
			label="Sign Out"
			classes="menu-light justify-content-left"
			role="menuitem"
			handleClick={handleLogout}
		/>
	{/if}
</Menu>

<style>
	.user-info {
		padding: 1.2rem 1.6rem;
		color: var(--black);
	}

	.user-name {
		font-weight: 500;
		font-size: 1.4rem;
		margin-bottom: 0.4rem;
	}

	.user-email {
		font-size: 1.2rem;
		color: var(--gray-400);
	}
</style>
