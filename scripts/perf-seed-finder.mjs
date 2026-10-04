/**
 * Seed (or remove) a dedicated Finder performance-test user.
 *
 * Creates `perf@expositor.dev` with a library big enough to make the Finder's costs visible:
 * nested groups, series with parts, standalone studies, and passages carrying a realistic
 * `cached_text` payload (the real table averages ~70 KB per passage), because the layout load's
 * cost is dominated by what it SELECTS, not only by how many rows there are.
 *
 * Everything this script writes is id-prefixed with `perf-` and owned by the perf user, so
 * `--clean` removes exactly what it created and nothing else.
 *
 * Usage:
 *   node scripts/perf-seed-finder.mjs [--studies 500] [--text-kb 20]
 *   node scripts/perf-seed-finder.mjs --clean
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { hashPassword } from 'better-auth/crypto';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const arg = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : Number(args[i + 1]);
};

export const PERF_EMAIL = 'perf@expositor.dev';
export const PERF_PASSWORD = 'PerfPass123!';
const USER_ID = 'perf-user';
const STUDY_COUNT = arg('studies', 500);
const TEXT_KB = arg('text-kb', 20);

const sql = postgres(process.env.DATABASE_URL, { max: 4 });

async function clean() {
	// study_group / study_series / study / passage all cascade from the user row.
	await sql`DELETE FROM "user" WHERE id = ${USER_ID}`;
}

const BOOKS = [
	['nt', 'rom', 'Romans', 16],
	['nt', 'eph', 'Ephesians', 6],
	['nt', 'jhn', 'John', 21],
	['ot', 'gen', 'Genesis', 50],
	['ot', 'psa', 'Psalms', 150],
	['nt', 'heb', 'Hebrews', 13]
];

async function seed() {
	await clean();
	const now = new Date();
	await sql`INSERT INTO "user" ${sql({
		id: USER_ID,
		name: 'Perf Tester',
		first_name: 'Perf',
		last_name: 'Tester',
		email: PERF_EMAIL,
		email_verified: true,
		created_at: now,
		updated_at: now
	})}`;
	await sql`INSERT INTO account ${sql({
		id: 'perf-account',
		account_id: USER_ID,
		provider_id: 'credential',
		user_id: USER_ID,
		password: await hashPassword(PERF_PASSWORD),
		created_at: now,
		updated_at: now
	})}`;

	// 10 top-level groups, each with 3 subgroups, each with 2 sub-subgroups => 100 groups, depth 3.
	const groups = [];
	let order = 0;
	for (let a = 0; a < 10; a++) {
		const ga = `perf-g-${a}`;
		groups.push({ id: ga, name: `Group ${String.fromCharCode(65 + a)}`, parent: null });
		for (let b = 0; b < 3; b++) {
			const gb = `${ga}-${b}`;
			groups.push({ id: gb, name: `Sub ${a}.${b}`, parent: ga });
			for (let c = 0; c < 2; c++) {
				groups.push({ id: `${gb}-${c}`, name: `Leaf ${a}.${b}.${c}`, parent: gb });
			}
		}
	}
	await sql`INSERT INTO study_group ${sql(
		groups.map((g) => ({
			id: g.id,
			name: g.name,
			user_id: USER_ID,
			parent_group_id: g.parent,
			display_order: order++,
			is_collapsed: false,
			created_at: now,
			updated_at: now
		}))
	)}`;

	// 20 series of 8 parts (160 parts), half filed in groups.
	const series = Array.from({ length: 20 }, (_, i) => ({
		id: `perf-s-${i}`,
		name: `Series ${String(i).padStart(2, '0')}`,
		user_id: USER_ID,
		group_id: i % 2 ? groups[i * 3].id : null,
		translation: 'esv',
		display_order: i,
		is_collapsed: false,
		created_at: now,
		updated_at: now
	}));
	await sql`INSERT INTO study_series ${sql(series)}`;

	// Unique per passage. SvelteKit serialises load data with devalue, which DEDUPLICATES
	// identical strings — a shared filler would ship once and hide the very cost being measured.
	const block = 'In the beginning was the Word. '.repeat(Math.ceil((TEXT_KB * 1024) / 31));
	const filler = (key) => `${key} ${block}`.slice(0, TEXT_KB * 1024);
	const studies = [];
	const passages = [];
	for (let i = 0; i < STUDY_COUNT; i++) {
		const isPart = i < 160;
		const [testament, bookId, bookName, chapters] = BOOKS[i % BOOKS.length];
		const id = `perf-st-${i}`;
		studies.push({
			id,
			title: `Study ${String(i).padStart(4, '0')} ${bookName}`,
			translation: 'esv',
			user_id: USER_ID,
			// Non-part studies: 2/3 in a (random-ish) group, 1/3 ungrouped.
			group_id: isPart ? null : i % 3 === 0 ? null : groups[i % groups.length].id,
			series_id: isPart ? `perf-s-${Math.floor(i / 8)}` : null,
			series_order: isPart ? (i % 8) + 1 : null,
			created_at: now,
			updated_at: now
		});
		const passageCount = 1 + (i % 3);
		for (let p = 0; p < passageCount; p++) {
			const ch = 1 + ((i + p) % chapters);
			passages.push({
				id: `perf-p-${i}-${p}`,
				study_id: id,
				testament,
				book_id: bookId,
				book_name: bookName,
				from_chapter: ch,
				to_chapter: ch,
				from_verse: 1,
				to_verse: 10 + p,
				display_order: p,
				cached_text: filler(`perf-p-${i}-${p}`),
				text_cached_at: now,
				created_at: now
			});
		}
	}
	for (let i = 0; i < studies.length; i += 500) {
		await sql`INSERT INTO study ${sql(studies.slice(i, i + 500))}`;
	}
	for (let i = 0; i < passages.length; i += 200) {
		await sql`INSERT INTO passage ${sql(passages.slice(i, i + 200))}`;
	}

	console.log(
		`✓ Seeded ${PERF_EMAIL}: ${groups.length} groups, ${series.length} series, ` +
			`${studies.length} studies, ${passages.length} passages (${TEXT_KB} KB cached text each)`
	);
}

try {
	if (args.includes('--clean')) {
		await clean();
		console.log('✓ Removed perf user and all of its data');
	} else {
		await seed();
	}
} finally {
	await sql.end();
}
