import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified')
		.$defaultFn(() => false)
		.notNull(),
	image: text('image'),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable('account', {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});

export const studyGroup = pgTable('study_group', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	displayOrder: integer('display_order').notNull().default(0),
	isCollapsed: boolean('is_collapsed').notNull().default(false),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const study = pgTable('study', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	groupId: text('group_id').references(() => studyGroup.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp('updated_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});

export const passage = pgTable('passage', {
	id: text('id').primaryKey(),
	studyId: text('study_id')
		.notNull()
		.references(() => study.id, { onDelete: 'cascade' }),
	testament: text('testament').notNull(),
	bookId: text('book_id').notNull(),
	bookName: text('book_name').notNull(),
	fromChapter: integer('from_chapter').notNull(),
	toChapter: integer('to_chapter').notNull(),
	fromVerse: integer('from_verse').notNull(),
	toVerse: integer('to_verse').notNull(),
	displayOrder: integer('display_order').notNull().default(0),
	createdAt: timestamp('created_at')
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull()
});
