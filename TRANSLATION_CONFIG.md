# Translation Configuration Guide

This document explains how the translation configuration system works in Expositor and how to set it up.

## Overview

The translation configuration uses a hybrid approach:
- **Static metadata** stored in `src/lib/data/translations.json`
- **Sensitive credentials** stored in environment variables (`.env` file)

This separation ensures that API keys and tokens are never committed to version control while keeping translation metadata easily accessible.

## Supported Translations

Currently, Expositor supports two Bible translations:
1. **ESV (English Standard Version)** - Requires API authentication
2. **NET (New English Translation)** - Free, no authentication required

## Setup Instructions

### 1. Create Environment File

Copy the example environment file to create your local configuration:

```bash
cp .env.example .env
```

### 2. Configure ESV API Access

1. Visit [https://api.esv.org/](https://api.esv.org/) to create a free account
2. Generate an API token
3. Add your token to the `.env` file:

```env
ESV_API_TOKEN=your_actual_token_here
ESV_API_BASE_URL=https://api.esv.org/v3/passage
```

### 3. Configure NET Bible API

The NET Bible API requires no authentication. Just ensure the base URL is set:

```env
NET_API_BASE_URL=https://labs.bible.org/api/
```

### 4. Verify Configuration

Your `.env` file should now contain all necessary configuration. The `.gitignore` file already excludes `.env` files from version control.

## Usage in Code

### Server-Side Usage (with credentials)

Use the utility functions from `translationConfig.js` to access complete configurations including API tokens:

```javascript
// In a SvelteKit server route or load function
import { 
  getTranslationConfig, 
  buildAuthHeader, 
  buildApiUrl 
} from '$lib/utils/translationConfig';

// Get complete configuration
const esvConfig = getTranslationConfig('esv');

// Build API URL for a specific endpoint
const apiUrl = buildApiUrl('esv', 'text');
// Returns: "https://api.esv.org/v3/passage/text/"

// Build authorization header
const authHeader = buildAuthHeader('esv');
// Returns: { "Authorization": "Token your_token_here" }

// Make API request
const response = await fetch(`${apiUrl}?q=John+3:16`, {
  headers: authHeader
});
```

### Client-Side Usage (metadata only)

For client-side code, use the metadata functions that exclude sensitive information:

```javascript
import { 
  getTranslationMetadata, 
  getAllTranslationsMetadata 
} from '$lib/utils/translationConfig';

// Get translation metadata (safe for client-side)
const esvMeta = getTranslationMetadata('esv');
// Returns: { id, name, abbreviation, description, features, copyright, etc. }

// Get all translations metadata
const allTranslations = getAllTranslationsMetadata();
```

## Available Utility Functions

### `getTranslationConfig(translationId)`
Returns complete translation configuration with environment variables merged. **Server-side only.**

### `getAllTranslations()`
Returns all translations with complete configurations. **Server-side only.**

### `getTranslationMetadata(translationId)`
Returns translation metadata without sensitive API details. **Safe for client-side.**

### `getAllTranslationsMetadata()`
Returns metadata for all translations. **Safe for client-side.**

### `requiresAuth(translationId)`
Checks if a translation requires authentication.

### `buildAuthHeader(translationId)`
Builds authorization header for API requests. **Server-side only.**

### `buildApiUrl(translationId, endpoint)`
Builds complete API URL for a specific endpoint. **Server-side only.**

## File Structure

```
expositor/
├── .env                                    # Local environment variables (not committed)
├── .env.example                            # Template for environment variables
├── src/
│   └── lib/
│       ├── data/
│       │   └── translations.json           # Static translation metadata
│       └── utils/
│           └── translationConfig.js        # Configuration utility functions
```

## Translation Data Structure

### Static Data (translations.json)

```json
{
  "id": "esv",
  "name": "English Standard Version",
  "abbreviation": "ESV",
  "api": {
    "baseUrl": null,
    "baseUrlEnvVar": "ESV_API_BASE_URL",
    "requiresAuth": true,
    "authTokenEnvVar": "ESV_API_TOKEN",
    "endpoints": { ... },
    "rateLimits": { ... }
  },
  "copyright": { ... },
  "features": { ... },
  "translationPhilosophy": { ... }
}
```

### Environment Variables (.env)

```env
ESV_API_TOKEN=your_token
ESV_API_BASE_URL=https://api.esv.org/v3/passage
NET_API_BASE_URL=https://labs.bible.org/api/
```

## Adding New Translations

To add a new Bible translation:

1. Add translation data to `src/lib/data/translations.json`
2. If authentication is required, add corresponding environment variables to `.env.example`
3. Update this documentation with the new translation details
4. Test the configuration with the utility functions

## Security Notes

- **Never commit `.env` files** - They contain sensitive API credentials
- **Always use `.env.example`** as a template (this file can be committed)
- **Server-side only** - Use configuration utilities only in server routes
- **Client-side safety** - Use metadata functions for client-side code

## Troubleshooting

### "Environment variable not found" warnings

If you see warnings about missing environment variables:
1. Ensure your `.env` file exists
2. Verify the variable names match those in `.env.example`
3. Restart your development server after modifying `.env`

### API authentication errors

For ESV API errors:
1. Verify your API token is correct in `.env`
2. Check that your token hasn't expired
3. Ensure you haven't exceeded rate limits (5000/day, 1000/hour, 60/minute)

### NET Bible API issues

The NET Bible API requires no authentication, so most issues are network-related:
1. Check your internet connection
2. Verify the base URL is correct
3. Ensure you're formatting requests according to NET Bible API documentation

## Additional Resources

- [ESV API Documentation](https://api.esv.org/docs/)
- [NET Bible API Documentation](https://labs.bible.org/api_web_service)
- [SvelteKit Environment Variables](https://kit.svelte.dev/docs/modules#$env-static-private)
