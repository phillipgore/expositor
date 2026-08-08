/**
 * Module resolution hooks — see alias-loader.mjs for why these exist.
 *
 * This lives in its own file rather than an inline `data:` URL because a data URL is terminated by
 * raw newlines, so a multi-line hook silently truncates and Node reports "Unexpected end of input"
 * from a location that does not appear in any source file.
 */

import { pathToFileURL } from 'node:url';

const root = pathToFileURL(process.cwd()).href;

export async function resolve(specifier, context, nextResolve) {
	const target = specifier.startsWith('$lib/')
		? `${root}/src/lib/${specifier.slice('$lib/'.length)}`
		: specifier;

	const resolved = await nextResolve(target, context);

	// Vite treats a .json import as JSON implicitly; Node requires an explicit
	// `with { type: 'json' }` attribute and throws ERR_IMPORT_ATTRIBUTE_MISSING without it.
	// Supplying it here lets the source files stay written for Vite, which is what actually ships.
	//
	// It must go on the *result*, not on the context passed downward: Node validates attributes at
	// load time against what the resolve hook returned, so a context-only version still throws.
	if (resolved.url.endsWith('.json')) {
		return { ...resolved, format: 'json', importAttributes: { type: 'json' } };
	}

	return resolved;
}

