/**
 * # Page Titles
 *
 * Single source of truth for `document.title`. The root layout derives the
 * title from the current route on every navigation, so the title is always
 * reset when leaving a section (Svelte 5's `<svelte:head><title>` does not
 * restore the previous title when a page unmounts).
 *
 * A page can override its title by returning `pageTitle` from its `load`.
 */

export const APP_NAME = 'Expositor App';

/** @type {Record<string, string>} SvelteKit `route.id` → title */
const ROUTE_TITLES = {
	'/(app)/dashboard': 'Dashboard',
	'/(app)/glossary': 'Glossary',
	'/(app)/new-study': 'New Study',
	'/(app)/new-study-group': 'New Study Group',
	'/(app)/series/[id]': 'Series',
	'/(app)/series/[id]/edit': 'Edit Series',
	'/(app)/series/[id]/edit/review': 'Review Series',
	'/(app)/study-group/[id]': 'Study Group',
	'/(app)/study-group/[id]/edit': 'Edit Study Group',
	'/(app)/study/[id]': 'Study',
	'/(app)/study/[id]/analyze': 'Analyze',
	'/(app)/study/[id]/document': 'Document',
	'/(app)/study/[id]/edit': 'Edit Study',
	'/(app)/study/[id]/edit/review': 'Review Study',
	'/(auth)/password': 'Password',
	'/(auth)/reset-password': 'Reset Password',
	'/(auth)/signin': 'Sign In',
	'/(auth)/signup': 'Sign Up',
	'/(auth)/verify-email': 'Verify Email',
	'/(auth)/verify-pending': 'Verify Email',
	'/(backoffice)/back-office': 'Back Office',
	'/(backoffice)/back-office/settings': 'Settings — Back Office',
	'/(backoffice)/back-office/users': 'Users — Back Office'
};

/**
 * @param {string | null | undefined} routeId
 * @param {string | null | undefined} [override] - e.g. `page.data.pageTitle`
 * @returns {string}
 */
export function getPageTitle(routeId, override) {
	const name = override || (routeId ? ROUTE_TITLES[routeId] : undefined);
	return name ? `${name} — ${APP_NAME}` : APP_NAME;
}
