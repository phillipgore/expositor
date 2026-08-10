/**
 * Exercise series creation with "Balance by length" against a REAL database (§5 option (b), Q11).
 *
 * The planner is verified by `verify-balance-by-length.mjs` (46 assertions, pure). What that cannot
 * check is the thing §5 actually promises: **"the preview a user approves is the parting they get."**
 * That promise spans three places — the modal previews with `planSeriesParts`, the endpoint re-plans
 * with it server-side, and the resulting rows are what the user lives with. A dropped option anywhere
 * in that chain would build the DEFAULT shape while the user had approved a balanced one, silently.
 *
 * So this calls the real creation path and reads back the rows, asserting that the parts written match
 * the parts the same planner previewed.
 *
 * ⚠️ A WRITE probe, not a verifier. Not in `npm run verify`. Run with `npm run probe:balance`.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const PREFIX = 'probe-bal-';
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
	if (actual === expected) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(
			`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`
		);
	}
}

function assert(label, condition) {
	if (condition) {
		pass += 1;
		console.log(`  ✓ ${label}`);
	} else {
		fail += 1;
		console.log(`  ✗ ${label}`);
	}
}

const sql = postgres(process.env.DATABASE_URL);

async function cleanup() {
	// The created parts are new studies whose ids are uuids, so they cannot be matched by prefix.
	// They are reached through the series instead, whose id IS prefixed — and `study.series_id` is
	// ON DELETE CASCADE, so removing the series removes every part it created.
	const rows = await sql`SELECT id FROM study_series WHERE name LIKE ${PREFIX + '%'}`;
	for (const row of rows) {
		await sql`DELETE FROM study_series WHERE id = ${row.id}`;
	}
	await sql`DELETE FROM study WHERE id LIKE ${PREFIX + '%'}`;
}

try {
	const [owner] = await sql`SELECT id FROM "user" LIMIT 1`;
	if (!owner) throw new Error('No user in the dev database; cannot build a fixture.');

	await cleanup();

	// A standalone Psalms 115–120 study: §5's own uneven-parts example.
	const studyId = `${PREFIX}source`;
	await sql`
		INSERT INTO study (id, title, translation, user_id, created_at, updated_at)
		VALUES (${studyId}, 'Psalms', 'esv', ${owner.id}, now(), now())
	`;
	await sql`
		INSERT INTO passage (id, study_id, testament, book_id, book_name, from_chapter, from_verse, to_chapter, to_verse, display_order, created_at)
		VALUES (${PREFIX + 'pass'}, ${studyId}, 'OT', 'PS', 'Psalms', 115, 1, 120, 7, 0, now())
	`;

	console.log('\nFixture: standalone Psalms 115–120 (Ps 117 = 2 verses, Ps 119 = 176).\n');

	const { planSeriesParts } = await import('../src/lib/utils/seriesPlanning.js');

	// What the MODAL would preview for a balanced split into three.
	const previewOptions = {
		passages: [
			{ testament: 'OT', book: 'PS', fromChapter: 115, fromVerse: 1, toChapter: 120, toVerse: 7 }
		],
		chaptersPerPart: 1,
		translationId: 'esv',
		baseTitle: 'Psalms',
		balanceByLength: true,
		targetParts: 3
	};
	const preview = planSeriesParts(previewOptions);
	console.log('── the preview the user would approve ──');
	check('three parts previewed', preview.parts.length, 3);
	for (const part of preview.parts) {
		const r = part.passages[0];
		console.log(`     Ps ${r.fromChapter}–${r.toChapter} (${part.verseCount} verses)`);
	}

	// ── Now run the ENDPOINT's own logic, exactly as it does ──────────────────
	//
	// The endpoint is a SvelteKit request handler, so it cannot be invoked directly without faking a
	// Request and a session. What it does after authenticating is call planSeriesParts with the body's
	// options and then write the plan — so the probe reproduces that write, and the assertion that
	// matters is that the SERVER-SIDE plan equals the previewed one.
	console.log('\n── the server re-plans from the same options ──');
	const { db } = await import('../src/lib/server/db/index.js');
	const { studySeries, study, passage } = await import('../src/lib/server/db/schema.js');
	const { eq } = await import('drizzle-orm');
	const { v4: uuidv4 } = await import('uuid');

	const [source] = await db.select().from(study).where(eq(study.id, studyId)).limit(1);
	const sourcePassages = await db.select().from(passage).where(eq(passage.studyId, studyId));

	const serverPlan = planSeriesParts({
		passages: sourcePassages.map((p) => ({
			testament: p.testament,
			book: p.bookId,
			fromChapter: p.fromChapter,
			fromVerse: p.fromVerse,
			toChapter: p.toChapter,
			toVerse: p.toVerse
		})),
		chaptersPerPart: 1,
		translationId: source.translation,
		baseTitle: source.title,
		balanceByLength: true,
		targetParts: 3
	});

	const shapeOf = (plan) =>
		plan.parts
			.map((p) => `${p.passages[0].fromChapter}-${p.passages[0].toChapter}:${p.verseCount}`)
			.join(' | ');

	check('the server plan is identical to the preview', shapeOf(serverPlan), shapeOf(preview));

	// Write it the way the endpoint does: reuse the source study as part 1, create the rest.
	console.log('\n── writing the series ──');
	const seriesId = `${PREFIX}series`;
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx.insert(studySeries).values({
			id: seriesId,
			name: `${PREFIX}Psalms`,
			userId: owner.id,
			createdAt: now,
			updatedAt: now
		});

		const [first, ...rest] = serverPlan.parts;
		await tx
			.update(study)
			.set({ seriesId, seriesOrder: first.seriesOrder, title: first.title, updatedAt: now })
			.where(eq(study.id, studyId));
		await tx.delete(passage).where(eq(passage.studyId, studyId));
		for (const range of first.passages) {
			await tx.insert(passage).values({
				id: uuidv4(),
				studyId,
				testament: range.testament,
				bookId: range.book,
				bookName: 'Psalms',
				fromChapter: range.fromChapter,
				toChapter: range.toChapter,
				fromVerse: range.fromVerse,
				toVerse: range.toVerse,
				displayOrder: 0,
				createdAt: now
			});
		}

		for (const part of rest) {
			const partId = uuidv4();
			await tx.insert(study).values({
				id: partId,
				title: part.title,
				translation: source.translation,
				userId: owner.id,
				seriesId,
				seriesOrder: part.seriesOrder,
				createdAt: now,
				updatedAt: now
			});
			for (const range of part.passages) {
				await tx.insert(passage).values({
					id: uuidv4(),
					studyId: partId,
					testament: range.testament,
					bookId: range.book,
					bookName: 'Psalms',
					fromChapter: range.fromChapter,
					toChapter: range.toChapter,
					fromVerse: range.fromVerse,
					toVerse: range.toVerse,
					displayOrder: 0,
					createdAt: now
				});
			}
		}
	});

	// ── What the user actually got ────────────────────────────────────────────
	console.log('\n── the rows written match the parting that was approved ──');
	const written = await sql`
		SELECT s.series_order, s.title, p.from_chapter, p.to_chapter
		FROM study s JOIN passage p ON p.study_id = s.id
		WHERE s.series_id = ${seriesId}
		ORDER BY s.series_order
	`;
	check('three parts exist in the database', written.length, 3);
	check(
		'and their ranges are the balanced ones, not one-per-chapter',
		written.map((r) => `${r.from_chapter}-${r.to_chapter}`).join(' | '),
		preview.parts.map((p) => `${p.passages[0].fromChapter}-${p.passages[0].toChapter}`).join(' | ')
	);
	assert(
		'the first part spans four psalms (115–118)',
		written[0].from_chapter === 115 && written[0].to_chapter === 118
	);
	assert(
		'Psalm 119 stands alone',
		written[1].from_chapter === 119 && written[1].to_chapter === 119
	);
	check('seriesOrder is 1,2,3 as seeded', written.map((r) => r.series_order).join(','), '1,2,3');

	// The counter-check: a DEFAULT creation of the same study yields six parts, so the three above are
	// genuinely the balanced shape rather than a coincidence of this range.
	const defaultPlan = planSeriesParts({
		...previewOptions,
		balanceByLength: false,
		targetParts: 0
	});
	check('the default shape would have been six parts', defaultPlan.parts.length, 6);
	assert(
		'so the written shape is demonstrably the balanced one',
		written.length !== defaultPlan.parts.length
	);

	// ── The gap this probe had, and the fix ───────────────────────────────────
	//
	// ⚠️ Everything above reproduces the endpoint's logic rather than invoking it (a SvelteKit handler
	// needs a Request and a session). I verified that limitation instead of assuming it away: mutating
	// the endpoint to drop the balance options left this probe at 9/9. So the probe did NOT cover the
	// single most likely place for the feature to break — the endpoint forwarding the options at all.
	//
	// The chain is asserted against the SOURCE instead. Coarse, and deliberately so: it is checking that
	// three specific hand-offs exist, and it fails loudly if any is deleted. Named `chain` rather than
	// dressed up as behavioural coverage.
	console.log('\n── the option chain exists at every hand-off (asserted on source) ──');
	const { readFileSync } = await import('node:fs');
	const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

	const modalSrc = read('../src/lib/componentWidgets/modals/SplitIntoSeriesModal.svelte');
	const menuSrc = read('../src/lib/componentWidgets/menus/MenuActions.svelte');
	const endpointSrc = read('../src/routes/api/series/+server.js');

	assert(
		'the modal previews with balanceByLength',
		/planSeriesParts\([\s\S]{0,400}balanceByLength/.test(modalSrc)
	);
	assert(
		'the modal sends the options to onCreate',
		/onCreate\?\.\([\s\S]{0,200}balanceByLength/.test(modalSrc)
	);
	assert(
		'the menu forwards them in the POST body',
		/balanceByLength:\s*options\.balanceByLength/.test(menuSrc)
	);
	assert('the endpoint reads them from the body', /balanceByLength\s*=\s*false/.test(endpointSrc));
	assert(
		'and passes them to planSeriesParts unaltered — not hardcoded false',
		/planSeriesParts\([\s\S]{0,600}\n\t\t\tbalanceByLength,\n\t\t\ttargetParts\n/.test(endpointSrc)
	);
} catch (error) {
	fail += 1;
	console.log(`\n✗ threw: ${error.message}`);
	console.log(error.stack?.split('\n').slice(1, 4).join('\n') ?? '');
} finally {
	await cleanup();
	const [left] = await sql`SELECT COUNT(*)::int AS n FROM study WHERE id LIKE ${PREFIX + '%'}`;
	const [seriesLeft] =
		await sql`SELECT COUNT(*)::int AS n FROM study_series WHERE name LIKE ${PREFIX + '%'}`;
	console.log(
		`\nFixture removed (${left.n} studies, ${seriesLeft.n} series left — expected 0, 0).`
	);
	await sql.end();
	console.log(`\n${pass} passed, ${fail} failed\n`);
	process.exit(fail === 0 ? 0 : 1);
}
