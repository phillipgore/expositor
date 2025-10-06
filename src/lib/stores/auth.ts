import { writable } from 'svelte/store';
import { authClient } from '$lib/auth-client.js';

// Use a more flexible user type that matches what better-auth actually returns
type AuthUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string;
	createdAt: Date;
	updatedAt: Date;
	firstName?: string;
	lastName?: string;
};

export const user = writable<AuthUser | null>(null);
export const isAuthenticated = writable(false);
export const isLoading = writable(true);

// Initialize auth state
export async function initializeAuth() {
	try {
		isLoading.set(true);
		const sessionData = await authClient.getSession();
		
		if (sessionData.data?.user) {
			user.set(sessionData.data.user as AuthUser);
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
			const userData = result.data.user as AuthUser;
			
			// Check if email is verified
			if (!userData.emailVerified) {
				// Sign out the user since they haven't verified their email
				await authClient.signOut();
				return { 
					success: false, 
					error: 'Please verify your email address before signing in. Check your inbox for the verification link.',
					needsVerification: true 
				};
			}
			
			user.set(userData);
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
export async function signUp(firstName: string, lastName: string, email: string, password: string) {
	try {
		console.log('Starting signup process...');
		const result = await authClient.signUp.email({
			name: `${firstName.trim()} ${lastName.trim()}`,
			email,
			password
		});
		
		console.log('Signup result:', JSON.stringify(result, null, 2));
		
		if (result.data?.user) {
			console.log('User created successfully, updating names...');
			// Update the user with firstName and lastName via a separate API call
			try {
				const updateResponse = await fetch('/api/auth/update-names', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						userId: result.data.user.id,
						firstName: firstName.trim(),
						lastName: lastName.trim()
					})
				});
				
				if (!updateResponse.ok) {
					console.warn('Failed to update firstName/lastName:', await updateResponse.text());
				} else {
					console.log('Names updated successfully');
				}
			} catch (updateError) {
				console.warn('Failed to update firstName/lastName:', updateError);
			}

			// Send verification email
			try {
				console.log('Sending verification email...');
				const verificationResponse = await fetch('/api/auth/send-verification', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ email })
				});
				
				if (!verificationResponse.ok) {
					console.warn('Failed to send verification email:', await verificationResponse.text());
				} else {
					console.log('Verification email sent successfully');
				}
			} catch (verificationError) {
				console.warn('Failed to send verification email:', verificationError);
			}

			// Do NOT log the user in - they need to verify their email first
			// User stays on signup page and sees verification message
			return { 
				success: true, 
				requiresVerification: true,
				email: email 
			};
		} else {
			console.error('Signup failed:', result.error);
			let errorMessage = 'Sign up failed';
			
			if (result.error?.message) {
				errorMessage = result.error.message;
			} else if (result.error?.code) {
				switch (result.error.code) {
					case 'USER_ALREADY_EXISTS':
						errorMessage = 'An account with this email already exists';
						break;
					case 'INVALID_EMAIL':
						errorMessage = 'Please enter a valid email address';
						break;
					case 'WEAK_PASSWORD':
						errorMessage = 'Password is too weak. Please choose a stronger password';
						break;
					default:
						errorMessage = `Sign up failed: ${result.error.code}`;
				}
			}
			
			return { success: false, error: errorMessage };
		}
	} catch (error) {
		console.error('Signup error:', error);
		let errorMessage = 'An unexpected error occurred';
		
		if (error instanceof Error) {
			errorMessage = error.message;
		} else if (typeof error === 'string') {
			errorMessage = error;
		}
		
		return { success: false, error: errorMessage };
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
