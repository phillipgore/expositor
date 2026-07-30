import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// Emit sourcemaps so minified production errors (e.g. "W.focus is not a
		// function") map back to the original source when debugging a prod build.
		sourcemap: true
	}
});
