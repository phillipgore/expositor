// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare namespace NodeJS {
	interface ProcessEnv {
		DATABASE_URL: string;
		BETTER_AUTH_SECRET: string;
		BETTER_AUTH_URL: string;
		MANDRILL_KEY?: string;
	}
}

export {};
