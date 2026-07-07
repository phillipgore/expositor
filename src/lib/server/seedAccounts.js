import { env } from '$env/dynamic/private';
import { eq, and } from 'drizzle-orm';
import { db } from './db/index.js';
import { user, account } from './db/schema.js';
import { auth } from './auth.js';

/**
 * Seed accounts that should always exist in the app, pre-verified.
 *
 * Credentials come from environment variables so they never live in source
 * control. Any account whose email or password env var is missing is simply
 * skipped (with a console notice), so the app runs fine without them.
 *
 * Seeding is idempotent and self-healing:
 * - Missing user  → user + credential account rows are created, email verified.
 * - Existing user → email_verified is ensured true and the password hash is
 *   re-synced to the env value (so rotating the env var rotates the password
 *   on the next server start).
 *
 * Passwords are hashed with better-auth's own hasher so sign-in via the normal
 * better-auth email/password flow works exactly as if the user had signed up.
 */

/** The accounts to guarantee, driven by env vars. */
function getSeedAccountDefinitions() {
	return [
		{
			label: 'admin',
			email: env.SEED_ADMIN_EMAIL,
			password: env.SEED_ADMIN_PASSWORD,
			firstName: 'Admin',
			lastName: 'Expositor'
		},
		{
			label: 'dev',
			email: env.SEED_DEV_EMAIL,
			password: env.SEED_DEV_PASSWORD,
			firstName: 'Dev',
			lastName: 'Expositor'
		}
	];
}

/**
 * Ensure a single seed account exists, is verified, and has the expected password.
 * @param {{ label: string, email: string, password: string, firstName: string, lastName: string }} def
 * @param {(password: string) => Promise<string>} hashPassword
 */
async function ensureAccount(def, hashPassword) {
	const now = new Date();
	const passwordHash = await hashPassword(def.password);

	const existing = await db.select().from(user).where(eq(user.email, def.email)).limit(1);

	if (existing.length === 0) {
		// Create the user row directly, already verified.
		const userId = crypto.randomUUID();
		await db.insert(user).values({
			id: userId,
			name: `${def.firstName} ${def.lastName}`,
			firstName: def.firstName,
			lastName: def.lastName,
			email: def.email,
			emailVerified: true,
			createdAt: now,
			updatedAt: now
		});

		// Create the matching better-auth credential account row.
		await db.insert(account).values({
			id: crypto.randomUUID(),
			accountId: userId,
			providerId: 'credential',
			userId,
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});

		console.log(`✅ Seeded ${def.label} account: ${def.email}`);
		return;
	}

	// User exists — ensure verified flag and re-sync the password hash.
	const userId = existing[0].id;

	await db
		.update(user)
		.set({ emailVerified: true, updatedAt: now })
		.where(eq(user.id, userId));

	const credential = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
		.limit(1);

	if (credential.length === 0) {
		await db.insert(account).values({
			id: crypto.randomUUID(),
			accountId: userId,
			providerId: 'credential',
			userId,
			password: passwordHash,
			createdAt: now,
			updatedAt: now
		});
	} else {
		await db
			.update(account)
			.set({ password: passwordHash, updatedAt: now })
			.where(eq(account.id, credential[0].id));
	}

	console.log(`✅ Verified ${def.label} account: ${def.email}`);
}

/**
 * Ensure all configured seed accounts exist. Never throws — a failure here
 * should not prevent the server from starting.
 */
export async function seedAccounts() {
	try {
		const definitions = getSeedAccountDefinitions();
		const configured = definitions.filter((def) => def.email && def.password);
		const skipped = definitions.filter((def) => !def.email || !def.password);

		for (const def of skipped) {
			console.log(`ℹ️  Skipping ${def.label} seed account (env vars not set)`);
		}

		if (configured.length === 0) return;

		// Use better-auth's own password hasher so credentials are fully
		// compatible with the normal email/password sign-in flow.
		const ctx = await auth.$context;
		const hashPassword = (password) => ctx.password.hash(password);

		for (const def of configured) {
			await ensureAccount(def, hashPassword);
		}
	} catch (error) {
		console.error('❌ Error seeding accounts:', error);
	}
}
