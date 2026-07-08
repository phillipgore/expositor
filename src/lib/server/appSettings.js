import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { appSettings } from './db/schema.js';

/**
 * Application-wide settings helpers.
 *
 * Settings live in the single-row `app_settings` table (id = 'app'). Reads are
 * self-healing: if the row is missing (fresh database, migration not seeded),
 * it is created with defaults so callers never have to special-case absence.
 */

/** The fixed primary key of the single settings row. */
const SETTINGS_ID = 'app';

/**
 * Fetch the settings row, creating it with defaults if it doesn't exist.
 *
 * @returns {Promise<{ id: string, signupsEnabled: boolean, updatedAt: Date }>}
 */
export async function getAppSettings() {
	const rows = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, SETTINGS_ID))
		.limit(1);

	if (rows.length > 0) {
		return rows[0];
	}

	// Self-heal: create the default row. onConflictDoNothing guards against a
	// concurrent request creating it first.
	const defaults = { id: SETTINGS_ID, signupsEnabled: true, updatedAt: new Date() };
	await db.insert(appSettings).values(defaults).onConflictDoNothing();

	const created = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, SETTINGS_ID))
		.limit(1);

	return created[0] ?? defaults;
}

/**
 * Whether new user sign-ups are currently allowed.
 *
 * On any error this fails OPEN (returns true) so a transient database issue
 * can never lock everyone out of signing up.
 *
 * @returns {Promise<boolean>}
 */
export async function getSignupsEnabled() {
	try {
		const settings = await getAppSettings();
		return settings.signupsEnabled;
	} catch (error) {
		console.error('❌ Error reading signupsEnabled app setting:', error);
		return true;
	}
}

/**
 * Enable or disable new user sign-ups.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setSignupsEnabled(enabled) {
	// Ensure the row exists first (self-healing).
	await getAppSettings();

	await db
		.update(appSettings)
		.set({ signupsEnabled: enabled, updatedAt: new Date() })
		.where(eq(appSettings.id, SETTINGS_ID));
}
