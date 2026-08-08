/**
 * Resolves SvelteKit's `$lib` alias for plain-Node scripts.
 *
 * The verifier scripts import modules under `src/lib`, which import each other via `$lib/...`.
 * Vite rewrites that alias at build time; bare `node` does not, so it throws
 * ERR_MODULE_NOT_FOUND on `$lib/data/bible.json`. Registering the hooks in ./alias-hooks.mjs maps
 * `$lib/x` to `src/lib/x` so the verifiers exercise the *real* modules — the alternative, stubbing
 * bible.json, would verify verse arithmetic against fixtures instead of the actual data, which is
 * the one thing these checks exist to avoid.
 *
 * Usage: node --import ./scripts/alias-loader.mjs scripts/some-verifier.mjs
 */

import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
