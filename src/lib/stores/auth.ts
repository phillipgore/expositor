import { writable } from 'svelte/store';
import { authClient } from '$lib/auth-client.js';
import type { User } from '$lib/server/auth.js';

export const user = writable<User | null>(null);
export const isAuthenticated = writable(false);
export const isLoading = writable(true);

// Initialize auth state
export async function initializeAuth() {
	try {
		isLoading.set(true);
		const sessionData = await authClient.getSession();
		
		if (sessionData.data?.user) {
			user.set(sessionData.data.user);
			isAuthenticated.set(true);
		} else {
			user.set(null);
			isAuthenticated.set(false);
		}
	} catch (error) {
		console.error('Failed to initialize auth:', error);
		user.set(null);
		isAuthenticated.set(false);
	} finally {
		isLoading.set(false);
	}
}

// Sign in function
export async function signIn(email: string, password: string) {
	try {
		const result = await authClient.signIn.email({
			email,
			password
		});
		
		if (result.data?.user) {
			user.set(result.data.user);
			isAuthenticated.set(true);
			return { success: true };
		} else {
			return { success: false, error: result.error?.message || 'Sign in failed' };
		}
	} catch (error) {
		return { success: false, error: 'An unexpected error occurred' };
	}
}

// Sign up function
export async function signUp(name: string, email: string, password: string) {
	try {
		const result = await authClient.signUp.email({
			name,
			email,
			password
		});
		
		if (result.data?.user) {
			user.set(result.data.user);
			isAuthenticated.set(true);
			return { success: true };
		} else {
			return { success: false, error: result.error?.message || 'Sign up failed' };
		}
	} catch (error) {
		return { success: false, error: 'An unexpected error occurred' };
	}
}

// Sign out function
export async function signOut() {
	try {
		await authClient.signOut();
		user.set(null);
		isAuthenticated.set(false);
		return { success: true };
	} catch (error) {
		return { success: false, error: 'Sign out failed' };
	}
}
