import { and, eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { account, session } from './db/schema.js';
import { auth } from './auth.js';

/**
 * Password helpers shared by the public reset flow and the Back Office.
 *
 * Passwords are hashed with better-auth's own hasher (same as seedAccounts.js)
 * so they work with the normal email/password sign-in flow.
 */

/**
 * Set a user's email/password credential, creating the credential account row
 * if it is missing.
 *
 * @param {string} userId
 * @param {string} newPassword
 * @param {{ revokeSessions?: boolean }} [options] - When true, delete all of
 *   the user's sessions so they are signed out everywhere.
 * @returns {Promise<void>}
 */
export async function setUserPassword(userId, newPassword, { revokeSessions = false } = {}) {
	const ctx = await auth.$context;
	const passwordHash = await ctx.password.hash(newPassword);
	const now = new Date();

	const updated = await db
		.update(account)
		.set({ password: passwordHash, updatedAt: now })
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
		.returning({ id: account.id });

	if (updated.length === 0) {
		await db.insert(account).values({
			id: crypto.randomUUID(),
			accountId: userId,
			providerId: 'credential',
			userId,
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});
	}

	if (revokeSessions) {
		await db.delete(session).where(eq(session.userId, userId));
	}
}
