import { writable } from 'svelte/store';
import { authClient } from '$lib/auth-client.js';

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {boolean} emailVerified
 * @property {string} [image]
 * @property {Date} createdAt
 * @property {Date} updatedAt
 * @property {string} [firstName]
 * @property {string} [lastName]
 */

/**
 * @type {import('svelte/store').Writable<AuthUser | null>}
 */
export const user = writable(null);

/**
 * @type {import('svelte/store').Writable<boolean>}
 */
export const isAuthenticated = writable(false);

/**
 * @type {import('svelte/store').Writable<boolean>}
 */
export const isLoading = writable(true);

/**
 * Initialize auth state
 */
export async function initializeAuth() {
	try {
		isLoading.set(true);
		const sessionData = await authClient.getSession();
		
		if (sessionData.data?.user) {
			user.set(/** @type {AuthUser} */ (sessionData.data.user));
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

/**
 * Re-check the session with the SERVER and sync the auth stores to it.
 *
 * Unlike `initializeAuth`, this does not toggle `isLoading` (which would unmount the whole app
 * behind the root layout's spinner). Used where the client-side flag may be stale — e.g. the
 * auth layout, which otherwise trusts `isAuthenticated` and can sit on "Redirecting to app..."
 * forever while the server keeps bouncing protected routes back to /signin.
 *
 * @returns {Promise<boolean>} whether the server recognises a signed-in user
 */
export async function verifySession() {
	try {
		const sessionData = await authClient.getSession();
		const sessionUser = sessionData.data?.user;

		if (sessionUser) {
			user.set(/** @type {AuthUser} */ (sessionUser));
			isAuthenticated.set(true);
			return true;
		}
	} catch (error) {
		console.error('Failed to verify session:', error);
	}

	user.set(null);
	isAuthenticated.set(false);
	return false;
}

/**
 * Message shown when sign-in succeeds but the browser does not send the session cookie back.
 * Most often a build whose BETTER_AUTH_URL is https:// served over plain http://, which makes
 * better-auth issue a `Secure` cookie the browser won't return.
 */
const SESSION_NOT_PERSISTED_ERROR =
	'Signed in, but the browser did not keep the session cookie, so the server does not see you as signed in. ' +
	'Check that BETTER_AUTH_URL matches the address in your browser (including http vs https).';

/**
 * The same failure on a locally served build. By far the usual cause is running `npm run build`
 * (which bakes in .env.production: the production database and https://expositor.app) and then
 * previewing it over http://localhost, so point at the scripts that build against the local .env.
 */
const SESSION_NOT_PERSISTED_LOCAL_ERROR =
	'Signed in, but the browser did not keep the session cookie. This build was probably made with ' +
	'"npm run build", which uses .env.production (the production database and an https:// auth URL). ' +
	'To run a compiled build locally, stop the server and use "npm run build:local" then "npm run preview:local".';

/**
 * Pick the session-cookie error that fits where the app is being served from.
 * @returns {string}
 */
function sessionNotPersistedError() {
	if (typeof window !== 'undefined') {
		const { protocol, hostname } = window.location;
		const isLocalHttp =
			protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]');
		if (isLocalHttp) return SESSION_NOT_PERSISTED_LOCAL_ERROR;
	}
	return SESSION_NOT_PERSISTED_ERROR;
}

/**
 * Sign in function
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string, needsVerification?: boolean}>}
 */
export async function signIn(email, password) {
	try {
		const result = await authClient.signIn.email({
			email,
			password
		});
		
		if (result.data?.user) {
			const userData = /** @type {AuthUser} */ (result.data.user);
			
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
			
			// Confirm the SERVER sees the new session before declaring success. The sign-in
			// response alone only proves the credentials were right; if the session cookie was
			// dropped, every protected route redirects back to /signin and the auth layout would
			// otherwise hang on "Redirecting to app...".
			const sessionPersisted = await verifySession();
			if (!sessionPersisted) {
				return { success: false, error: sessionNotPersistedError() };
			}

			return { success: true };
		} else {
			return { success: false, error: result.error?.message || 'Sign in failed' };
		}
	} catch (error) {
		return { success: false, error: 'An unexpected error occurred' };
	}
}

/**
 * Sign up function
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string, requiresVerification?: boolean, email?: string}>}
 */
export async function signUp(firstName, lastName, email, password) {
	try {
		console.log('Starting signup process...');
		const result = await authClient.signUp.email({
			name: `${firstName.trim()} ${lastName.trim()}`,
			// firstName/lastName are declared as required additionalFields in the
			// server auth config, so better-auth includes them in the user INSERT
			// (the columns are NOT NULL in the database).
			firstName: firstName.trim(),
			lastName: lastName.trim(),
			email,
			password
		});
		
		console.log('Signup result:', JSON.stringify(result, null, 2));
		
		if (result.data?.user) {
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

/**
 * Sign out function
 * @returns {Promise<{success: boolean, error?: string}>}
 */
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
