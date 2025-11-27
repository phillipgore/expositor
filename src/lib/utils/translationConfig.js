/**
 * Translation Configuration Utility
 * 
 * Merges static translation metadata from translations.json with
 * sensitive configuration from environment variables.
 * 
 * Usage (server-side only):
 *   import { getTranslationConfig, getAllTranslations } from '$lib/utils/translationConfig';
 *   const esvConfig = getTranslationConfig('esv');
 */

import translationsData from '$lib/data/translations.json';

/**
 * Get environment variable value (works in both server and build contexts)
 * @param {string} key - Environment variable name
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
	// Try to import from SvelteKit env module (server-side)
	try {
		// Dynamic import would be needed here, but for simplicity we'll handle it differently
		// In actual server-side code, use: import { KEY } from '$env/static/private';
		return process.env[key];
	} catch {
		return undefined;
	}
}

/**
 * Get complete translation configuration with environment variables merged
 * @param {string} translationId - Translation ID (e.g., 'esv', 'net')
 * @returns {Object|null} Complete translation configuration or null if not found
 */
export function getTranslationConfig(translationId) {
	const translation = translationsData.find((t) => t.id === translationId);

	if (!translation) {
		console.warn(`Translation '${translationId}' not found`);
		return null;
	}

	// Clone the translation object to avoid mutations
	const config = JSON.parse(JSON.stringify(translation));

	// Merge environment variables for API configuration
	if (config.api) {
		// Set base URL from environment variable
		if (config.api.baseUrlEnvVar) {
			const baseUrl = getEnvVar(config.api.baseUrlEnvVar);
			if (baseUrl) {
				config.api.baseUrl = baseUrl;
			} else {
				console.warn(
					`Environment variable '${config.api.baseUrlEnvVar}' not found for translation '${translationId}'`
				);
			}
		}

		// Set auth token from environment variable (if required)
		if (config.api.requiresAuth && config.api.authTokenEnvVar) {
			const authToken = getEnvVar(config.api.authTokenEnvVar);
			if (authToken) {
				config.api.authToken = authToken;
			} else {
				console.warn(
					`Environment variable '${config.api.authTokenEnvVar}' not found for translation '${translationId}'`
				);
			}
		}
	}

	return config;
}

/**
 * Get all available translations with environment variables merged
 * @returns {Array<Object>} Array of complete translation configurations
 */
export function getAllTranslations() {
	return translationsData.map((t) => getTranslationConfig(t.id)).filter(Boolean);
}

/**
 * Get basic translation metadata (without sensitive API details)
 * Safe for client-side use
 * @param {string} translationId - Translation ID (e.g., 'esv', 'net')
 * @returns {Object|null} Basic translation metadata
 */
export function getTranslationMetadata(translationId) {
	const translation = translationsData.find((t) => t.id === translationId);

	if (!translation) {
		return null;
	}

	// Return only non-sensitive metadata
	return {
		id: translation.id,
		name: translation.name,
		abbreviation: translation.abbreviation,
		language: translation.language,
		publisher: translation.publisher,
		yearPublished: translation.yearPublished,
		description: translation.description,
		translationPhilosophy: translation.translationPhilosophy,
		features: translation.features,
		copyright: translation.copyright,
		restrictions: translation.restrictions
	};
}

/**
 * Get all translations metadata (safe for client-side)
 * @returns {Array<Object>} Array of translation metadata
 */
export function getAllTranslationsMetadata() {
	return translationsData.map((t) => getTranslationMetadata(t.id)).filter(Boolean);
}

/**
 * Check if a translation requires authentication
 * @param {string} translationId - Translation ID
 * @returns {boolean} True if translation requires authentication
 */
export function requiresAuth(translationId) {
	const translation = translationsData.find((t) => t.id === translationId);
	return translation?.api?.requiresAuth || false;
}

/**
 * Build authorization header for a translation
 * @param {string} translationId - Translation ID
 * @returns {Object|null} Authorization header object or null
 */
export function buildAuthHeader(translationId) {
	const config = getTranslationConfig(translationId);

	if (!config || !config.api.requiresAuth) {
		return null;
	}

	if (!config.api.authToken) {
		console.error(`Auth token not found for translation '${translationId}'`);
		return null;
	}

	const headerName = config.api.authHeader || 'Authorization';
	const headerValue = config.api.authPrefix
		? `${config.api.authPrefix} ${config.api.authToken}`
		: config.api.authToken;

	return {
		[headerName]: headerValue
	};
}

/**
 * Build complete API URL for a translation endpoint
 * @param {string} translationId - Translation ID
 * @param {string} endpoint - Endpoint name (e.g., 'text', 'html')
 * @returns {string|null} Complete API URL or null
 */
export function buildApiUrl(translationId, endpoint = '') {
	const config = getTranslationConfig(translationId);

	if (!config || !config.api.baseUrl) {
		console.error(`API base URL not found for translation '${translationId}'`);
		return null;
	}

	const endpointPath = config.api.endpoints?.[endpoint] || endpoint;
	return `${config.api.baseUrl}${endpointPath}`;
}
